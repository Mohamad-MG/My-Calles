import {
  LEAD_STAGES,
  OPPORTUNITY_STAGES,
  SOURCE_WORKFLOW_BUCKETS,
  createSeedData,
  deepClone,
  getComputedLeadStage,
  getLeadGuardFlags,
  getLeadWorkflowBucket,
  getOpportunityGuardFlags,
  getOpportunityReadinessGaps,
  getComputedOpportunityStage,
  getComputedSectorStatus,
  getRequiredValidationErrors,
  hasOpportunityForLead,
  normalizeDashboardState,
  todayDate,
  validateLeadTransition,
  validateOpportunityTransition,
} from "./logic.mjs";

const STATIC_SCREENS = [
  { key: "analysis" },
  { key: "all-leads" },
];

const FALLBACK_COPY = {
  meta: {
    locale: "en",
    lang: "en",
    dir: "ltr",
    title: "MyCalls Operational Dashboard",
    productName: "MyCalls",
    brandMark: "MC",
    brandEyebrow: "Revenue Engine",
    dashboardEyebrow: "Operational Dashboard",
  },
  chrome: {
    screens: {
      analysis: "Analysis",
      "all-leads": "All Leads",
      sources: "Sources",
    },
    sidebar: {
      weeklyFocusLabel: "Weekly Focus",
      rulesLabel: "Operating Rules",
      rules: [],
    },
    filters: {
      sector: "Sector",
      stage: "Stage / Status",
      urgency: "Urgency",
      overdue: "Overdue",
      all: "All",
      yes: "Yes",
      no: "No",
    },
    storage: {
      savedLocally: (time) => `Saved locally ${time}`,
      localLoaded: "Local state loaded",
      seedMode: "Seed mode",
      memoryOnly: "Memory only",
    },
    buttons: {
      restoreSeed: "Restore Seed",
      resetLocal: "Reset Local",
      newSector: "New Sector",
      newLead: "New Lead",
      newOpportunity: "New Opportunity",
      setActive: "Set as Active",
      save: "Save",
      createSector: "Create sector",
      createLead: "Create lead",
      createOpportunity: "Create opportunity",
      createOpportunityFromLead: "Create Opportunity",
    },
    empty: {
      title: "No matching items",
      copy: "Adjust filters or add a new record.",
    },
    sections: {},
    fields: {},
    forms: {},
    values: {
      noActiveSector: "No active sector",
      noActiveOffer: "No active offer",
      selectOneSector: "Select one sector only and focus it hard.",
      noImmediateNextStep: "No immediate next step",
      noRole: "No role",
      noUrgency: "No urgency",
      noDecisionLevel: "No decision level",
      noSignalCaptured: "No signal captured yet.",
      noObjectionLogged: "No objection logged",
      notReadyYet: "Not ready yet",
      missing: "Missing",
      noAdditionalNote: "No additional note",
      stakeholderPathUnclear: "Stakeholder path not clear",
      readyForProposalStage: "Ready for Proposal Stage",
      noDelayedStage: "No delayed stage",
      record: "Record",
      opportunity: "Opportunity",
      lead: "Lead",
      sector: "Sector",
      last: "Last",
      delayedCount: (count) => `${count} delayed`,
      overdueCount: (count) => `${count} overdue`,
    },
  },
  display: {
    leadStages: {},
    opportunityStages: {},
    sectorStatuses: {},
    breakOptions: {},
    guardFlags: {},
    urgency: {},
    priorities: {},
    finalDecision: {},
    interestType: {},
    decisionLevel: {},
    channels: {},
  },
  messages: {
    notices: {},
    logicErrors: {},
  },
  seed: {
    factory: (seed) => seed,
  },
};

const state = {
  locale: "en",
  copy: FALLBACK_COPY,
  data: createSeedData(),
  activeScreen: "analysis",
  activeSource: "all",
  filters: {
    sector: "all",
    stage: "all",
    urgency: "all",
    overdue: "all",
    source: "all",
    focus: "all",
  },
  drawer: {
    open: false,
    kind: null,
    entityType: null,
    entityId: null,
    mode: "view",
    message: "",
    contextSource: "",
  },
  notice: "",
  guidance: null,
  storage: {
    available: true,
    source: "shared",
    lastSavedAt: null,
    snapshot: "",
    syncTimer: null,
    version: 0,
    conflictCount: 0,
  },
};

let elements = null;
const SYNC_INTERVAL_MS = 15000;
const clientSessionId = globalThis.crypto?.randomUUID?.() || `session-${Date.now()}`;
const DEBUG_VALIDATION = new URLSearchParams(window.location.search).has("debug");

function copy() {
  return state.copy || FALLBACK_COPY;
}

function getCopyValue(section, key, fallback = "") {
  return copy()?.chrome?.[section]?.[key] ?? fallback;
}

function getFieldLabel(key, fallback = key) {
  return copy()?.chrome?.fields?.[key] ?? fallback;
}

function getFormLabel(key, fallback = key) {
  return copy()?.chrome?.forms?.[key] ?? fallback;
}

function getValueLabel(key, fallback = "") {
  return copy()?.chrome?.values?.[key] ?? fallback;
}

function displayFromMap(group, value) {
  return copy()?.display?.[group]?.[value] ?? value;
}

function displayStage(value) {
  return (
    copy()?.display?.leadStages?.[value] ??
    copy()?.display?.opportunityStages?.[value] ??
    copy()?.display?.sectorStatuses?.[value] ??
    value
  );
}

function displayBreakOption(value) {
  return displayFromMap("breakOptions", value);
}

function displayGuardFlag(value) {
  return displayFromMap("guardFlags", value);
}

function displayUrgency(value) {
  return displayFromMap("urgency", value);
}

function displayPriority(value) {
  return displayFromMap("priorities", value);
}

function displayDecision(value) {
  return displayFromMap("finalDecision", value);
}

function displayInterestType(value) {
  return displayFromMap("interestType", value);
}

function displayDecisionLevel(value) {
  return displayFromMap("decisionLevel", value);
}

function displayChannel(value) {
  return displayFromMap("channels", value);
}

function displayReadinessGap(value) {
  const mapping = {
    pain_summary: getFormLabel("painSummary", "pain_summary"),
    use_case: getFormLabel("useCase", "use_case"),
    buyer_readiness: getFormLabel("buyerReadiness", "buyer_readiness"),
    stakeholder_status: getFormLabel("stakeholderStatus", "stakeholder_status"),
  };
  return mapping[value] || value;
}

function localizeMessage(message) {
  return copy()?.messages?.logicErrors?.[message] || message;
}

function localizeMessages(messages) {
  return messages.map((message) => localizeMessage(message));
}

function setNotice(message) {
  state.notice = message;
}

function setGuidance(guidance = null) {
  state.guidance = guidance;
}

function guidanceLabel(key) {
  const labels = {
    dismiss: copy().meta.lang === "ar" ? "إخفاء" : "Dismiss",
    openOpportunity: copy().meta.lang === "ar" ? "افتح الفرصة" : "Open opportunity",
    createOpportunity: copy().meta.lang === "ar" ? "حوّل إلى فرصة" : "Create opportunity",
    openLead: copy().meta.lang === "ar" ? "افتح الجهة" : "Open lead",
    createLead: copy().meta.lang === "ar" ? "أنشئ جهة جديدة" : "Create lead",
    reviewOpportunity: copy().meta.lang === "ar" ? "راجع الفرصة" : "Review opportunity",
  };
  return labels[key] || key;
}

function getOpportunityByLeadId(leadId) {
  return state.data.opportunities.find((opportunity) => opportunity.origin_lead_id === leadId);
}

function getMutationGuidance({ entityType, record, action = "update" }) {
  if (!record) {
    return null;
  }

  if (entityType === "sector") {
    if (record.is_active) {
      return {
        message:
          copy().meta.lang === "ar"
            ? `الخطوة التالية: افتح جهة جديدة داخل ${record.sector_name} أو راجع اللِيدز الحالية لهذا القطاع.`
            : `Next step: create or review leads inside ${record.sector_name}.`,
        action: {
          type: "create-record",
          entityType: "lead",
          label: guidanceLabel("createLead"),
        },
      };
    }

    return {
      message:
        copy().meta.lang === "ar"
          ? `الخطوة التالية: راجع ما إذا كان هذا القطاع يحتاج تفعيلًا لاحقًا أو أبقه في المتابعة فقط.`
          : "Next step: decide whether this sector needs activation later or should stay in monitoring.",
      action: {
        type: "open-record",
        entityType: "sector",
        entityId: record.id,
        label: record.sector_name,
      },
    };
  }

  if (entityType === "lead") {
    if (record.current_stage === "Handoff Sent" && record.handoff_summary && !getOpportunityByLeadId(record.id)) {
      return {
        message:
          copy().meta.lang === "ar"
            ? `الخطوة التالية: هذه الجهة جاهزة الآن للتحويل إلى فرصة.`
            : "Next step: this lead is now ready to become an opportunity.",
        action: {
          type: "convert-lead",
          leadId: record.id,
          label: guidanceLabel("createOpportunity"),
        },
      };
    }

    if (record.current_stage === "Meeting Booked") {
      return {
        message:
          copy().meta.lang === "ar"
            ? `الخطوة التالية: بعد الاجتماع، أكمل handoff واضح قبل نقل الجهة إلى الفرص.`
            : "Next step: complete a clear handoff after the meeting before moving this lead into opportunities.",
        action: {
          type: "open-record",
          entityType: "lead",
          entityId: record.id,
          label: guidanceLabel("openLead"),
        },
      };
    }

    return {
      message:
        copy().meta.lang === "ar"
          ? `الخطوة التالية: ${record.next_step || "راجع الجهة وحدد خطوة عملية تالية."}`
          : `Next step: ${record.next_step || "review the lead and set a concrete next step."}`,
      action: {
        type: "open-record",
        entityType: "lead",
        entityId: record.id,
        label: guidanceLabel("openLead"),
      },
    };
  }

  if (entityType === "opportunity") {
    return {
      message:
        copy().meta.lang === "ar"
          ? `الخطوة التالية: ${record.next_step || "حافظ على momentum وحدد الخطوة التجارية التالية."}`
          : `Next step: ${record.next_step || "keep momentum and define the next commercial move."}`,
      action: {
        type: "open-record",
        entityType: "opportunity",
        entityId: record.id,
        label: guidanceLabel("reviewOpportunity"),
      },
    };
  }

  return action === "create"
    ? {
        message:
          copy().meta.lang === "ar"
            ? "تم حفظ التغيير. اختر الخطوة التالية مباشرة حتى لا تتوقف الجلسة هنا."
            : "Change saved. Take the next step now so the session keeps moving.",
      }
    : null;
}

function getRecoveryGuidance(errorMessage, context = {}) {
  if (errorMessage.includes("An opportunity already exists for this lead.")) {
    const opportunity = getOpportunityByLeadId(context.leadId);
    return opportunity
      ? {
          message:
            copy().meta.lang === "ar"
              ? "هذه الجهة تحولت بالفعل إلى فرصة. أكمل العمل من سجل الفرصة الحالي بدل التوقف هنا."
              : "This lead is already an opportunity. Continue from the existing opportunity instead of stopping here.",
          action: {
            type: "open-record",
            entityType: "opportunity",
            entityId: opportunity.id,
            label: guidanceLabel("openOpportunity"),
          },
        }
      : null;
  }

  if (errorMessage.includes("Opportunity can only be created from a Handoff Sent lead.")) {
    return {
      message:
        copy().meta.lang === "ar"
          ? "لا تنتقل للفرصة الآن. أكمل handoff داخل الجهة أولًا ثم أعد المحاولة."
          : "Do not move into opportunities yet. Complete the lead handoff first, then try again.",
      action: context.leadId
        ? {
            type: "open-record",
            entityType: "lead",
            entityId: context.leadId,
            label: guidanceLabel("openLead"),
          }
        : null,
    };
  }

  return null;
}

function getSeedData() {
  const seedFactory = copy()?.seed?.factory || ((seed) => seed);
  return normalizeDashboardState(seedFactory(deepClone(createSeedData())));
}

