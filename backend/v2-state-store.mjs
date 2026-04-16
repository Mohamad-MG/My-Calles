import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createOpportunityFromQualifiedLead,
  createQualifiedLeadFromSource,
  createV2SeedData,
  getCreateErrors,
  getRequiredErrors,
  getSourceRecord,
  getStatusField,
  hasDuplicateOpportunity,
  normalizeV2State,
  resolveV2Collection,
  SERVICE_CONFIDENCE_OPTIONS,
  SERVICE_OPTIONS,
  validateStatusPatch,
} from "../v2/domain.mjs";

function nowIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function clone(value) {
  return structuredClone(value);
}

function withStateMeta(state, meta = {}) {
  return {
    ...state,
    _meta: {
      version: meta.version || 1,
      last_mutation_at: meta.lastMutationAt || null,
      last_mutation_by: meta.lastMutationBy || null,
    },
  };
}

function buildRecentActivity(records = []) {
  return records
    .slice(-6)
    .reverse()
    .map((entry) => ({
      id: `${entry.entity}-${entry.id}-${entry.state_version}`,
      entity: entry.entity,
      action: entry.action,
      record_id: entry.id,
      timestamp: entry.timestamp,
      summary:
        entry.after?.summary ||
        entry.after?.company_name ||
        entry.after?.profile_name ||
        entry.after?.keyword ||
        entry.after?.pain_summary ||
        entry.after?.next_step ||
        entry.id,
    }));
}

class V2StateStore {
  constructor({ dataDir }) {
    this.dataDir = dataDir;
    this.stateFile = path.join(dataDir, "dashboard-state.json");
    this.auditFile = path.join(dataDir, "audit-log.jsonl");
    this.eventsFile = path.join(dataDir, "observability-log.jsonl");
    this.state = null;
    this.recentActivity = [];
    this.metrics = {
      requests: 0,
      failures: 0,
      conflicts: 0,
      state_reads: 0,
      mutations: 0,
      total_latency_ms: 0,
      max_latency_ms: 0,
      by_route: {},
      recent: [],
    };
  }

  async init() {
    await mkdir(this.dataDir, { recursive: true });
    this.state = await this.#loadState();
    this.recentActivity = await this.#loadRecentActivity();
    return this;
  }

  async getState() {
    if (!this.state) {
      await this.init();
    }
    return {
      ...clone(this.state),
      recent_activity: clone(this.recentActivity),
    };
  }

  getVersion() {
    return Number(this.state?._meta?.version || 1);
  }

  getObservabilitySnapshot() {
    const averageLatency =
      this.metrics.requests > 0 ? this.metrics.total_latency_ms / this.metrics.requests : 0;
    return {
      requests: this.metrics.requests,
      failures: this.metrics.failures,
      conflicts: this.metrics.conflicts,
      state_reads: this.metrics.state_reads,
      mutations: this.metrics.mutations,
      average_latency_ms: Number(averageLatency.toFixed(2)),
      max_latency_ms: this.metrics.max_latency_ms,
      by_route: this.metrics.by_route,
      recent: this.metrics.recent,
      current_version: this.getVersion(),
    };
  }

  async recordEvent(event) {
    const timestamp = event.timestamp || new Date().toISOString();
    const latency = Number(event.latency_ms || 0);
    this.metrics.requests += 1;
    this.metrics.total_latency_ms += latency;
    this.metrics.max_latency_ms = Math.max(this.metrics.max_latency_ms, latency);
    this.metrics.by_route[event.route] = {
      count: (this.metrics.by_route[event.route]?.count || 0) + 1,
      failures:
        (this.metrics.by_route[event.route]?.failures || 0) + (event.level === "error" ? 1 : 0),
    };
    if (event.kind === "read") this.metrics.state_reads += 1;
    if (event.kind === "mutation") this.metrics.mutations += 1;
    if (event.level === "error") this.metrics.failures += 1;
    if (event.conflict_detected) this.metrics.conflicts += 1;

    this.metrics.recent = [
      {
        timestamp,
        route: event.route,
        method: event.method,
        level: event.level,
        actor: event.actor,
        latency_ms: latency,
        conflict_detected: Boolean(event.conflict_detected),
        status_code: event.status_code,
        error: event.error || null,
      },
      ...this.metrics.recent,
    ].slice(0, 25);

    await appendFile(
      this.eventsFile,
      `${JSON.stringify({
        ...event,
        timestamp,
      })}\n`,
    );
  }

