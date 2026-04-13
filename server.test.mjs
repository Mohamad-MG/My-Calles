import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createAppServer } from "./server.mjs";

async function startTestServer() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mycalls-server-"));
  const app = createAppServer({ dataDir: tempDir });
  await app.start(0);
  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return { app, baseUrl, tempDir };
}

test("GET /state returns shared state with metadata", async () => {
  const { app, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/state`);
    const state = await response.json();

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(state.sectors));
    assert.ok(state._meta);
    assert.ok(state._meta.version >= 1);
    assert.ok(state.sectors[0].created_at);
    assert.ok(state.sectors[0].updated_at);
    assert.ok(state.sectors[0].updated_by);
    assert.ok(state.analytics);
    assert.ok(state.analytics.sources.WhatsApp);
    assert.equal(state.analytics.sources.WhatsApp.trend.daily.length, 14);
  } finally {
    await app.stop();
  }
});

test("POST /leads updates analytics rollups for the source", async () => {
  const { app, baseUrl } = await startTestServer();

  try {
    const beforeResponse = await fetch(`${baseUrl}/state`);
    const beforeState = await beforeResponse.json();
    const beforeLeads = beforeState.analytics.sources.WhatsApp.roi.leads;
    const beforeCapturedToday = beforeState.analytics.sources.WhatsApp.funnel.captured;

    const response = await fetch(`${baseUrl}/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User": "analytics-user",
      },
      body: JSON.stringify({
        id: "lead-analytics",
        company_name: "Analytics Clinic",
        sector_id: "sector-clinics",
        contact_name: "Noor",
        role: "Owner",
        channel: "WhatsApp",
        owner: "Admin",
        current_stage: "Targeted",
        next_step: "Send opener",
        next_step_date: "2026-04-13",
        notes: "",
        pain_signal: "Missed calls after hours",
        urgency_level: "Medium",
        decision_level: "Owner",
        interest_type: "New",
        lead_score: 12,
        last_contact_date: "2026-04-13",
        handoff_summary: "",
        stage_updated_at: "2026-04-13",
      }),
    });

    const afterState = await response.json();

    assert.equal(response.status, 201);
    assert.equal(afterState.analytics.sources.WhatsApp.roi.leads, beforeLeads + 1);
    assert.equal(afterState.analytics.sources.WhatsApp.funnel.captured, beforeCapturedToday + 1);
  } finally {
    await app.stop();
  }
});

test("POST /opportunities rejects duplicates from the same origin lead", async () => {
  const { app, baseUrl } = await startTestServer();

  try {
    const stateResponse = await fetch(`${baseUrl}/state`);
    const state = await stateResponse.json();
    const sourceLead = state.leads.find((lead) => lead.id === "lead-2");

    const response = await fetch(`${baseUrl}/opportunities`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User": "test-user",
      },
      body: JSON.stringify({
        id: "opp-duplicate",
        origin_lead_id: sourceLead.id,
        company_name: sourceLead.company_name,
        sector_id: sourceLead.sector_id,
        owner: "Agent 3",
        current_stage: "Discovery",
        buyer_readiness: "Ready",
        pain_summary: "Pain",
        use_case: "Use case",
        stakeholder_status: "Owner identified",
        stakeholder_map: sourceLead.handoff_summary,
        estimated_value: 0,
        objection_summary: "",
        close_probability: 25,
        risk_flag: "Medium",
        decision_status: "New",
        next_step: "Run discovery",
        next_step_date: "2026-04-11",
      }),
    });

    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.match(payload.error, /already exists/i);
  } finally {
    await app.stop();
  }
});