function updateStorageTimestamp() {
  state.storage.lastSavedAt = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

function applyStateSnapshot(nextData, { message = "", source = "shared" } = {}) {
  state.data = normalizeDashboardState(nextData);
  state.storage.snapshot = JSON.stringify(state.data);
  state.storage.available = source !== "memory-only";
  state.storage.source = source;
  state.storage.version = Number(nextData?._meta?.version || state.storage.version || 0);
  if (source !== "memory-only") {
    updateStorageTimestamp();
  }
  if (message) {
    setNotice(message);
  }
}

function getClientActor() {
  return `organic-board:${state.locale}:${clientSessionId}`;
}

async function apiRequest(path, { method = "GET", body } = {}) {
  const startedAt = performance.now();
  const response = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-User": getClientActor(),
      "X-Session-Id": clientSessionId,
      "X-Known-State-Version": String(state.storage.version || 0),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  const apiResult = {
    payload,
    version: Number(response.headers.get("X-State-Version") || 0),
    conflictDetected: response.headers.get("X-Conflict-Detected") === "1",
    latencyMs: Number((performance.now() - startedAt).toFixed(2)),
  };
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed with status ${response.status}`);
    error.api = apiResult;
    throw error;
  }

  return apiResult;
}

async function refreshState({ silent = false, render = true } = {}) {
  try {
    const remoteState = await apiRequest("/state");
    const snapshot = JSON.stringify(normalizeDashboardState(remoteState.payload));
    const changed = snapshot !== state.storage.snapshot;
    applyStateSnapshot(remoteState.payload, { source: "shared" });
    if (DEBUG_VALIDATION) {
      console.debug("[validation] state refresh", {
        session: clientSessionId,
        version: remoteState.version,
        changed,
        latencyMs: remoteState.latencyMs,
      });
    }
    if (render && changed && !state.drawer.open) {
      renderApp();
    }
    return remoteState.payload;
  } catch (error) {
    state.storage.available = false;
    state.storage.source = "memory-only";
    if (!silent) {
      setNotice(copy().messages.notices.serverUnavailable || error.message);
    }
    if (!state.storage.snapshot) {
      applyStateSnapshot(getSeedData(), { source: "memory-only" });
    }
    if (render) {
      renderApp();
    }
    return state.data;
  }
}

async function loadInitialDashboardState() {
  return refreshState({ silent: false, render: false });
}

async function mutateState(path, { method = "PATCH", body, message = "", recoveryContext = null } = {}) {
  try {
    const remoteState = await apiRequest(path, { method, body });
    applyStateSnapshot(remoteState.payload, { message, source: "shared" });
    if (remoteState.conflictDetected) {
      state.storage.conflictCount += 1;
      console.warn("[validation] conflict detected, last-write-wins applied", {
        path,
        session: clientSessionId,
        version: remoteState.version,
      });
    } else if (DEBUG_VALIDATION) {
      console.debug("[validation] mutation applied", {
        path,
        session: clientSessionId,
        version: remoteState.version,
        latencyMs: remoteState.latencyMs,
      });
    }
    return remoteState.payload;
  } catch (error) {
    const recoveryGuidance = getRecoveryGuidance(error.message, recoveryContext || {});
    if (recoveryGuidance) {
      setGuidance(recoveryGuidance);
    }
    console.error("[validation] api mutation failed", {
      path,
      session: clientSessionId,
      message: error.message,
      latencyMs: error.api?.latencyMs || null,
    });
    setNotice(error.message);
    renderApp();
    throw error;
  }
}

async function resetToSeed({ clearStorage = false } = {}) {
  const endpoint = clearStorage ? "/state/reset-shared" : "/state/restore-seed";
  const message = clearStorage
    ? copy().messages.notices.localCleared
    : copy().messages.notices.seedRestored;
  await mutateState(endpoint, { method: "POST", message });
}

function startStateSync() {
  if (state.storage.syncTimer) {
    clearInterval(state.storage.syncTimer);
  }

  state.storage.syncTimer = window.setInterval(() => {
    if (document.hidden) {
      return;
    }
    refreshState({ silent: true, render: !state.drawer.open });
  }, SYNC_INTERVAL_MS);
}

function formatDate(dateValue) {
  if (!dateValue) {
    return "—";
  }

  return new Intl.DateTimeFormat(copy().meta.lang === "ar" ? "ar-EG" : "en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${dateValue}T12:00:00`));
}

function formatCurrency(value) {
  return new Intl.NumberFormat(copy().meta.lang === "ar" ? "ar-SA" : "en-US", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function inferTextDirection(value) {
  if (!value) {
    return "auto";
  }

  return /[\u0600-\u06FF]/.test(String(value)) ? "rtl" : "ltr";
}

function compactText(value, limit = 72) {
  if (!value) {
    return "—";
  }

  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1).trim()}…` : normalized;
}

function shortDate(dateValue) {
  if (!dateValue) {
    return "—";
  }

  return new Intl.DateTimeFormat(copy().meta.lang === "ar" ? "ar-EG" : "en-CA", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${dateValue}T12:00:00`));
}

function renderEmptyState() {
  return `
    <div class="empty-state">
      <p class="empty-title">${copy().chrome.empty.title}</p>
      <p class="empty-copy">${copy().chrome.empty.copy}</p>
    </div>
  `;
}

function getSectorById(sectorId) {
  return state.data.sectors.find((sector) => sector.id === sectorId);
}

function getLeadById(leadId) {
  return state.data.leads.find((lead) => lead.id === leadId);
}

function getChannelOptions() {
  const seeded = Object.keys(copy()?.display?.channels || {});
  const live = [
    ...state.data.leads.map((lead) => lead.channel).filter(Boolean),
    ...state.data.opportunities
      .map((opportunity) => getLeadById(opportunity.origin_lead_id)?.channel)
      .filter(Boolean),
  ];
  return [...new Set([...seeded, ...live])];
}

function getAvailableSources() {
  return getChannelOptions().filter((channel) =>
    state.data.leads.some((lead) => lead.channel === channel) ||
    state.data.opportunities.some(
      (opportunity) => getLeadById(opportunity.origin_lead_id)?.channel === channel,
    ),
  );
}

function getPrimaryScreens() {
  return [
    ...STATIC_SCREENS,
    ...ensureActiveSource().map((source) => ({
      key: `source:${source}`,
      source,
    })),
  ];
}

function isSourceScreen(screen = state.activeScreen) {
  return screen.startsWith("source:");
}

function getScreenSource(screen = state.activeScreen) {
  return isSourceScreen(screen) ? screen.replace(/^source:/, "") : "";
}

function ensureActiveSource() {
  const sources = getAvailableSources();
  if (!sources.length) {
    state.activeSource = "all";
    return [];
  }
  if (!sources.includes(state.activeSource)) {
    state.activeSource = sources[0];
  }
  return sources;
}

function getActiveSource() {
  const screenSource = getScreenSource();
  if (screenSource) {
    state.activeSource = screenSource;
    return screenSource;
  }
  ensureActiveSource();
  return state.activeSource;
}

function leadMatchesCommonFilters(lead) {
  const today = todayDate();
  const computedStage = getComputedLeadStage(lead, today);
  const sector = getSectorById(lead.sector_id);
  const matchesSector =
    state.filters.sector === "all" || sector?.id === state.filters.sector;
  const matchesStage =
    state.filters.stage === "all" || computedStage === state.filters.stage || lead.current_stage === state.filters.stage;
  const matchesUrgency =
    state.filters.urgency === "all" || (lead.urgency_level || "None") === state.filters.urgency;
  const isOverdue = computedStage === "Delayed";
  const matchesOverdue =
    state.filters.overdue === "all" ||
    (state.filters.overdue === "yes" && isOverdue) ||
    (state.filters.overdue === "no" && !isOverdue);
  return matchesSector && matchesStage && matchesUrgency && matchesOverdue;
}

function opportunityMatchesCommonFilters(opportunity) {
  const today = todayDate();
  const computedStage = getComputedOpportunityStage(opportunity, today);
  const sector = getSectorById(opportunity.sector_id);
  const matchesSector =
    state.filters.sector === "all" || sector?.id === state.filters.sector;
  const matchesStage =
    state.filters.stage === "all" ||
    computedStage === state.filters.stage ||
    opportunity.current_stage === state.filters.stage;
  const matchesUrgency =
    state.filters.urgency === "all" || (opportunity.risk_flag || "None") === state.filters.urgency;
  const isOverdue = computedStage === "Delayed";
  const matchesOverdue =
    state.filters.overdue === "all" ||
    (state.filters.overdue === "yes" && isOverdue) ||
    (state.filters.overdue === "no" && !isOverdue);
  return matchesSector && matchesStage && matchesUrgency && matchesOverdue;
}

function getSourceLeads(source = getActiveSource()) {
  return state.data.leads.filter(
    (lead) => lead.channel === source && leadMatchesCommonFilters(lead),
  );
}

function getSourceOpportunities(source = getActiveSource()) {
  return state.data.opportunities.filter((opportunity) => {
    const originLead = getLeadById(opportunity.origin_lead_id);
    return (
      originLead?.channel === source &&
      opportunityMatchesCommonFilters(opportunity)
    );
  });
}

function getSourceMetrics(source = getActiveSource()) {
  const leads = getSourceLeads(source);
  const opportunities = getSourceOpportunities(source);
  const readyForHandoff = leads.filter(
    (lead) => getLeadWorkflowBucket(lead, state.data.opportunities) === "Ready for Handoff",
  ).length;
  const needsReply = leads.filter(
    (lead) => getLeadWorkflowBucket(lead, state.data.opportunities) === "Needs Reply",
  ).length;
  return {
    leads: leads.length,
    needsReply,
    readyForHandoff,
    opportunities: opportunities.length,
  };
}

function getFilteredLeads() {
  return getSourceLeads();
}

function getFilteredOpportunities() {
  return getSourceOpportunities();
}

function getFilteredSectors() {
  const today = todayDate();
  return state.data.sectors.filter((sector) => {
    const computedStatus = getComputedSectorStatus(sector, today);
    const activeSource = getActiveSource();
    const hasSourceLead =
      state.data.leads.some((lead) => lead.sector_id === sector.id && lead.channel === activeSource);
    const matchesSector =
      state.filters.sector === "all" || sector.id === state.filters.sector;
    const matchesStage =
      state.filters.stage === "all" || sector.status === state.filters.stage || computedStatus === state.filters.stage;
    const matchesUrgency = state.filters.urgency === "all" || sector.priority === state.filters.urgency;
    const isOverdue = computedStatus === "Delayed";
    const matchesOverdue =
      state.filters.overdue === "all" ||
      (state.filters.overdue === "yes" && isOverdue) ||
      (state.filters.overdue === "no" && !isOverdue);
    return hasSourceLead && matchesSector && matchesStage && matchesUrgency && matchesOverdue;
  });
}

function getAllLeads() {
  return state.data.leads.filter((lead) => {
    if (!leadMatchesCommonFilters(lead)) {
      return false;
    }

    if (state.filters.source !== "all" && lead.channel !== state.filters.source) {
      return false;
    }

    const workflowBucket = getLeadWorkflowBucket(lead, state.data.opportunities);
    if (state.filters.focus === "needs-reply" && workflowBucket !== "Needs Reply") {
      return false;
    }
    if (state.filters.focus === "ready-handoff" && workflowBucket !== "Ready for Handoff") {
      return false;
    }

    return true;
  });
}

function getAnalysisMetrics() {
  const today = todayDate();
  const leads = state.data.leads;
  const openOpportunities = state.data.opportunities.filter((opportunity) => {
    const stage = getComputedOpportunityStage(opportunity, today);
    return !["Won", "Lost"].includes(stage);
  });

  return {
    newToday: leads.filter((lead) => lead.created_at === today).length,
    needsContact: leads.filter((lead) => {
      const bucket = getLeadWorkflowBucket(lead, state.data.opportunities);
      return ["New", "Needs Extraction", "Needs Reply"].includes(bucket);
    }).length,
    readyForHandoff: leads.filter(
      (lead) => getLeadWorkflowBucket(lead, state.data.opportunities) === "Ready for Handoff",
    ).length,
    openOpportunities: openOpportunities.length,
  };
}

function getSourcePriorityRows() {
  return ensureActiveSource()
    .map((source) => {
      const metrics = getSourceMetrics(source);
      return {
        source,
        metrics,
        score: metrics.readyForHandoff * 3 + metrics.needsReply * 2 + metrics.leads,
      };
    })
    .sort((left, right) => right.score - left.score || right.metrics.leads - left.metrics.leads);
}

