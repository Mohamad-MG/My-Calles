import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createAppServer } from "./server.mjs";
import { V2_STORAGE_KEY, createSeedData, getAllHomeSummaries, normalizeState } from "./app/domain.mjs";
import { normalizeGoogleTab, routeForPath } from "./app/app.mjs";
import { getRuntimeBasePath, getRuntimeMode, getStaticStatePath, fetchState, sendRequest } from "./app/shared-state.mjs";
import { createEnvelope } from "./app/state-engine.mjs";

async function startTestServer() {
  const tempDir = await mkdtemp(path.join(process.env.TEST_TMPDIR || os.tmpdir(), "mycalls-app-server-"));
  const app = createAppServer({ dataDir: tempDir });
  await app.start(0);
  const address = app.server.address();
  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

function createStorageMock(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index) {
      return [...store.keys()][index] || null;
    },
    get length() {
      return store.size;
    },
  };
}

function createStaticWindow(storage, pathname = "/My-Calles/en/google/") {
  return {
    location: {
      hostname: "mohamad-mg.github.io",
      pathname,
    },
    localStorage: storage,
  };
}

function makeArticleIdeas(count) {
  return Array.from({ length: count }, (_, index) => ({
    title: `Article ${index + 1}`,
    status: "Idea",
  }));
}

test("state normalizes the explicit entity collections", () => {
  const normalized = normalizeState({
    whatsapp_items: [{ id: "wa-x", phone: "1", contact_name: "A", company_name: "B", summary: "S", next_step: "N", next_step_date: "2026-04-15" }],
  });

  assert.ok(Array.isArray(normalized.whatsapp_items));
  assert.ok(Array.isArray(normalized.linkedin_prospects));
  assert.ok(Array.isArray(normalized.google_prompt_templates));
  assert.ok(Array.isArray(normalized.google_maps_missions));
  assert.ok(Array.isArray(normalized.google_inbound_items));
  assert.ok(Array.isArray(normalized.google_rank_tasks));
  assert.ok(Array.isArray(normalized.qualified_leads));
  assert.ok(Array.isArray(normalized.opportunities));
});

test("home summaries stay channel-first with one resume item per channel", () => {
  const seed = createSeedData();
  const summaries = getAllHomeSummaries(seed);

  assert.equal(summaries.length, 3);
  assert.ok(summaries.every((item) => ["WhatsApp", "LinkedIn", "Google"].includes(item.channel)));
  assert.ok(summaries.every((item) => "resume_item" in item));
});

test("GitHub Pages runtime resolves static mode and repo-aware data path", () => {
  const originalWindow = global.window;
  global.window = {
    location: {
      hostname: "mohamad-mg.github.io",
      pathname: "/My-Calles/en/",
    },
  };

  try {
    assert.equal(getRuntimeMode(), "static");
    assert.equal(getRuntimeBasePath(), "/My-Calles");
    assert.equal(getStaticStatePath(), "/My-Calles/data/dashboard-state.json");
  } finally {
    global.window = originalWindow;
  }
});

test("server runtime stays in live mode without project base path", () => {
  const originalWindow = global.window;
  global.window = {
    location: {
      hostname: "localhost",
      pathname: "/en/",
    },
  };

  try {
    assert.equal(getRuntimeMode(), "live");
    assert.equal(getRuntimeBasePath(), "");
    assert.equal(getStaticStatePath(), "/data/dashboard-state.json");
  } finally {
    global.window = originalWindow;
  }
});

test("static fetchState prefers localStorage before fetching the seed file", async () => {
  const originalWindow = global.window;
  const originalFetch = global.fetch;
  const seedEnvelope = createEnvelope(createSeedData());
  const storage = createStorageMock({
    [V2_STORAGE_KEY]: JSON.stringify(seedEnvelope),
  });
  let fetchCalls = 0;

  global.window = createStaticWindow(storage, "/My-Calles/en/google/");
  global.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch should not run when localStorage already has state");
  };

  try {
    const result = await fetchState({ sessionId: "static-local" });
    assert.equal(fetchCalls, 0);
    assert.ok(result.payload.google_maps_missions.length > 0);
    assert.equal(result.version, Number(seedEnvelope.state._meta.version || 0));
  } finally {
    global.window = originalWindow;
    global.fetch = originalFetch;
  }
});

