import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createSeedData,
  enforceSingleActiveSector,
  getRequiredValidationErrors,
  hasOpportunityForLead,
  normalizeDashboardState,
  validateLeadTransition,
  validateOpportunityTransition,
} from "../logic.mjs";

const ENTITY_MAP = {
  sector: "sectors",
  sectors: "sectors",
  lead: "leads",
  leads: "leads",
  opportunity: "opportunities",
  opportunities: "opportunities",
};

function nowIso() {
  return new Date().toISOString();
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

function ensureEntityMetadata(items, actor, timestamp) {
  return items.map((item) => ({
    ...item,
    created_at: item.created_at || timestamp,
    updated_at: item.updated_at || timestamp,
    updated_by: item.updated_by || actor,
  }));
}

function alignWeeklyFocus(state) {
  const activeSectors = state.sectors.filter((sector) => sector.is_active);

  if (activeSectors.length > 1) {
    return enforceSingleActiveSector(state, activeSectors[0].id);
  }

  if (!activeSectors.length) {
    return {
      ...state,
      weeklyFocus: {
        ...state.weeklyFocus,
        active_sector_id: "",
        current_offer: "",
      },
    };
  }

  return {
    ...state,
    weeklyFocus: {
      ...state.weeklyFocus,
      active_sector_id: activeSectors[0].id,
      current_offer: activeSectors[0].offer_angle || "",
    },
  };
}

function normalizeStoredState(candidate, actor = "system", timestamp = nowIso()) {
  const normalized = normalizeDashboardState(candidate);
  const withMetadata = {
    ...normalized,
    sectors: ensureEntityMetadata(normalized.sectors, actor, timestamp),
    leads: ensureEntityMetadata(normalized.leads, actor, timestamp),
    opportunities: ensureEntityMetadata(normalized.opportunities, actor, timestamp),
  };

  const alignedState = alignWeeklyFocus(withMetadata);
  const version = Number(candidate?._meta?.version || 1);
  return withStateMeta(alignedState, {
    version,
    lastMutationAt: candidate?._meta?.last_mutation_at || timestamp,
    lastMutationBy: candidate?._meta?.last_mutation_by || actor,
  });
}

function resolveCollection(entity) {
  const collectionKey = ENTITY_MAP[entity];
  if (!collectionKey) {
    throw new Error(`Unknown entity "${entity}".`);
  }
  return collectionKey;
}

function getOpportunityCreateErrors(state, draft) {
  const errors = [
    ...getRequiredValidationErrors("opportunity", draft),
    ...validateOpportunityTransition(draft, draft.current_stage),
  ];

  const sourceLead = state.leads.find((lead) => lead.id === draft.origin_lead_id);
  if (!sourceLead || sourceLead.current_stage !== "Handoff Sent" || !sourceLead.handoff_summary) {
    errors.push("Opportunity can only be created from a Handoff Sent lead.");
  }
  if (hasOpportunityForLead(state.opportunities, draft.origin_lead_id)) {
    errors.push("An opportunity already exists for this lead.");
  }

  return errors;
}

function getLeadCreateErrors(state, draft) {
  return [
    ...getRequiredValidationErrors("lead", draft),
    ...validateLeadTransition(draft, draft.current_stage),
  ];
}

function getSectorPatchState(state, id, patch) {
  const nextState = clone(state);
  const index = nextState.sectors.findIndex((sector) => sector.id === id);
  if (index < 0) {
    throw new Error("Record not found.");
  }

  const existing = nextState.sectors[index];
  const updated = {
    ...existing,
    ...patch,
  };
  nextState.sectors[index] = updated;

  if (patch.is_active === true) {
    return alignWeeklyFocus(enforceSingleActiveSector(nextState, id));
  }

  if (patch.is_active === false && existing.is_active) {
    nextState.sectors[index] = {
      ...nextState.sectors[index],
      is_active: false,
      status: nextState.sectors[index].status === "Active" ? "Testing" : nextState.sectors[index].status,
    };
    return alignWeeklyFocus(nextState);
  }

  return alignWeeklyFocus(nextState);
}

function applyPatchRules(state, entity, id, patch, actor, timestamp) {
  if (entity === "sectors") {
    const sectorState = getSectorPatchState(state, id, patch);
    const index = sectorState.sectors.findIndex((sector) => sector.id === id);
    const errors = getRequiredValidationErrors("sector", sectorState.sectors[index]);
    if (errors.length) {
      throw new Error(errors.join(" "));
    }
    sectorState.sectors[index] = {
      ...sectorState.sectors[index],
      updated_at: timestamp,
      updated_by: actor,
    };
    return sectorState;
  }

  const collectionKey = resolveCollection(entity);
  const nextState = clone(state);
  const index = nextState[collectionKey].findIndex((item) => item.id === id);
  if (index < 0) {
    throw new Error("Record not found.");
  }

  const updated = {
    ...nextState[collectionKey][index],
    ...patch,
    updated_at: timestamp,
    updated_by: actor,
  };

  if (collectionKey === "leads") {
    const errors = [
      ...getRequiredValidationErrors("lead", updated),
      ...validateLeadTransition(updated, updated.current_stage),
    ];
    if (errors.length) {
      throw new Error(errors.join(" "));
    }
  }

  if (collectionKey === "opportunities") {
    const errors = [
      ...getRequiredValidationErrors("opportunity", updated),
      ...validateOpportunityTransition(updated, updated.current_stage),
    ];
    if (
      patch.origin_lead_id &&
      state.opportunities.some(
        (opportunity) => opportunity.id !== id && opportunity.origin_lead_id === patch.origin_lead_id,
      )
    ) {
      errors.push("An opportunity already exists for this lead.");
    }
    if (errors.length) {
      throw new Error(errors.join(" "));
    }
  }

  nextState[collectionKey][index] = updated;
  return alignWeeklyFocus(nextState);
}

class StateStore {
  constructor({ dataDir }) {
    this.dataDir = dataDir;
    this.stateFile = path.join(dataDir, "dashboard-state.json");
    this.auditFile = path.join(dataDir, "audit-log.jsonl");
    this.eventsFile = path.join(dataDir, "observability-log.jsonl");
    this.state = null;
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
    return this;
  }

  async getState() {
    if (!this.state) {
      await this.init();
    }
    return clone(this.state);
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
    const timestamp = event.timestamp || nowIso();
    const latency = Number(event.latency_ms || 0);
    this.metrics.requests += 1;
    this.metrics.total_latency_ms += latency;
    this.metrics.max_latency_ms = Math.max(this.metrics.max_latency_ms, latency);
    this.metrics.by_route[event.route] = {
      count: (this.metrics.by_route[event.route]?.count || 0) + 1,
      failures:
        (this.metrics.by_route[event.route]?.failures || 0) + (event.level === "error" ? 1 : 0),
    };
    if (event.kind === "read") {
      this.metrics.state_reads += 1;
    }
    if (event.kind === "mutation") {
      this.metrics.mutations += 1;
    }
    if (event.level === "error") {
      this.metrics.failures += 1;
    }
    if (event.conflict_detected) {
      this.metrics.conflicts += 1;
    }
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
    const timestamp = nowIso();
    const beforeState = await this.getState();
    const collectionKey = resolveCollection(entity);
    const before = beforeState[collectionKey].find((item) => item.id === id);
    if (!before) {
      throw new Error("Record not found.");
    }

    const nextState = applyPatchRules(beforeState, collectionKey, id, patch, actor, timestamp);
    await this.#commit({
      action: "patch",
      entity: collectionKey,
      id,
      before,
      after: nextState[collectionKey].find((item) => item.id === id),
      state: nextState,
      actor,
      timestamp,
    });
    return clone(nextState);
  }

  async createEntity(entity, values, actor = "system") {
    const timestamp = nowIso();
    const currentState = await this.getState();
    const nextState = clone(currentState);

    if (entity === "sectors") {
      const draft = {
        ...values,
        created_at: timestamp,
        updated_at: timestamp,
        updated_by: actor,
      };
      const errors = getRequiredValidationErrors("sector", draft);
      if (errors.length) {
        throw new Error(errors.join(" "));
      }
      nextState.sectors.unshift(draft);
      const committedState = draft.is_active
        ? alignWeeklyFocus(enforceSingleActiveSector(nextState, draft.id))
        : alignWeeklyFocus(nextState);
      await this.#commit({
        action: "create",
        entity: "sectors",
        id: draft.id,
        before: null,
        after: draft,
        state: committedState,
        actor,
        timestamp,
      });
      return {
        state: clone(committedState),
        record: clone(draft),
        created: true,
        duplicate: false,
      };
    }

    if (entity === "leads") {
      const existingLead = currentState.leads.find((lead) => lead.id === values.id);
      if (existingLead) {
        return {
          state: clone(currentState),
          record: clone(existingLead),
          created: false,
          duplicate: true,
        };
      }

      const draft = {
        ...values,
        created_at: timestamp,
        updated_at: timestamp,
        updated_by: actor,
      };
      const errors = getLeadCreateErrors(currentState, draft);
      if (errors.length) {
        throw new Error(errors.join(" "));
      }
      nextState.leads.unshift(draft);
      const committedState = alignWeeklyFocus(nextState);
      await this.#commit({
        action: "create",
        entity: "leads",
        id: draft.id,
        before: null,
        after: draft,
        state: committedState,
        actor,
        timestamp,
      });
      return {
        state: clone(committedState),
        record: clone(draft),
        created: true,
        duplicate: false,
      };
    }

    if (entity === "opportunities") {
      const draft = {
        ...values,
        created_at: timestamp,
        updated_at: timestamp,
        updated_by: actor,
      };
      const errors = getOpportunityCreateErrors(currentState, draft);
      if (errors.length) {
        throw new Error(errors.join(" "));
      }
      nextState.opportunities.unshift(draft);
      const committedState = alignWeeklyFocus(nextState);
      await this.#commit({
        action: "create",
        entity: "opportunities",
        id: draft.id,
        before: null,
        after: draft,
        state: committedState,
        actor,
        timestamp,
      });
      return {
        state: clone(committedState),
        record: clone(draft),
        created: true,
        duplicate: false,
      };
    }

    throw new Error(`Unknown entity "${entity}".`);
  }

  async restoreSeed(actor = "system", reason = "restore-seed") {
    const timestamp = nowIso();
    const nextState = normalizeStoredState(createSeedData(), actor, timestamp);
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
    return clone(nextState);
  }

  async #loadState() {
    try {
      const serialized = await readFile(this.stateFile, "utf8");
      return normalizeStoredState(JSON.parse(serialized));
    } catch {
      const initialState = normalizeStoredState(createSeedData());
      await writeFile(this.stateFile, JSON.stringify(initialState, null, 2));
      return initialState;
    }
  }

  async #commit({ action, entity, id, before, after, state, actor, timestamp }) {
    const previousState = clone(this.state);
    const nextVersion = Number(this.state?._meta?.version || 1) + 1;
    const committedState = withStateMeta(state, {
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
  }
}

export { StateStore, resolveCollection };