function getTodayActionQueue(limit = 6) {
  const today = todayDate();
  return state.data.leads
    .map((lead) => {
      const workflowBucket = getLeadWorkflowBucket(lead, state.data.opportunities);
      const computedStage = getComputedLeadStage(lead, today);
      let priority = 0;
      if (workflowBucket === "Ready for Handoff") priority += 5;
      if (workflowBucket === "Needs Reply") priority += 4;
      if (workflowBucket === "Needs Qualification") priority += 3;
      if (computedStage === "Delayed") priority += 3;
      if (lead.next_step_date && lead.next_step_date <= today) priority += 2;
      if (!lead.next_step) priority += 1;
      return { lead, workflowBucket, computedStage, priority };
    })
    .filter((item) => item.priority > 0)
    .sort((left, right) => right.priority - left.priority)
    .slice(0, limit);
}

function getDropoffRows() {
  const today = todayDate();
  return getSourcePriorityRows()
    .map(({ source, metrics }) => {
      const stalledLeads = getSourceLeads(source).filter((lead) => {
        const computedStage = getComputedLeadStage(lead, today);
        return computedStage === "Delayed" || !lead.next_step;
      }).length;
      return {
        source,
        stalledLeads,
        readyForHandoff: metrics.readyForHandoff,
        needsReply: metrics.needsReply,
      };
    })
    .filter((row) => row.stalledLeads || row.readyForHandoff || row.needsReply)
    .sort((left, right) => right.stalledLeads - left.stalledLeads || right.readyForHandoff - left.readyForHandoff);
}

function setDrawer(drawerState) {
  state.drawer = { ...state.drawer, ...drawerState };
  renderDrawer();
}

function closeDrawer() {
  state.drawer = {
    open: false,
    kind: null,
    entityType: null,
    entityId: null,
    mode: "view",
    message: "",
    contextSource: "",
  };
  renderDrawer();
}

function renderNav() {
  elements.nav.innerHTML = getPrimaryScreens().map(
    (screen) => `
      <button
        class="nav-link ${screen.key === state.activeScreen ? "active" : ""}"
        data-screen="${screen.key}"
        type="button"
      >
        ${screen.source ? displayChannel(screen.source) : copy().chrome.screens[screen.key] || screen.key}
      </button>
    `,
  ).join("");

  elements.nav.querySelectorAll("[data-screen]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeScreen = button.dataset.screen;
      if (isSourceScreen(state.activeScreen)) {
        state.activeSource = getScreenSource(state.activeScreen);
      }
      renderApp();
    });
  });
}

function renderSidebarWeeklyFocus() {
  const activeSector = getSectorById(state.data.weeklyFocus.active_sector_id);
  elements.sidebarWeeklyFocus.innerHTML = `
    <div class="focus-chip" dir="${inferTextDirection(activeSector?.sector_name)}">${
      activeSector?.sector_name || getValueLabel("noActiveSector", "No active sector")
    }</div>
    <p class="sidebar-copy">${state.data.weeklyFocus.current_offer || getValueLabel("noActiveOffer", "No active offer")}</p>
    <p class="sidebar-note">${state.data.weeklyFocus.weekly_target}</p>
  `;
}

function renderFilters() {
  const sourceOptions = getAvailableSources()
    .map((source) => `<option value="${source}">${displayChannel(source)}</option>`)
    .join("");
  const sectorOptions = state.data.sectors
    .map((sector) => `<option value="${sector.id}">${sector.sector_name}</option>`)
    .join("");
  const stageOptions = [...new Set([...LEAD_STAGES, ...OPPORTUNITY_STAGES, "Active", "Testing", "Paused", "Rejected"])]
    .map((stage) => `<option value="${stage}">${displayStage(stage)}</option>`)
    .join("");
  const focusLabel = copy().meta.lang === "ar" ? "التركيز" : "Focus";
  const needsReplyLabel = copy().meta.lang === "ar" ? "يحتاج رد" : "Needs Reply";
  const readyLabel = copy().meta.lang === "ar" ? "جاهز للتحويل" : "Ready for Handoff";

  if (state.activeScreen === "analysis") {
    elements.filters.innerHTML = `
      <label>
        <span>${copy().chrome.filters.sector}</span>
        <select data-filter="sector">
          <option value="all">${copy().chrome.filters.all}</option>
          ${sectorOptions}
        </select>
      </label>
      <label>
        <span>${copy().chrome.filters.overdue}</span>
        <select data-filter="overdue">
          <option value="all">${copy().chrome.filters.all}</option>
          <option value="yes">${copy().chrome.filters.yes}</option>
          <option value="no">${copy().chrome.filters.no}</option>
        </select>
      </label>
    `;
  } else if (state.activeScreen === "all-leads") {
    elements.filters.innerHTML = `
      <label>
        <span>${getFieldLabel("source", "Source")}</span>
        <select data-filter="source">
          <option value="all">${copy().chrome.filters.all}</option>
          ${sourceOptions}
        </select>
      </label>
      <label>
        <span>${copy().chrome.filters.stage}</span>
        <select data-filter="stage">
          <option value="all">${copy().chrome.filters.all}</option>
          ${stageOptions}
        </select>
      </label>
      <label>
        <span>${copy().chrome.filters.sector}</span>
        <select data-filter="sector">
          <option value="all">${copy().chrome.filters.all}</option>
          ${sectorOptions}
        </select>
      </label>
      <label>
        <span>${copy().chrome.filters.overdue}</span>
        <select data-filter="overdue">
          <option value="all">${copy().chrome.filters.all}</option>
          <option value="yes">${copy().chrome.filters.yes}</option>
          <option value="no">${copy().chrome.filters.no}</option>
        </select>
      </label>
      <label>
        <span>${focusLabel}</span>
        <select data-filter="focus">
          <option value="all">${copy().chrome.filters.all}</option>
          <option value="needs-reply">${needsReplyLabel}</option>
          <option value="ready-handoff">${readyLabel}</option>
        </select>
      </label>
    `;
  } else {
    elements.filters.innerHTML = `
      <label>
        <span>${copy().chrome.filters.sector}</span>
        <select data-filter="sector">
          <option value="all">${copy().chrome.filters.all}</option>
          ${sectorOptions}
        </select>
      </label>
      <label>
        <span>${copy().chrome.filters.stage}</span>
        <select data-filter="stage">
          <option value="all">${copy().chrome.filters.all}</option>
          ${stageOptions}
        </select>
      </label>
      <label>
        <span>${copy().chrome.filters.overdue}</span>
        <select data-filter="overdue">
          <option value="all">${copy().chrome.filters.all}</option>
          <option value="yes">${copy().chrome.filters.yes}</option>
          <option value="no">${copy().chrome.filters.no}</option>
        </select>
      </label>
    `;
  }

  elements.filters.querySelectorAll("[data-filter]").forEach((input) => {
    input.value = state.filters[input.dataset.filter];
    input.addEventListener("change", () => {
      state.filters[input.dataset.filter] = input.value;
      renderScreen();
    });
  });
}

function setScreenActions(html) {
  const storageLabel = state.storage.available
    ? state.storage.lastSavedAt
      ? copy().chrome.storage.savedLocally(state.storage.lastSavedAt)
      : state.storage.source === "shared"
        ? copy().chrome.storage.localLoaded
        : copy().chrome.storage.seedMode
    : copy().chrome.storage.memoryOnly;

  elements.screenActions.innerHTML = `
    <span class="storage-pill ${state.storage.available ? "" : "warning"}">${storageLabel}</span>
    <button class="ghost-button" type="button" data-action="restore-seed">${copy().chrome.buttons.restoreSeed}</button>
    <button class="ghost-button" type="button" data-action="reset-local">${copy().chrome.buttons.resetLocal}</button>
    ${html}
  `;
}

function attachActionListeners() {
  const handleScreenAction = async (action) => {
    if (action === "restore-seed") {
      await resetToSeed();
      renderApp();
    }
    if (action === "reset-local") {
      await resetToSeed({ clearStorage: true });
      renderApp();
    }
    if (action === "new-sector") {
      setDrawer({ open: true, kind: "create", entityType: "sector", mode: "create", message: "" });
    }
    if (action === "new-lead") {
      setDrawer({
        open: true,
        kind: "create",
        entityType: "lead",
        mode: "create",
        message: "",
        contextSource: getActiveSource(),
      });
    }
    if (action === "new-opportunity") {
      setDrawer({ open: true, kind: "create", entityType: "opportunity", mode: "create", message: "" });
    }
  };

  elements.content.querySelectorAll("[data-guidance-dismiss]").forEach((button) => {
    button.addEventListener("click", () => {
      setGuidance(null);
      setNotice("");
      renderApp();
    });
  });

  elements.content.querySelectorAll("[data-guidance-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const actionType = button.dataset.guidanceAction;
      if (actionType === "open-record") {
        setDrawer({
          open: true,
          kind: "detail",
          entityType: button.dataset.guidanceEntity,
          entityId: button.dataset.guidanceId,
          mode: "view",
          message: "",
        });
      }
      if (actionType === "create-record") {
        setDrawer({
          open: true,
          kind: "create",
          entityType: button.dataset.guidanceEntity,
          mode: "create",
          message: "",
          contextSource: button.dataset.guidanceEntity === "lead" ? getActiveSource() : "",
        });
      }
      if (actionType === "convert-lead" && button.dataset.guidanceLead) {
        convertLeadToOpportunity(button.dataset.guidanceLead);
      }
    });
  });

  [elements.screenActions, elements.content].forEach((scope) => scope?.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await handleScreenAction(button.dataset.action);
      } catch {
        // Notice is already set by the mutation helper.
      }
    });
  }));
}

function renderNotice() {
  if (!state.notice && !state.guidance) {
    return "";
  }

  const guidanceAction = state.guidance?.action
    ? `<button class="ghost-button tight" type="button" data-guidance-action="${state.guidance.action.type}" data-guidance-entity="${state.guidance.action.entityType || ""}" data-guidance-id="${state.guidance.action.entityId || ""}" data-guidance-lead="${state.guidance.action.leadId || ""}">${state.guidance.action.label}</button>`
    : "";

  return `
    <div class="flash-banner guidance-banner">
      ${state.notice ? `<p>${state.notice}</p>` : ""}
      ${state.guidance?.message ? `<p>${state.guidance.message}</p>` : ""}
      <div class="guidance-actions">
        ${guidanceAction}
        <button class="ghost-button tight" type="button" data-guidance-dismiss="true">${guidanceLabel("dismiss")}</button>
      </div>
    </div>
  `;
}

function displayWorkflowBucket(bucket) {
  const labels = {
    New: copy().meta.lang === "ar" ? "جديد" : "New",
    "Needs Extraction": copy().meta.lang === "ar" ? "يحتاج استخراج" : "Needs Extraction",
    "Needs Reply": copy().meta.lang === "ar" ? "يحتاج رد" : "Needs Reply",
    "Needs Qualification": copy().meta.lang === "ar" ? "يحتاج تأهيل" : "Needs Qualification",
    "Ready for Handoff": copy().meta.lang === "ar" ? "جاهز للتحويل" : "Ready for Handoff",
    "Closed / Disqualified": copy().meta.lang === "ar" ? "مغلق / مستبعد" : "Closed / Disqualified",
  };
  return labels[bucket] || bucket;
}

function getSourceTabSummary(source) {
  const metrics = getSourceMetrics(source);
  return copy().meta.lang === "ar"
    ? `${metrics.leads} جهة • ${metrics.opportunities} فرصة`
    : `${metrics.leads} leads • ${metrics.opportunities} opportunities`;
}

