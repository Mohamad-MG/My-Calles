import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  applyLocalRequest,
  buildRecentActivity,
  createEnvelope,
  getPublicStateFromEnvelope,
} from "../app/state-engine.mjs";

class StateStore {
  constructor({ dataDir }) {
    this.dataDir = dataDir;
    this.stateFile = path.join(dataDir, "dashboard-state.json");
    this.auditFile = path.join(dataDir, "audit-log.jsonl");
    this.eventsFile = path.join(dataDir, "observability-log.jsonl");
    this.envelope = null;
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
    this.envelope = await this.#loadEnvelope();
    return this;
  }

  async getState() {
    if (!this.envelope) {
      await this.init();
    }
    return getPublicStateFromEnvelope(this.envelope);
  }

  getVersion() {
    return Number(this.envelope?.state?._meta?.version || 1);
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
    const result = applyLocalRequest(this.envelope, {
      path: `/${entity}/${id}`,
      method: "PATCH",
      body: patch,
      actor,
    });
    await this.#persistMutation(result, true);
    return result.payload;
  }

  async createEntity(entity, values, actor = "system") {
    const result = applyLocalRequest(this.envelope, {
      path: `/${entity}`,
      method: "POST",
      body: values,
      actor,
    });
    await this.#persistMutation(result, Boolean(result.auditEntry));
    return {
      state: result.payload,
      record: result.record || null,
      created: Boolean(result.created),
      duplicate: Boolean(result.duplicate),
    };
  }

  async convertQualifiedLead(payload, actor = "system") {
    const result = applyLocalRequest(this.envelope, {
      path: "/conversions/qualified-leads",
      method: "POST",
      body: payload,
      actor,
    });
    await this.#persistMutation(result, true);
    return result.payload;
  }

  async createOpportunityFromQualifiedLead(payload, actor = "system") {
    const result = applyLocalRequest(this.envelope, {
      path: "/opportunities",
      method: "POST",
      body: payload,
      actor,
    });
    await this.#persistMutation(result, true);
    return result.payload;
  }

  async restoreSeed(actor = "system", reason = "restore-seed") {
    const result = applyLocalRequest(this.envelope, {
      path: "/state/restore-seed",
      method: "POST",
      body: { reason },
      actor,
    });
    if (result.auditEntry) {
      result.auditEntry.action = reason;
    }
    await this.#persistMutation(result, true);
    return result.payload;
  }

  async importMapsSearchResults(missionId, payload, actor = "system") {
    const result = applyLocalRequest(this.envelope, {
      path: `/google_maps_missions/${missionId}/import-search`,
      method: "POST",
      body: payload,
      actor,
    });
    await this.#persistMutation(result, true);
    return result.payload;
  }

  async importMapsShortlistResults(missionId, payload, actor = "system") {
    const result = applyLocalRequest(this.envelope, {
      path: `/google_maps_missions/${missionId}/import-shortlist`,
      method: "POST",
      body: payload,
      actor,
    });
    await this.#persistMutation(result, true);
    return result.payload;
  }

  async importKeywordStrategy(campaignId, payload, actor = "system") {
    const result = applyLocalRequest(this.envelope, {
      path: `/google_rank_tasks/${campaignId}/import-keyword-strategy`,
      method: "POST",
      body: payload,
      actor,
    });
    await this.#persistMutation(result, true);
    return result.payload;
  }

  async importSubkeywordCluster(campaignId, payload, actor = "system") {
    const result = applyLocalRequest(this.envelope, {
      path: `/google_rank_tasks/${campaignId}/import-subkeyword-cluster`,
      method: "POST",
      body: payload,
      actor,
    });
    await this.#persistMutation(result, true);
    return result.payload;
  }

  async importArticlePlan(campaignId, payload, actor = "system") {
    const result = applyLocalRequest(this.envelope, {
      path: `/google_rank_tasks/${campaignId}/import-article-planner`,
      method: "POST",
      body: payload,
      actor,
    });
    await this.#persistMutation(result, true);
    return result.payload;
  }

  async #loadEnvelope() {
    const state = await this.#loadStateFile();
    const auditRecords = await this.#loadAuditRecords();
    return createEnvelope({
      state,
      audit_records: auditRecords,
    });
  }

  async #loadStateFile() {
    try {
      const serialized = await readFile(this.stateFile, "utf8");
      return JSON.parse(serialized);
    } catch {
      const seedEnvelope = createEnvelope();
      await writeFile(this.stateFile, JSON.stringify(seedEnvelope.state, null, 2));
      return seedEnvelope.state;
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

  async #persistMutation(result, appendAudit = true) {
    const previousEnvelope = this.envelope;
    this.envelope = result.envelope;

    try {
      await writeFile(this.stateFile, JSON.stringify(this.envelope.state, null, 2));
      if (appendAudit && result.auditEntry) {
        await appendFile(this.auditFile, `${JSON.stringify(result.auditEntry)}\n`);
      }
    } catch (error) {
      this.envelope = previousEnvelope;
      await writeFile(this.stateFile, JSON.stringify(previousEnvelope.state, null, 2));
      throw error;
    }
  }
}

export { StateStore };
