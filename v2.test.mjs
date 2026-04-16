import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createAppServer } from "./server.mjs";
import { createV2SeedData, getAllHomeSummaries, normalizeV2State } from "./v2/domain.mjs";

async function startTestServer() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mycalls-v2-server-"));
  const app = createAppServer({ dataDir: tempDir });
  await app.start(0);
  const address = app.server.address();
  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

test("state normalizes the explicit entity collections", () => {
  const normalized = normalizeV2State({
    whatsapp_items: [{ id: "wa-x", phone: "1", contact_name: "A", company_name: "B", summary: "S", next_step: "N", next_step_date: "2026-04-15" }],
  });

  assert.ok(Array.isArray(normalized.whatsapp_items));
  assert.ok(Array.isArray(normalized.linkedin_prospects));
  assert.ok(Array.isArray(normalized.google_inbound_items));
  assert.ok(Array.isArray(normalized.google_rank_tasks));
  assert.ok(Array.isArray(normalized.qualified_leads));
  assert.ok(Array.isArray(normalized.opportunities));
});

test("home summaries stay channel-first with one resume item per channel", () => {
  const seed = createV2SeedData();
  const summaries = getAllHomeSummaries(seed);

  assert.equal(summaries.length, 3);
  assert.ok(summaries.every((item) => ["WhatsApp", "LinkedIn", "Google"].includes(item.channel)));
  assert.ok(summaries.every((item) => "resume_item" in item));
});

test("GET /state returns isolated state", async () => {
  const { app, baseUrl } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/state`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(payload.whatsapp_items));
    assert.ok(Array.isArray(payload.qualified_leads));
    assert.ok(payload._meta.version >= 1);
  } finally {
    await app.stop();
  }
});

test("PATCH rejects invalid explicit transitions", async () => {
  const { app, baseUrl } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/whatsapp_items/wa-1`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-User": "v2-test",
      },
      body: JSON.stringify({ status: "Follow-up Due" }),
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.match(payload.error, /Invalid transition/i);
  } finally {
    await app.stop();
  }
});

test("POST /conversions/qualified-leads creates one qualified lead and preserves source record", async () => {
  const { app, baseUrl } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/conversions/qualified-leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User": "v2-test",
      },
      body: JSON.stringify({
        id: "ql-converted",
        source_entity: "whatsapp_items",
        source_id: "wa-2",
        pain_summary: "After-hours bookings",
        qualification_note: "Owner wants a demo",
        recommended_service: "mycalls",
        recommended_service_confidence: "high",
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.ok(payload.qualified_leads.some((item) => item.id === "ql-converted"));
    assert.equal(payload.whatsapp_items.find((item) => item.id === "wa-2").converted_qualified_lead_id, "ql-converted");
  } finally {
    await app.stop();
  }
});

test("duplicate qualified lead conversion is rejected for the same source record", async () => {
  const { app, baseUrl } = await startTestServer();
  try {
    await fetch(`${baseUrl}/conversions/qualified-leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User": "v2-test",
      },
      body: JSON.stringify({
        id: "ql-once",
        source_entity: "linkedin_prospects",
        source_id: "li-2",
        pain_summary: "LinkedIn pain",
        qualification_note: "Ready now",
        recommended_service: "nicechat",
        recommended_service_confidence: "medium",
      }),
    });

    const second = await fetch(`${baseUrl}/conversions/qualified-leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User": "v2-test",
      },
      body: JSON.stringify({
        id: "ql-twice",
        source_entity: "linkedin_prospects",
        source_id: "li-2",
        pain_summary: "LinkedIn pain",
        qualification_note: "Ready now",
        recommended_service: "nicechat",
        recommended_service_confidence: "medium",
      }),
    });
    const payload = await second.json();

    assert.equal(second.status, 400);
    assert.match(payload.error, /active qualified lead/i);
  } finally {
    await app.stop();
  }
});