function getSourcePlaybook(source) {
  const isArabic = copy().meta.lang === "ar";
  const defaults = isArabic
    ? {
        whereToLook: ["ابحث في المحادثات النشطة", "راجع التعليقات أو الأسئلة المتكررة", "التقط أي إشارة ألم أو طلب متابعة"],
        signals: ["طلب توضيح أو تسعير", "شكوى من بطء أو فوضى", "وجود مدير تشغيل أو مالك في الحوار"],
        tricks: ["سجل lead بسرعة قبل ضياع الإشارة", "اكتب pain signal بجملة واحدة", "أضف next step واضحة من أول مرة"],
        qualifies: "جهة فيها ألم واضح، وقناة تواصل مباشرة، وخطوة تالية قابلة للتنفيذ.",
      }
    : {
        whereToLook: ["Check active conversations", "Review repeated questions and comments", "Capture any pain signal or follow-up request"],
        signals: ["Pricing or scope question", "Complaint about delay or chaos", "Ops manager or owner present in the thread"],
        tricks: ["Capture the lead before the signal disappears", "Write the pain signal in one sentence", "Set the next step immediately"],
        qualifies: "A usable lead has clear pain, a direct contact path, and a practical next step.",
      };

  const presets = {
    WhatsApp: isArabic
      ? {
          whereToLook: ["محادثات العملاء السابقة", "الرسائل التي توقفت بعد استفسار", "الإحالات من عملاء حاليين"],
          signals: ["استفسار عن الحجز أو المتابعة", "شكوى من missed calls", "احتياج سكرتارية أو متابعة خارج الدوام"],
          tricks: ["ابدأ من المحادثات الأحدث", "استخرج lead من كل استفسار ناقص", "دوّن اسم النشاط والدور فورًا"],
          qualifies: "الشركة لديها ضغط مكالمات أو متابعة، ويوجد شخص واضح يمكن الرجوع إليه.",
        }
      : {
          whereToLook: ["Recent client chats", "Threads that stopped after a question", "Referrals from current customers"],
          signals: ["Booking or follow-up question", "Complaint about missed calls", "Need for secretary or after-hours follow-up"],
          tricks: ["Start with the freshest chats", "Turn every incomplete inquiry into a lead", "Capture company and role immediately"],
          qualifies: "The business has follow-up pressure and a clear person to continue with.",
        },
    Call: isArabic
      ? {
          whereToLook: ["سجل المكالمات الفائتة", "المكالمات المتكررة لنفس الرقم", "المكالمات التي انتهت بدون متابعة"],
          signals: ["مكالمة فائتة أكثر من مرة", "سؤال سريع عن الخدمة", "عدم وجود سكرتارية أو رد ثابت"],
          tricks: ["رتب الأرقام حسب التكرار", "سجّل pain signal من أول مكالمة", "حدد هل تحتاج رد أم تأهيل"],
          qualifies: "هناك intent واضح من المتصل وسبب عملي يجعل خدمة My Calls ذات معنى.",
        }
      : {
          whereToLook: ["Missed-call logs", "Repeated calls from the same number", "Calls that ended without follow-up"],
          signals: ["Repeated missed calls", "Fast service inquiry", "No consistent front-desk handling"],
          tricks: ["Sort numbers by repetition", "Capture the pain signal from the first call", "Decide if it needs reply or qualification"],
          qualifies: "The caller shows intent and there is an operational reason for My Calls to help.",
        },
    LinkedIn: isArabic
      ? {
          whereToLook: ["منشورات التشغيل والمبيعات", "تعليقات أصحاب الشركات", "صفحات الشركات التي يظهر عليها بطء الرد"],
          signals: ["ذكر فقدان العملاء", "ضغط على الفريق", "طلب نظام متابعة أو تنظيم مكالمات"],
          tricks: ["ابدأ بأصحاب القرار الظاهرين", "اسحب الإشارة لا الاسم فقط", "اكتب next step مخصصة للمنصة"],
          qualifies: "يوجد pain تشغيلي واضح وشخص مهني مناسب للتواصل.",
        }
      : {
          whereToLook: ["Ops and sales posts", "Founder and manager comments", "Company pages showing response gaps"],
          signals: ["Mentions lost customers", "Team overload", "Need for follow-up or call handling system"],
          tricks: ["Start with visible decision-makers", "Capture the signal, not just the name", "Write a source-specific next step"],
          qualifies: "There is clear operational pain and a relevant professional contact.",
        },
  };

  return presets[source] || defaults;
}

