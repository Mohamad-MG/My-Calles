const LEAD_STAGES = [
  "New",
  "Targeted",
  "Contacted",
  "Replied",
  "Qualified",
  "Meeting Booked",
  "Handoff Sent",
  "Disqualified",
  "No Response",
  "Delayed",
];

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

const BREAK_OPTIONS = [
  "Sector selection",
  "Offer clarity",
  "Outreach messaging",
  "Qualification",
  "Handoff quality",
  "Discovery quality",
  "Objection handling",
  "Proposal timing",
  "No-decision drift",
];

const SOURCE_WORKFLOW_BUCKETS = [
  "New",
  "Needs Extraction",
  "Needs Reply",
  "Needs Qualification",
  "Ready for Handoff",
  "Closed / Disqualified",
];

const STORAGE_KEY = "mycalls-operational-dashboard.v1";
const STORAGE_VERSION = 1;

const LEAD_REQUIRED_FIELDS = [
  "company_name",
  "sector_id",
  "contact_name",
  "channel",
  "owner",
  "current_stage",
  "next_step",
  "next_step_date",
];

const OPPORTUNITY_REQUIRED_FIELDS = [
  "company_name",
  "sector_id",
  "owner",
  "current_stage",
  "buyer_readiness",
  "pain_summary",
  "next_step",
  "next_step_date",
];

const SECTOR_REQUIRED_FIELDS = [
  "sector_name",
  "priority",
  "status",
  "icp",
  "pain",
  "offer_angle",
  "proof_needed",
  "final_decision",
];

const SECTOR_DEFAULTS = {
  id: "",
  sector_name: "",
  priority: "Medium",
  status: "Testing",
  icp: "",
  pain: "",
  offer_angle: "",
  urgency_angle: "",
  proof_needed: "",
  final_decision: "",
  why_this_sector: "",
  why_now: "",
  disqualify_rules: "",
  score: 0,
  is_active: false,
  owner: "Agent 1",
  next_step: "",
  next_step_date: "",
  notes: "",
  created_at: "",
  updated_at: "",
};

const LEAD_DEFAULTS = {
  id: "",
  company_name: "",
  sector_id: "",
  contact_name: "",
  role: "",
  channel: "",
  owner: "Agent 2",
  lead_score: 0,
  pain_signal: "",
  urgency_level: "Medium",
  decision_level: "",
  interest_type: "",
  current_stage: "New",
  last_contact_date: "",
  next_step: "",
  next_step_date: "",
  notes: "",
  handoff_summary: "",
  archived: false,
  operational_state: "active",
  first_touch_at: "",
  follow_up_due_at: "",
  follow_up_sent_at: "",
  responded_at: "",
  stage_updated_at: "",
  created_at: "",
  updated_at: "",
};

const OPPORTUNITY_DEFAULTS = {
  id: "",
  origin_lead_id: "",
  company_name: "",
  sector_id: "",
  owner: "Agent 3",
  estimated_value: 0,
  current_stage: "Discovery",
  buyer_readiness: "",
  stakeholder_status: "",
  stakeholder_map: "",
  pain_summary: "",
  use_case: "",
  objection_summary: "",
  close_probability: 0,
  risk_flag: "Medium",
  next_step: "",
  next_step_date: "",
  decision_status: "",
  stage_updated_at: "",
  created_at: "",
  updated_at: "",
};

const WEEKLY_FOCUS_DEFAULTS = {
  week: "",
  active_sector_id: "",
  current_offer: "",
  weekly_target: "",
  current_bottleneck: "",
  decisions_needed: "",
  owner_notes: "",
  top_objection: "",
  source_targets: {},
};

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

