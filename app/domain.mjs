import {
  OPPORTUNITY_STAGES,
  addDays,
  deepClone,
  getComputedOpportunityStage,
  todayDate,
  validateOpportunityTransition,
} from "./opportunity-domain.mjs";

const APP_STORAGE_KEY = "mycalls-ops";

const ENTITY_ALIASES = {
  whatsapp_item: "whatsapp_items",
  whatsapp_items: "whatsapp_items",
  linkedin_prospect: "linkedin_prospects",
  linkedin_prospects: "linkedin_prospects",
  google_inbound_item: "google_inbound_items",
  google_inbound_items: "google_inbound_items",
  google_rank_task: "google_rank_tasks",
  google_rank_tasks: "google_rank_tasks",
  qualified_lead: "qualified_leads",
  qualified_leads: "qualified_leads",
  opportunity: "opportunities",
  opportunities: "opportunities",
};

const OPPORTUNITY_ACTIVE_STAGES = OPPORTUNITY_STAGES.filter((stage) => stage !== "Delayed");
const SERVICE_OPTIONS = ["mycalls", "nicechat", "both"];
const SERVICE_CONFIDENCE_OPTIONS = ["high", "medium", "low"];
const HANDOFF_ACTIVE_STATUSES = ["New", "Reviewing", "Ready for Opportunity"];

const COMMON_RECORD_FIELDS = {
  id: "",
  channel: "",
  status: "",
  owner: "Admin",
  summary: "",
  next_step: "",
  next_step_date: "",
  notes: "",
  converted_qualified_lead_id: "",
  created_at: "",
  updated_at: "",
  updated_by: "",
};

const WHATSAPP_DEFAULTS = {
  ...COMMON_RECORD_FIELDS,
  channel: "WhatsApp",
  status: "New",
  phone: "",
  contact_name: "",
  company_name: "",
  conversation_source: "inbound",
  last_message_at: "",
  pain_signal: "",
};

const LINKEDIN_DEFAULTS = {
  ...COMMON_RECORD_FIELDS,
  channel: "LinkedIn",
  status: "Target List",
  profile_name: "",
  company_name: "",
  role: "",
  profile_url: "",
  outreach_angle: "",
  qualification_signal: "",
};

const GOOGLE_INBOUND_DEFAULTS = {
  ...COMMON_RECORD_FIELDS,
  channel: "Google",
  status: "New",
  intent_source: "form",
  page_or_listing: "",
  contact_name: "",
  company_name: "",
  review_signal: "",
  inbound_summary: "",
};

const GOOGLE_RANK_TASK_DEFAULTS = {
  ...COMMON_RECORD_FIELDS,
  channel: "Google",
  status: "Backlog",
  keyword: "",
  page: "",
  search_intent: "",
  rank_task_type: "",
  task_summary: "",
  opportunity_note: "",
};

const QUALIFIED_LEAD_DEFAULTS = {
  id: "",
  origin_channel: "",
  origin_entity: "",
  origin_record_id: "",
  pain_summary: "",
  qualification_note: "",
  recommended_service: "mycalls",
  recommended_service_confidence: "medium",
  handoff_status: "New",
  owner: "Admin",
  notes: "",
  converted_opportunity_id: "",
  created_at: "",
  updated_at: "",
  updated_by: "",
};

const OPPORTUNITY_DEFAULTS = {
  id: "",
  qualified_lead_id: "",
  origin_channel: "",
  company_name: "",
  owner: "Admin",
  current_stage: "Discovery",
  buyer_readiness: "",
  pain_summary: "",
  use_case: "",
  stakeholder_status: "",
  stakeholder_map: "",
  estimated_value: 0,
  objection_summary: "",
  close_probability: 25,
  risk_flag: "Medium",
  decision_status: "New",
  next_step: "",
  next_step_date: "",
  notes: "",
  created_at: "",
  updated_at: "",
  updated_by: "",
};

const REQUIRED_FIELDS = {
  whatsapp_items: ["phone", "contact_name", "company_name", "summary", "next_step", "next_step_date"],
  linkedin_prospects: ["profile_name", "company_name", "role", "summary", "next_step", "next_step_date"],
  google_inbound_items: ["intent_source", "company_name", "summary", "next_step", "next_step_date"],
  google_rank_tasks: ["keyword", "page", "task_summary", "search_intent", "rank_task_type", "next_step", "next_step_date"],
  qualified_leads: ["origin_channel", "origin_entity", "origin_record_id", "pain_summary", "qualification_note", "recommended_service", "recommended_service_confidence", "handoff_status", "owner"],
  opportunities: ["qualified_lead_id", "company_name", "owner", "current_stage", "buyer_readiness", "pain_summary", "use_case", "stakeholder_status", "next_step", "next_step_date"],
};