function renderBullets(items) {
  return `<ul class="playbook-list">${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
}

function renderSourceHuntPanel(source) {
  const playbook = getSourcePlaybook(source);
  return `
    <article class="panel source-panel hunt-panel">
      <div class="panel-head">
        <div>
          <p class="panel-label">${copy().meta.lang === "ar" ? "الالتقاط" : "Hunt"}</p>
          <h3>${copy().meta.lang === "ar" ? `كيف نبحث داخل ${displayChannel(source)}` : `How to hunt in ${displayChannel(source)}`}</h3>
        </div>
        <button class="primary-button tight" type="button" data-action="new-lead">${copy().chrome.buttons.newLead}</button>
      </div>
      <div class="playbook-grid">
        <div>
          <h4>${copy().meta.lang === "ar" ? "أين نبحث" : "Where to look"}</h4>
          ${renderBullets(playbook.whereToLook)}
        </div>
        <div>
          <h4>${copy().meta.lang === "ar" ? "الإشارات المهمة" : "Lead signals"}</h4>
          ${renderBullets(playbook.signals)}
        </div>
        <div>
          <h4>${copy().meta.lang === "ar" ? "حيل سريعة" : "Quick tricks"}</h4>
          ${renderBullets(playbook.tricks)}
        </div>
      </div>
      <p class="card-summary"><strong>${copy().meta.lang === "ar" ? "ما الذي يجعلها lead صالحة؟" : "What qualifies as usable?"}</strong> ${playbook.qualifies}</p>
    </article>
  `;
}

function renderSourceSnapshot(source) {
  const metrics = getSourceMetrics(source);
  return `
    <article class="panel source-panel snapshot-panel">
      <div class="panel-head">
        <div>
          <p class="panel-label">${copy().meta.lang === "ar" ? "ملخص القناة" : "Captured / Snapshot"}</p>
          <h3>${displayChannel(source)}</h3>
        </div>
      </div>
      <div class="detail-grid tight">
        <div><span>${copy().meta.lang === "ar" ? "إجمالي اللِيدز" : "Total leads"}</span><strong>${metrics.leads}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "تحتاج رد" : "Needs reply"}</span><strong>${metrics.needsReply}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "جاهزة للتحويل" : "Ready for handoff"}</span><strong>${metrics.readyForHandoff}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "فرص ناتجة" : "Progressed opportunities"}</span><strong>${metrics.opportunities}</strong></div>
      </div>
      <p class="card-summary">
        ${
          copy().meta.lang === "ar"
            ? "هذا الملخص يوضح أين تقف هذه القناة الآن: ما تم التقاطه، وما يحتاج ردًا، وما أصبح جاهزًا للانتقال إلى فرصة."
            : "This snapshot shows what the source has captured, what still needs reply, and what is ready to move into opportunities."
        }
      </p>
    </article>
  `;
}

function renderExtractionPanel(source) {
  const metrics = getSourceMetrics(source);
  return `
    <article class="panel source-panel extraction-panel">
      <div class="panel-head">
        <div>
          <p class="panel-label">${copy().meta.lang === "ar" ? "الاستخراج" : "Extraction"}</p>
          <h3>${displayChannel(source)}</h3>
        </div>
        <button class="primary-button tight" type="button" data-action="new-lead">${copy().chrome.buttons.newLead}</button>
      </div>
      <div class="detail-grid tight">
        <div><span>${copy().meta.lang === "ar" ? "الإشارات داخل القناة" : "Signals in source"}</span><strong>${metrics.leads}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "تحتاج رد" : "Need reply"}</span><strong>${metrics.needsReply}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "جاهزة للتحويل" : "Ready for handoff"}</span><strong>${metrics.readyForHandoff}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "فرص ناتجة" : "Progressed opportunities"}</span><strong>${metrics.opportunities}</strong></div>
      </div>
      <p class="card-summary">
        ${
          copy().meta.lang === "ar"
            ? "استخدم هذا التبويب لتسجيل lead جديدة من نفس القناة بسرعة ثم تحريكها داخل inbox واضح حتى التحويل إلى فرصة."
            : "Use this tab to capture new leads from the same source quickly, then move them through a clear inbox until handoff and opportunity creation."
        }
      </p>
    </article>
  `;
}

function renderSourceLeadCard(lead) {
  const sector = getSectorById(lead.sector_id);
  const computedStage = getComputedLeadStage(lead, todayDate());
  const workflowBucket = getLeadWorkflowBucket(lead, state.data.opportunities);
  const linkedOpportunity = getOpportunityByLeadId(lead.id);
  const canConvert =
    workflowBucket === "Ready for Handoff" &&
    lead.current_stage === "Handoff Sent" &&
    lead.handoff_summary &&
    !linkedOpportunity;

  return `
    <article class="source-card">
      <button class="source-card-main" type="button" data-open-record="lead:${lead.id}">
        <div class="kanban-top">
          <div>
            <strong dir="${inferTextDirection(lead.company_name)}">${lead.company_name}</strong>
            <span class="mixed-meta" dir="auto">${lead.contact_name} • ${lead.role || getValueLabel("noRole", "No role")}</span>
          </div>
          <span class="badge ${computedStage === "Delayed" ? "danger" : ""}">${displayStage(computedStage)}</span>
        </div>
        <div class="meta-list">
          <span dir="auto"><span class="source-badge">${displayChannel(lead.channel)}</span> • ${sector?.sector_name || "—"}</span>
          <span dir="${inferTextDirection(lead.pain_signal || lead.notes)}">${compactText(lead.pain_signal || lead.notes || getValueLabel("noSignalCaptured", "No signal captured yet."), 72)}</span>
        </div>
        <div class="card-footer">
          <small class="card-next" dir="${inferTextDirection(lead.next_step)}">${compactText(lead.next_step || "—", 42)}</small>
          <small dir="ltr">${shortDate(lead.next_step_date)}</small>
        </div>
      </button>
      ${
        canConvert
          ? `<div class="source-card-actions"><button class="ghost-button tight" type="button" data-convert-lead="${lead.id}">${copy().chrome.buttons.createOpportunityFromLead}</button></div>`
          : linkedOpportunity
            ? `<div class="source-card-actions"><button class="ghost-button tight" type="button" data-open-record="opportunity:${linkedOpportunity.id}">${guidanceLabel("openOpportunity")}</button></div>`
            : ""
      }
    </article>
  `;
}

function renderSourceWorkflow(source) {
  const leads = getSourceLeads(source);
  return `
    <section class="source-workflow">
      ${SOURCE_WORKFLOW_BUCKETS.map((bucket) => {
        const items = leads.filter(
          (lead) => getLeadWorkflowBucket(lead, state.data.opportunities) === bucket,
        );
        return `
          <article class="panel workflow-column">
            <header class="kanban-header">
              <div>
                <p class="panel-label">${copy().meta.lang === "ar" ? "مرحلة الصندوق" : "Inbox Stage"}</p>
                <h3>${displayWorkflowBucket(bucket)}</h3>
              </div>
              <span class="pill">${items.length}</span>
            </header>
            <div class="kanban-stack">
              ${items.length ? items.map(renderSourceLeadCard).join("") : renderEmptyState()}
            </div>
          </article>
        `;
      }).join("")}
    </section>
  `;
}

function renderSourceProgression(source) {
  const leads = getSourceLeads(source);
  const readyLeads = leads.filter(
    (lead) => getLeadWorkflowBucket(lead, state.data.opportunities) === "Ready for Handoff",
  );
  const opportunities = getSourceOpportunities(source);

  return `
    <aside class="source-progression">
      <article class="panel rail-panel">
        <div class="panel-head">
          <div>
            <p class="panel-label">${copy().meta.lang === "ar" ? "التحويل" : "Progression"}</p>
            <h3>${copy().meta.lang === "ar" ? "جاهزة للتحويل" : "Ready for Handoff"}</h3>
          </div>
          <span class="pill">${readyLeads.length}</span>
        </div>
        <div class="rail-list">
          ${
            readyLeads.length
              ? readyLeads
                  .map(
                    (lead) => `
                      <div class="rail-item action-rail-item">
                        <div>
                          <strong>${lead.company_name}</strong>
                          <div class="meta-row">${compactText(lead.handoff_summary, 70)}</div>
                        </div>
                        <button class="ghost-button tight" type="button" data-convert-lead="${lead.id}">${copy().chrome.buttons.createOpportunityFromLead}</button>
                      </div>
                    `,
                  )
                  .join("")
              : renderEmptyState()
          }
        </div>
      </article>

      <article class="panel rail-panel">
        <div class="panel-head">
          <div>
            <p class="panel-label">${copy().meta.lang === "ar" ? "الفرص الناتجة" : "Progressed"}</p>
            <h3>${copy().meta.lang === "ar" ? "فرص هذه القناة" : "Source Opportunities"}</h3>
          </div>
          <span class="pill">${opportunities.length}</span>
        </div>
        <div class="rail-list">
          ${
            opportunities.length
              ? opportunities
                  .map(
                    (opportunity) => `
                      <button class="rail-item source-opp-row" type="button" data-open-record="opportunity:${opportunity.id}">
                        <div>
                          <strong>${opportunity.company_name}</strong>
                          <div class="meta-row">${displayStage(getComputedOpportunityStage(opportunity, todayDate()))}</div>
                        </div>
                        <span class="pill">${formatCurrency(opportunity.estimated_value)}</span>
                      </button>
                    `,
                  )
                  .join("")
              : renderEmptyState()
          }
        </div>
      </article>

      <article class="panel rail-panel">
        <div class="panel-head">
          <div>
            <p class="panel-label">${copy().meta.lang === "ar" ? "دعم القرار" : "Decision Support"}</p>
            <h3>${copy().meta.lang === "ar" ? "القطاعات داخل القناة" : "Sectors in Source"}</h3>
          </div>
        </div>
        <div class="rail-list">
          ${getFilteredSectors()
            .map(
              (sector) => `
                <button class="rail-item source-sector-row" type="button" data-open-record="sector:${sector.id}">
                  <div>
                    <strong>${sector.sector_name}</strong>
                    <div class="meta-row">${displayStage(getComputedSectorStatus(sector, todayDate()))}</div>
                  </div>
                  ${sector.is_active ? `<span class="pill">${copy().chrome.buttons.setActive}</span>` : ""}
                </button>
              `,
            )
            .join("") || renderEmptyState()}
        </div>
      </article>
    </aside>
  `;
}

function renderMetricCard(label, value, note = "") {
  return `
    <article class="stat-card">
      <span>${label}</span>
      <strong>${value}</strong>
      ${note ? `<small>${note}</small>` : ""}
    </article>
  `;
}

function renderAnalysisScreen() {
  const metrics = getAnalysisMetrics();
  const sourceRows = getSourcePriorityRows();
  const actionQueue = getTodayActionQueue();
  const dropoffRows = getDropoffRows();

  setScreenActions("");

  return `
    <section class="analysis-board">
      <section class="stat-strip source-stat-strip">
        ${renderMetricCard(copy().meta.lang === "ar" ? "جهات جديدة اليوم" : "New leads today", metrics.newToday)}
        ${renderMetricCard(copy().meta.lang === "ar" ? "تحتاج تواصل الآن" : "Need contact now", metrics.needsContact)}
        ${renderMetricCard(copy().meta.lang === "ar" ? "جاهزة للتحويل" : "Ready for handoff", metrics.readyForHandoff)}
        ${renderMetricCard(copy().meta.lang === "ar" ? "فرص مفتوحة" : "Open opportunities", metrics.openOpportunities)}
      </section>

      <section class="analysis-grid">
        <article class="panel analysis-panel">
          <div class="panel-head">
            <div>
              <p class="panel-label">${copy().meta.lang === "ar" ? "أين نبدأ" : "Where to Hunt Today"}</p>
              <h3>${copy().meta.lang === "ar" ? "أولوية القنوات اليوم" : "Source priority today"}</h3>
            </div>
          </div>
          <div class="rail-list">
            ${sourceRows
              .map(
                ({ source, metrics: sourceMetrics }) => `
                  <button class="rail-item source-priority-row" type="button" data-source-tab="${source}">
                    <div>
                      <strong>${displayChannel(source)}</strong>
                      <div class="meta-row">
                        ${
                          copy().meta.lang === "ar"
                            ? `${sourceMetrics.leads} جهة • ${sourceMetrics.needsReply} تحتاج رد • ${sourceMetrics.opportunities} فرصة`
                            : `${sourceMetrics.leads} leads • ${sourceMetrics.needsReply} need reply • ${sourceMetrics.opportunities} opportunities`
                        }
                      </div>
                    </div>
                    <span class="pill">${copy().meta.lang === "ar" ? `${sourceMetrics.readyForHandoff} جاهزة` : `${sourceMetrics.readyForHandoff} ready`}</span>
                  </button>
                `,
              )
              .join("")}
          </div>
        </article>

        <article class="panel analysis-panel">
          <div class="panel-head">
            <div>
              <p class="panel-label">${copy().meta.lang === "ar" ? "حركة اليوم" : "Today Action Queue"}</p>
              <h3>${copy().meta.lang === "ar" ? "ما الذي يحتاج حركة الآن" : "What should move now"}</h3>
            </div>
          </div>
          <div class="rail-list">
            ${
              actionQueue.length
                ? actionQueue
                    .map(
                      ({ lead, workflowBucket, computedStage }) => `
                        <button class="rail-item analysis-action-row" type="button" data-open-record="lead:${lead.id}">
                          <div>
                            <strong>${lead.company_name}</strong>
                            <div class="meta-row">${displayChannel(lead.channel)} • ${displayWorkflowBucket(workflowBucket)} • ${displayStage(computedStage)}</div>
                            <div class="meta-row">${compactText(lead.next_step || getValueLabel("noImmediateNextStep", "No immediate next step"), 80)}</div>
                          </div>
                          <span class="pill">${shortDate(lead.next_step_date)}</span>
                        </button>
                      `,
                    )
                    .join("")
                : renderEmptyState()
            }
          </div>
        </article>

        <article class="panel analysis-panel">
          <div class="panel-head">
            <div>
              <p class="panel-label">${copy().meta.lang === "ar" ? "نقاط الانتباه" : "Drop-Off / Attention"}</p>
              <h3>${copy().meta.lang === "ar" ? "أماكن التوقف الظاهرة" : "Where progress is stalling"}</h3>
            </div>
          </div>
          <div class="rail-list">
            ${
              dropoffRows.length
                ? dropoffRows
                    .map(
                      (row) => `
                        <button class="rail-item source-priority-row" type="button" data-source-tab="${row.source}">
                          <div>
                            <strong>${displayChannel(row.source)}</strong>
                            <div class="meta-row">
                              ${
                                copy().meta.lang === "ar"
                                  ? `${row.stalledLeads} متعطلة • ${row.needsReply} تحتاج رد`
                                  : `${row.stalledLeads} stalled • ${row.needsReply} need reply`
                              }
                            </div>
                          </div>
                          <span class="pill">${copy().meta.lang === "ar" ? `${row.readyForHandoff} جاهزة` : `${row.readyForHandoff} ready`}</span>
                        </button>
                      `,
                    )
                    .join("")
                : renderEmptyState()
            }
          </div>
        </article>
      </section>
    </section>
  `;
}

function renderAllLeadCard(lead) {
  const sector = getSectorById(lead.sector_id);
  const computedStage = getComputedLeadStage(lead, todayDate());
  const workflowBucket = getLeadWorkflowBucket(lead, state.data.opportunities);
  const linkedOpportunity = getOpportunityByLeadId(lead.id);
  const canConvert =
    workflowBucket === "Ready for Handoff" &&
    lead.current_stage === "Handoff Sent" &&
    lead.handoff_summary &&
    !linkedOpportunity;

  return `
    <article class="source-card dense-card">
      <button class="source-card-main" type="button" data-open-record="lead:${lead.id}">
        <div class="kanban-top">
          <div>
            <strong dir="${inferTextDirection(lead.company_name)}">${lead.company_name}</strong>
            <span class="mixed-meta" dir="auto">${lead.contact_name} • ${lead.role || getValueLabel("noRole", "No role")}</span>
          </div>
          <span class="badge ${computedStage === "Delayed" ? "danger" : ""}">${displayStage(computedStage)}</span>
        </div>
        <div class="meta-list">
          <span><span class="source-badge">${displayChannel(lead.channel)}</span> • ${sector?.sector_name || "—"}</span>
          <span>${displayWorkflowBucket(workflowBucket)}</span>
          <span dir="${inferTextDirection(lead.pain_signal || lead.notes)}">${compactText(lead.pain_signal || lead.notes || getValueLabel("noSignalCaptured", "No signal captured yet."), 84)}</span>
        </div>
        <div class="card-footer">
          <small class="card-next" dir="${inferTextDirection(lead.next_step)}">${compactText(lead.next_step || "—", 56)}</small>
          <small dir="ltr">${shortDate(lead.next_step_date)}</small>
        </div>
      </button>
      <div class="source-card-actions">
        <button class="ghost-button tight" type="button" data-open-record="lead:${lead.id}">${copy().meta.lang === "ar" ? "فتح السجل" : "Open lead"}</button>
        ${
          canConvert
            ? `<button class="ghost-button tight" type="button" data-convert-lead="${lead.id}">${copy().chrome.buttons.createOpportunityFromLead}</button>`
            : linkedOpportunity
              ? `<button class="ghost-button tight" type="button" data-open-record="opportunity:${linkedOpportunity.id}">${guidanceLabel("openOpportunity")}</button>`
              : ""
        }
      </div>
    </article>
  `;
}

function renderAllLeadsScreen() {
  const leads = getAllLeads();

  setScreenActions("");

  return `
    <section class="analysis-board">
      <section class="stat-strip source-stat-strip">
        ${renderMetricCard(copy().meta.lang === "ar" ? "كل اللِيدز" : "All leads", leads.length)}
        ${renderMetricCard(copy().meta.lang === "ar" ? "تحتاج رد" : "Needs reply", leads.filter((lead) => getLeadWorkflowBucket(lead, state.data.opportunities) === "Needs Reply").length)}
        ${renderMetricCard(copy().meta.lang === "ar" ? "جاهزة للتحويل" : "Ready for handoff", leads.filter((lead) => getLeadWorkflowBucket(lead, state.data.opportunities) === "Ready for Handoff").length)}
        ${renderMetricCard(copy().meta.lang === "ar" ? "مرتبطة بفرص" : "Already progressed", leads.filter((lead) => getOpportunityByLeadId(lead.id)).length)}
      </section>
      <section class="panel all-leads-panel">
        <div class="panel-head">
          <div>
            <p class="panel-label">${copy().meta.lang === "ar" ? "الصندوق الرئيسي" : "Master Inbox"}</p>
            <h3>${copy().meta.lang === "ar" ? "كل العملاء المحتملين" : "All Leads"}</h3>
          </div>
          <button class="primary-button tight" type="button" data-action="new-lead">${copy().chrome.buttons.newLead}</button>
        </div>
        <div class="all-leads-grid">
          ${leads.length ? leads.map(renderAllLeadCard).join("") : renderEmptyState()}
        </div>
      </section>
    </section>
  `;
}

function renderSourceScreen(source) {
  if (!source) {
    return renderEmptyState();
  }

  state.activeSource = source;
  return `
    <section class="source-board">
      <section class="source-intro-grid">
        ${renderSourceHuntPanel(source)}
        ${renderSourceSnapshot(source)}
      </section>
      <section class="source-layout">
        <div class="source-main">
          ${renderSourceWorkflow(source)}
        </div>
        ${renderSourceProgression(source)}
      </section>
    </section>
  `;
}

function fieldRow(label, value) {
  return `
    <div class="detail-row">
      <span>${label}</span>
      <strong>${value || "—"}</strong>
    </div>
  `;
}

function renderSectorDrawer(sector) {
  const computedStatus = getComputedSectorStatus(sector, todayDate());
  return `
    <section class="drawer-section">
      <div class="detail-row cluster">
        <span>${getFieldLabel("status", "Status")}</span>
        <strong>${displayStage(computedStatus)}</strong>
        <span class="badge">${displayPriority(sector.priority)}</span>
      </div>
      ${fieldRow(getFieldLabel("icp", "ICP"), sector.icp)}
      ${fieldRow(getFieldLabel("pain", "Pain"), sector.pain)}
      ${fieldRow(getFieldLabel("offerAngle", "Offer angle"), sector.offer_angle)}
      ${fieldRow(getFieldLabel("urgencyAngle", "Urgency angle"), sector.urgency_angle)}
      ${fieldRow(getFieldLabel("proofNeeded", "Proof needed"), sector.proof_needed)}
      ${fieldRow(getFieldLabel("whyThisSector", "Why this sector"), sector.why_this_sector)}
      ${fieldRow(getFieldLabel("whyNow", "Why now"), sector.why_now)}
      ${fieldRow(getFieldLabel("disqualifyRules", "Disqualify rules"), sector.disqualify_rules)}
      ${fieldRow(getFieldLabel("finalDecision", "Final decision"), displayDecision(sector.final_decision))}
    </section>
    <section class="drawer-section">
      <h4>${getFieldLabel("quickEdit", "Quick Edit")}</h4>
      <form data-save-form="sector" data-entity-id="${sector.id}">
        <label><span>${getFieldLabel("nextStep", "Next Step")}</span><input name="next_step" value="${sector.next_step || ""}" /></label>
        <label><span>${getFieldLabel("nextStepDate", "Next Step Date")}</span><input type="date" name="next_step_date" value="${sector.next_step_date || ""}" /></label>
        <label><span>${getFieldLabel("urgencyAngle", "Urgency angle")}</span><textarea name="urgency_angle">${sector.urgency_angle || ""}</textarea></label>
        <label><span>${getFieldLabel("whyThisSector", "Why this sector")}</span><textarea name="why_this_sector">${sector.why_this_sector || ""}</textarea></label>
        <label><span>${getFieldLabel("whyNow", "Why now")}</span><textarea name="why_now">${sector.why_now || ""}</textarea></label>
        <label><span>${getFieldLabel("disqualifyRules", "Disqualify rules")}</span><textarea name="disqualify_rules">${sector.disqualify_rules || ""}</textarea></label>
        <label><span>${getFormLabel("notes", "notes")}</span><textarea name="notes">${sector.notes || ""}</textarea></label>
        <div class="form-actions">
          <button class="ghost-button" type="button" data-set-active="${sector.id}">${copy().chrome.buttons.setActive}</button>
          <button class="primary-button" type="submit">${copy().chrome.buttons.save}</button>
        </div>
      </form>
    </section>
  `;
}

function renderLeadDrawer(lead) {
  const computedStage = getComputedLeadStage(lead, todayDate());
  const sector = getSectorById(lead.sector_id);
  const linkedOpportunity = getOpportunityByLeadId(lead.id);
  const eligibleForOpportunity =
    lead.current_stage === "Handoff Sent" &&
    lead.handoff_summary &&
    !hasOpportunityForLead(state.data.opportunities, lead.id);
  const guardFlags = getLeadGuardFlags(lead, todayDate());
  return `
    <section class="drawer-section">
      <h4>${getFieldLabel("leadSnapshot", "Lead Snapshot")}</h4>
      ${
        guardFlags.length
          ? `<div class="guard-row">${guardFlags
              .map((flag) => `<span class="guard-pill ${flag.type}">${displayGuardFlag(flag.label)}</span>`)
              .join("")}</div>`
          : ""
      }
      ${fieldRow(getFieldLabel("sector", "Sector"), sector?.sector_name)}
      ${fieldRow(getFieldLabel("contact", "Contact"), `${lead.contact_name} • ${lead.role || getValueLabel("noRole", "No role")}`)}
      ${fieldRow(getFieldLabel("channel", "Channel"), displayChannel(lead.channel))}
      ${fieldRow(getFieldLabel("score", "Score"), lead.lead_score)}
      ${fieldRow(getFieldLabel("painSignal", "Pain Signal"), lead.pain_signal)}
      ${fieldRow(getFieldLabel("interestType", "Interest Type"), displayInterestType(lead.interest_type))}
      ${fieldRow(getFieldLabel("currentStage", "Current Stage"), displayStage(computedStage))}
      ${fieldRow(getFieldLabel("shortNote", "Short Note"), lead.notes)}
      ${fieldRow(getFieldLabel("handoffSummary", "Handoff Summary"), lead.handoff_summary || getValueLabel("notReadyYet", "Not ready yet"))}
    </section>
    ${
      lead.current_stage === "Handoff Sent" || linkedOpportunity
        ? `
          <section class="drawer-section">
            <h4>${copy().meta.lang === "ar" ? "خطوة التقدم التالية" : "Progression"}</h4>
            <div class="progression-card">
              <p>${
                linkedOpportunity
                  ? copy().meta.lang === "ar"
                    ? "هذه الجهة تحولت بالفعل إلى فرصة. الأفضل الآن متابعة التنفيذ من سجل الفرصة."
                    : "This lead has already progressed into an opportunity. Continue execution from the opportunity record."
                  : copy().meta.lang === "ar"
                    ? "الـ handoff مكتمل. الخطوة الطبيعية التالية الآن هي إنشاء فرصة ومتابعة التنفيذ هناك."
                    : "The handoff is complete. The natural next step is to create an opportunity and continue execution there."
              }</p>
              <div class="guidance-actions">
                ${
                  linkedOpportunity
                    ? `<button class="ghost-button tight" type="button" data-open-record="opportunity:${linkedOpportunity.id}">${guidanceLabel("openOpportunity")}</button>`
                    : `<button class="ghost-button tight" type="button" data-convert-lead="${lead.id}">${guidanceLabel("createOpportunity")}</button>`
                }
              </div>
            </div>
          </section>
        `
        : ""
    }
    <section class="drawer-section">
      <h4>${getFieldLabel("quickEdit", "Quick Edit")}</h4>
      <form data-save-form="lead" data-entity-id="${lead.id}">
        <label>
          <span>${getFormLabel("currentStage", "current_stage")}</span>
          <select name="current_stage">
            ${LEAD_STAGES.filter((stage) => stage !== "Delayed")
              .map(
                (stage) =>
                  `<option value="${stage}" ${stage === lead.current_stage ? "selected" : ""}>${displayStage(stage)}</option>`,
              )
              .join("")}
          </select>
        </label>
        <label><span>${getFieldLabel("nextStep", "Next Step")}</span><input name="next_step" value="${lead.next_step || ""}" /></label>
        <label><span>${getFieldLabel("nextStepDate", "Next Step Date")}</span><input type="date" name="next_step_date" value="${lead.next_step_date || ""}" /></label>
        <label><span>${getFieldLabel("painSignal", "Pain Signal")}</span><input name="pain_signal" value="${lead.pain_signal || ""}" /></label>
        <label><span>${getFormLabel("notes", "notes")}</span><textarea name="notes">${lead.notes || ""}</textarea></label>
        <label><span>${getFieldLabel("handoffSummary", "Handoff Summary")}</span><textarea name="handoff_summary">${lead.handoff_summary || ""}</textarea></label>
        <div class="form-actions">
          ${
            eligibleForOpportunity
              ? `<button class="ghost-button" type="button" data-convert-lead="${lead.id}">${copy().chrome.buttons.createOpportunityFromLead}</button>`
              : ""
          }
          <button class="primary-button" type="submit">${copy().chrome.buttons.save}</button>
        </div>
      </form>
    </section>
  `;
}

function renderOpportunityDrawer(opportunity) {
  const sector = getSectorById(opportunity.sector_id);
  const computedStage = getComputedOpportunityStage(opportunity, todayDate());
  const guardFlags = getOpportunityGuardFlags(opportunity, todayDate());
  const readinessGaps = getOpportunityReadinessGaps(opportunity);
  return `
    <section class="drawer-section">
      <h4>${getFieldLabel("businessSnapshot", "Business Snapshot")}</h4>
      ${
        guardFlags.length
          ? `<div class="guard-row">${guardFlags
              .map((flag) => `<span class="guard-pill ${flag.type}">${displayGuardFlag(flag.label)}</span>`)
              .join("")}</div>`
          : ""
      }
      ${fieldRow(getFieldLabel("sector", "Sector"), sector?.sector_name)}
      ${fieldRow(getFieldLabel("estimatedValue", "Estimated Value"), formatCurrency(opportunity.estimated_value))}
      ${fieldRow(getFieldLabel("currentStage", "Current Stage"), displayStage(computedStage))}
      ${fieldRow(getFieldLabel("buyerReadiness", "Buyer Readiness"), opportunity.buyer_readiness)}
    </section>
    <section class="drawer-section">
      <h4>${getFieldLabel("painValue", "Pain & Value")}</h4>
      ${fieldRow(getFormLabel("painSummary", "pain_summary"), opportunity.pain_summary)}
      ${fieldRow(getFieldLabel("useCase", "Use Case"), opportunity.use_case || getValueLabel("missing", "Missing"))}
      ${fieldRow(getFieldLabel("closeProbability", "Close Probability"), `${opportunity.close_probability || 0}%`)}
    </section>
    <section class="drawer-section">
      <h4>${getFieldLabel("buyerReadiness", "Buyer Readiness")}</h4>
      ${fieldRow(getFieldLabel("decisionStatus", "Decision Status"), opportunity.decision_status)}
      ${fieldRow(getFieldLabel("stakeholderStatus", "Stakeholder Status"), opportunity.stakeholder_status)}
      ${fieldRow(
        getFieldLabel("proposalGate", "Proposal Gate"),
        readinessGaps.length
          ? `${getValueLabel("missing", "Missing")}: ${readinessGaps.map((gap) => displayReadinessGap(gap)).join(", ")}`
          : getValueLabel("readyForProposalStage", "Ready for Proposal Stage"),
      )}
    </section>
    <section class="drawer-section">
      <h4>${getFieldLabel("stakeholderMapping", "Stakeholder Mapping")}</h4>
      ${fieldRow(getFieldLabel("stakeholderMap", "Stakeholder Map"), opportunity.stakeholder_map)}
    </section>
    <section class="drawer-section">
      <h4>${getFieldLabel("objections", "Objections")}</h4>
      ${fieldRow(getFieldLabel("objectionSummary", "Objection Summary"), opportunity.objection_summary)}
      ${fieldRow(getFieldLabel("riskFlag", "Risk Flag"), displayUrgency(opportunity.risk_flag))}
    </section>
    <section class="drawer-section">
      <h4>${getFieldLabel("nextStepLogic", "Next Step Logic")}</h4>
      ${fieldRow(getFieldLabel("nextStep", "Next Step"), opportunity.next_step)}
      ${fieldRow(getFieldLabel("nextStepDate", "Next Step Date"), formatDate(opportunity.next_step_date))}
    </section>
    <section class="drawer-section">
      <h4>${getFieldLabel("quickEdit", "Quick Edit")}</h4>
      <form data-save-form="opportunity" data-entity-id="${opportunity.id}">
        <label>
          <span>${getFormLabel("currentStage", "current_stage")}</span>
          <select name="current_stage">
            ${OPPORTUNITY_STAGES.filter((stage) => stage !== "Delayed")
              .map(
                (stage) =>
                  `<option value="${stage}" ${stage === opportunity.current_stage ? "selected" : ""}>${displayStage(stage)}</option>`,
              )
              .join("")}
          </select>
        </label>
        <label><span>${getFieldLabel("nextStep", "Next Step")}</span><input name="next_step" value="${opportunity.next_step || ""}" /></label>
        <label><span>${getFieldLabel("nextStepDate", "Next Step Date")}</span><input type="date" name="next_step_date" value="${opportunity.next_step_date || ""}" /></label>
        <label><span>${getFieldLabel("estimatedValue", "Estimated Value")}</span><input type="number" min="0" step="1" name="estimated_value" value="${opportunity.estimated_value || 0}" /></label>
        <label><span>${getFieldLabel("closeProbability", "Close Probability")}</span><input type="number" min="0" max="100" step="1" name="close_probability" value="${opportunity.close_probability || 0}" /></label>
        <label><span>${getFieldLabel("decisionStatus", "Decision Status")}</span><textarea name="decision_status">${opportunity.decision_status || ""}</textarea></label>
        <label><span>${getFieldLabel("stakeholderMap", "Stakeholder Map")}</span><textarea name="stakeholder_map">${opportunity.stakeholder_map || ""}</textarea></label>
        <label><span>${getFieldLabel("buyerReadiness", "Buyer Readiness")}</span><input name="buyer_readiness" value="${opportunity.buyer_readiness || ""}" /></label>
        <label><span>${getFieldLabel("useCase", "Use Case")}</span><textarea name="use_case">${opportunity.use_case || ""}</textarea></label>
        <label><span>${getFieldLabel("stakeholderStatus", "Stakeholder Status")}</span><textarea name="stakeholder_status">${opportunity.stakeholder_status || ""}</textarea></label>
        <label><span>${getFormLabel("painSummary", "pain_summary")}</span><textarea name="pain_summary">${opportunity.pain_summary || ""}</textarea></label>
        <label><span>${getFieldLabel("objectionSummary", "Objection Summary")}</span><textarea name="objection_summary">${opportunity.objection_summary || ""}</textarea></label>
        <div class="form-actions">
          <button class="primary-button" type="submit">${copy().chrome.buttons.save}</button>
        </div>
      </form>
    </section>
  `;
}

function renderCreateForm(entityType) {
  if (entityType === "sector") {
    return `
      <section class="drawer-section">
        <h4>${copy().chrome.forms.createSector}</h4>
        <form data-create-form="sector">
          <label><span>${getFormLabel("sectorName", "sector_name")}</span><input name="sector_name" required /></label>
          <label><span>${getFormLabel("priority", "priority")}</span><select name="priority"><option value="High">${displayPriority("High")}</option><option value="Medium">${displayPriority("Medium")}</option><option value="Low">${displayPriority("Low")}</option></select></label>
          <label><span>${getFormLabel("status", "status")}</span><select name="status"><option value="Testing">${displayStage("Testing")}</option><option value="Paused">${displayStage("Paused")}</option><option value="Rejected">${displayStage("Rejected")}</option><option value="Active">${displayStage("Active")}</option></select></label>
          <label><span>${getFieldLabel("icp", "ICP")}</span><textarea name="icp" required></textarea></label>
          <label><span>${getFieldLabel("pain", "Pain")}</span><textarea name="pain" required></textarea></label>
          <label><span>${getFormLabel("offerAngle", "offer_angle")}</span><textarea name="offer_angle" required></textarea></label>
          <label><span>${getFormLabel("proofNeeded", "proof_needed")}</span><textarea name="proof_needed" required></textarea></label>
          <label><span>${getFormLabel("finalDecision", "final_decision")}</span><select name="final_decision"><option value="Go">${displayDecision("Go")}</option><option value="Test">${displayDecision("Test")}</option><option value="Pause">${displayDecision("Pause")}</option><option value="Reject">${displayDecision("Reject")}</option></select></label>
          <label><span>${getFormLabel("nextStep", "next_step")}</span><input name="next_step" /></label>
          <label><span>${getFormLabel("nextStepDate", "next_step_date")}</span><input type="date" name="next_step_date" /></label>
          <div class="form-actions">
            <button class="primary-button" type="submit">${copy().chrome.buttons.createSector}</button>
          </div>
        </form>
      </section>
    `;
  }

  if (entityType === "lead") {
    const activeSectors = state.data.sectors.filter((sector) => sector.is_active);
    const activeSource = state.drawer.contextSource || getActiveSource();
    return `
      <section class="drawer-section">
        <h4>${copy().chrome.forms.createLead}</h4>
        <form data-create-form="lead">
          <label><span>${getFormLabel("companyName", "company_name")}</span><input name="company_name" required /></label>
          <label><span>${getFormLabel("sectorId", "sector_id")}</span><select name="sector_id">${activeSectors.map((sector) => `<option value="${sector.id}">${sector.sector_name}</option>`).join("")}</select></label>
          <label><span>${getFormLabel("contactName", "contact_name")}</span><input name="contact_name" required /></label>
          <label><span>${getFormLabel("role", "role")}</span><input name="role" /></label>
          <label><span>${getFieldLabel("channel", "Channel")}</span><select name="channel">${getChannelOptions()
            .map((channel) => `<option value="${channel}" ${channel === activeSource ? "selected" : ""}>${displayChannel(channel)}</option>`)
            .join("")}</select></label>
          <label><span>${getFormLabel("currentStage", "current_stage")}</span><select name="current_stage">${LEAD_STAGES.filter((stage) => stage !== "Delayed").map((stage) => `<option value="${stage}">${displayStage(stage)}</option>`).join("")}</select></label>
          <label><span>${getFormLabel("painSignal", "pain_signal")}</span><textarea name="pain_signal"></textarea></label>
          <label><span>${getFormLabel("nextStep", "next_step")}</span><input name="next_step" required /></label>
          <label><span>${getFormLabel("nextStepDate", "next_step_date")}</span><input type="date" name="next_step_date" required /></label>
          <label><span>${getFormLabel("notes", "notes")}</span><textarea name="notes"></textarea></label>
          <div class="form-actions">
            <button class="primary-button" type="submit">${copy().chrome.buttons.createLead}</button>
          </div>
        </form>
      </section>
    `;
  }

  const eligibleLeads = state.data.leads.filter(
    (lead) =>
      lead.current_stage === "Handoff Sent" &&
      lead.handoff_summary &&
      !hasOpportunityForLead(state.data.opportunities, lead.id),
  );

  return `
      <section class="drawer-section">
        <h4>${copy().chrome.forms.createOpportunity}</h4>
        <form data-create-form="opportunity">
        <label><span>${getFormLabel("originLeadId", "origin_lead_id")}</span><select name="origin_lead_id">${eligibleLeads.map((lead) => `<option value="${lead.id}">${lead.company_name}</option>`).join("")}</select></label>
        <label><span>${getFormLabel("companyName", "company_name")}</span><input name="company_name" required /></label>
        <label><span>${getFormLabel("sectorId", "sector_id")}</span><select name="sector_id">${state.data.sectors.map((sector) => `<option value="${sector.id}">${sector.sector_name}</option>`).join("")}</select></label>
        <label><span>${getFormLabel("currentStage", "current_stage")}</span><select name="current_stage">${OPPORTUNITY_STAGES.filter((stage) => !["Delayed", "Won", "Lost"].includes(stage)).map((stage) => `<option value="${stage}">${displayStage(stage)}</option>`).join("")}</select></label>
        <label><span>${getFormLabel("buyerReadiness", "buyer_readiness")}</span><textarea name="buyer_readiness" required></textarea></label>
        <label><span>${getFormLabel("painSummary", "pain_summary")}</span><textarea name="pain_summary" required></textarea></label>
        <label><span>${getFormLabel("useCase", "use_case")}</span><textarea name="use_case"></textarea></label>
        <label><span>${getFormLabel("stakeholderStatus", "stakeholder_status")}</span><textarea name="stakeholder_status"></textarea></label>
        <label><span>${getFormLabel("nextStep", "next_step")}</span><input name="next_step" required /></label>
        <label><span>${getFormLabel("nextStepDate", "next_step_date")}</span><input type="date" name="next_step_date" required /></label>
        <div class="form-actions">
          <button class="primary-button" type="submit">${copy().chrome.buttons.createOpportunity}</button>
        </div>
      </form>
    </section>
  `;
}

function renderDrawer() {
  const { open, kind, entityType, entityId, message } = state.drawer;
  elements.drawer.classList.toggle("hidden", !open);
  elements.drawerBackdrop.classList.toggle("hidden", !open);

  if (!open) {
    elements.drawerBody.innerHTML = "";
    return;
  }

  let title = "Record";
  let kicker = copy().chrome.sections.details;
  let content = "";

  if (kind === "create") {
    title = entityType === "sector" ? copy().chrome.forms.createSector : entityType === "lead" ? copy().chrome.forms.createLead : copy().chrome.forms.createOpportunity;
    kicker = copy().chrome.sections.createRecord;
    content = renderCreateForm(entityType);
  }

  if (entityType === "sector" && entityId) {
    const sector = state.data.sectors.find((item) => item.id === entityId);
    title = sector?.sector_name || getValueLabel("sector", "Sector");
    kicker = copy().chrome.sections.sectorOffer;
    content = renderSectorDrawer(sector);
  }

  if (entityType === "lead" && entityId) {
    const lead = state.data.leads.find((item) => item.id === entityId);
    title = lead?.company_name || getValueLabel("lead", "Lead");
    kicker = copy().chrome.sections.pipeline;
    content = renderLeadDrawer(lead);
  }

  if (entityType === "opportunity" && entityId) {
    const opportunity = state.data.opportunities.find((item) => item.id === entityId);
    title = opportunity?.company_name || getValueLabel("opportunity", "Opportunity");
    kicker = copy().chrome.sections.revenue;
    content = renderOpportunityDrawer(opportunity);
  }

  elements.drawerKicker.textContent = kicker;
  elements.drawerTitle.textContent = title;
  elements.drawerBody.innerHTML = `
    ${message ? `<div class="flash-message">${message}</div>` : ""}
    ${content}
  `;

  bindDrawerActions();
}

function readFormValues(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

async function patchEntity(entityType, entityId, patch, message = "") {
  const entityPath =
    entityType === "sector" ? "sectors" : entityType === "lead" ? "leads" : "opportunities";
  const payload = { ...patch };
  if (entityType !== "sector" && patch.current_stage) {
    payload.stage_updated_at = todayDate();
  }
  const nextState = await mutateState(`/${entityPath}/${entityId}`, {
    method: "PATCH",
    body: payload,
    message,
  });
  const collectionKey =
    entityType === "sector" ? "sectors" : entityType === "lead" ? "leads" : "opportunities";
  const updatedRecord = nextState[collectionKey].find((item) => item.id === entityId);
  setGuidance(getMutationGuidance({ entityType, record: updatedRecord, action: "update" }));
}

async function saveSectorForm(form) {
  const entityId = form.dataset.entityId;
  const patch = readFormValues(form);
  patch.notes = patch.notes || "";
  patch.owner = "Admin";
  patch.next_step = patch.next_step || "";
  patch.next_step_date = patch.next_step_date || "";
  patch.status = state.data.sectors.find((sector) => sector.id === entityId)?.status;
  patch.is_active = state.data.sectors.find((sector) => sector.id === entityId)?.is_active;
  patch.priority = state.data.sectors.find((sector) => sector.id === entityId)?.priority;
  patch.score = state.data.sectors.find((sector) => sector.id === entityId)?.score;
  patch.icp = state.data.sectors.find((sector) => sector.id === entityId)?.icp;
  patch.pain = state.data.sectors.find((sector) => sector.id === entityId)?.pain;
  patch.offer_angle = state.data.sectors.find((sector) => sector.id === entityId)?.offer_angle;
  patch.proof_needed = state.data.sectors.find((sector) => sector.id === entityId)?.proof_needed;
  patch.final_decision = state.data.sectors.find((sector) => sector.id === entityId)?.final_decision;
  patch.sector_name = state.data.sectors.find((sector) => sector.id === entityId)?.sector_name;
  const errors = getRequiredValidationErrors("sector", patch);

  if (errors.length) {
    setDrawer({ message: localizeMessages(errors).join(" ") });
    return;
  }

  await patchEntity("sector", entityId, patch, copy().messages.notices.sectorUpdated);
  setDrawer({ message: copy().messages.notices.sectorUpdated });
  renderApp();
}

async function saveLeadForm(form) {
  const entityId = form.dataset.entityId;
  const existing = state.data.leads.find((lead) => lead.id === entityId);
  const patch = { ...existing, ...readFormValues(form) };
  patch.owner = "Admin";
  patch.lead_score = existing.lead_score;
  patch.urgency_level = existing.urgency_level;
  patch.decision_level = existing.decision_level;
  patch.interest_type = existing.interest_type;
  patch.last_contact_date = existing.last_contact_date;
  patch.role = existing.role;
  patch.channel = existing.channel;
  patch.sector_id = existing.sector_id;
  const errors = [
    ...localizeMessages(getRequiredValidationErrors("lead", patch)),
    ...localizeMessages(validateLeadTransition(patch, patch.current_stage)),
  ];

  if (errors.length) {
    setDrawer({ message: errors.join(" ") });
    return;
  }

  await patchEntity("lead", entityId, patch, copy().messages.notices.leadUpdated);
  setDrawer({ message: copy().messages.notices.leadUpdated });
  renderApp();
}

async function saveOpportunityForm(form) {
  const entityId = form.dataset.entityId;
  const existing = state.data.opportunities.find((opportunity) => opportunity.id === entityId);
  const patch = { ...existing, ...readFormValues(form) };
  patch.owner = "Admin";
  patch.estimated_value = Number(patch.estimated_value || 0);
  patch.stakeholder_map = patch.stakeholder_map || "";
  patch.close_probability = Math.max(0, Math.min(100, Number(patch.close_probability || 0)));
  patch.risk_flag = existing.risk_flag;
  patch.decision_status = patch.decision_status || "";
  patch.origin_lead_id = existing.origin_lead_id;
  patch.sector_id = existing.sector_id;
  const errors = [
    ...localizeMessages(getRequiredValidationErrors("opportunity", patch)),
    ...localizeMessages(validateOpportunityTransition(patch, patch.current_stage)),
  ];

  if (errors.length) {
    setDrawer({ message: errors.join(" ") });
    return;
  }

  await patchEntity("opportunity", entityId, patch, copy().messages.notices.opportunityUpdated);
  setDrawer({ message: copy().messages.notices.opportunityUpdated });
  renderApp();
}

async function createEntity(entityType, form) {
  const values = readFormValues(form);

  if (entityType === "sector") {
    const draft = {
      id: `sector-${crypto.randomUUID().slice(0, 8)}`,
      sector_name: values.sector_name,
      priority: values.priority,
      status: values.status,
      icp: values.icp,
      pain: values.pain,
      offer_angle: values.offer_angle,
      proof_needed: values.proof_needed,
      final_decision: values.final_decision,
      owner: "Admin",
      next_step: values.next_step,
      next_step_date: values.next_step_date,
      urgency_angle: "",
      why_this_sector: "",
      why_now: "",
      disqualify_rules: "",
      score: 60,
      is_active: values.status === "Active",
      notes: "",
    };
    const errors = getRequiredValidationErrors("sector", draft);
    if (errors.length) {
      setDrawer({ message: localizeMessages(errors).join(" ") });
      return;
    }
    const nextState = await mutateState("/sectors", {
      method: "POST",
      body: draft,
      message: copy().messages.notices.sectorCreated,
    });
    const createdSector = nextState.sectors.find((item) => item.id === draft.id);
    setGuidance(getMutationGuidance({ entityType: "sector", record: createdSector, action: "create" }));
  }

  if (entityType === "lead") {
    const sector = state.data.sectors.find((item) => item.id === values.sector_id);
    if (!sector?.is_active) {
      setDrawer({ message: localizeMessage("New leads can only be created for the active sector.") });
      return;
    }
    const draft = {
      id: `lead-${crypto.randomUUID().slice(0, 8)}`,
      company_name: values.company_name,
      sector_id: values.sector_id,
      contact_name: values.contact_name,
      role: values.role,
      channel: values.channel,
      owner: "Admin",
      current_stage: values.current_stage,
      next_step: values.next_step,
      next_step_date: values.next_step_date,
      notes: values.notes,
      pain_signal: values.pain_signal,
      urgency_level: "Medium",
      decision_level: "Unknown",
      interest_type: "New",
      lead_score: 10,
      last_contact_date: todayDate(),
      handoff_summary: "",
      stage_updated_at: todayDate(),
    };
    const errors = [
      ...localizeMessages(getRequiredValidationErrors("lead", draft)),
      ...localizeMessages(validateLeadTransition(draft, draft.current_stage)),
    ];
    if (errors.length) {
      setDrawer({ message: errors.join(" ") });
      return;
    }
    const nextState = await mutateState("/leads", {
      method: "POST",
      body: draft,
      message: copy().messages.notices.leadCreated,
    });
    const createdLead = nextState.leads.find((item) => item.id === draft.id);
    setGuidance(getMutationGuidance({ entityType: "lead", record: createdLead, action: "create" }));
  }

  if (entityType === "opportunity") {
    const sourceLead = state.data.leads.find((lead) => lead.id === values.origin_lead_id);
    if (!sourceLead || sourceLead.current_stage !== "Handoff Sent" || !sourceLead.handoff_summary) {
      setGuidance(getRecoveryGuidance("Opportunity can only be created from a Handoff Sent lead.", {
        leadId: values.origin_lead_id,
      }));
      setDrawer({ message: localizeMessage("Opportunity can only be created from a Handoff Sent lead.") });
      return;
    }
    if (hasOpportunityForLead(state.data.opportunities, values.origin_lead_id)) {
      setGuidance(getRecoveryGuidance("An opportunity already exists for this lead.", {
        leadId: values.origin_lead_id,
      }));
      setDrawer({ message: localizeMessage("An opportunity already exists for this lead.") });
      return;
    }
    const draft = {
      id: `opp-${crypto.randomUUID().slice(0, 8)}`,
      origin_lead_id: values.origin_lead_id,
      company_name: values.company_name,
      sector_id: values.sector_id,
      owner: "Admin",
      current_stage: values.current_stage,
      buyer_readiness: values.buyer_readiness,
      pain_summary: values.pain_summary,
      use_case: values.use_case,
      stakeholder_status: values.stakeholder_status,
      stakeholder_map: sourceLead.handoff_summary,
      estimated_value: 0,
      objection_summary: "",
      close_probability: 25,
      risk_flag: "Medium",
      decision_status: "New",
      next_step: values.next_step,
      next_step_date: values.next_step_date,
      stage_updated_at: todayDate(),
    };
    const errors = [
      ...localizeMessages(getRequiredValidationErrors("opportunity", draft)),
      ...localizeMessages(validateOpportunityTransition(draft, draft.current_stage)),
    ];
    if (errors.length) {
      setDrawer({ message: errors.join(" ") });
      return;
    }
    const nextState = await mutateState("/opportunities", {
      method: "POST",
      body: draft,
      message: copy().messages.notices.opportunityCreated,
      recoveryContext: { leadId: values.origin_lead_id },
    });
    const createdOpportunity = nextState.opportunities.find((item) => item.id === draft.id);
    setGuidance(getMutationGuidance({ entityType: "opportunity", record: createdOpportunity, action: "create" }));
  }

  if (entityType === "sector") {
    closeDrawer();
    renderApp();
    return;
  }

  closeDrawer();
  renderApp();
}

function convertLeadToOpportunity(leadId) {
  const lead = state.data.leads.find((item) => item.id === leadId);
  if (!lead || lead.current_stage !== "Handoff Sent" || !lead.handoff_summary) {
    setGuidance(getRecoveryGuidance("Opportunity can only be created from a Handoff Sent lead.", {
      leadId,
    }));
    setDrawer({ message: localizeMessage("Lead must be Handoff Sent with a handoff summary first.") });
    return;
  }
  if (hasOpportunityForLead(state.data.opportunities, lead.id)) {
    setGuidance(getRecoveryGuidance("An opportunity already exists for this lead.", {
      leadId,
    }));
    setDrawer({ message: localizeMessage("An opportunity already exists for this lead.") });
    return;
  }
  setDrawer({
    open: true,
    kind: "create",
    entityType: "opportunity",
    mode: "create",
    message: copy().messages.notices.opportunityPrefillReady(lead.company_name),
  });
  requestAnimationFrame(() => {
    const form = document.querySelector('[data-create-form="opportunity"]');
    if (!form) return;
    form.querySelector('[name="origin_lead_id"]').value = lead.id;
    form.querySelector('[name="company_name"]').value = lead.company_name;
    form.querySelector('[name="sector_id"]').value = lead.sector_id;
    form.querySelector('[name="pain_summary"]').value = lead.pain_signal || lead.notes || "";
    form.querySelector('[name="next_step"]').value = copy().meta.lang === "ar" ? "تنفيذ اجتماع استكشاف" : "Run discovery call";
    form.querySelector('[name="next_step_date"]').value = todayDate();
  });
}

function bindDrawerActions() {
  elements.drawerBody.querySelectorAll("[data-save-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        if (form.dataset.saveForm === "sector") await saveSectorForm(form);
        if (form.dataset.saveForm === "lead") await saveLeadForm(form);
        if (form.dataset.saveForm === "opportunity") await saveOpportunityForm(form);
      } catch {
        // Notice is already set by the mutation helper.
      }
    });
  });

  elements.drawerBody.querySelectorAll("[data-create-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await createEntity(form.dataset.createForm, form);
      } catch {
        // Notice is already set by the mutation helper.
      }
    });
  });

  elements.drawerBody.querySelectorAll("[data-set-active]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await patchEntity("sector", button.dataset.setActive, { is_active: true }, copy().messages.notices.activeSectorUpdated);
        setDrawer({ message: copy().messages.notices.activeSectorUpdated });
        renderApp();
      } catch {
        // Notice is already set by the mutation helper.
      }
    });
  });

  elements.drawerBody.querySelectorAll("[data-convert-lead]").forEach((button) => {
    button.addEventListener("click", () => convertLeadToOpportunity(button.dataset.convertLead));
  });
}

function bindRecordOpeners() {
  elements.content.querySelectorAll("[data-source-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeSource = button.dataset.sourceTab;
      state.activeScreen = `source:${button.dataset.sourceTab}`;
      renderApp();
    });
  });

  elements.content.querySelectorAll("[data-open-record]").forEach((button) => {
    button.addEventListener("click", () => {
      const [entityType, entityId] = button.dataset.openRecord.split(":");
      setDrawer({ open: true, kind: "detail", entityType, entityId, mode: "view", message: "" });
    });
  });

  elements.content.querySelectorAll("[data-convert-lead]").forEach((button) => {
    button.addEventListener("click", () => convertLeadToOpportunity(button.dataset.convertLead));
  });

  elements.content.querySelectorAll("[data-set-active]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await patchEntity("sector", button.dataset.setActive, { is_active: true }, copy().messages.notices.activeSectorUpdated);
        renderApp();
      } catch {
        // Notice is already set by the mutation helper.
      }
    });
  });
}

function renderScreen() {
  const title = isSourceScreen()
    ? displayChannel(getScreenSource())
    : copy().chrome.screens[state.activeScreen];
  elements.screenTitle.textContent = title;

  let screenHtml = "";
  if (state.activeScreen === "analysis") {
    screenHtml = renderAnalysisScreen();
  } else if (state.activeScreen === "all-leads") {
    screenHtml = renderAllLeadsScreen();
  } else if (isSourceScreen()) {
    screenHtml = renderSourceScreen(getScreenSource());
  }

  elements.content.innerHTML = `${renderNotice()}${screenHtml}`;

  attachActionListeners();
  bindRecordOpeners();
}

function renderApp() {
  renderNav();
  renderShellChrome();
  renderSidebarWeeklyFocus();
  renderFilters();
  renderScreen();
  renderDrawer();
}

function renderShellChrome() {
  document.documentElement.lang = copy().meta.lang;
  document.documentElement.dir = copy().meta.dir;
  document.title = copy().meta.title;
  elements.brandMark.textContent = copy().meta.brandMark;
  elements.brandEyebrow.textContent = copy().meta.brandEyebrow;
  elements.productName.textContent = copy().meta.productName;
  if (elements.sidebarWeeklyLabel) elements.sidebarWeeklyLabel.textContent = copy().chrome.sidebar.weeklyFocusLabel;
  if (elements.sidebarRulesLabel) elements.sidebarRulesLabel.textContent = copy().chrome.sidebar.rulesLabel;
  if (elements.rulesList) elements.rulesList.innerHTML = copy().chrome.sidebar.rules.map((rule) => `<li>${rule}</li>`).join("");
  elements.topbarEyebrow.textContent = copy().meta.dashboardEyebrow;
  elements.drawerClose.setAttribute(
    "aria-label",
    copy().meta.lang === "ar" ? "إغلاق اللوحة" : "Close drawer",
  );
}

async function bootstrapApp({ locale = "en", localeConfig = FALLBACK_COPY } = {}) {
  document.documentElement.classList.remove("app-pending");
  document.documentElement.classList.add("app-ready");

  state.locale = locale;
  state.copy = localeConfig;

  elements = {
    nav: document.querySelector("#main-nav"),
    brandMark: document.querySelector("#brand-mark"),
    brandEyebrow: document.querySelector("#brand-eyebrow"),
    productName: document.querySelector("#product-name"),
    sidebarWeeklyLabel: document.querySelector("#sidebar-weekly-label"),
    sidebarRulesLabel: document.querySelector("#sidebar-rules-label"),
    rulesList: document.querySelector("#rules-list"),
    topbarEyebrow: document.querySelector("#topbar-eyebrow"),
    screenTitle: document.querySelector("#screen-title"),
    screenActions: document.querySelector("#screen-actions"),
    filters: document.querySelector("#global-filters"),
    content: document.querySelector("#screen-content"),
    sidebarWeeklyFocus: document.querySelector("#sidebar-weekly-focus"),
    drawer: document.querySelector("#drawer"),
    drawerBody: document.querySelector("#drawer-body"),
    drawerKicker: document.querySelector("#drawer-kicker"),
    drawerTitle: document.querySelector("#drawer-title"),
    drawerClose: document.querySelector("#drawer-close"),
    drawerBackdrop: document.querySelector("#drawer-backdrop"),
  };

  elements.drawerClose.addEventListener("click", closeDrawer);
  elements.drawerBackdrop.addEventListener("click", closeDrawer);
  await loadInitialDashboardState();
  startStateSync();
  renderApp();
}

export { bootstrapApp };