test("PATCH /sectors/:id can clear the active sector without auto-selecting another", async () => {
  const { app, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/sectors/sector-clinics`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-User": "test-user",
      },
      body: JSON.stringify({ is_active: false }),
    });

    const state = await response.json();
    assert.equal(response.status, 200);
    assert.equal(state.weeklyFocus.active_sector_id, "");
    assert.equal(state.sectors.filter((sector) => sector.is_active).length, 0);
  } finally {
    await app.stop();
  }
});

test("POST /leads is idempotent for duplicate ids and does not write duplicate audit creates", async () => {
  const { app, baseUrl, tempDir } = await startTestServer();

  try {
    const payload = {
      id: "lead-idempotent",
      company_name: "Baseline Clinic",
      sector_id: "sector-clinics",
      contact_name: "Mona",
      role: "Owner",
      channel: "WhatsApp",
      owner: "Admin",
      current_stage: "Targeted",
      next_step: "Send opener",
      next_step_date: "2026-04-11",
      notes: "",
      pain_signal: "Missed calls",
      urgency_level: "Medium",
      decision_level: "Owner",
      interest_type: "New",
      lead_score: 12,
      last_contact_date: "2026-04-11",
      handoff_summary: "",
      stage_updated_at: "2026-04-11",
    };

    const firstResponse = await fetch(`${baseUrl}/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User": "idempotent-user",
      },
      body: JSON.stringify(payload),
    });
    const firstState = await firstResponse.json();

    assert.equal(firstResponse.status, 201);
    assert.equal(firstResponse.headers.get("X-Duplicate-Detected"), "0");
    assert.equal(firstState.leads.filter((lead) => lead.id === payload.id).length, 1);

    const secondResponse = await fetch(`${baseUrl}/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User": "idempotent-user",
      },
      body: JSON.stringify(payload),
    });
    const secondState = await secondResponse.json();

    assert.equal(secondResponse.status, 200);
    assert.equal(secondResponse.headers.get("X-Duplicate-Detected"), "1");
    assert.equal(secondState.leads.filter((lead) => lead.id === payload.id).length, 1);

    const auditLog = await readFile(path.join(tempDir, "audit-log.jsonl"), "utf8");
    const createEvents = auditLog
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((entry) => entry.entity === "leads" && entry.id === payload.id && entry.action === "create");

    assert.equal(createEvents.length, 1);
  } finally {
    await app.stop();
  }
});

test("audit log captures before and after for mutations", async () => {
  const { app, baseUrl, tempDir } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/leads/lead-1`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-User": "audit-user",
      },
      body: JSON.stringify({ next_step: "Updated next step" }),
    });
    assert.equal(response.status, 200);

    const auditLog = await readFile(path.join(tempDir, "audit-log.jsonl"), "utf8");
    const lastLine = auditLog.trim().split("\n").at(-1);
    const entry = JSON.parse(lastLine);

    assert.equal(entry.entity, "leads");
    assert.equal(entry.id, "lead-1");
    assert.equal(entry.user, "audit-user");
    assert.ok(entry.state_version >= 2);
    assert.equal(entry.before.next_step, "Book discovery call with clinic owner");
    assert.equal(entry.after.next_step, "Updated next step");
  } finally {
    await app.stop();
  }
});

test("conflicting updates are accepted with last-write-wins and logged as conflicts", async () => {
  const { app, baseUrl } = await startTestServer();

  try {
    const stateResponse = await fetch(`${baseUrl}/state`, {
      headers: { "X-Session-Id": "session-a" },
    });
    const state = await stateResponse.json();
    const initialVersion = state._meta.version;

    const firstUpdate = await fetch(`${baseUrl}/leads/lead-1`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-User": "session-a",
        "X-Session-Id": "session-a",
        "X-Known-State-Version": String(initialVersion),
      },
      body: JSON.stringify({ next_step: "Session A update" }),
    });
    assert.equal(firstUpdate.status, 200);

    const conflictingUpdate = await fetch(`${baseUrl}/leads/lead-1`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-User": "session-b",
        "X-Session-Id": "session-b",
        "X-Known-State-Version": String(initialVersion),
      },
      body: JSON.stringify({ next_step: "Session B overwrite" }),
    });
    const conflictingState = await conflictingUpdate.json();

    assert.equal(conflictingUpdate.status, 200);
    assert.equal(conflictingUpdate.headers.get("X-Conflict-Detected"), "1");
    assert.equal(conflictingState.leads.find((lead) => lead.id === "lead-1").next_step, "Session B overwrite");

    const observabilityResponse = await fetch(`${baseUrl}/debug/observability`);
    const observability = await observabilityResponse.json();
    assert.ok(observability.conflicts >= 1);
    assert.ok(observability.recent.some((entry) => entry.conflict_detected === true));
  } finally {
    await app.stop();
  }
});

test("debug observability endpoint summarizes latency and failures", async () => {
  const { app, baseUrl } = await startTestServer();

  try {
    await fetch(`${baseUrl}/state`, { headers: { "X-Session-Id": "debug-session" } });
    await fetch(`${baseUrl}/unknown-route`);
    const response = await fetch(`${baseUrl}/debug/observability`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.ok(payload.requests >= 2);
    assert.ok(payload.by_route["/state"]);
    assert.ok(payload.recent.length >= 1);
  } finally {
    await app.stop();
  }
});