const TRANSITION_MAPS = {
  whatsapp_items: {
    New: ["Needs Reply", "Disqualified"],
    "Needs Reply": ["Waiting Response", "Qualified", "Disqualified"],
    "Waiting Response": ["Follow-up Due", "Qualified", "Disqualified"],
    "Follow-up Due": ["Waiting Response", "Qualified", "Disqualified"],
    Qualified: [],
    Disqualified: [],
  },
  linkedin_prospects: {
    "Target List": ["Ready Outreach", "Disqualified"],
    "Ready Outreach": ["Awaiting Reply", "Disqualified"],
    "Awaiting Reply": ["In Conversation", "Disqualified"],
    "In Conversation": ["Qualified", "Disqualified"],
    Qualified: [],
    Disqualified: [],
  },
  google_inbound_items: {
    New: ["Needs Response", "Disqualified"],
    "Needs Response": ["Follow-up", "Qualified", "Disqualified"],
    "Follow-up": ["Needs Response", "Qualified", "Disqualified"],
    Qualified: [],
    Disqualified: [],
  },
  google_rank_tasks: {
    Backlog: ["In Progress", "Done"],
    "In Progress": ["Waiting Data", "Opportunity Found", "Done"],
    "Waiting Data": ["In Progress", "Done"],
    "Opportunity Found": ["Done"],
    Done: [],
  },
  qualified_leads: {
    New: ["Reviewing", "Closed / Rejected"],
    Reviewing: ["Ready for Opportunity", "Closed / Rejected"],
    "Ready for Opportunity": ["Closed / Rejected"],
    "Closed / Rejected": [],
  },
};

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function nowDate() {
  return todayDate();
}

