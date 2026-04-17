import {
  OPPORTUNITY_STAGES,
  addDays,
  deepClone,
  getComputedOpportunityStage,
  todayDate,
  validateOpportunityTransition,
} from "./opportunity-domain.mjs";

const V2_STORAGE_KEY = "mycalls-ops";

const V2_ENTITIES = {
  whatsapp_item: "whatsapp_items",
  whatsapp_items: "whatsapp_items",
  linkedin_prospect: "linkedin_prospects",
  linkedin_prospects: "linkedin_prospects",
  google_prompt_template: "google_prompt_templates",
  google_prompt_templates: "google_prompt_templates",
  google_maps_mission: "google_maps_missions",
  google_maps_missions: "google_maps_missions",
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
const TEMPLATE_WORKFLOWS = [
  "maps-search",
  "maps-shortlist",
  "seo-keyword-strategy",
  "seo-subkeyword-cluster",
  "seo-article-planner",
];
const MAPS_MISSION_STATUSES = ["Draft", "Searching", "Shortlist Pending", "Ready for Review", "Complete", "Archived"];
const MAPS_LEAD_STATUSES = ["Discovered", "Scored", "Shortlisted", "Qualified", "Disqualified"];
const SEARCH_CAMPAIGN_STATUSES = ["Brief", "Research Ready", "Cluster Ready", "Writing", "Published", "Refresh"];
const ARTICLE_STATUSES = ["Idea", "Brief Ready", "Drafted", "Published"];
const MAPS_SCORE_MODEL = {
  call_dependency: 30,
  pain_signal: 25,
  commercial_fit: 20,
  demand_volume: 15,
  contactability: 10,
};
const MAPS_SCORE_KEYS = Object.keys(MAPS_SCORE_MODEL);
const MAPS_AGENT_SLOTS = [
  {
    key: "research_primary",
    workflow: "maps-search",
    templateField: "research_primary_template_id",
    overrideField: "research_primary_override",
    resultField: "research_primary_result_json",
  },
  {
    key: "research_secondary",
    workflow: "maps-search",
    templateField: "research_secondary_template_id",
    overrideField: "research_secondary_override",
    resultField: "research_secondary_result_json",
  },
  {
    key: "shortlist",
    workflow: "maps-shortlist",
    templateField: "shortlist_template_id",
    overrideField: "shortlist_override",
    resultField: "shortlist_result_json",
  },
];
const SEARCH_AGENT_SLOTS = [
  {
    key: "keyword_strategy",
    workflow: "seo-keyword-strategy",
    templateField: "keyword_strategy_template_id",
    overrideField: "keyword_strategy_override",
    resultField: "keyword_strategy_result_json",
  },
  {
    key: "subkeyword_cluster",
    workflow: "seo-subkeyword-cluster",
    templateField: "subkeyword_cluster_template_id",
    overrideField: "subkeyword_cluster_override",
    resultField: "subkeyword_cluster_result_json",
  },
  {
    key: "article_planner",
    workflow: "seo-article-planner",
    templateField: "article_planner_template_id",
    overrideField: "article_planner_override",
    resultField: "article_planner_result_json",
  },
];

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

function makeWhatsAppDefaults() {
  return {
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
}

function makeLinkedInDefaults() {
  return {
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
}

function makeGooglePromptTemplateDefaults() {
  return {
    id: "",
    workflow: "maps-search",
    name: "",
    base_prompt: "",
    output_contract_json: "",
    active: true,
    created_at: "",
    updated_at: "",
    updated_by: "",
  };
}

function makeGoogleMapsMissionDefaults() {
  return {
    id: "",
    channel: "Google",
    title: "",
    country: "Saudi Arabia",
    city_scope: "",
    icp_focus: "Call-heavy services with missed-call pain",
    business_types: [],
    must_have_signals: [],
    exclude_signals: [],
    search_goal: "",
    status: "Draft",
    summary: "",
    next_step: "",
    next_step_date: "",
    research_primary_template_id: "",
    research_primary_override: "",
    research_primary_result_json: "",
    research_secondary_template_id: "",
    research_secondary_override: "",
    research_secondary_result_json: "",
    shortlist_template_id: "",
    shortlist_override: "",
    shortlist_result_json: "",
    notes: "",
    created_at: "",
    updated_at: "",
    updated_by: "",
  };
}

function createBlankScoreBreakdown() {
  return {
    call_dependency: 0,
    pain_signal: 0,
    commercial_fit: 0,
    demand_volume: 0,
    contactability: 0,
  };
}

function makeGoogleInboundDefaults() {
  return {
    ...COMMON_RECORD_FIELDS,
    channel: "Google",
    status: "Discovered",
    mission_id: "",
    maps_url: "",
    city: "",
    category: "",
    website: "",
    phone: "",
    rating: 0,
    reviews_count: 0,
    branch_count_estimate: 0,
    call_dependency_signal: "",
    pain_signals: [],
    fit_notes: "",
    lead_score: 0,
    score_tier: "",
    score_breakdown: createBlankScoreBreakdown(),
    recommended_service: "",
    qualification_note: "",
  };
}

function makeGoogleRankTaskDefaults() {
  return {
    ...COMMON_RECORD_FIELDS,
    channel: "Google",
    status: "",
    primary_keyword: "",
    country: "Saudi Arabia",
    target_intent: "",
    target_page: "",
    campaign_status: "Brief",
    subkeywords: [],
    article_ideas: [],
    keyword_strategy_template_id: "",
    keyword_strategy_override: "",
    keyword_strategy_result_json: "",
    subkeyword_cluster_template_id: "",
    subkeyword_cluster_override: "",
    subkeyword_cluster_result_json: "",
    article_planner_template_id: "",
    article_planner_override: "",
    article_planner_result_json: "",
  };
}

function makeQualifiedLeadDefaults() {
  return {
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
}

function makeOpportunityDefaults() {
  return {
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
}

const REQUIRED_FIELDS = {
  whatsapp_items: ["phone", "contact_name", "company_name", "summary", "next_step", "next_step_date"],
  linkedin_prospects: ["profile_name", "company_name", "role", "summary", "next_step", "next_step_date"],
  google_prompt_templates: ["workflow", "name", "base_prompt", "output_contract_json"],
  google_maps_missions: ["title", "country", "city_scope", "icp_focus", "search_goal", "status", "next_step", "next_step_date"],
  google_inbound_items: ["mission_id", "company_name", "maps_url", "city", "category", "status", "next_step", "next_step_date"],
  google_rank_tasks: ["primary_keyword", "country", "target_intent", "target_page", "campaign_status", "next_step", "next_step_date"],
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
    Discovered: ["Scored", "Disqualified"],
    Scored: ["Shortlisted", "Disqualified"],
    Shortlisted: ["Qualified", "Disqualified"],
    Qualified: ["Disqualified"],
    Disqualified: [],
  },
  google_rank_tasks: {
    Brief: ["Research Ready", "Refresh"],
    "Research Ready": ["Cluster Ready", "Refresh"],
    "Cluster Ready": ["Writing", "Refresh"],
    Writing: ["Published", "Refresh"],
    Published: ["Refresh"],
    Refresh: ["Writing", "Published"],
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

function coerceBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === "on") return true;
  if (value === "false" || value === "0" || value === "off") return false;
  return fallback;
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (value && typeof value === "object") {
    return Object.values(value).map((item) => String(item).trim()).filter(Boolean);
  }
  const text = String(value || "").trim();
  if (!text) return [];
  if (text.startsWith("[")) {
    try {
      return normalizeStringList(JSON.parse(text));
    } catch {
      return [];
    }
  }
  return text
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeJsonText(value, fallback = "") {
  if (isBlank(value)) return fallback;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return fallback;
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback;
  }
}

function parseJsonObject(value, fallback = {}) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeScoreBreakdown(value) {
  const parsed = parseJsonObject(value, value && typeof value === "object" ? value : {});
  return MAPS_SCORE_KEYS.reduce((result, key) => {
    result[key] = Math.max(0, coerceNumber(parsed[key], 0));
    return result;
  }, createBlankScoreBreakdown());
}

function getScoreTier(score) {
  const numericScore = coerceNumber(score, 0);
  if (numericScore >= 80) return "A";
  if (numericScore >= 65) return "B";
  if (numericScore >= 50) return "C";
  return "D";
}

function normalizeArticleIdeas(value) {
  let source = value;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return [];
    if (text.startsWith("[")) {
      try {
        source = JSON.parse(text);
      } catch {
        source = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
      }
    } else {
      source = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    }
  }

  if (!Array.isArray(source)) return [];

  return source
    .map((item) => {
      if (typeof item === "string") {
        return {
          title: item.trim(),
          status: "Idea",
        };
      }
      if (!item || typeof item !== "object") {
        return null;
      }
      const title = String(item.title || item.headline || "").trim();
      if (!title) return null;
      const status = ARTICLE_STATUSES.includes(item.status) ? item.status : "Idea";
      return {
        title,
        status,
      };
    })
    .filter(Boolean);
}

function resolveCollection(entity) {
  const collection = V2_ENTITIES[entity];
  if (!collection) {
    throw new Error(`Unknown V2 entity "${entity}".`);
  }
  return collection;
}

function getDefaultsForCollection(collection) {
  switch (resolveCollection(collection)) {
    case "whatsapp_items":
      return makeWhatsAppDefaults();
    case "linkedin_prospects":
      return makeLinkedInDefaults();
    case "google_prompt_templates":
      return makeGooglePromptTemplateDefaults();
    case "google_maps_missions":
      return makeGoogleMapsMissionDefaults();
    case "google_inbound_items":
      return makeGoogleInboundDefaults();
    case "google_rank_tasks":
      return makeGoogleRankTaskDefaults();
    case "qualified_leads":
      return makeQualifiedLeadDefaults();
    case "opportunities":
      return makeOpportunityDefaults();
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

function normalizePromptTemplateRecord(item, actor, timestamp) {
  return {
    ...makeGooglePromptTemplateDefaults(),
    ...item,
    workflow: TEMPLATE_WORKFLOWS.includes(item.workflow) ? item.workflow : "maps-search",
    output_contract_json: normalizeJsonText(item.output_contract_json, "{}"),
    active: coerceBoolean(item.active, true),
    created_at: item.created_at || timestamp,
    updated_at: item.updated_at || timestamp,
    updated_by: item.updated_by || actor,
  };
}

function normalizeMapsMissionRecord(item, actor, timestamp) {
  const normalized = {
    ...makeGoogleMapsMissionDefaults(),
    ...item,
    business_types: normalizeStringList(item.business_types),
    must_have_signals: normalizeStringList(item.must_have_signals),
    exclude_signals: normalizeStringList(item.exclude_signals),
    status: MAPS_MISSION_STATUSES.includes(item.status) ? item.status : "Draft",
    summary: item.summary || item.search_goal || "",
    created_at: item.created_at || timestamp,
    updated_at: item.updated_at || timestamp,
    updated_by: item.updated_by || actor,
  };

  for (const slot of MAPS_AGENT_SLOTS) {
    normalized[slot.overrideField] = String(item[slot.overrideField] || "").trim();
    normalized[slot.resultField] = normalizeJsonText(item[slot.resultField], "");
  }

  return normalized;
}

function normalizeMapsLeadRecord(item, actor, timestamp) {
  const normalized = {
    ...makeGoogleInboundDefaults(),
    ...item,
    status: MAPS_LEAD_STATUSES.includes(item.status) ? item.status : "Discovered",
    mission_id: String(item.mission_id || "").trim(),
    maps_url: String(item.maps_url || "").trim(),
    city: String(item.city || "").trim(),
    category: String(item.category || "").trim(),
    website: String(item.website || "").trim(),
    phone: String(item.phone || "").trim(),
    rating: coerceNumber(item.rating, 0),
    reviews_count: coerceNumber(item.reviews_count, 0),
    branch_count_estimate: coerceNumber(item.branch_count_estimate, 0),
    call_dependency_signal: String(item.call_dependency_signal || "").trim(),
    pain_signals: normalizeStringList(item.pain_signals),
    fit_notes: String(item.fit_notes || "").trim(),
    lead_score: coerceNumber(item.lead_score, 0),
    score_breakdown: normalizeScoreBreakdown(item.score_breakdown),
    recommended_service: String(item.recommended_service || "").trim(),
    qualification_note: String(item.qualification_note || "").trim(),
    summary: String(item.summary || item.fit_notes || "").trim(),
    created_at: item.created_at || timestamp,
    updated_at: item.updated_at || timestamp,
    updated_by: item.updated_by || actor,
  };

  normalized.score_tier = item.score_tier || getScoreTier(normalized.lead_score);
  return normalized;
}

function normalizeSearchCampaignRecord(item, actor, timestamp) {
  const normalized = {
    ...makeGoogleRankTaskDefaults(),
    ...item,
    campaign_status: SEARCH_CAMPAIGN_STATUSES.includes(item.campaign_status) ? item.campaign_status : "Brief",
    primary_keyword: String(item.primary_keyword || "").trim(),
    country: String(item.country || "Saudi Arabia").trim(),
    target_intent: String(item.target_intent || "").trim(),
    target_page: String(item.target_page || "").trim(),
    subkeywords: normalizeStringList(item.subkeywords),
    article_ideas: normalizeArticleIdeas(item.article_ideas),
    summary: String(item.summary || "").trim(),
    created_at: item.created_at || timestamp,
    updated_at: item.updated_at || timestamp,
    updated_by: item.updated_by || actor,
  };

  for (const slot of SEARCH_AGENT_SLOTS) {
    normalized[slot.overrideField] = String(item[slot.overrideField] || "").trim();
    normalized[slot.resultField] = normalizeJsonText(item[slot.resultField], "");
  }

  return normalized;
}

function normalizeQualifiedLeadRecord(item, actor, timestamp) {
  return {
    ...makeQualifiedLeadDefaults(),
    ...item,
    recommended_service: SERVICE_OPTIONS.includes(item.recommended_service) ? item.recommended_service : "mycalls",
    recommended_service_confidence: SERVICE_CONFIDENCE_OPTIONS.includes(item.recommended_service_confidence)
      ? item.recommended_service_confidence
      : "medium",
    created_at: item.created_at || timestamp,
    updated_at: item.updated_at || timestamp,
    updated_by: item.updated_by || actor,
  };
}

function normalizeOpportunityRecord(item, actor, timestamp) {
  return {
    ...makeOpportunityDefaults(),
    ...item,
    estimated_value: coerceNumber(item.estimated_value, 0),
    close_probability: coerceNumber(item.close_probability, 25),
    created_at: item.created_at || timestamp,
    updated_at: item.updated_at || timestamp,
    updated_by: item.updated_by || actor,
  };
}

function normalizeCollectionItems(collection, items = [], actor = "system", timestamp = nowDate()) {
  const safeItems = Array.isArray(items) ? items : [];
  switch (resolveCollection(collection)) {
    case "google_prompt_templates":
      return safeItems.map((item) => normalizePromptTemplateRecord(item, actor, timestamp));
    case "google_maps_missions":
      return safeItems.map((item) => normalizeMapsMissionRecord(item, actor, timestamp));
    case "google_inbound_items":
      return safeItems.map((item) => normalizeMapsLeadRecord(item, actor, timestamp));
    case "google_rank_tasks":
      return safeItems.map((item) => normalizeSearchCampaignRecord(item, actor, timestamp));
    case "qualified_leads":
      return safeItems.map((item) => normalizeQualifiedLeadRecord(item, actor, timestamp));
    case "opportunities":
      return safeItems.map((item) => normalizeOpportunityRecord(item, actor, timestamp));
    default: {
      const defaults = getDefaultsForCollection(collection);
      return safeItems.map((item) => ({
        ...defaults,
        ...item,
        created_at: item.created_at || timestamp,
        updated_at: item.updated_at || timestamp,
        updated_by: item.updated_by || actor,
      }));
    }
  }
}

function createPromptTemplateSeeds() {
  return [
    {
      id: "tpl-maps-search",
      workflow: "maps-search",
      name: "بحث خرائط: اكتشاف شركات قابلة للشراء",
      base_prompt:
        "أنت وكيل بحث سوقي. ابحث في Google Maps داخل السعودية عن شركات خدمية تعتمد على المكالمات، وتظهر لديها مؤشرات واضحة على ضياع مكالمات أو ضغط على الاستقبال. ركّز على الأنشطة التي يمكن أن تستفيد من MyCalls بسرعة.",
      output_contract_json: JSON.stringify(
        {
          mission_id: "maps-mission-id",
          results: [
            {
              company_name: "string",
              maps_url: "string",
              city: "string",
              category: "string",
              rating: 4.2,
              reviews_count: 145,
              pain_signals: ["string"],
              fit_notes: "string",
            },
          ],
        },
        null,
        2,
      ),
      active: true,
    },
    {
      id: "tpl-maps-shortlist",
      workflow: "maps-shortlist",
      name: "تحليل وترتيب Leads الخرائط",
      base_prompt:
        "أنت وكيل تقييم مبيعات. استلم نتائج البحث، وامنح كل شركة score من 100 بناءً على الاعتماد على المكالمات، وضوح الألم، الملاءمة التجارية، حجم الطلب، وسهولة الوصول. رتّب النتائج من الأعلى إلى الأقل، واستبعد الضعيف.",
      output_contract_json: JSON.stringify(
        {
          mission_id: "maps-mission-id",
          shortlist: [
            {
              maps_url: "string",
              lead_score: 82,
              score_breakdown: {
                call_dependency: 25,
                pain_signal: 22,
                commercial_fit: 16,
                demand_volume: 12,
                contactability: 7,
              },
              tier: "A",
              recommended_service: "mycalls",
              qualification_note: "string",
            },
          ],
        },
        null,
        2,
      ),
      active: true,
    },
    {
      id: "tpl-seo-keyword-strategy",
      workflow: "seo-keyword-strategy",
      name: "استراتيجية الكلمة الرئيسية",
      base_prompt:
        "أنت وكيل SEO استراتيجي. اختر كلمة رئيسية واحدة تجارية تصلح أن تهيمن عليها MyCalls في السعودية، وحدد intent واضحًا والصفحة الأنسب للاستهداف.",
      output_contract_json: JSON.stringify(
        {
          primary_keyword: "string",
          target_intent: "string",
          target_page: "string",
        },
        null,
        2,
      ),
      active: true,
    },
    {
      id: "tpl-seo-subkeyword-cluster",
      workflow: "seo-subkeyword-cluster",
      name: "تجميع الكلمات الفرعية",
      base_prompt:
        "أنت وكيل بناء Cluster. أعط 8 إلى 20 كلمة فرعية داعمة تخدم نفس intent، وتغطي الأسئلة والاعتراضات والمقارنات والشراء.",
      output_contract_json: JSON.stringify(
        {
          subkeywords: ["string"],
        },
        null,
        2,
      ),
      active: true,
    },
    {
      id: "tpl-seo-article-planner",
      workflow: "seo-article-planner",
      name: "خطة المقالات العشر",
      base_prompt:
        "أنت وكيل تخطيط محتوى SEO. ابنِ عشر عناوين مقالات فقط، مرتبطة مباشرة بالكلمة الرئيسية والكلمات الفرعية، ويمكن أن تدعم الرانك التجاري.",
      output_contract_json: JSON.stringify(
        {
          article_ideas: [
            {
              title: "string",
              status: "Idea",
            },
          ],
        },
        null,
        2,
      ),
      active: true,
    },
  ];
}

function createLegacyMapsMissionSeed(today) {
  return {
    id: "legacy-import",
    title: "Legacy imported maps work",
    country: "Saudi Arabia",
    city_scope: "Imported legacy scope",
    icp_focus: "Call-heavy services with missed-call pain",
    business_types: ["Imported"],
    must_have_signals: ["Legacy imported lead"],
    exclude_signals: [],
    search_goal: "Review legacy Google work and re-rank it.",
    status: "Ready for Review",
    summary: "Review imported Google maps leads from the previous model.",
    next_step: "Review imported maps leads and confirm shortlist.",
    next_step_date: today,
    research_primary_template_id: "tpl-maps-search",
    research_secondary_template_id: "tpl-maps-search",
    shortlist_template_id: "tpl-maps-shortlist",
    notes: "",
  };
}

function createArticleIdeasSeed(primaryKeyword, prefix) {
  return Array.from({ length: 10 }, (_, index) => ({
    title: `${prefix} ${index + 1}: ${primaryKeyword}`,
    status: index < 2 ? "Brief Ready" : "Idea",
  }));
}

function createSeedStateRaw(today = nowDate()) {
  return {
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
    google_prompt_templates: createPromptTemplateSeeds(),
    google_maps_missions: [
      {
        id: "gm-ksa-clinics",
        title: "عيادات الرياض ذات ضغط المكالمات",
        country: "Saudi Arabia",
        city_scope: "Riyadh",
        icp_focus: "عيادات وأسنان تعتمد على المكالمات والحجوزات",
        business_types: ["Dental clinics", "Medical centers", "Skin clinics"],
        must_have_signals: ["WhatsApp listed", "High review activity", "Complaints about response"],
        exclude_signals: ["No phone number", "Government entity"],
        search_goal: "استخراج شركات في الرياض فيها فرص قوية لشراء MyCalls بسبب ضغط المكالمات أو ضياع الحجوزات.",
        status: "Ready for Review",
        summary: "Riyadh clinics pipeline for MyCalls qualification.",
        next_step: "Review the shortlist and push qualified clinics to handoff.",
        next_step_date: today,
        research_primary_template_id: "tpl-maps-search",
        research_secondary_template_id: "tpl-maps-search",
        shortlist_template_id: "tpl-maps-shortlist",
        research_primary_override: "ابدأ بالرياض، وركّز على العيادات ذات التقييم المرتفع والنشاط الكبير في المراجعات.",
        shortlist_override: "ارفع الأولوية للمنشآت التي لديها أكثر من فرع أو إشارات ضغط تشغيل واضحة.",
      },
      {
        id: "gm-ksa-service",
        title: "خدمات منزلية في جدة",
        country: "Saudi Arabia",
        city_scope: "Jeddah",
        icp_focus: "شركات خدمات منزلية تعتمد على الاتصالات الفورية والحجز السريع",
        business_types: ["Home maintenance", "Cleaning", "AC repair"],
        must_have_signals: ["Phone-first booking", "Reviews mention delays"],
        exclude_signals: ["Marketplace-only"],
        search_goal: "البحث عن شركات خدمات منزلية في جدة قد تستفيد من إدارة المكالمات والمتابعة.",
        status: "Searching",
        summary: "Jeddah field services discovery mission.",
        next_step: "Run the primary search prompt and import the results.",
        next_step_date: addDays(1),
        research_primary_template_id: "tpl-maps-search",
        research_secondary_template_id: "tpl-maps-search",
        shortlist_template_id: "tpl-maps-shortlist",
      },
    ],
    google_inbound_items: [
      {
        id: "gmlead-1",
        mission_id: "gm-ksa-clinics",
        company_name: "Smile Riyadh Clinic",
        maps_url: "https://maps.google.com/?cid=smile-riyadh-clinic",
        city: "Riyadh",
        category: "Dental clinic",
        website: "https://smileryadh.example.com",
        phone: "+966500000111",
        rating: 4.6,
        reviews_count: 184,
        branch_count_estimate: 2,
        call_dependency_signal: "Appointments happen mainly by phone and WhatsApp.",
        pain_signals: ["Complaints about no answer", "Busy front desk", "After-hours inquiries"],
        fit_notes: "High-volume clinic with visible response pressure and direct booking dependency.",
        lead_score: 72,
        score_tier: "B",
        score_breakdown: {
          call_dependency: 24,
          pain_signal: 18,
          commercial_fit: 15,
          demand_volume: 10,
          contactability: 5,
        },
        recommended_service: "mycalls",
        qualification_note: "Strong MyCalls fit. Needs human confirmation on booking workflow.",
        summary: "Clinic with missed-call pain and active review volume.",
        status: "Scored",
        next_step: "Run shortlist scoring and confirm the buying signals.",
        next_step_date: today,
      },
      {
        id: "gmlead-2",
        mission_id: "gm-ksa-clinics",
        company_name: "Nova Dental Hub",
        maps_url: "https://maps.google.com/?cid=nova-dental-hub",
        city: "Riyadh",
        category: "Dental clinic",
        website: "https://novadental.example.com",
        phone: "+966500000222",
        rating: 4.8,
        reviews_count: 260,
        branch_count_estimate: 4,
        call_dependency_signal: "Call center and reception teams handle appointment volume all day.",
        pain_signals: ["Multiple branches", "High review velocity", "Booking responsiveness matters"],
        fit_notes: "Multi-branch clinic with both scale and clear booking dependence.",
        lead_score: 84,
        score_tier: "A",
        score_breakdown: {
          call_dependency: 27,
          pain_signal: 21,
          commercial_fit: 18,
          demand_volume: 11,
          contactability: 7,
        },
        recommended_service: "mycalls",
        qualification_note: "Shortlisted for fast qualification. Likely budget and urgency fit.",
        summary: "Multi-branch dental group with clear missed-call exposure.",
        status: "Shortlisted",
        next_step: "Qualify the operations manager and confirm current call coverage.",
        next_step_date: today,
      },
      {
        id: "gmlead-3",
        mission_id: "gm-ksa-clinics",
        company_name: "Carepoint Medical Center",
        maps_url: "https://maps.google.com/?cid=carepoint-medical-center",
        city: "Riyadh",
        category: "Medical center",
        website: "https://carepoint.example.com",
        phone: "+966500000333",
        rating: 4.4,
        reviews_count: 312,
        branch_count_estimate: 1,
        call_dependency_signal: "Patients book consultations directly by phone.",
        pain_signals: ["Review complaints about follow-up", "Busy appointment desk", "High lead capture value"],
        fit_notes: "Already high enough to move toward qualification and handoff.",
        lead_score: 88,
        score_tier: "A",
        score_breakdown: {
          call_dependency: 28,
          pain_signal: 22,
          commercial_fit: 18,
          demand_volume: 13,
          contactability: 7,
        },
        recommended_service: "mycalls",
        qualification_note: "Clear fit for handoff. Strong buying pain and contactability.",
        summary: "Qualified medical center lead from maps ops.",
        status: "Qualified",
        next_step: "Convert to shared handoff.",
        next_step_date: today,
      },
      {
        id: "gmlead-4",
        mission_id: "gm-ksa-service",
        company_name: "FastHome Cooling",
        maps_url: "https://maps.google.com/?cid=fasthome-cooling",
        city: "Jeddah",
        category: "AC repair",
        website: "https://fasthome.example.com",
        phone: "+966500000444",
        rating: 4.1,
        reviews_count: 93,
        branch_count_estimate: 1,
        call_dependency_signal: "Urgent service bookings arrive mainly by phone.",
        pain_signals: ["Response delays", "Weekend demand spikes"],
        fit_notes: "Useful discovery record but still needs scoring.",
        lead_score: 0,
        score_tier: "D",
        score_breakdown: createBlankScoreBreakdown(),
        recommended_service: "",
        qualification_note: "",
        summary: "Fresh service-business lead awaiting score.",
        status: "Discovered",
        next_step: "Run shortlist scoring after importing more search results.",
        next_step_date: addDays(1),
      },
    ],
    google_rank_tasks: [
      {
        id: "gseo-1",
        primary_keyword: "virtual receptionist for clinics saudi arabia",
        country: "Saudi Arabia",
        target_intent: "commercial",
        target_page: "/services/mycalls",
        campaign_status: "Writing",
        summary: "Own a high-buying-intent keyword around virtual receptionist demand in clinics.",
        next_step: "Brief the first three articles and refresh the service page outline.",
        next_step_date: today,
        subkeywords: [
          "clinic call handling service",
          "missed calls in clinics",
          "medical receptionist outsourcing",
          "after hours clinic calls",
        ],
        article_ideas: createArticleIdeasSeed("virtual receptionist for clinics saudi arabia", "Article"),
        keyword_strategy_template_id: "tpl-seo-keyword-strategy",
        subkeyword_cluster_template_id: "tpl-seo-subkeyword-cluster",
        article_planner_template_id: "tpl-seo-article-planner",
        keyword_strategy_override: "ركّز على intent التجاري المباشر، وليس التعليمي العام.",
        article_planner_override: "أعطنا 10 عناوين قريبة من الشراء والاعتراضات.",
      },
      {
        id: "gseo-2",
        primary_keyword: "missed call management for service businesses",
        country: "Saudi Arabia",
        target_intent: "commercial",
        target_page: "/services/mycalls",
        campaign_status: "Research Ready",
        summary: "Build a second campaign around service businesses losing deals from missed calls.",
        next_step: "Import the final subkeyword cluster and create the 10-article plan.",
        next_step_date: addDays(1),
        subkeywords: [
          "missed call tracking for businesses",
          "lead leakage from phone calls",
          "call capture for service companies",
        ],
        article_ideas: [],
        keyword_strategy_template_id: "tpl-seo-keyword-strategy",
        subkeyword_cluster_template_id: "tpl-seo-subkeyword-cluster",
        article_planner_template_id: "tpl-seo-article-planner",
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
  };
}

function migrateLegacyGoogleInboundItems(items = [], timestamp = nowDate()) {
  return (Array.isArray(items) ? items : []).map((item) => {
    if (item.mission_id || item.maps_url || MAPS_LEAD_STATUSES.includes(item.status)) {
      return item;
    }

    const mappedStatus = {
      New: "Discovered",
      "Needs Response": "Scored",
      "Follow-up": "Shortlisted",
      Qualified: "Qualified",
      Disqualified: "Disqualified",
    }[item.status] || "Discovered";

    const painSignals = normalizeStringList(item.review_signal);
    const syntheticUrl = item.intent_source === "maps"
      ? `https://maps.google.com/?legacy=${encodeURIComponent(item.id || item.company_name || timestamp)}`
      : `legacy:${encodeURIComponent(item.id || item.company_name || timestamp)}`;

    return {
      ...item,
      status: mappedStatus,
      mission_id: "legacy-import",
      maps_url: syntheticUrl,
      city: "Imported",
      category: item.intent_source === "maps" ? "Google Maps lead" : "Imported Google lead",
      website: "",
      phone: "",
      rating: 0,
      reviews_count: 0,
      branch_count_estimate: 0,
      call_dependency_signal: item.intent_source === "maps" ? "Legacy imported maps lead" : "Imported legacy lead",
      pain_signals: painSignals,
      fit_notes: item.inbound_summary || item.summary || "",
      lead_score: mappedStatus === "Qualified" ? 80 : mappedStatus === "Shortlisted" ? 68 : mappedStatus === "Scored" ? 56 : 0,
      score_tier: mappedStatus === "Qualified" ? "A" : mappedStatus === "Shortlisted" ? "B" : mappedStatus === "Scored" ? "C" : "D",
      score_breakdown: createBlankScoreBreakdown(),
      recommended_service: item.intent_source === "maps" ? "mycalls" : "",
      qualification_note: item.inbound_summary || "",
      summary: item.summary || item.inbound_summary || "",
      next_step: item.next_step || "Review imported lead",
      next_step_date: item.next_step_date || timestamp,
    };
  });
}

function migrateLegacyGoogleRankTasks(items = [], timestamp = nowDate()) {
  return (Array.isArray(items) ? items : []).map((item) => {
    if (item.primary_keyword || item.campaign_status || SEARCH_CAMPAIGN_STATUSES.includes(item.status)) {
      return item;
    }

    const mappedStatus = {
      Backlog: "Brief",
      "In Progress": "Research Ready",
      "Waiting Data": "Cluster Ready",
      Done: "Published",
      "Opportunity Found": "Research Ready",
    }[item.status] || "Brief";

    const notes = [item.notes, item.status === "Opportunity Found" ? item.opportunity_note : ""]
      .filter(Boolean)
      .join("\n\n");

    return {
      ...item,
      status: "",
      primary_keyword: item.keyword || "",
      country: "Saudi Arabia",
      target_intent: item.search_intent || "commercial",
      target_page: item.page || "/services/mycalls",
      campaign_status: mappedStatus,
      subkeywords: [],
      article_ideas: [],
      notes,
      summary: item.summary || item.task_summary || "",
      next_step: item.next_step || "Review imported search campaign",
      next_step_date: item.next_step_date || timestamp,
    };
  });
}

function prepareGoogleCollections(state = {}, timestamp = nowDate()) {
  const promptTemplates = Array.isArray(state.google_prompt_templates)
    ? state.google_prompt_templates
    : createPromptTemplateSeeds();

  const inboundItems = migrateLegacyGoogleInboundItems(state.google_inbound_items || [], timestamp);
  const rankTasks = migrateLegacyGoogleRankTasks(state.google_rank_tasks || [], timestamp);
  const missions = Array.isArray(state.google_maps_missions) ? [...state.google_maps_missions] : [];
  const needsLegacyMission = inboundItems.some((item) => item.mission_id === "legacy-import");

  if (needsLegacyMission && !missions.some((mission) => mission.id === "legacy-import")) {
    missions.unshift(createLegacyMapsMissionSeed(timestamp));
  }

  return {
    google_prompt_templates: promptTemplates,
    google_maps_missions: missions,
    google_inbound_items: inboundItems,
    google_rank_tasks: rankTasks,
  };
}

function normalizeState(candidate, actor = "system", timestamp = nowDate()) {
  const state = candidate || createSeedStateRaw(timestamp);
  const googleCollections = prepareGoogleCollections(state, timestamp);

  const normalized = {
    whatsapp_items: normalizeCollectionItems("whatsapp_items", state.whatsapp_items, actor, timestamp),
    linkedin_prospects: normalizeCollectionItems("linkedin_prospects", state.linkedin_prospects, actor, timestamp),
    google_prompt_templates: normalizeCollectionItems("google_prompt_templates", googleCollections.google_prompt_templates, actor, timestamp),
    google_maps_missions: normalizeCollectionItems("google_maps_missions", googleCollections.google_maps_missions, actor, timestamp),
    google_inbound_items: normalizeCollectionItems("google_inbound_items", googleCollections.google_inbound_items, actor, timestamp),
    google_rank_tasks: normalizeCollectionItems("google_rank_tasks", googleCollections.google_rank_tasks, actor, timestamp),
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
    .filter((field) => {
      const value = record?.[field];
      if (Array.isArray(value)) return value.length === 0;
      return isBlank(value);
    })
    .map((field) => `Field "${field}" is required.`);
}

function getTransitionMap(collection) {
  return TRANSITION_MAPS[resolveCollection(collection)] || null;
}

function getStatusField(collection) {
  const normalizedCollection = resolveCollection(collection);
  if (normalizedCollection === "qualified_leads") return "handoff_status";
  if (normalizedCollection === "opportunities") return "current_stage";
  if (normalizedCollection === "google_rank_tasks") return "campaign_status";
  return "status";
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

function isQualifiedSourceStatus(collection, status) {
  return resolveCollection(collection) === "google_inbound_items" ? status === "Qualified" : status === "Qualified";
}

function getQualifiedLeadCreateErrors(state, draft) {
  const errors = getRequiredErrors("qualified_leads", draft);
  const sourceRecord = getSourceRecord(state, draft.origin_entity, draft.origin_record_id);
  const sourceCollection = resolveCollection(draft.origin_entity);

  if (sourceCollection !== "whatsapp_items" && sourceCollection !== "linkedin_prospects" && sourceCollection !== "google_inbound_items") {
    errors.push("Qualified leads can only be created from WhatsApp, LinkedIn, or Google Maps leads.");
  }

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

function validateTemplateRecord(draft) {
  const errors = [];
  if (!TEMPLATE_WORKFLOWS.includes(draft.workflow)) {
    errors.push('Field "workflow" is invalid.');
  }
  try {
    JSON.parse(draft.output_contract_json);
  } catch {
    errors.push('Field "output_contract_json" must be valid JSON.');
  }
  return errors;
}

function validateMissionRecord(draft) {
  const errors = [];
  if (!MAPS_MISSION_STATUSES.includes(draft.status)) {
    errors.push('Field "status" is invalid for google_maps_missions.');
  }
  return errors;
}

function hasDuplicateMapsUrl(state, draft) {
  return (state.google_inbound_items || []).some(
    (item) => item.mission_id === draft.mission_id && item.maps_url === draft.maps_url && item.id !== draft.id,
  );
}

function validateMapsLeadRecord(state, draft) {
  const errors = [];
  if (!MAPS_LEAD_STATUSES.includes(draft.status)) {
    errors.push('Field "status" is invalid for google_inbound_items.');
  }
  if (!(state.google_maps_missions || []).some((mission) => mission.id === draft.mission_id)) {
    errors.push('Field "mission_id" must reference an existing Google Maps mission.');
  }
  if (hasDuplicateMapsUrl(state, draft)) {
    errors.push('Field "maps_url" must be unique inside the mission.');
  }
  if (draft.recommended_service && !SERVICE_OPTIONS.includes(draft.recommended_service)) {
    errors.push('Field "recommended_service" is invalid.');
  }
  const leadScore = coerceNumber(draft.lead_score, 0);
  if (leadScore < 0 || leadScore > 100) {
    errors.push('Field "lead_score" must be between 0 and 100.');
  }
  const articleTier = draft.score_tier || getScoreTier(leadScore);
  if (!["A", "B", "C", "D"].includes(articleTier)) {
    errors.push('Field "score_tier" is invalid.');
  }
  return errors;
}

function validateSearchCampaignRecord(state, draft) {
  const errors = [];
  if (!SEARCH_CAMPAIGN_STATUSES.includes(draft.campaign_status)) {
    errors.push('Field "campaign_status" is invalid for google_rank_tasks.');
  }
  if (Array.isArray(draft.article_ideas) && draft.article_ideas.length && draft.article_ideas.length !== 10) {
    errors.push('Field "article_ideas" must contain exactly 10 items when present.');
  }
  if ((state.google_rank_tasks || []).length >= 10 && !(state.google_rank_tasks || []).some((item) => item.id === draft.id)) {
    errors.push("Google Search supports a maximum of 10 active campaigns.");
  }
  return errors;
}

function getOpportunityCreateErrorsV2(state, draft) {
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
    return getOpportunityCreateErrorsV2(state, draft);
  }

  const errors = getRequiredErrors(normalizedCollection, draft);

  if (normalizedCollection === "google_prompt_templates") {
    return [...errors, ...validateTemplateRecord(draft)];
  }
  if (normalizedCollection === "google_maps_missions") {
    return [...errors, ...validateMissionRecord(draft)];
  }
  if (normalizedCollection === "google_inbound_items") {
    return [...errors, ...validateMapsLeadRecord(state, draft)];
  }
  if (normalizedCollection === "google_rank_tasks") {
    return [...errors, ...validateSearchCampaignRecord(state, draft)];
  }

  const transitionMap = getTransitionMap(normalizedCollection);
  if (transitionMap && !transitionMap[draft.status]) {
    errors.push(`Field "status" is invalid for ${normalizedCollection}.`);
  }
  return errors;
}

function createQualifiedLeadFromSource(sourceRecord, entity, values = {}, actor = "system", timestamp = nowDate()) {
  const painSignals = normalizeStringList(sourceRecord.pain_signals);
  return {
    ...makeQualifiedLeadDefaults(),
    id: values.id || createId("ql"),
    origin_channel: sourceRecord.channel,
    origin_entity: resolveCollection(entity),
    origin_record_id: sourceRecord.id,
    pain_summary:
      values.pain_summary ||
      sourceRecord.pain_signal ||
      sourceRecord.qualification_signal ||
      sourceRecord.review_signal ||
      painSignals.join(", ") ||
      sourceRecord.fit_notes ||
      sourceRecord.summary,
    qualification_note:
      values.qualification_note ||
      sourceRecord.qualification_note ||
      sourceRecord.fit_notes ||
      sourceRecord.summary ||
      "",
    recommended_service: values.recommended_service || sourceRecord.recommended_service || "mycalls",
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
    ...makeOpportunityDefaults(),
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
  return normalizeState(createSeedStateRaw(today), "system", today);
}

function getGoogleLeadPriority(record, today = nowDate()) {
  const dateWeight = record.next_step_date && record.next_step_date <= today ? 5 : 0;
  const map = {
    Qualified: 100,
    Shortlisted: 88,
    Scored: 75,
    Discovered: 62,
    Disqualified: 0,
  };
  return (map[record.status] || 0) + dateWeight;
}

function getGoogleCampaignPriority(record, today = nowDate()) {
  const dateWeight = record.next_step_date && record.next_step_date <= today ? 5 : 0;
  const map = {
    Refresh: 95,
    Writing: 88,
    "Cluster Ready": 78,
    "Research Ready": 68,
    Brief: 56,
    Published: 32,
  };
  return (map[record.campaign_status] || 0) + dateWeight;
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
  };

  if (resolveCollection(collection) === "google_inbound_items") {
    return getGoogleLeadPriority(record, today);
  }
  if (resolveCollection(collection) === "google_rank_tasks") {
    return getGoogleCampaignPriority(record, today);
  }

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

  const mapsLeads = state.google_inbound_items || [];
  const campaigns = state.google_rank_tasks || [];
  const ranked = [
    ...mapsLeads
      .filter((item) => item.status !== "Disqualified")
      .map((item) => ({ item, score: getGoogleLeadPriority(item, today) })),
    ...campaigns.map((item) => ({ item, score: getGoogleCampaignPriority(item, today) })),
  ].sort((left, right) => right.score - left.score);

  return {
    channel: "Google",
    today_captured:
      mapsLeads.filter((item) => item.created_at === today).length +
      campaigns.filter((item) => item.created_at === today).length,
    needs_action:
      mapsLeads.filter((item) => ["Discovered", "Scored", "Shortlisted"].includes(item.status)).length +
      campaigns.filter((item) => ["Brief", "Research Ready", "Cluster Ready", "Writing", "Refresh"].includes(item.campaign_status)).length,
    qualified_ready: mapsLeads.filter((item) => item.status === "Qualified" && !item.converted_qualified_lead_id).length,
    resume_item: ranked[0]?.item || null,
  };
}

function getAllHomeSummaries(state, today = nowDate()) {
  return ["WhatsApp", "LinkedIn", "Google"].map((channel) => getHomeChannelSummary(state, channel, today));
}

function getDisplayStatus(record, collection, today = nowDate()) {
  const normalizedCollection = resolveCollection(collection);
  if (normalizedCollection === "opportunities") {
    return getComputedOpportunityStage(record, today);
  }
  if (normalizedCollection === "qualified_leads") {
    return record.handoff_status || "—";
  }
  if (normalizedCollection === "google_rank_tasks") {
    return record.campaign_status || "—";
  }
  return record.status || "—";
}

export {
  ARTICLE_STATUSES,
  GOOGLE_INBOUND_DEFAULTS as GOOGLE_INBOUND_DEFAULTS,
  HANDOFF_ACTIVE_STATUSES,
  LINKEDIN_DEFAULTS as LINKEDIN_DEFAULTS,
  MAPS_AGENT_SLOTS,
  MAPS_LEAD_STATUSES,
  MAPS_MISSION_STATUSES,
  MAPS_SCORE_KEYS,
  MAPS_SCORE_MODEL,
  OPPORTUNITY_ACTIVE_STAGES,
  SEARCH_AGENT_SLOTS,
  SEARCH_CAMPAIGN_STATUSES,
  SERVICE_CONFIDENCE_OPTIONS,
  SERVICE_OPTIONS,
  TEMPLATE_WORKFLOWS,
  TRANSITION_MAPS,
  V2_STORAGE_KEY,
  WHATSAPP_DEFAULTS as WHATSAPP_DEFAULTS,
  createId,
  createOpportunityFromQualifiedLead,
  createPromptTemplateSeeds,
  createQualifiedLeadFromSource,
  createSeedData,
  createBlankScoreBreakdown,
  deepClone,
  getAllHomeSummaries,
  getCreateErrors,
  getDefaultsForCollection,
  getDisplayStatus,
  getHomeChannelSummary,
  getQualifiedLeadCreateErrors,
  getRequiredErrors,
  getScoreTier,
  getSourceRecord,
  getStatusField,
  getTransitionMap,
  hasActiveQualifiedLead,
  hasDuplicateOpportunity,
  isBlank,
  isQualifiedSourceStatus,
  isStatusTransitionAllowed,
  normalizeArticleIdeas,
  normalizeJsonText,
  normalizeScoreBreakdown,
  normalizeState,
  normalizeStringList,
  nowDate,
  prepareGoogleCollections,
  resolveCollection,
  validateStatusPatch,
};

const WHATSAPP_DEFAULTS = makeWhatsAppDefaults();
const LINKEDIN_DEFAULTS = makeLinkedInDefaults();
const GOOGLE_INBOUND_DEFAULTS = makeGoogleInboundDefaults();