test("static fetchState falls back to the seed JSON and persists it locally", async () => {
  const originalWindow = global.window;
  const originalFetch = global.fetch;
  const storage = createStorageMock();
  const seed = createSeedData();
  let fetchCalls = 0;

  global.window = createStaticWindow(storage, "/My-Calles/ar/google/");
  global.fetch = async (input) => {
    fetchCalls += 1;
    assert.match(String(input), /\/My-Calles\/data\/dashboard-state\.json$/);
    return new Response(JSON.stringify(seed), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await fetchState({ sessionId: "static-seed" });
    const stored = JSON.parse(storage.getItem(V2_STORAGE_KEY));

    assert.equal(fetchCalls, 1);
    assert.ok(result.payload.google_rank_tasks.length > 0);
    assert.ok(stored.state.google_maps_missions.length > 0);
  } finally {
    global.window = originalWindow;
    global.fetch = originalFetch;
  }
});

test("static sendRequest applies local mutations and persists the full envelope", async () => {
  const originalWindow = global.window;
  const originalFetch = global.fetch;
  const seedEnvelope = createEnvelope(createSeedData());
  const storage = createStorageMock({
    [V2_STORAGE_KEY]: JSON.stringify(seedEnvelope),
  });

  global.window = createStaticWindow(storage, "/My-Calles/en/google/");
  global.fetch = async () => {
    throw new Error("static mutations should not call the backend");
  };

  try {
    const initialVersion = Number(seedEnvelope.state._meta.version || 0);
    const result = await sendRequest("/google_maps_missions/gm-ksa-service/import-search", {
      method: "POST",
      body: {
        slot_key: "research_primary",
        result_json: JSON.stringify({
          mission_id: "gm-ksa-service",
          results: [
            {
              company_name: "Jeddah Fix Team",
              maps_url: "https://maps.google.com/?cid=jeddah-fix-team",
              city: "Jeddah",
              category: "Home maintenance",
              rating: 4.5,
              reviews_count: 118,
              pain_signals: ["Slow response", "Phone-heavy bookings"],
              fit_notes: "Strong candidate for MyCalls qualification.",
            },
          ],
        }),
      },
      sessionId: "static-mutation",
      version: initialVersion,
    });
    const stored = JSON.parse(storage.getItem(V2_STORAGE_KEY));

    assert.ok(result.payload.google_inbound_items.some((item) => item.maps_url === "https://maps.google.com/?cid=jeddah-fix-team"));
    assert.ok(Number(result.version) > initialVersion);
    assert.ok(Number(stored.state._meta.version || 0) > initialVersion);
    assert.ok(Array.isArray(stored.audit_records));
  } finally {
    global.window = originalWindow;
    global.fetch = originalFetch;
  }
});

test("GET /state returns isolated state", async () => {
  const { app, baseUrl } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/state`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(payload.whatsapp_items));
    assert.ok(Array.isArray(payload.google_maps_missions));
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
        "X-User": "app-test",
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

test("live mode supports POST and PATCH for Google collections with version headers", async () => {
  const { app, baseUrl } = await startTestServer();
  try {
    const createdTemplate = await fetch(`${baseUrl}/google_prompt_templates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User": "app-test",
      },
      body: JSON.stringify({
        id: "tpl-test",
        workflow: "maps-search",
        name: "Maps Search Test Template",
        base_prompt: "Find companies with strong phone dependence.",
        output_contract_json: "{\"results\":[]}",
        active: true,
      }),
    });
    const templatePayload = await createdTemplate.json();

    assert.equal(createdTemplate.status, 201);
    assert.ok(templatePayload.google_prompt_templates.some((item) => item.id === "tpl-test"));
    assert.ok(Number(createdTemplate.headers.get("X-State-Version")) >= 1);

    const patchedMission = await fetch(`${baseUrl}/google_maps_missions/gm-ksa-service`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-User": "app-test",
      },
      body: JSON.stringify({ status: "Shortlist Pending", maps_agent_one_box_one: "Custom maps agent copy" }),
    });
    const missionPayload = await patchedMission.json();

    assert.equal(patchedMission.status, 200);
    assert.equal(missionPayload.google_maps_missions.find((item) => item.id === "gm-ksa-service").status, "Shortlist Pending");
    assert.equal(missionPayload.google_maps_missions.find((item) => item.id === "gm-ksa-service").maps_agent_one_box_one, "Custom maps agent copy");

    const patchedLead = await fetch(`${baseUrl}/google_inbound_items/gmlead-1`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-User": "app-test",
      },
      body: JSON.stringify({ status: "Disqualified" }),
    });
    const leadPayload = await patchedLead.json();

    assert.equal(patchedLead.status, 200);
    assert.equal(leadPayload.google_inbound_items.find((item) => item.id === "gmlead-1").status, "Disqualified");

    const patchedCampaign = await fetch(`${baseUrl}/google_rank_tasks/gseo-2`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-User": "app-test",
      },
      body: JSON.stringify({ campaign_status: "Cluster Ready", article_title_pairs_json: JSON.stringify([{ subkeyword: "saudi seo", primary_title: "Title 1", secondary_title: "Title 2" }]) }),
    });
    const campaignPayload = await patchedCampaign.json();

    assert.equal(patchedCampaign.status, 200);
    assert.equal(campaignPayload.google_rank_tasks.find((item) => item.id === "gseo-2").campaign_status, "Cluster Ready");
    assert.equal(campaignPayload.google_rank_tasks.find((item) => item.id === "gseo-2").article_title_pairs_json, JSON.stringify([{ subkeyword: "saudi seo", primary_title: "Title 1", secondary_title: "Title 2" }]));
    assert.ok(Number(patchedCampaign.headers.get("X-State-Version")) > Number(createdTemplate.headers.get("X-State-Version")));
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
        "X-User": "app-test",
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
        "X-User": "app-test",
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
        "X-User": "app-test",
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

