const OPPORTUNITY_STAGES = [
  "Discovery",
  "Qualified Interest",
  "Demo Needed",
  "Pilot Candidate",
  "Proposal Stage",
  "Negotiation",
  "Close Ready",
  "Won",
  "Lost",
  "Delayed",
];

function toIsoDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString().slice(0, 10);
}

function todayDate() {
  return toIsoDate(new Date());
}

function addDays(days, start = new Date()) {
  const date = new Date(start);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

function deepClone(value) {
  return structuredClone(value);
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function compareDateOnly(dateA, dateB) {
  return String(dateA || "").localeCompare(String(dateB || ""));
}

function isOpportunityClosed(stage) {
  return stage === "Won" || stage === "Lost";
}

function getComputedOpportunityStage(opportunity, today = todayDate()) {
  if (isOpportunityClosed(opportunity.current_stage)) {
    return opportunity.current_stage;
  }

  if (!opportunity.next_step_date) {
    return opportunity.current_stage;
  }

  return compareDateOnly(opportunity.next_step_date, today) < 0 ? "Delayed" : opportunity.current_stage;
}

function validateOpportunityTransition(opportunity, nextStage) {
  const errors = [];

  if (nextStage === "Proposal Stage") {
    if (isBlank(opportunity.pain_summary)) {
      errors.push("Pain summary is required before Proposal Stage.");
    }
    if (isBlank(opportunity.use_case)) {
      errors.push("Use case is required before Proposal Stage.");
    }
    if (isBlank(opportunity.buyer_readiness)) {
      errors.push("Buyer readiness is required before Proposal Stage.");
    }
    if (isBlank(opportunity.stakeholder_status)) {
      errors.push("Stakeholder status is required before Proposal Stage.");
    }
  }

  return errors;
}

export {
  OPPORTUNITY_STAGES,
  addDays,
  deepClone,
  getComputedOpportunityStage,
  todayDate,
  validateOpportunityTransition,
};
