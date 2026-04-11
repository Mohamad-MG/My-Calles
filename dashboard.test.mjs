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
  serializeDashboardState,
  getTodayQueue,
  validateLeadTransition,
  validateOpportunityTransition,
} from "./logic.mjs";

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