  async patchEntity(entity, id, patch, actor = "system") {
    const timestamp = nowIsoDate();
    const collection = resolveV2Collection(entity);
    const currentState = await this.getState();
    const nextState = clone(currentState);
    const index = nextState[collection].findIndex((item) => item.id === id);

    if (index < 0) {
      throw new Error("Record not found.");
    }

    const before = nextState[collection][index];
    const after = {
      ...before,
      ...patch,
      updated_at: timestamp,
      updated_by: actor,
    };

    const statusField = getStatusField(collection);
    if (statusField in patch) {
      validateStatusPatch(collection, before, after);
    }

    const errors =
      collection === "opportunities"
        ? getCreateErrors(collection, currentState, after).filter(
            (error) => !error.includes("already exists") && !error.includes("only be created"),
          )
        : getRequiredErrors(collection, after);

    if (collection === "qualified_leads") {
      if (!SERVICE_OPTIONS.includes(after.recommended_service)) {
        errors.push('Field "recommended_service" is invalid.');
      }
      if (!SERVICE_CONFIDENCE_OPTIONS.includes(after.recommended_service_confidence)) {
        errors.push('Field "recommended_service_confidence" is invalid.');
      }
    }

    if (errors.length) {
      throw new Error(errors.join(" "));
    }

    nextState[collection][index] = after;
    await this.#commit({
      action: "patch",
      entity: collection,
      id,
      before,
      after,
      state: nextState,
      actor,
      timestamp,
    });
    return await this.getState();
  }

  async createEntity(entity, values, actor = "system") {
    const timestamp = nowIsoDate();
    const collection = resolveV2Collection(entity);
    const currentState = await this.getState();
    const existing = currentState[collection].find((item) => item.id === values.id);
    if (existing) {
      return {
        state: clone(currentState),
        record: clone(existing),
        created: false,
        duplicate: true,
      };
    }

    const draft = {
      ...values,
      created_at: values.created_at || timestamp,
      updated_at: timestamp,
      updated_by: actor,
    };
    const errors = getCreateErrors(collection, currentState, draft);
    if (errors.length) {
      throw new Error(errors.join(" "));
    }

    const nextState = clone(currentState);
    nextState[collection].unshift(draft);
    await this.#commit({
      action: "create",
      entity: collection,
      id: draft.id,
      before: null,
      after: draft,
      state: nextState,
      actor,
      timestamp,
    });

    return {
      state: await this.getState(),
      record: clone(draft),
      created: true,
      duplicate: false,
    };
  }

  async convertQualifiedLead(payload, actor = "system") {
    const timestamp = nowIsoDate();
    const currentState = await this.getState();
    const { source_entity, source_id } = payload;
    const sourceRecord = getSourceRecord(currentState, source_entity, source_id);
    if (!sourceRecord) {
      throw new Error("Source record not found.");
    }

    const qualifiedLead = createQualifiedLeadFromSource(
      sourceRecord,
      source_entity,
      {
        id: payload.id,
        pain_summary: payload.pain_summary,
        qualification_note: payload.qualification_note,
        recommended_service: payload.recommended_service,
        recommended_service_confidence: payload.recommended_service_confidence,
        handoff_status: payload.handoff_status || "New",
        owner: payload.owner || sourceRecord.owner,
        notes: payload.notes || "",
      },
      actor,
      timestamp,
    );

    const errors = getCreateErrors("qualified_leads", currentState, qualifiedLead);
    if (errors.length) {
      throw new Error(errors.join(" "));
    }

    const nextState = clone(currentState);
    const collection = resolveV2Collection(source_entity);
    const index = nextState[collection].findIndex((item) => item.id === source_id);
    nextState[collection][index] = {
      ...nextState[collection][index],
      converted_qualified_lead_id: qualifiedLead.id,
      updated_at: timestamp,
      updated_by: actor,
    };
    nextState.qualified_leads.unshift(qualifiedLead);

    await this.#commit({
      action: "convert-to-qualified-lead",
      entity: "qualified_leads",
      id: qualifiedLead.id,
      before: sourceRecord,
      after: qualifiedLead,
      state: nextState,
      actor,
      timestamp,
    });

    return await this.getState();
  }

  async createOpportunityFromQualifiedLead(payload, actor = "system") {
    const timestamp = nowIsoDate();
    const currentState = await this.getState();
    const qualifiedLead = currentState.qualified_leads.find((item) => item.id === payload.qualified_lead_id);
    if (!qualifiedLead) {
      throw new Error("Opportunity can only be created from a qualified lead.");
    }
    if (qualifiedLead.handoff_status !== "Ready for Opportunity") {
      throw new Error("Qualified lead must be Ready for Opportunity first.");
    }
    if (qualifiedLead.converted_opportunity_id || hasDuplicateOpportunity(currentState, qualifiedLead.id)) {
      throw new Error("An opportunity already exists for this qualified lead.");
    }

    const draft = createOpportunityFromQualifiedLead(qualifiedLead, payload, actor, timestamp);
    const errors = getCreateErrors("opportunities", currentState, draft);
    if (errors.length) {
      throw new Error(errors.join(" "));
    }

    const nextState = clone(currentState);
    nextState.opportunities.unshift(draft);
    const handoffIndex = nextState.qualified_leads.findIndex((item) => item.id === qualifiedLead.id);
    nextState.qualified_leads[handoffIndex] = {
      ...nextState.qualified_leads[handoffIndex],
      converted_opportunity_id: draft.id,
      updated_at: timestamp,
      updated_by: actor,
    };

    await this.#commit({
      action: "converted-to-opportunity",
      entity: "opportunities",
      id: draft.id,
      before: qualifiedLead,
      after: draft,
      state: nextState,
      actor,
      timestamp,
    });

    return await this.getState();
  }

  async restoreSeed(actor = "system", reason = "restore-seed") {
    const timestamp = nowIsoDate();
    const nextState = normalizeV2State(createV2SeedData(), actor, timestamp);
    const beforeState = await this.getState();
    await this.#commit({
      action: reason,
      entity: "state",
      id: "dashboard",
      before: beforeState,
      after: nextState,
      state: nextState,
      actor,
      timestamp,
    });
    return await this.getState();
  }

  async #loadState() {
    try {
      const serialized = await readFile(this.stateFile, "utf8");
      return normalizeV2State(JSON.parse(serialized));
    } catch {
      const initialState = normalizeV2State(createV2SeedData());
      await writeFile(this.stateFile, JSON.stringify(initialState, null, 2));
      return initialState;
    }
  }

  async #loadAuditRecords() {
    try {
      const serialized = await readFile(this.auditFile, "utf8");
      return serialized
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch {
      return [];
    }
  }

  async #loadRecentActivity() {
    const records = await this.#loadAuditRecords();
    return buildRecentActivity(records);
  }

  async #commit({ action, entity, id, before, after, state, actor, timestamp }) {
    const previousState = clone(this.state);
    const nextVersion = Number(this.state?._meta?.version || 1) + 1;
    const committedState = withStateMeta(normalizeV2State(state, actor, timestamp), {
      version: nextVersion,
      lastMutationAt: timestamp,
      lastMutationBy: actor,
    });
    this.state = committedState;
    await writeFile(this.stateFile, JSON.stringify(committedState, null, 2));
    const auditRecord = {
      action,
      entity,
      id,
      before,
      after,
      timestamp,
      user: actor,
      state_version: nextVersion,
    };
    try {
      await appendFile(this.auditFile, `${JSON.stringify(auditRecord)}\n`);
    } catch (error) {
      this.state = previousState;
      await writeFile(this.stateFile, JSON.stringify(previousState, null, 2));
      throw error;
    }
    this.recentActivity = buildRecentActivity([...(await this.#loadAuditRecords())]);
  }
}

export { V2StateStore };