test("POST /opportunities only accepts ready handoff records and prevents duplicates", async () => {
  const { app, baseUrl } = await startTestServer();
  try {
    let response = await fetch(`${baseUrl}/opportunities`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User": "v2-test",
      },
      body: JSON.stringify({
        id: "opp-invalid",
        qualified_lead_id: "ql-1",
        company_name: "Not Ready",
        buyer_readiness: "High",
        pain_summary: "Pain",
        use_case: "Use case",
        stakeholder_status: "Stakeholder",
        next_step: "Run discovery",
        next_step_date: "2026-04-15",
      }),
    });
    let payload = await response.json();
    assert.equal(response.status, 400);
    assert.match(payload.error, /Ready for Opportunity/i);

    await fetch(`${baseUrl}/qualified_leads/ql-1`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-User": "v2-test",
      },
      body: JSON.stringify({ handoff_status: "Ready for Opportunity" }),
    });

    response = await fetch(`${baseUrl}/opportunities`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User": "v2-test",
      },
      body: JSON.stringify({
        id: "opp-valid",
        qualified_lead_id: "ql-1",
        company_name: "Ready Deal",
        buyer_readiness: "High",
        pain_summary: "Pain",
        use_case: "Use case",
        stakeholder_status: "Stakeholder",
        next_step: "Run discovery",
        next_step_date: "2026-04-15",
      }),
    });
    payload = await response.json();
    assert.equal(response.status, 201);
    assert.ok(payload.opportunities.some((item) => item.id === "opp-valid"));

    const duplicate = await fetch(`${baseUrl}/opportunities`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User": "v2-test",
      },
      body: JSON.stringify({
        id: "opp-duplicate",
        qualified_lead_id: "ql-1",
        company_name: "Ready Deal",
        buyer_readiness: "High",
        pain_summary: "Pain",
        use_case: "Use case",
        stakeholder_status: "Stakeholder",
        next_step: "Run discovery",
        next_step_date: "2026-04-15",
      }),
    });
    const duplicatePayload = await duplicate.json();
    assert.equal(duplicate.status, 400);
    assert.match(duplicatePayload.error, /already exists/i);
  } finally {
    await app.stop();
  }
});

test("localized routes and dynamic opportunity route resolve to HTML", async () => {
  const { app, baseUrl } = await startTestServer();
  try {
    const home = await fetch(`${baseUrl}/en/`);
    const google = await fetch(`${baseUrl}/ar/google/`);
    const opportunity = await fetch(`${baseUrl}/en/opportunities/opp-1/`);

    assert.equal(home.status, 200);
    assert.equal(google.status, 200);
    assert.equal(opportunity.status, 200);
    assert.match(await opportunity.text(), /bootstrapV2/);
  } finally {
    await app.stop();
  }
});

test("root locale entrypoints render the canonical non-versioned shell", async () => {
  const { app, baseUrl } = await startTestServer();
  try {
    const root = await fetch(`${baseUrl}/`);
    const english = await fetch(`${baseUrl}/en/`);
    const arabic = await fetch(`${baseUrl}/ar/`);
    const rootHtml = await root.text();
    const englishHtml = await english.text();
    const arabicHtml = await arabic.text();

    assert.match(rootHtml, /en\//);
    assert.match(englishHtml, /bootstrapV2/);
    assert.match(arabicHtml, /bootstrapV2/);
    assert.doesNotMatch(englishHtml, /MyCalls V2|Channel Ops V2|>V2</);
    assert.doesNotMatch(arabicHtml, /نظام التشغيل V2|تشغيل القنوات V2|>V2</);
  } finally {
    await app.stop();
  }
});

test("legacy versioned API routes redirect to canonical endpoints", async () => {
  const { app, baseUrl } = await startTestServer();
  try {
    const oldState = await fetch(`${baseUrl}/v2/state`, { redirect: "manual" });
    const oldCreate = await fetch(`${baseUrl}/v2/whatsapp_items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      redirect: "manual",
    });

    assert.equal(oldState.status, 302);
    assert.equal(oldState.headers.get("location"), "/state");
    assert.equal(oldCreate.status, 302);
    assert.equal(oldCreate.headers.get("location"), "/whatsapp_items");
  } finally {
    await app.stop();
  }
});