test("Google Maps conversion only works from qualified maps leads", async () => {
  const { app, baseUrl } = await startTestServer();
  try {
    const nonQualified = await fetch(`${baseUrl}/conversions/qualified-leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User": "app-test",
      },
      body: JSON.stringify({
        id: "ql-gm-bad",
        source_entity: "google_inbound_items",
        source_id: "gmlead-1",
        pain_summary: "Still not ready",
        qualification_note: "Needs more validation",
        recommended_service: "mycalls",
        recommended_service_confidence: "medium",
      }),
    });
    const nonQualifiedPayload = await nonQualified.json();

    assert.equal(nonQualified.status, 400);
    assert.match(nonQualifiedPayload.error, /not ready for qualified lead conversion/i);

    const wrongSource = await fetch(`${baseUrl}/conversions/qualified-leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User": "app-test",
      },
      body: JSON.stringify({
        id: "ql-gseo-bad",
        source_entity: "google_rank_tasks",
        source_id: "gseo-1",
        pain_summary: "Wrong source",
        qualification_note: "Should fail",
        recommended_service: "mycalls",
        recommended_service_confidence: "medium",
      }),
    });
    const wrongSourcePayload = await wrongSource.json();

    assert.equal(wrongSource.status, 400);
    assert.match(wrongSourcePayload.error, /Google Maps leads/i);
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
        "X-User": "app-test",
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
        "X-User": "app-test",
      },
      body: JSON.stringify({ handoff_status: "Ready for Opportunity" }),
    });

    response = await fetch(`${baseUrl}/opportunities`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User": "app-test",
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
        "X-User": "app-test",
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

test("maps search import rejects invalid JSON and duplicate maps_url values within the mission", async () => {
  const { app, baseUrl } = await startTestServer();
  try {
    const invalid = await fetch(`${baseUrl}/google_maps_missions/gm-ksa-service/import-search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User": "app-test",
      },
      body: JSON.stringify({
        slot_key: "research_primary",
        result_json: "{bad json",
      }),
    });
    const invalidPayload = await invalid.json();

    assert.equal(invalid.status, 400);
    assert.match(invalidPayload.error, /invalid/i);

    const duplicate = await fetch(`${baseUrl}/google_maps_missions/gm-ksa-service/import-search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User": "app-test",
      },
      body: JSON.stringify({
        slot_key: "research_primary",
        result_json: JSON.stringify({
          mission_id: "gm-ksa-service",
          results: [
            {
              company_name: "FastHome Cooling",
              maps_url: "https://maps.google.com/?cid=fasthome-cooling",
              city: "Jeddah",
              category: "AC repair",
              rating: 4.1,
              reviews_count: 93,
              pain_signals: ["Weekend demand spikes"],
              fit_notes: "Already exists",
            },
          ],
        }),
      }),
    });
    const duplicatePayload = await duplicate.json();

    assert.equal(duplicate.status, 400);
    assert.match(duplicatePayload.error, /Duplicate maps_url/i);
  } finally {
    await app.stop();
  }
});

