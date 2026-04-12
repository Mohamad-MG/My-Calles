import test from "node:test";
import assert from "node:assert/strict";

import {
  createSeedData,
  enforceSingleActiveSector,
  getComputedLeadStage,
  getLeadGuardFlags,
  getOpportunityGuardFlags,
  getComputedOpportunityStage,
  hydrateDashboardState,
  getMetrics,
  normalizeDashboardState,
  parseDashboardState,
  getRequiredValidationErrors,
  getLeadWorkflowBucket,
  serializeDashboardState,
  SOURCE_WORKFLOW_BUCKETS,
  getTodayQueue,
  hasOpportunityForLead,
  validateLeadTransition,
  validateOpportunityTransition,
} from "./logic.mjs";
import {
  getDisplayLabelMaps,
  getLocaleConfig,
  getLocaleSeedFactory,
  getStorageKey,
} from "./i18n.mjs";

test("sector creation enforces required fields", () => {
  const errors = getRequiredValidationErrors("sector", {
    sector_name: "",
    priority: "",
    status: "",
    icp: "",
    pain: "",
    offer_angle: "",
    proof_needed: "",
    final_decision: "",
  });

  assert.ok(errors.length >= 8);
});

test("only one active sector can remain after activation", () => {
  const seed = createSeedData();
  const updated = enforceSingleActiveSector(seed, "sector-real-estate");
  const activeSectors = updated.sectors.filter((sector) => sector.is_active);

  assert.equal(activeSectors.length, 1);
  assert.equal(activeSectors[0].id, "sector-real-estate");
});

test("lead becomes delayed automatically when next step date is in the past", () => {
  const seed = createSeedData();
  const delayedLead = seed.leads.find((lead) => lead.id === "lead-2");

  assert.equal(getComputedLeadStage(delayedLead), "Delayed");
});

test("lead cannot move to handoff sent without handoff summary", () => {
  const seed = createSeedData();
  const lead = seed.leads.find((item) => item.id === "lead-1");
  const errors = validateLeadTransition({ ...lead, current_stage: "Handoff Sent" }, "Handoff Sent");

  assert.ok(errors.some((error) => error.includes("Handoff summary")));
});

test("opportunity cannot move to proposal stage without readiness gates", () => {
  const errors = validateOpportunityTransition(
    {
      pain_summary: "",
      use_case: "",
      buyer_readiness: "",
      stakeholder_status: "",
    },
    "Proposal Stage",
  );

  assert.equal(errors.length, 4);
});

test("today queue is derived from records and includes bucket classification", () => {
  const seed = createSeedData();
  const queue = getTodayQueue(seed);

  assert.ok(queue.some((item) => item.bucket === "Overdue"));
  assert.ok(queue.some((item) => item.bucket === "Due Today"));
  assert.ok(queue.every((item) => ["sector", "lead", "opportunity"].includes(item.kind)));
});

test("metrics stay consistent with staged records", () => {
  const seed = createSeedData();
  const metrics = getMetrics(seed);

  assert.ok(metrics.targeted >= metrics.qualified);
  assert.ok(metrics.proposals <= metrics.demos);
  assert.ok(metrics.pipelineValue > 0);
});

test("closed-out or disqualified lead stages do not inflate positive funnel counts", () => {
  const seed = createSeedData();
  const metrics = getMetrics(seed);

  assert.equal(metrics.targeted, 4);
  assert.equal(metrics.contacted, 4);
  assert.equal(metrics.replied, 3);
});

test("opportunity becomes delayed automatically when next step date is in the past", () => {
  const seed = createSeedData();
  const delayedOpportunity = seed.opportunities.find((opportunity) => opportunity.id === "opp-3");

  assert.equal(getComputedOpportunityStage(delayedOpportunity), "Delayed");
});

test("persisted dashboard state hydrates back into normalized domain state", () => {
  const seed = createSeedData();
  seed.sectors[0].is_active = true;
  seed.sectors[1].is_active = true;
  seed.weeklyFocus.active_sector_id = "sector-real-estate";
  const serialized = serializeDashboardState(seed);
  const restored = parseDashboardState(serialized);

  assert.equal(restored.sectors.filter((sector) => sector.is_active).length, 1);
  assert.equal(restored.weeklyFocus.active_sector_id, "sector-real-estate");
});

test("normalization fills missing collections safely", () => {
  const normalized = normalizeDashboardState({
    weeklyFocus: { week: "2026-W16" },
    sectors: [{ id: "s1", sector_name: "قطاع", status: "Active", is_active: true }],
    leads: [],
    opportunities: [],
  });

  assert.equal(normalized.weeklyFocus.week, "2026-W16");
  assert.equal(normalized.sectors[0].owner, "Agent 1");
  assert.equal(normalized.sectors.filter((sector) => sector.is_active).length, 1);
});

test("normalization backfills lightweight source targets and archived lead state", () => {
  const normalized = normalizeDashboardState({
    weeklyFocus: { week: "2026-W16" },
    sectors: [{ id: "s1", sector_name: "قطاع", status: "Active", is_active: true }],
    leads: [{ id: "l1", company_name: "شركة", sector_id: "s1", contact_name: "أحمد", channel: "LinkedIn", current_stage: "New", next_step: "راجع", next_step_date: "2026-04-12" }],
    opportunities: [],
  });

  assert.equal(normalized.leads[0].archived, false);
  assert.equal(normalized.leads[0].operational_state, "active");
  assert.equal(normalized.leads[0].first_touch_at, "");
  assert.equal(normalized.leads[0].follow_up_due_at, "");
  assert.equal(normalized.leads[0].follow_up_sent_at, "");
  assert.equal(normalized.leads[0].responded_at, "");
  assert.equal(normalized.weeklyFocus.source_targets.LinkedIn, 2);
  assert.equal(normalized.weeklyFocus.source_targets.WhatsApp, 3);
});