function createId(prefix = "rec") {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

function coerceNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function resolveCollection(entity) {
  const collection = ENTITY_ALIASES[entity];
  if (!collection) {
    throw new Error(`Unknown entity "${entity}".`);
  }
  return collection;
}

function getDefaultsForCollection(collection) {
  switch (resolveCollection(collection)) {
    case "whatsapp_items":
      return WHATSAPP_DEFAULTS;
    case "linkedin_prospects":
      return LINKEDIN_DEFAULTS;
    case "google_inbound_items":
      return GOOGLE_INBOUND_DEFAULTS;
    case "google_rank_tasks":
      return GOOGLE_RANK_TASK_DEFAULTS;
    case "qualified_leads":
      return QUALIFIED_LEAD_DEFAULTS;
    case "opportunities":
      return OPPORTUNITY_DEFAULTS;
    default:
      return {};
  }
}

function withMeta(state, meta = {}) {
  return {
    ...state,
    _meta: {
      version: meta.version || 1,
      last_mutation_at: meta.lastMutationAt || null,
      last_mutation_by: meta.lastMutationBy || null,
    },
  };
}

function normalizeCollectionItems(collection, items = [], actor = "system", timestamp = nowDate()) {
  const defaults = getDefaultsForCollection(collection);
  return (Array.isArray(items) ? items : []).map((item) => ({
    ...defaults,
    ...item,
    updated_at: item.updated_at || timestamp,
    updated_by: item.updated_by || actor,
    created_at: item.created_at || timestamp,
  }));
}

function normalizeState(candidate, actor = "system", timestamp = nowDate()) {
  const state = candidate || {};
  const normalized = {
    whatsapp_items: normalizeCollectionItems("whatsapp_items", state.whatsapp_items, actor, timestamp),
    linkedin_prospects: normalizeCollectionItems("linkedin_prospects", state.linkedin_prospects, actor, timestamp),
    google_inbound_items: normalizeCollectionItems("google_inbound_items", state.google_inbound_items, actor, timestamp),
    google_rank_tasks: normalizeCollectionItems("google_rank_tasks", state.google_rank_tasks, actor, timestamp),
    qualified_leads: normalizeCollectionItems("qualified_leads", state.qualified_leads, actor, timestamp),
    opportunities: normalizeCollectionItems("opportunities", state.opportunities, actor, timestamp),
  };

  return withMeta(normalized, {
    version: Number(state?._meta?.version || 1),
    lastMutationAt: state?._meta?.last_mutation_at || timestamp,
    lastMutationBy: state?._meta?.last_mutation_by || actor,
  });
}

function getRequiredErrors(collection, record) {
  const requiredFields = REQUIRED_FIELDS[resolveCollection(collection)] || [];
  return requiredFields
    .filter((field) => isBlank(record?.[field]))
    .map((field) => `Field "${field}" is required.`);
}

function getTransitionMap(collection) {
  return TRANSITION_MAPS[resolveCollection(collection)] || null;
}

function isStatusTransitionAllowed(collection, currentStatus, nextStatus) {
  const normalizedCollection = resolveCollection(collection);
  if (!nextStatus || currentStatus === nextStatus) {
    return true;
  }

  if (normalizedCollection === "opportunities") {
    return OPPORTUNITY_ACTIVE_STAGES.includes(nextStatus);
  }

  const map = getTransitionMap(normalizedCollection);
  if (!map) {
    return true;
  }

  return (map[currentStatus] || []).includes(nextStatus);
}

function getStatusField(collection) {
  return resolveCollection(collection) === "qualified_leads"
    ? "handoff_status"
    : resolveCollection(collection) === "opportunities"
      ? "current_stage"
      : "status";
}

function validateStatusPatch(collection, beforeRecord, afterRecord) {
  const normalizedCollection = resolveCollection(collection);
  const statusField = getStatusField(normalizedCollection);
  const currentStatus = beforeRecord?.[statusField];
  const nextStatus = afterRecord?.[statusField];

  if (!isStatusTransitionAllowed(normalizedCollection, currentStatus, nextStatus)) {
    throw new Error(`Invalid transition from "${currentStatus}" to "${nextStatus}" for ${normalizedCollection}.`);
  }

  if (normalizedCollection === "opportunities") {
    const errors = validateOpportunityTransition(afterRecord, nextStatus);
    if (errors.length) {
      throw new Error(errors.join(" "));
    }
  }
}

function hasDuplicateOpportunity(state, qualifiedLeadId) {
  return (state.opportunities || []).some((item) => item.qualified_lead_id === qualifiedLeadId);
}

function isQualifiedSourceStatus(collection, status) {
  const normalizedCollection = resolveCollection(collection);
  if (normalizedCollection === "google_rank_tasks") {
    return status === "Opportunity Found";
  }
  return status === "Qualified";
}

function getSourceRecord(state, entity, id) {
  const collection = resolveCollection(entity);
  return (state[collection] || []).find((item) => item.id === id) || null;
}

function hasActiveQualifiedLead(state, originEntity, originRecordId) {
  return (state.qualified_leads || []).some(
    (lead) =>
      lead.origin_entity === resolveCollection(originEntity) &&
      lead.origin_record_id === originRecordId &&
      HANDOFF_ACTIVE_STATUSES.includes(lead.handoff_status) &&
      !lead.converted_opportunity_id,
  );
}

function getQualifiedLeadCreateErrors(state, draft) {
  const errors = getRequiredErrors("qualified_leads", draft);
  const sourceRecord = getSourceRecord(state, draft.origin_entity, draft.origin_record_id);

  if (!sourceRecord) {
    errors.push("Source record not found.");
  } else if (!isQualifiedSourceStatus(draft.origin_entity, sourceRecord.status)) {
    errors.push("Source record is not ready for qualified lead conversion.");
  }

  if (!SERVICE_OPTIONS.includes(draft.recommended_service)) {
    errors.push('Field "recommended_service" is invalid.');
  }
  if (!SERVICE_CONFIDENCE_OPTIONS.includes(draft.recommended_service_confidence)) {
    errors.push('Field "recommended_service_confidence" is invalid.');
  }
  if (hasActiveQualifiedLead(state, draft.origin_entity, draft.origin_record_id)) {
    errors.push("An active qualified lead already exists for this source record.");
  }

  return errors;
}

function getOpportunityCreateErrors(state, draft) {
  const errors = [
    ...getRequiredErrors("opportunities", draft),
    ...validateOpportunityTransition(draft, draft.current_stage),
  ];

  const sourceQualifiedLead = (state.qualified_leads || []).find((item) => item.id === draft.qualified_lead_id);
  if (!sourceQualifiedLead) {
    errors.push("Opportunity can only be created from a qualified lead.");
  } else if (sourceQualifiedLead.handoff_status !== "Ready for Opportunity") {
    errors.push("Qualified lead must be Ready for Opportunity first.");
  }

  if (hasDuplicateOpportunity(state, draft.qualified_lead_id)) {
    errors.push("An opportunity already exists for this qualified lead.");
  }

  return errors;
}

function getCreateErrors(collection, state, draft) {
  const normalizedCollection = resolveCollection(collection);
  if (normalizedCollection === "qualified_leads") {
    return getQualifiedLeadCreateErrors(state, draft);
  }
  if (normalizedCollection === "opportunities") {
    return getOpportunityCreateErrors(state, draft);
  }

  const errors = getRequiredErrors(normalizedCollection, draft);
  if (!getTransitionMap(normalizedCollection)?.[draft.status]) {
    errors.push(`Field "status" is invalid for ${normalizedCollection}.`);
  }
  return errors;
}

function createQualifiedLeadFromSource(sourceRecord, entity, values = {}, actor = "system", timestamp = nowDate()) {
  return {
    ...QUALIFIED_LEAD_DEFAULTS,
    id: values.id || createId("ql"),
    origin_channel: sourceRecord.channel,
    origin_entity: resolveCollection(entity),
    origin_record_id: sourceRecord.id,
    pain_summary:
      values.pain_summary ||
      sourceRecord.pain_signal ||
      sourceRecord.qualification_signal ||
      sourceRecord.review_signal ||
      sourceRecord.opportunity_note ||
      sourceRecord.summary,
    qualification_note: values.qualification_note || sourceRecord.summary || "",
    recommended_service: values.recommended_service || "mycalls",
    recommended_service_confidence: values.recommended_service_confidence || "medium",
    handoff_status: values.handoff_status || "New",
    owner: values.owner || sourceRecord.owner || "Admin",
    notes: values.notes || "",
    created_at: timestamp,
    updated_at: timestamp,
    updated_by: actor,
  };
}

function createOpportunityFromQualifiedLead(qualifiedLead, values = {}, actor = "system", timestamp = nowDate()) {
  return {
    ...OPPORTUNITY_DEFAULTS,
    id: values.id || createId("oppv2"),
    qualified_lead_id: qualifiedLead.id,
    origin_channel: qualifiedLead.origin_channel,
    company_name: values.company_name || values.title || qualifiedLead.company_name || "Qualified Opportunity",
    owner: values.owner || qualifiedLead.owner || "Admin",
    current_stage: values.current_stage || "Discovery",
    buyer_readiness: values.buyer_readiness || "Qualified",
    pain_summary: values.pain_summary || qualifiedLead.pain_summary,
    use_case: values.use_case || qualifiedLead.qualification_note || "Discovery needed",
    stakeholder_status: values.stakeholder_status || "Primary contact identified",
    stakeholder_map: values.stakeholder_map || qualifiedLead.qualification_note || "",
    estimated_value: coerceNumber(values.estimated_value, 0),
    objection_summary: values.objection_summary || "",
    close_probability: coerceNumber(values.close_probability, 25),
    risk_flag: values.risk_flag || "Medium",
    decision_status: values.decision_status || "New",
    next_step: values.next_step || "Run discovery",
    next_step_date: values.next_step_date || timestamp,
    notes: values.notes || "",
    created_at: timestamp,
    updated_at: timestamp,
    updated_by: actor,
  };
}

function createSeedData() {
  const today = nowDate();
  return normalizeState({
    whatsapp_items: [
      {
        id: "wa-1",
        phone: "+201000000001",
        contact_name: "Sara Adel",
        company_name: "Alpha Clinics",
        conversation_source: "inbound",
        last_message_at: `${today}T09:00:00.000Z`,
        pain_signal: "Missed evening calls",
        summary: "Asked about after-hours call handling.",
        status: "Needs Reply",
        next_step: "Send the service summary and booking flow.",
        next_step_date: today,
      },
      {
        id: "wa-2",
        phone: "+201000000002",
        contact_name: "Khaled Nabil",
        company_name: "Smile Center",
        conversation_source: "referral",
        last_message_at: `${today}T08:00:00.000Z`,
        pain_signal: "Front desk overload",
        summary: "Already engaged and ready for qualification.",
        status: "Qualified",
        next_step: "Convert to shared handoff.",
        next_step_date: today,
      },
    ],
    linkedin_prospects: [
      {
        id: "li-1",
        profile_name: "Maya Hassan",
        company_name: "Nova Dental",
        role: "Operations Manager",
        profile_url: "https://linkedin.com/in/maya-hassan",
        outreach_angle: "Night shift appointment leakage",
        qualification_signal: "Mentioned missed bookings in comments",
        summary: "Strong fit for MyCalls outreach.",
        status: "Ready Outreach",
        next_step: "Send first personalized outreach.",
        next_step_date: today,
      },
      {
        id: "li-2",
        profile_name: "Omar Tarek",
        company_name: "Care Plus",
        role: "Founder",
        profile_url: "https://linkedin.com/in/omar-tarek",
        outreach_angle: "Lead reply automation",
        qualification_signal: "Directly asked about response delays",
        summary: "Conversation is mature enough for qualification.",
        status: "Qualified",
        next_step: "Convert to shared handoff.",
        next_step_date: today,
      },
    ],
    google_inbound_items: [
      {
        id: "gi-1",
        intent_source: "form",
        page_or_listing: "Contact form / pricing page",
        contact_name: "Lina",
        company_name: "Urban Clinic",
        review_signal: "Asked about follow-up automation",
        inbound_summary: "Inbound form asking for a quick call.",
        summary: "Needs same-day response from Google inbound.",
        status: "Needs Response",
        next_step: "Call back before end of day.",
        next_step_date: today,
      },
      {
        id: "gi-2",
        intent_source: "maps",
        page_or_listing: "Google Maps review",
        contact_name: "Nader",
        company_name: "Fixit Auto",
        review_signal: "Public complaint about missed calls",
        inbound_summary: "Strong intent from review thread.",
        summary: "Ready for qualification via Google Maps complaint.",
        status: "Qualified",
        next_step: "Convert to shared handoff.",
        next_step_date: today,
      },
    ],
    google_rank_tasks: [
      {
        id: "gr-1",
        keyword: "virtual receptionist for clinics",
        page: "/services/mycalls",
        search_intent: "commercial",
        rank_task_type: "content-refresh",
        task_summary: "Update page structure and CTA depth.",
        opportunity_note: "",
        summary: "Refresh the service page around clinic-intent keyword.",
        status: "In Progress",
        next_step: "Draft the refreshed hero and service sections.",
        next_step_date: addDays(1),
      },
      {
        id: "gr-2",
        keyword: "whatsapp customer follow up",
        page: "/services/nicechat",
        search_intent: "commercial",
        rank_task_type: "keyword-validation",
        task_summary: "Validate traffic intent and demo CTA alignment.",
        opportunity_note: "Keyword gap shows outbound Nice Chat angle.",
        summary: "SEO task surfaced a real sales opportunity.",
        status: "Opportunity Found",
        next_step: "Convert into qualified handoff for Nice Chat.",
        next_step_date: today,
      },
    ],
    qualified_leads: [
      {
        id: "ql-1",
        origin_channel: "WhatsApp",
        origin_entity: "whatsapp_items",
        origin_record_id: "wa-legacy",
        pain_summary: "Lost after-hours bookings",
        qualification_note: "Owner wants a pilot this week.",
        recommended_service: "mycalls",
        recommended_service_confidence: "high",
        handoff_status: "Reviewing",
        owner: "Admin",
      },
    ],
    opportunities: [
      {
        id: "opp-1",
        qualified_lead_id: "ql-legacy",
        origin_channel: "LinkedIn",
        company_name: "Helio Clinics",
        owner: "Admin",
        current_stage: "Discovery",
        buyer_readiness: "High",
        pain_summary: "Lead leakage after first inquiry",
        use_case: "WhatsApp and call handling handoff",
        stakeholder_status: "Founder and ops lead engaged",
        stakeholder_map: "Founder owns final approval",
        estimated_value: 12000,
        objection_summary: "",
        close_probability: 45,
        risk_flag: "Medium",
        decision_status: "New",
        next_step: "Run discovery call",
        next_step_date: addDays(2),
      },
    ],
  });
}

function getChannelPriority(record, collection, today = nowDate()) {
  const dateWeight = record.next_step_date && record.next_step_date <= today ? 5 : 0;
  const maps = {
    whatsapp_items: {
      "Follow-up Due": 100,
      "Needs Reply": 95,
      "Waiting Response": 80,
      New: 70,
      Qualified: 60,
      Disqualified: 0,
    },
    linkedin_prospects: {
      "In Conversation": 100,
      "Ready Outreach": 92,
      "Awaiting Reply": 80,
      "Target List": 60,
      Qualified: 55,
      Disqualified: 0,
    },
    google_inbound_items: {
      "Needs Response": 100,
      "Follow-up": 90,
      Qualified: 70,
      New: 60,
      Disqualified: 0,
    },
    google_rank_tasks: {
      "Opportunity Found": 100,
      "In Progress": 82,
      "Waiting Data": 70,
      Backlog: 50,
      Done: 0,
    },
  };

  return (maps[resolveCollection(collection)]?.[record.status] || 0) + dateWeight;
}

function getSortedResumeItems(records, collection, today = nowDate()) {
  return [...records]
    .filter((record) => record.status !== "Disqualified" && record.status !== "Done")
    .sort((left, right) => {
      const scoreDiff = getChannelPriority(right, collection, today) - getChannelPriority(left, collection, today);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      return String(left.next_step_date || "").localeCompare(String(right.next_step_date || ""));
    });
}

function getHomeChannelSummary(state, channel, today = nowDate()) {
  if (channel === "WhatsApp") {
    const records = state.whatsapp_items || [];
    return {
      channel,
      today_captured: records.filter((item) => item.created_at === today).length,
      needs_action: records.filter((item) => ["Needs Reply", "Follow-up Due"].includes(item.status)).length,
      qualified_ready: records.filter((item) => item.status === "Qualified" && !item.converted_qualified_lead_id).length,
      resume_item: getSortedResumeItems(records, "whatsapp_items", today)[0] || null,
    };
  }

  if (channel === "LinkedIn") {
    const records = state.linkedin_prospects || [];
    return {
      channel,
      today_captured: records.filter((item) => item.created_at === today).length,
      needs_action: records.filter((item) => ["Ready Outreach", "In Conversation"].includes(item.status)).length,
      qualified_ready: records.filter((item) => item.status === "Qualified" && !item.converted_qualified_lead_id).length,
      resume_item: getSortedResumeItems(records, "linkedin_prospects", today)[0] || null,
    };
  }

  const inbound = state.google_inbound_items || [];
  const rankOps = state.google_rank_tasks || [];
  const ranked = [
    ...getSortedResumeItems(inbound, "google_inbound_items", today).map((item) => ({ item, score: getChannelPriority(item, "google_inbound_items", today) })),
    ...getSortedResumeItems(rankOps, "google_rank_tasks", today).map((item) => ({ item, score: getChannelPriority(item, "google_rank_tasks", today) })),
  ].sort((left, right) => right.score - left.score);
  return {
    channel: "Google",
    today_captured: inbound.filter((item) => item.created_at === today).length + rankOps.filter((item) => item.created_at === today).length,
    needs_action: inbound.filter((item) => ["Needs Response", "Follow-up"].includes(item.status)).length + rankOps.filter((item) => ["In Progress", "Waiting Data"].includes(item.status)).length,
    qualified_ready: inbound.filter((item) => item.status === "Qualified" && !item.converted_qualified_lead_id).length + rankOps.filter((item) => item.status === "Opportunity Found" && !item.converted_qualified_lead_id).length,
    resume_item: ranked[0]?.item || null,
  };
}

function getAllHomeSummaries(state, today = nowDate()) {
  return ["WhatsApp", "LinkedIn", "Google"].map((channel) => getHomeChannelSummary(state, channel, today));
}

function getDisplayStatus(record, collection, today = nowDate()) {
  if (resolveCollection(collection) !== "opportunities") {
    return record.status || record.handoff_status || "—";
  }
  return getComputedOpportunityStage(record, today);
}

export {
  GOOGLE_INBOUND_DEFAULTS,
  GOOGLE_RANK_TASK_DEFAULTS,
  HANDOFF_ACTIVE_STATUSES,
  LINKEDIN_DEFAULTS,
  OPPORTUNITY_ACTIVE_STAGES,
  OPPORTUNITY_DEFAULTS,
  QUALIFIED_LEAD_DEFAULTS,
  SERVICE_CONFIDENCE_OPTIONS,
  SERVICE_OPTIONS,
  TRANSITION_MAPS,
  APP_STORAGE_KEY,
  WHATSAPP_DEFAULTS,
  createId,
  createOpportunityFromQualifiedLead,
  createQualifiedLeadFromSource,
  createSeedData,
  deepClone,
  getAllHomeSummaries,
  getCreateErrors,
  getDefaultsForCollection,
  getDisplayStatus,
  getHomeChannelSummary,
  getRequiredErrors,
  getSourceRecord,
  getStatusField,
  getTransitionMap,
  hasActiveQualifiedLead,
  hasDuplicateOpportunity,
  isBlank,
  isQualifiedSourceStatus,
  isStatusTransitionAllowed,
  normalizeState,
  nowDate,
  resolveCollection,
  validateStatusPatch,
};