test("maps shortlist import updates only the matching mission leads", async () => {
  const { app, baseUrl } = await startTestServer();
  try {
    const response = await fetch(`${baseUrl}/google_maps_missions/gm-ksa-service/import-shortlist`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User": "app-test",
      },
      body: JSON.stringify({
        slot_key: "shortlist",
        result_json: JSON.stringify({
          mission_id: "gm-ksa-service",
          shortlist: [
            {
              maps_url: "https://maps.google.com/?cid=fasthome-cooling",
              lead_score: 82,
              score_breakdown: {
                call_dependency: 26,
                pain_signal: 20,
                commercial_fit: 18,
                demand_volume: 10,
                contactability: 8,
              },
              tier: "A",
              recommended_service: "mycalls",
              qualification_note: "Very strong service-business fit.",
            },
          ],
        }),
      }),
    });
    const payload = await response.json();
    const updated = payload.google_inbound_items.find((item) => item.id === "gmlead-4");
    const untouched = payload.google_inbound_items.find((item) => item.id === "gmlead-1");

    assert.equal(response.status, 200);
    assert.equal(updated.status, "Shortlisted");
    assert.equal(updated.score_tier, "A");
    assert.equal(updated.recommended_service, "mycalls");
    assert.equal(untouched.status, "Scored");
  } finally {
    await app.stop();
  }
});