function compareDateOnly(dateA, dateB) {
  return dateA.localeCompare(dateB);
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function coerceNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function stageIndex(stages, stage) {
  return Math.max(stages.indexOf(stage), 0);
}

function stageAtOrAfter(stages, current, minimum) {
  return stageIndex(stages, current) >= stageIndex(stages, minimum);
}

function hasOpportunityForLead(opportunities, leadId) {
  return opportunities.some((opportunity) => opportunity.origin_lead_id === leadId);
}

function getLeadWorkflowBucket(lead, opportunities = [], today = todayDate()) {
  if (!lead) {
    return "New";
  }

  if (hasOpportunityForLead(opportunities, lead.id)) {
    return "Progressed";
  }

  const computedStage = getComputedLeadStage(lead, today);

  if (["Disqualified", "No Response"].includes(computedStage)) {
    return "Closed / Disqualified";
  }

  if (computedStage === "Handoff Sent" && lead.handoff_summary) {
    return "Ready for Handoff";
  }

  if (["Qualified", "Meeting Booked"].includes(computedStage)) {
    return "Needs Qualification";
  }

  if (["Contacted", "Replied", "Delayed"].includes(computedStage)) {
    return "Needs Reply";
  }

  if (["New", "Targeted"].includes(computedStage)) {
    return lead.current_stage === "New" ? "New" : "Needs Extraction";
  }

  return "Needs Extraction";
}

function isLeadClosed(stage) {
  return ["Disqualified", "No Response"].includes(stage);
}

function isOpportunityClosed(stage) {
  return ["Won", "Lost"].includes(stage);
}

function isSectorClosed(status) {
  return status === "Rejected";
}

function getComputedLeadStage(lead, today = todayDate()) {
  if (isLeadClosed(lead.current_stage)) {
    return lead.current_stage;
  }

  if (!lead.next_step_date) {
    return lead.current_stage;
  }

  return compareDateOnly(lead.next_step_date, today) < 0 ? "Delayed" : lead.current_stage;
}

function getComputedOpportunityStage(opportunity, today = todayDate()) {
  if (isOpportunityClosed(opportunity.current_stage)) {
    return opportunity.current_stage;
  }

  if (!opportunity.next_step_date) {
    return opportunity.current_stage;
  }

  return compareDateOnly(opportunity.next_step_date, today) < 0
    ? "Delayed"
    : opportunity.current_stage;
}

function getComputedSectorStatus(sector, today = todayDate()) {
  if (isSectorClosed(sector.status)) {
    return sector.status;
  }

  if (!sector.next_step_date) {
    return sector.status;
  }

  return compareDateOnly(sector.next_step_date, today) < 0 ? "Delayed" : sector.status;
}

function getRequiredValidationErrors(type, draft) {
  const requiredFields =
    type === "sector"
      ? SECTOR_REQUIRED_FIELDS
      : type === "lead"
        ? LEAD_REQUIRED_FIELDS
        : OPPORTUNITY_REQUIRED_FIELDS;

  return requiredFields
    .filter((field) => isBlank(draft[field]))
    .map((field) => `Field "${field}" is required.`);
}

function validateLeadTransition(lead, nextStage) {
  const errors = [];

  if (nextStage === "Meeting Booked") {
    if (isBlank(lead.pain_signal)) {
      errors.push("Pain signal is required before moving to Meeting Booked.");
    }
    if (isBlank(lead.owner)) {
      errors.push("Owner is required before moving to Meeting Booked.");
    }
    if (isBlank(lead.next_step)) {
      errors.push("Next step is required before moving to Meeting Booked.");
    }
  }

  if (nextStage === "Handoff Sent" && isBlank(lead.handoff_summary)) {
    errors.push("Handoff summary is required before moving to Handoff Sent.");
  }

  return errors;
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

function getOpportunityReadinessGaps(opportunity) {
  const gaps = [];

  if (isBlank(opportunity.pain_summary)) {
    gaps.push("pain_summary");
  }
  if (isBlank(opportunity.use_case)) {
    gaps.push("use_case");
  }
  if (isBlank(opportunity.buyer_readiness)) {
    gaps.push("buyer_readiness");
  }
  if (isBlank(opportunity.stakeholder_status)) {
    gaps.push("stakeholder_status");
  }

  return gaps;
}

function getLeadGuardFlags(lead, today = todayDate()) {
  const flags = [];

  if (getComputedLeadStage(lead, today) === "Delayed") {
    flags.push({ type: "danger", label: "Overdue" });
  }

  if (
    stageAtOrAfter(LEAD_STAGES, lead.current_stage, "Meeting Booked") &&
    isBlank(lead.handoff_summary)
  ) {
    flags.push({ type: "warning", label: "Handoff missing" });
  }

  if (isBlank(lead.owner) || isBlank(lead.next_step) || isBlank(lead.next_step_date)) {
    flags.push({ type: "warning", label: "Next step missing" });
  }

  return flags;
}

function getOpportunityGuardFlags(opportunity, today = todayDate()) {
  const flags = [];

  if (getComputedOpportunityStage(opportunity, today) === "Delayed") {
    flags.push({ type: "danger", label: "Overdue" });
  }

  if (getOpportunityReadinessGaps(opportunity).length) {
    flags.push({ type: "warning", label: "Readiness missing" });
  }

  return flags;
}

function canCreateOpportunityFromLead(lead) {
  return lead && lead.current_stage === "Handoff Sent" && !isBlank(lead.handoff_summary);
}

function countLeadMilestone(leads, stages) {
  return leads.filter((lead) => stages.includes(lead.current_stage)).length;
}

function countOpportunityMilestone(opportunities, stages) {
  return opportunities.filter((opportunity) => stages.includes(opportunity.current_stage)).length;
}

function getTodayQueue(state, today = todayDate()) {
  const upcomingLimit = addDays(7, new Date(today));
  const queue = [];

  state.sectors.forEach((sector) => {
    if (
      sector.next_step_date &&
      sector.owner &&
      !isSectorClosed(sector.status) &&
      !isBlank(sector.next_step)
    ) {
      queue.push({
        kind: "sector",
        id: sector.id,
        title: sector.sector_name,
        owner: sector.owner,
        stage: getComputedSectorStatus(sector, today),
        next_step: sector.next_step,
        next_step_date: sector.next_step_date,
      });
    }
  });

  state.leads.forEach((lead) => {
    if (
      lead.next_step_date &&
      !isLeadClosed(lead.current_stage) &&
      !isBlank(lead.next_step)
    ) {
      queue.push({
        kind: "lead",
        id: lead.id,
        title: lead.company_name,
        owner: lead.owner,
        stage: getComputedLeadStage(lead, today),
        next_step: lead.next_step,
        next_step_date: lead.next_step_date,
      });
    }
  });

  state.opportunities.forEach((opportunity) => {
    if (
      opportunity.next_step_date &&
      !isOpportunityClosed(opportunity.current_stage) &&
      !isBlank(opportunity.next_step)
    ) {
      queue.push({
        kind: "opportunity",
        id: opportunity.id,
        title: opportunity.company_name,
        owner: opportunity.owner,
        stage: getComputedOpportunityStage(opportunity, today),
        next_step: opportunity.next_step,
        next_step_date: opportunity.next_step_date,
      });
    }
  });

  return queue
    .map((item) => {
      let bucket = null;
      if (compareDateOnly(item.next_step_date, today) < 0) {
        bucket = "Overdue";
      } else if (item.next_step_date === today) {
        bucket = "Due Today";
      } else if (compareDateOnly(item.next_step_date, upcomingLimit) <= 0) {
        bucket = "Upcoming";
      }

      return bucket ? { ...item, bucket } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.next_step_date.localeCompare(right.next_step_date));
}

function countByStage(items) {
  return items.reduce((accumulator, item) => {
    accumulator[item] = (accumulator[item] || 0) + 1;
    return accumulator;
  }, {});
}

function getMetrics(state, today = todayDate()) {
  const computedLeadStages = state.leads.map((lead) => getComputedLeadStage(lead, today));
  const computedOpportunityStages = state.opportunities.map((opportunity) =>
    getComputedOpportunityStage(opportunity, today),
  );

  const targeted = countLeadMilestone(state.leads, [
    "Targeted",
    "Contacted",
    "Replied",
    "Qualified",
    "Meeting Booked",
    "Handoff Sent",
  ]);
  const contacted = countLeadMilestone(state.leads, [
    "Contacted",
    "Replied",
    "Qualified",
    "Meeting Booked",
    "Handoff Sent",
  ]);
  const replied = countLeadMilestone(state.leads, [
    "Replied",
    "Qualified",
    "Meeting Booked",
    "Handoff Sent",
  ]);
  const qualified = countLeadMilestone(state.leads, [
    "Qualified",
    "Meeting Booked",
    "Handoff Sent",
  ]);
  const meetings = countLeadMilestone(state.leads, ["Meeting Booked", "Handoff Sent"]);
  const handoffs = countLeadMilestone(state.leads, ["Handoff Sent"]);

  const discoveries = countOpportunityMilestone(state.opportunities, [
    "Discovery",
    "Qualified Interest",
    "Demo Needed",
    "Pilot Candidate",
    "Proposal Stage",
    "Negotiation",
    "Close Ready",
  ]);
  const demos = countOpportunityMilestone(state.opportunities, [
    "Demo Needed",
    "Pilot Candidate",
    "Proposal Stage",
    "Negotiation",
    "Close Ready",
  ]);
  const proposals = countOpportunityMilestone(state.opportunities, [
    "Proposal Stage",
    "Negotiation",
    "Close Ready",
  ]);
  const wins = state.opportunities.filter((opportunity) => opportunity.current_stage === "Won").length;

  const activePipelineValue = state.opportunities
    .filter((opportunity) => !["Won", "Lost"].includes(opportunity.current_stage))
    .reduce((total, opportunity) => total + coerceNumber(opportunity.estimated_value), 0);

  const objections = state.opportunities
    .map((opportunity) => opportunity.objection_summary)
    .filter(Boolean)
    .map((summary) => summary.split(" - ")[0]);
  const objectionCounts = countByStage(objections);
  const topObjection =
    Object.entries(objectionCounts).sort((left, right) => right[1] - left[1])[0]?.[0] || "No clear pattern";

  const delayedLeadStages = countByStage(
    state.leads
      .filter((lead) => getComputedLeadStage(lead, today) === "Delayed")
      .map((lead) => lead.current_stage),
  );
  const delayedOpportunityStages = countByStage(
    state.opportunities
      .filter((opportunity) => getComputedOpportunityStage(opportunity, today) === "Delayed")
      .map((opportunity) => opportunity.current_stage),
  );
  const combinedDelayedStages = { ...delayedLeadStages };
  Object.entries(delayedOpportunityStages).forEach(([stage, value]) => {
    combinedDelayedStages[stage] = (combinedDelayedStages[stage] || 0) + value;
  });
  const mostDelayedStage =
    Object.entries(combinedDelayedStages).sort((left, right) => right[1] - left[1])[0]?.[0] ||
    "No delayed stage";

  const replyRate = contacted ? replied / contacted : 0;
  const meetingConversion = qualified ? meetings / qualified : 0;
  const proposalConversion = demos ? proposals / demos : 0;
  const winRate = proposals ? wins / proposals : 0;
  const delayedNegotiations = state.opportunities.filter(
    (opportunity) =>
      ["Negotiation", "Close Ready"].includes(opportunity.current_stage) &&
      getComputedOpportunityStage(opportunity, today) === "Delayed",
  ).length;

  let breakSuggestion = "Sector selection";
  if (!state.sectors.some((sector) => sector.is_active)) {
    breakSuggestion = "Sector selection";
  } else if (state.sectors.some((sector) => sector.is_active && (sector.score || 0) < 70)) {
    breakSuggestion = "Offer clarity";
  } else if (replyRate < 0.25) {
    breakSuggestion = "Outreach messaging";
  } else if (qualified && meetingConversion < 0.45) {
    breakSuggestion = "Qualification";
  } else if (handoffs && discoveries / handoffs < 0.75) {
    breakSuggestion = "Handoff quality";
  } else if (
    state.opportunities.some(
      (opportunity) =>
        ["Discovery", "Qualified Interest"].includes(opportunity.current_stage) &&
        getComputedOpportunityStage(opportunity, today) === "Delayed",
    )
  ) {
    breakSuggestion = "Discovery quality";
  } else if (proposalConversion < 0.5) {
    breakSuggestion = "Proposal timing";
  } else if (delayedNegotiations > 0) {
    breakSuggestion = "No-decision drift";
  } else if (winRate < 0.35) {
    breakSuggestion = "Objection handling";
  }

  return {
    targeted,
    contacted,
    replyRate,
    replied,
    qualified,
    meetingConversion,
    discoveries,
    demos,
    proposals,
    wins,
    pipelineValue: activePipelineValue,
    topObjection,
    mostDelayedStage,
    breakSuggestion: BREAK_OPTIONS.includes(breakSuggestion) ? breakSuggestion : "Offer clarity",
    computedLeadStages,
    computedOpportunityStages,
  };
}

function enforceSingleActiveSector(state, sectorId) {
  const nextState = deepClone(state);
  const hasTargetSector = nextState.sectors.some((sector) => sector.id === sectorId);
  nextState.sectors = nextState.sectors.map((sector) => ({
    ...sector,
    is_active: hasTargetSector && sector.id === sectorId,
    status:
      hasTargetSector && sector.id === sectorId
        ? "Active"
        : sector.status === "Active"
          ? "Testing"
          : sector.status,
  }));
  nextState.weeklyFocus.active_sector_id = hasTargetSector ? sectorId : "";
  const activeSector = hasTargetSector
    ? nextState.sectors.find((sector) => sector.id === sectorId)
    : null;
  if (activeSector) {
    nextState.weeklyFocus.current_offer = activeSector.offer_angle;
  } else {
    nextState.weeklyFocus.current_offer = "";
  }
  return nextState;
}

function normalizeDashboardState(candidate) {
  const seed = createSeedData();
  const nextState = {
    weeklyFocus: {
      ...WEEKLY_FOCUS_DEFAULTS,
      ...seed.weeklyFocus,
      ...(candidate?.weeklyFocus || {}),
    },
    sectors: Array.isArray(candidate?.sectors)
      ? candidate.sectors.map((sector) => ({
          ...SECTOR_DEFAULTS,
          ...sector,
        }))
      : deepClone(seed.sectors),
    leads: Array.isArray(candidate?.leads)
      ? candidate.leads.map((lead) => ({
          ...LEAD_DEFAULTS,
          ...lead,
        }))
      : deepClone(seed.leads),
    opportunities: Array.isArray(candidate?.opportunities)
      ? candidate.opportunities.map((opportunity) => ({
          ...OPPORTUNITY_DEFAULTS,
          ...opportunity,
        }))
      : deepClone(seed.opportunities),
  };

  if (!nextState.sectors.length) {
    nextState.weeklyFocus.active_sector_id = "";
    nextState.weeklyFocus.current_offer = nextState.weeklyFocus.current_offer || "";
    return nextState;
  }

  const activeSectors = nextState.sectors.filter((sector) => sector.is_active || sector.status === "Active");
  const preferredActiveId =
    nextState.sectors.find((sector) => sector.id === nextState.weeklyFocus.active_sector_id)?.id ||
    activeSectors[0]?.id ||
    "";

  const normalized = preferredActiveId
    ? enforceSingleActiveSector(nextState, preferredActiveId)
    : enforceSingleActiveSector(nextState, "");
  normalized.weeklyFocus.current_offer = normalized.weeklyFocus.active_sector_id
    ? normalized.weeklyFocus.current_offer ||
      normalized.sectors.find((sector) => sector.id === normalized.weeklyFocus.active_sector_id)
        ?.offer_angle ||
      ""
    : "";

  return normalized;
}

function serializeDashboardState(data) {
  return JSON.stringify({
    version: STORAGE_VERSION,
    data: normalizeDashboardState(data),
  });
}

function parseDashboardState(serialized) {
  if (isBlank(serialized)) {
    return createSeedData();
  }

  try {
    const parsed = JSON.parse(serialized);
    if (parsed && typeof parsed === "object" && "data" in parsed) {
      return normalizeDashboardState(parsed.data);
    }

    return normalizeDashboardState(parsed);
  } catch {
    return createSeedData();
  }
}

function hydrateDashboardState(serialized) {
  if (isBlank(serialized)) {
    return {
      data: createSeedData(),
      recovered: false,
      reason: "empty",
    };
  }

  try {
    const parsed = JSON.parse(serialized);
    const candidate = parsed && typeof parsed === "object" && "data" in parsed ? parsed.data : parsed;

    return {
      data: normalizeDashboardState(candidate),
      recovered: false,
      reason: "ok",
    };
  } catch {
    return {
      data: createSeedData(),
      recovered: true,
      reason: "invalid-json",
    };
  }
}

function createSeedData() {
  return {
    weeklyFocus: {
      week: "2026-W15",
      active_sector_id: "sector-clinics",
      current_offer: "Clinic Booking Recovery Pack",
      weekly_target: "2 discovery calls, 1 pilot candidate, 1 proposal-ready deal",
      current_bottleneck: "Outreach messaging",
      top_objection: "AI may sound robotic",
      decisions_needed: "Approve clinic proof pack and tighten first WhatsApp opener.",
      owner_notes: "Stay focused on clinics only this week.",
      source_targets: {
        WhatsApp: 3,
        Call: 2,
        LinkedIn: 2,
        Email: 2,
        Google: 1,
        Instagram: 2,
        TikTok: 1,
        YouTube: 1,
        "Competitor Comments": 1,
      },
    },
    sectors: [
      {
        id: "sector-clinics",
        sector_name: "العيادات",
        priority: "High",
        status: "Active",
        icp: "Multi-branch clinics with heavy inbound booking calls after hours.",
        pain: "Missed calls mean missed appointments and weak follow-up.",
        offer_angle: "Recover bookings and confirm appointments 24/7.",
        urgency_angle: "Every missed evening call becomes a lost booking.",
        proof_needed: "Demo call flow + booking confirmation sample.",
        final_decision: "Go",
        why_this_sector: "Pain is daily, ROI is easy to explain, and owner attention is high.",
        why_now: "Summer demand increases booking pressure and after-hours leakage.",
        disqualify_rules: "Solo practices with very low daily call volume.",
        score: 84,
        is_active: true,
        owner: "Agent 1",
        next_step: "Approve vertical proof pack",
        next_step_date: addDays(0),
        notes: "Need one anonymized proof case before wider outreach.",
      },
      {
        id: "sector-real-estate",
        sector_name: "العقارات",
        priority: "Medium",
        status: "Testing",
        icp: "Brokerages with high inquiry volume and weak lead qualification.",
        pain: "Unqualified inquiries consume team time and delay serious buyers.",
        offer_angle: "Qualify inquiries and schedule site visits automatically.",
        urgency_angle: "Slow responses push prospects to competing listings.",
        proof_needed: "Qualification script + viewing-booking workflow.",
        final_decision: "Test",
        why_this_sector: "Strong volume but needs more local proof.",
        why_now: "Demand is active but objection handling still softer than clinics.",
        disqualify_rules: "Tiny agencies with owner-only follow-up.",
        score: 66,
        is_active: false,
        owner: "Agent 1",
        next_step: "Decide go / pause after first clinic sprint",
        next_step_date: addDays(4),
        notes: "Keep warm, not active.",
      },
      {
        id: "sector-education",
        sector_name: "التعليم",
        priority: "Low",
        status: "Paused",
        icp: "Private schools and institutes with admission inquiry spikes.",
        pain: "Admission inquiries arrive unevenly and follow-up is slow.",
        offer_angle: "Capture admission inquiries and route next steps cleanly.",
        urgency_angle: "Admission windows create seasonal peaks.",
        proof_needed: "Admission intake sample + parent FAQ flow.",
        final_decision: "Pause",
        why_this_sector: "Useful later but slower decision cycle today.",
        why_now: "Not the fastest path to revenue this month.",
        disqualify_rules: "Institutes without a call-driven intake process.",
        score: 54,
        is_active: false,
        owner: "Agent 1",
        next_step: "Revisit after clinic pilot outcome",
        next_step_date: addDays(9),
        notes: "Outside current sprint.",
      },
    ],
    leads: [
      {
        id: "lead-1",
        company_name: "عيادات الصفا",
        sector_id: "sector-clinics",
        contact_name: "خالد",
        role: "Operations Manager",
        channel: "WhatsApp",
        owner: "Agent 2",
        lead_score: 31,
        pain_signal: "Missed evening booking calls",
        urgency_level: "High",
        decision_level: "Manager",
        interest_type: "Commercial",
        current_stage: "Qualified",
        last_contact_date: addDays(-1),
        next_step: "Book discovery call with clinic owner",
        next_step_date: addDays(0),
        notes: "Strong booking pain, asked about after-hours coverage.",
        handoff_summary: "",
        stage_updated_at: addDays(-1),
      },
      {
        id: "lead-2",
        company_name: "مركز العناية الطبية",
        sector_id: "sector-clinics",
        contact_name: "ريم",
        role: "Clinic Owner",
        channel: "Call",
        owner: "Agent 2",
        lead_score: 35,
        pain_signal: "Heavy call pressure during lunch and evening",
        urgency_level: "High",
        decision_level: "Owner",
        interest_type: "Ready",
        current_stage: "Handoff Sent",
        last_contact_date: addDays(-2),
        next_step: "Prepare discovery framing for owner call",
        next_step_date: addDays(-1),
        notes: "Owner wants proof on booking recovery, not AI features.",
        handoff_summary:
          "Clinic owner sees missed bookings after 6pm, wants lower-risk pilot framing and ROI clarity.",
        stage_updated_at: addDays(-2),
      },
      {
        id: "lead-3",
        company_name: "مجمع النخبة",
        sector_id: "sector-clinics",
        contact_name: "سارة",
        role: "Front Desk Supervisor",
        channel: "WhatsApp",
        owner: "Agent 2",
        lead_score: 18,
        pain_signal: "Front desk overload",
        urgency_level: "Medium",
        decision_level: "Influencer",
        interest_type: "Curious",
        current_stage: "Contacted",
        last_contact_date: addDays(-3),
        next_step: "Send tighter opener focused on missed bookings",
        next_step_date: addDays(-1),
        notes: "Replied politely once, still unclear if commercial interest exists.",
        handoff_summary: "",
        stage_updated_at: addDays(-3),
      },
      {
        id: "lead-4",
        company_name: "عيادات الندى",
        sector_id: "sector-clinics",
        contact_name: "عبدالله",
        role: "Owner",
        channel: "LinkedIn",
        owner: "Agent 2",
        lead_score: 27,
        pain_signal: "Follow-up gaps after initial inquiry",
        urgency_level: "Medium",
        decision_level: "Owner",
        interest_type: "Commercial",
        current_stage: "Meeting Booked",
        last_contact_date: addDays(-1),
        next_step: "Run discovery tomorrow at 11 AM",
        next_step_date: addDays(1),
        notes: "Open to pilot if we show low-risk entry.",
        handoff_summary: "",
        stage_updated_at: addDays(-1),
      },
      {
        id: "lead-5",
        company_name: "الوفاق العقارية",
        sector_id: "sector-real-estate",
        contact_name: "أمل",
        role: "Sales Director",
        channel: "WhatsApp",
        owner: "Agent 2",
        lead_score: 14,
        pain_signal: "",
        urgency_level: "Low",
        decision_level: "Director",
        interest_type: "Polite reply",
        current_stage: "No Response",
        last_contact_date: addDays(-8),
        next_step: "",
        next_step_date: "",
        notes: "No useful follow-up signal.",
        handoff_summary: "",
        stage_updated_at: addDays(-8),
      },
    ],
    opportunities: [
      {
        id: "opp-1",
        origin_lead_id: "lead-2",
        company_name: "مركز العناية الطبية",
        sector_id: "sector-clinics",
        owner: "Agent 3",
        estimated_value: 48000,
        current_stage: "Discovery",
        buyer_readiness: "Aware of pain but risk-sensitive",
        stakeholder_status: "Owner + operations manager identified",
        stakeholder_map: "Owner approves budget; operations manager feels the pain.",
        pain_summary: "Missed after-hours bookings and reception overload.",
        use_case: "After-hours booking capture and appointment confirmation.",
        objection_summary: "AI may sound robotic - needs proof of quality",
        close_probability: 55,
        risk_flag: "Medium",
        decision_status: "Need proof first",
        next_step: "Send discovery summary and pilot framing",
        next_step_date: addDays(0),
        stage_updated_at: addDays(-1),
      },
      {
        id: "opp-2",
        origin_lead_id: "lead-4",
        company_name: "عيادات الندى",
        sector_id: "sector-clinics",
        owner: "Agent 3",
        estimated_value: 62000,
        current_stage: "Demo Needed",
        buyer_readiness: "Comparing options",
        stakeholder_status: "Owner engaged, finance not yet present",
        stakeholder_map: "Owner leads evaluation; finance will review pricing later.",
        pain_summary: "Lead follow-up delays reduce bookings and frustrate staff.",
        use_case: "Capture inquiries and book appointments during overflow periods.",
        objection_summary: "Need clear ROI before pilot",
        close_probability: 48,
        risk_flag: "Medium",
        decision_status: "Demo before pricing",
        next_step: "Run clinic-specific demo tied to overflow calls",
        next_step_date: addDays(2),
        stage_updated_at: addDays(-2),
      },
      {
        id: "opp-3",
        origin_lead_id: "lead-legacy",
        company_name: "مجمع السمو",
        sector_id: "sector-clinics",
        owner: "Agent 3",
        estimated_value: 75000,
        current_stage: "Negotiation",
        buyer_readiness: "Ready to move",
        stakeholder_status: "Budget owner identified",
        stakeholder_map: "CEO approves; clinic manager drives urgency.",
        pain_summary: "Night shift gaps create direct booking loss.",
        use_case: "Recover bookings and confirm appointments automatically.",
        objection_summary: "Needs lower-risk starting scope",
        close_probability: 72,
        risk_flag: "Low",
        decision_status: "Commercial scope pending",
        next_step: "Lock limited-scope pilot pricing",
        next_step_date: addDays(-2),
        stage_updated_at: addDays(-3),
      },
      {
        id: "opp-4",
        origin_lead_id: "lead-old",
        company_name: "عيادات المستقبل",
        sector_id: "sector-clinics",
        owner: "Agent 3",
        estimated_value: 52000,
        current_stage: "Won",
        buyer_readiness: "Moved forward",
        stakeholder_status: "Decision complete",
        stakeholder_map: "Owner approved",
        pain_summary: "High missed-call rate after hours.",
        use_case: "Night and weekend booking capture.",
        objection_summary: "None",
        close_probability: 100,
        risk_flag: "Low",
        decision_status: "Won",
        next_step: "",
        next_step_date: "",
        stage_updated_at: addDays(-10),
      },
    ],
  };
}

export {
  BREAK_OPTIONS,
  LEAD_REQUIRED_FIELDS,
  LEAD_STAGES,
  OPPORTUNITY_REQUIRED_FIELDS,
  OPPORTUNITY_STAGES,
  SECTOR_REQUIRED_FIELDS,
  SOURCE_WORKFLOW_BUCKETS,
  STORAGE_KEY,
  STORAGE_VERSION,
  addDays,
  canCreateOpportunityFromLead,
  createSeedData,
  deepClone,
  enforceSingleActiveSector,
  getComputedLeadStage,
  getLeadGuardFlags,
  getOpportunityGuardFlags,
  getOpportunityReadinessGaps,
  getComputedOpportunityStage,
  getComputedSectorStatus,
  getMetrics,
  getRequiredValidationErrors,
  getTodayQueue,
  getLeadWorkflowBucket,
  hasOpportunityForLead,
  hydrateDashboardState,
  normalizeDashboardState,
  parseDashboardState,
  serializeDashboardState,
  isLeadClosed,
  isOpportunityClosed,
  stageIndex,
  todayDate,
  validateLeadTransition,
  validateOpportunityTransition,
};