test("normalization preserves no-active-sector state instead of inventing one", () => {
  const normalized = normalizeDashboardState({
    weeklyFocus: { week: "2026-W16", active_sector_id: "" },
    sectors: [
      { id: "s1", sector_name: "قطاع 1", status: "Paused", is_active: false },
      { id: "s2", sector_name: "قطاع 2", status: "Testing", is_active: false },
    ],
    leads: [],
    opportunities: [],
  });

  assert.equal(normalized.weeklyFocus.active_sector_id, "");
  assert.equal(normalized.weeklyFocus.current_offer, "");
  assert.equal(normalized.sectors.filter((sector) => sector.is_active).length, 0);
});

test("lead can be checked for existing opportunities before conversion", () => {
  const seed = createSeedData();

  assert.equal(hasOpportunityForLead(seed.opportunities, "lead-2"), true);
  assert.equal(hasOpportunityForLead(seed.opportunities, "lead-4"), true);
  assert.equal(hasOpportunityForLead(seed.opportunities, "lead-1"), false);
});

test("lead guard flags expose missing handoff and overdue states", () => {
  const seed = createSeedData();
  const lead = seed.leads.find((item) => item.id === "lead-4");
  const flags = getLeadGuardFlags(lead);

  assert.ok(flags.some((flag) => flag.label === "Handoff missing"));
});

test("opportunity guard flags expose readiness gaps", () => {
  const flags = getOpportunityGuardFlags({
    current_stage: "Qualified Interest",
    pain_summary: "",
    use_case: "",
    buyer_readiness: "",
    stakeholder_status: "",
    next_step_date: "",
  });

  assert.ok(flags.some((flag) => flag.label === "Readiness missing"));
});

test("hydrate dashboard state recovers from invalid persisted data", () => {
  const hydrated = hydrateDashboardState("{not-valid-json");

  assert.equal(hydrated.recovered, true);
  assert.ok(Array.isArray(hydrated.data.sectors));
  assert.ok(Array.isArray(hydrated.data.leads));
  assert.ok(Array.isArray(hydrated.data.opportunities));
});

test("locale storage keys stay isolated per language", () => {
  assert.equal(getStorageKey("en"), "mycalls-operational-dashboard.v1.en");
  assert.equal(getStorageKey("ar"), "mycalls-operational-dashboard.v1.ar");
  assert.notEqual(getStorageKey("en"), getStorageKey("ar"));
});

test("locale configs expose explicit language direction", () => {
  assert.equal(getLocaleConfig("en").meta.lang, "en");
  assert.equal(getLocaleConfig("en").meta.dir, "ltr");
  assert.equal(getLocaleConfig("ar").meta.lang, "ar");
  assert.equal(getLocaleConfig("ar").meta.dir, "rtl");
});

test("display maps stay canonical-key based across locales", () => {
  const enDisplay = getDisplayLabelMaps("en");
  const arDisplay = getDisplayLabelMaps("ar");

  assert.equal(enDisplay.leadStages["Handoff Sent"], "Handoff Sent");
  assert.equal(arDisplay.leadStages["Handoff Sent"], "تم التسليم");
  assert.equal(arDisplay.breakOptions["Offer clarity"], "وضوح العرض");
});

test("locale seed factories preserve shared domain parity", () => {
  const seed = createSeedData();
  const enSeed = getLocaleSeedFactory("en")(seed);
  const arSeed = getLocaleSeedFactory("ar")(seed);

  assert.equal(enSeed.sectors.length, arSeed.sectors.length);
  assert.equal(enSeed.leads.length, arSeed.leads.length);
  assert.equal(enSeed.opportunities.length, arSeed.opportunities.length);
  assert.equal(enSeed.weeklyFocus.active_sector_id, arSeed.weeklyFocus.active_sector_id);
});

test("source workflow buckets stay canonical and ordered", () => {
  assert.deepEqual(SOURCE_WORKFLOW_BUCKETS, [
    "New",
    "Needs Extraction",
    "Needs Reply",
    "Needs Qualification",
    "Ready for Handoff",
    "Closed / Disqualified",
  ]);
});

test("lead workflow bucket mapping follows source-first display rules", () => {
  const seed = createSeedData();

  const newLead = { ...seed.leads[0], id: "lead-new", current_stage: "New" };
  const targetedLead = { ...seed.leads[0], id: "lead-targeted", current_stage: "Targeted" };
  const repliedLead = { ...seed.leads[0], id: "lead-replied", current_stage: "Replied" };
  const qualifiedLead = { ...seed.leads[0], id: "lead-qualified", current_stage: "Qualified" };
  const handoffLead = {
    ...seed.leads.find((lead) => lead.id === "lead-2"),
    id: "lead-handoff-ready",
    next_step_date: "",
  };
  const closedLead = seed.leads.find((lead) => lead.id === "lead-5");
  const progressedLead = seed.leads.find((lead) => lead.id === "lead-4");

  assert.equal(getLeadWorkflowBucket(newLead, seed.opportunities), "New");
  assert.equal(getLeadWorkflowBucket(targetedLead, seed.opportunities), "Needs Extraction");
  assert.equal(getLeadWorkflowBucket(repliedLead, seed.opportunities), "Needs Reply");
  assert.equal(getLeadWorkflowBucket(qualifiedLead, seed.opportunities), "Needs Qualification");
  assert.equal(getLeadWorkflowBucket(handoffLead, seed.opportunities), "Ready for Handoff");
  assert.equal(getLeadWorkflowBucket(closedLead, seed.opportunities), "Closed / Disqualified");
  assert.equal(getLeadWorkflowBucket(progressedLead, seed.opportunities), "Progressed");
});