test("search import routes populate campaigns and article planner enforces exactly 10 ideas", async () => {
  const { app, baseUrl } = await startTestServer();
  try {
    const keywordStrategy = await fetch(`${baseUrl}/google_rank_tasks/gseo-2/import-keyword-strategy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User": "app-test",
      },
      body: JSON.stringify({
        slot_key: "keyword_strategy",
        result_json: JSON.stringify({
          primary_keyword: "call answering service for clinics in riyadh",
          target_intent: "commercial",
          target_page: "/services/mycalls/clinics",
        }),
      }),
    });
    const keywordPayload = await keywordStrategy.json();

    assert.equal(keywordStrategy.status, 200);
    assert.equal(keywordPayload.google_rank_tasks.find((item) => item.id === "gseo-2").primary_keyword, "call answering service for clinics in riyadh");

    const subkeywordCluster = await fetch(`${baseUrl}/google_rank_tasks/gseo-2/import-subkeyword-cluster`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User": "app-test",
      },
      body: JSON.stringify({
        slot_key: "subkeyword_cluster",
        result_json: JSON.stringify({
          subkeywords: ["clinic call overflow", "medical center missed calls", "clinic booking follow up"],
        }),
      }),
    });
    const subkeywordPayload = await subkeywordCluster.json();

    assert.equal(subkeywordCluster.status, 200);
    assert.equal(subkeywordPayload.google_rank_tasks.find((item) => item.id === "gseo-2").subkeywords.length, 3);

    const invalidArticlePlan = await fetch(`${baseUrl}/google_rank_tasks/gseo-2/import-article-planner`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User": "app-test",
      },
      body: JSON.stringify({
        slot_key: "article_planner",
        result_json: JSON.stringify({
          article_ideas: makeArticleIdeas(9),
        }),
      }),
    });
    const invalidPayload = await invalidArticlePlan.json();

    assert.equal(invalidArticlePlan.status, 400);
    assert.match(invalidPayload.error, /exactly 10 article ideas/i);

    const validArticlePlan = await fetch(`${baseUrl}/google_rank_tasks/gseo-2/import-article-planner`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User": "app-test",
      },
      body: JSON.stringify({
        slot_key: "article_planner",
        result_json: JSON.stringify({
          article_ideas: makeArticleIdeas(10),
        }),
      }),
    });
    const validPayload = await validArticlePlan.json();

    assert.equal(validArticlePlan.status, 200);
    assert.equal(validPayload.google_rank_tasks.find((item) => item.id === "gseo-2").article_ideas.length, 10);
  } finally {
    await app.stop();
  }
});

test("search campaigns stop creating new records after ten active campaigns", async () => {
  const { app, baseUrl } = await startTestServer();
  try {
    for (let index = 0; index < 8; index += 1) {
      const response = await fetch(`${baseUrl}/google_rank_tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User": "app-test",
        },
        body: JSON.stringify({
          id: `gseo-extra-${index + 1}`,
          primary_keyword: `keyword ${index + 1}`,
          country: "Saudi Arabia",
          target_intent: "commercial",
          target_page: `/services/mycalls/${index + 1}`,
          campaign_status: "Brief",
          next_step: "Run keyword strategy",
          next_step_date: "2026-04-17",
        }),
      });

      assert.equal(response.status, 201);
    }

    const overflow = await fetch(`${baseUrl}/google_rank_tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User": "app-test",
      },
      body: JSON.stringify({
        id: "gseo-overflow",
        primary_keyword: "keyword overflow",
        country: "Saudi Arabia",
        target_intent: "commercial",
        target_page: "/services/mycalls/overflow",
        campaign_status: "Brief",
        next_step: "Run keyword strategy",
        next_step_date: "2026-04-17",
      }),
    });
    const overflowPayload = await overflow.json();

    assert.equal(overflow.status, 400);
    assert.match(overflowPayload.error, /maximum of 10 active campaigns/i);
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
    assert.match(await opportunity.text(), /bootstrapApp/);
  } finally {
    await app.stop();
  }
});

test("google tab routing normalizes legacy values into the new Maps and Search tabs", () => {
  assert.equal(normalizeGoogleTab("inbound"), "maps-ops");
  assert.equal(normalizeGoogleTab("rank-ops"), "search-ops");
  assert.equal(normalizeGoogleTab("unknown"), "maps-ops");
  assert.equal(
    routeForPath("google", { basePath: "/My-Calles", locale: "en", googleTab: "rank-ops" }),
    "/My-Calles/en/google/?tab=search-ops",
  );
  assert.equal(
    routeForPath("google", { basePath: "/My-Calles", locale: "ar", googleTab: "search-ops" }),
    "/My-Calles/ar/google/?tab=search-ops",
  );
  assert.equal(
    routeForPath("google", { basePath: "/My-Calles", locale: "ar", googleTab: "unknown" }),
    "/My-Calles/ar/google/",
  );
});

test("root locale entrypoints render the canonical unversioned shell", async () => {
  const { app, baseUrl } = await startTestServer();
  try {
    const root = await fetch(`${baseUrl}/`);
    const english = await fetch(`${baseUrl}/en/`);
    const arabic = await fetch(`${baseUrl}/ar/`);
    const rootHtml = await root.text();
    const englishHtml = await english.text();
    const arabicHtml = await arabic.text();

    assert.match(rootHtml, /en\//);
    assert.match(englishHtml, /bootstrapApp/);
    assert.match(arabicHtml, /bootstrapApp/);
    assert.doesNotMatch(englishHtml, /MyCalls\s+V\d|Channel Ops\s+V\d|>V\d</);
    assert.doesNotMatch(arabicHtml, /نظام التشغيل\s+V\d|تشغيل القنوات\s+V\d|>V\d</);
  } finally {
    await app.stop();
  }
});

test("legacy compatibility API routes redirect to canonical endpoints", async () => {
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

test("legacy compatibility frontend routes redirect to canonical localized routes", async () => {
  const { app, baseUrl } = await startTestServer();
  try {
    const home = await fetch(`${baseUrl}/en/v2/`, { redirect: "manual" });
    const workspace = await fetch(`${baseUrl}/ar/v2/google/?tab=rank-ops`, { redirect: "manual" });
    const opportunity = await fetch(`${baseUrl}/en/v2/opportunities/opp-1/`, { redirect: "manual" });

    assert.equal(home.status, 302);
    assert.equal(home.headers.get("location"), "/en/");
    assert.equal(workspace.status, 302);
    assert.equal(workspace.headers.get("location"), "/ar/google/?tab=rank-ops");
    assert.equal(opportunity.status, 302);
    assert.equal(opportunity.headers.get("location"), "/en/opportunities/opp-1/");
  } finally {
    await app.stop();
  }
});
