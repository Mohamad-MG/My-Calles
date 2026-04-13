import {
  LEAD_STAGES,
  OPPORTUNITY_STAGES,
  SOURCE_WORKFLOW_BUCKETS,
  STORAGE_KEY,
  createSeedData,
  deepClone,
  parseDashboardState,
  serializeDashboardState,
  getComputedLeadStage,
  getLeadGuardFlags,
  getLeadWorkflowBucket,
  getOpportunityGuardFlags,
  getOpportunityReadinessGaps,
  getComputedOpportunityStage,
  getComputedSectorStatus,
  buildDashboardAnalytics,
  getRequiredValidationErrors,
  hasOpportunityForLead,
  normalizeDashboardState,
  todayDate,
  getLeadNextBestAction,
  getLeadSlaState,
  getOpportunityNextBestAction,
  getOpportunitySlaState,
  getSectorSlaState,
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
      savedLocally: (time) => `Saved ${time}`,
      localLoaded: "Saved",
      seedMode: "Sample data restored",
      memoryOnly: "Storage unavailable",
    },
    buttons: {
      restoreSeed: "Restore Seed",
      resetLocal: "Reset local data",
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
    archived: "hidden",
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
  analytics: null,
  storage: {
    available: true,
    source: "local",
    lastSavedAt: null,
    snapshot: "",
    version: 0,
    sessionId: crypto.randomUUID ? crypto.randomUUID() : `session-${Math.random().toString(16).slice(2)}`,
  },
  recentCaptureLeadId: "",
};

let elements = null;
const DEBUG_MODE = new URLSearchParams(window.location.search).has("debug");

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

/* ── localStorage persistence layer ────────────────────────── */

function saveToLocalStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, serializeDashboardState(state.data, state.analytics));
    state.storage.lastSavedAt = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date());
    state.storage.source = "local";
    state.storage.available = true;
  } catch {
    state.storage.available = false;
  }
}

function loadFromLocalStorage() {
  try {
    const serialized = localStorage.getItem(STORAGE_KEY);
    return parseDashboardState(serialized);
  } catch {
    return normalizeDashboardState(createSeedData());
  }
}

function applyStateSnapshot(nextData, { message = "", source = "local" } = {}) {
  state.data = normalizeDashboardState(nextData);
  state.analytics = nextData?.analytics || buildDashboardAnalytics(state.data);
  state.storage.snapshot = JSON.stringify(state.data);
  state.storage.source = source;
  if (source !== "memory-only") {
    state.storage.lastSavedAt = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date());
  }
  if (message) {
    setNotice(message);
  }
}

async function fetchRemoteDashboardState() {
  try {
    const response = await fetch("/state", {
      headers: {
        "X-User": "dashboard-web",
        "X-Session-Id": state.storage.sessionId,
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const version = Number(response.headers.get("X-State-Version") || 0);
    return {
      payload,
      version: Number.isFinite(version) ? version : 0,
    };
  } catch {
    return null;
  }
}

async function sendRemoteMutation(path, method, body) {
  try {
    const response = await fetch(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-User": "dashboard-web",
        "X-Session-Id": state.storage.sessionId,
        "X-Known-State-Version": String(state.storage.version || 0),
      },
      body: method === "GET" ? undefined : JSON.stringify(body || {}),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Remote mutation failed.");
    }

    return {
      payload,
      version: Number(response.headers.get("X-State-Version") || state.storage.version || 0),
      conflict: response.headers.get("X-Conflict-Detected") === "1",
    };
  } catch {
    return null;
  }
}

async function loadInitialDashboardState() {
  const remote = await fetchRemoteDashboardState();
  if (remote?.payload) {
    applyStateSnapshot(remote.payload, { source: "remote" });
    state.storage.version = remote.version || state.storage.version;
    saveToLocalStorage();
    return;
  }

  const data = loadFromLocalStorage();
  applyStateSnapshot(data, { source: "local" });
  state.storage.version = Number(data?._meta?.version || 0);
}

async function mutateState(path, { method = "PATCH", body, message = "" } = {}) {
  const remote = await sendRemoteMutation(path, method, body);
  if (remote?.payload) {
    applyStateSnapshot(remote.payload, { source: "remote", message });
    state.storage.version = remote.version || state.storage.version;
    saveToLocalStorage();
    return remote.payload;
  }

  // Apply the mutation to in-memory state (body is the patch/entity)
  // path pattern: /sectors/:id, /leads/:id, /opportunities/:id, /sectors, etc.
  const segments = path.replace(/^\//, "").split("/");
  const collection = segments[0];
  const id = segments[1];
  const mutationDate = todayDate();

  if (!id) {
    // POST create — body is the new entity
    const payload = {
      ...body,
      created_at: body?.created_at || mutationDate,
      updated_at: mutationDate,
    };
    if (collection === "sectors") state.data.sectors.push(payload);
    else if (collection === "leads") state.data.leads.push(payload);
    else if (collection === "opportunities") state.data.opportunities.push(payload);
  } else if (collection === "sectors") {
    state.data.sectors = state.data.sectors.map((s) => (s.id === id ? { ...s, ...body, updated_at: mutationDate } : s));
  } else if (collection === "leads") {
    state.data.leads = state.data.leads.map((l) => (l.id === id ? { ...l, ...body, updated_at: mutationDate } : l));
  } else if (collection === "opportunities") {
    state.data.opportunities = state.data.opportunities.map((o) => (o.id === id ? { ...o, ...body, updated_at: mutationDate } : o));
  } else if (path === "/state/restore-seed" || path === "/state/reset-shared") {
    state.data = normalizeDashboardState(getSeedData());
  }

  state.data = normalizeDashboardState(state.data);
  state.analytics = buildDashboardAnalytics(state.data);
  saveToLocalStorage();
  if (message) setNotice(message);
  return state.data;
}

async function resetToSeed({ clearStorage = false } = {}) {
  state.data = normalizeDashboardState(getSeedData());
  saveToLocalStorage();
  const message = clearStorage
    ? (copy().messages.notices.localCleared || "State cleared.")
    : (copy().messages.notices.seedRestored || "Seed restored.");
  setNotice(message);
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

function isLeadArchived(lead) {
  return Boolean(lead?.archived);
}

function shouldShowArchivedLeads() {
  return state.filters.archived === "show";
}

function matchesArchivedVisibility(lead) {
  return shouldShowArchivedLeads() || !isLeadArchived(lead);
}

function getDefaultSourceTarget(source) {
  const defaults = {
    WhatsApp: 3,
    Call: 2,
    LinkedIn: 2,
    Email: 2,
    Google: 1,
    Instagram: 2,
    TikTok: 1,
    YouTube: 1,
    "Competitor Comments": 1,
  };

  return defaults[source] ?? 1;
}

function getSourceTargetMap() {
  const configured = state.data.weeklyFocus?.source_targets || {};
  return getChannelOptions().reduce((accumulator, source) => {
    accumulator[source] = Number(configured[source] ?? getDefaultSourceTarget(source));
    return accumulator;
  }, {});
}

function getSourceDailyTarget(source) {
  return Math.max(0, Number(getSourceTargetMap()[source] ?? getDefaultSourceTarget(source)));
}

function getTargetStatus(todayCaptured, dailyTarget) {
  if (dailyTarget <= 0 || todayCaptured >= dailyTarget) {
    return "done";
  }

  const now = new Date();
  const elapsedRatio = Math.min(1, ((now.getHours() * 60) + now.getMinutes()) / (24 * 60));
  const completionRatio = todayCaptured / dailyTarget;
  return completionRatio >= Math.max(0.2, elapsedRatio - 0.2) ? "on_track" : "behind";
}

function getSourceTargetProgress(source, todayCaptured = 0) {
  const dailyTarget = getSourceDailyTarget(source);
  const remainingToTarget = Math.max(0, dailyTarget - todayCaptured);
  const targetStatus = getTargetStatus(todayCaptured, dailyTarget);
  const warning = targetStatus === "behind" && remainingToTarget > 0
    ? (copy().meta.lang === "ar"
        ? `نحتاج ${remainingToTarget} جهة إضافية من ${displayChannel(source)} اليوم`
        : `Need ${remainingToTarget} more leads from ${displayChannel(source)} today`)
    : "";

  return {
    todayCaptured,
    dailyTarget,
    remainingToTarget,
    targetStatus,
    warning,
  };
}

function getSourceActionPrompt(source, metrics) {
  if (metrics.overdueFollowups > 0) {
    return copy().meta.lang === "ar"
      ? `${metrics.overdueFollowups} متابعات متأخرة — نظّفها الآن قبل أي التقاط جديد`
      : `${metrics.overdueFollowups} follow-ups are overdue — clear them before fresh capture`;
  }

  if (metrics.followUpDueToday > 0) {
    return copy().meta.lang === "ar"
      ? `${metrics.followUpDueToday} جهات تحتاج متابعة اليوم — نفّذ دورة متابعة الآن`
      : `${metrics.followUpDueToday} leads need follow-up today — run one follow-up cycle now`;
  }

  if (metrics.untouchedCapturedToday > 0) {
    return copy().meta.lang === "ar"
      ? `${metrics.untouchedCapturedToday} جهات تحتاج أول تواصل الآن — افتح outreach وابدأ فورًا`
      : `${metrics.untouchedCapturedToday} captured leads still need first touch — start outreach now`;
  }

  if (!metrics.todayCaptured) {
    return copy().meta.lang === "ar"
      ? `لا يوجد التقاط اليوم بعد — ابدأ بـ 5 جهات جديدة داخل ${displayChannel(source)}`
      : `No captures yet today — start with 5 fresh profiles in ${displayChannel(source)}`;
  }

  if (metrics.targetStatus === "behind" && metrics.remainingToTarget > 0) {
    return copy().meta.lang === "ar"
      ? `نحتاج ${metrics.remainingToTarget} جهة إضافية — نفّذ دورة التقاط سريعة الآن`
      : `Need ${metrics.remainingToTarget} more leads — run one quick capture cycle now`;
  }

  if (metrics.targetStatus === "done") {
    return copy().meta.lang === "ar"
      ? "تم الوصول للهدف — حوّل الجهد الآن إلى الردود أو التأهيل"
      : "Target reached — shift to follow-up or qualification";
  }

  return copy().meta.lang === "ar"
    ? `القناة على المسار — أكمل دورة التقاط واحدة ثم ارجع للردود`
    : "On track — complete one more capture cycle, then shift into follow-up";
}

function getSourceExecutionAlert(source, metrics) {
  if (metrics.overdueFollowUpWarning) {
    return metrics.overdueFollowUpWarning;
  }

  if (metrics.followUpDueWarning) {
    return metrics.followUpDueWarning;
  }

  if (metrics.firstTouchWarning) {
    return metrics.firstTouchWarning;
  }

  if (metrics.warning) {
    return metrics.warning;
  }

  if (!metrics.todayCaptured && metrics.dailyTarget > 0) {
    return copy().meta.lang === "ar"
      ? `لم يتم التقاط أي جهة من ${displayChannel(source)} بعد`
      : `No leads captured from ${displayChannel(source)} yet today`;
  }

  return "";
}

function renderTargetStatusBadge(status) {
  const labels = {
    done: copy().meta.lang === "ar" ? "مكتمل" : "Done",
    on_track: copy().meta.lang === "ar" ? "على المسار" : "On track",
    behind: copy().meta.lang === "ar" ? "متأخر" : "Behind",
  };

  return `<span class="badge target-${status}">${labels[status] || status}</span>`;
}

function getChannelOptions() {
  const seeded = Object.keys(copy()?.display?.channels || {});
  const live = [
    ...state.data.leads.filter((lead) => !isLeadArchived(lead)).map((lead) => lead.channel).filter(Boolean),
    ...state.data.opportunities
      .map((opportunity) => {
        const originLead = getLeadById(opportunity.origin_lead_id);
        return isLeadArchived(originLead) ? "" : originLead?.channel;
      })
      .filter(Boolean),
  ];
  return [...new Set([...seeded, ...live])];
}

function getAvailableSources() {
  return getChannelOptions().filter((channel) =>
    getSourceDailyTarget(channel) > 0 ||
    state.data.leads.some((lead) => !isLeadArchived(lead) && lead.channel === channel) ||
    state.data.opportunities.some((opportunity) => {
      const originLead = getLeadById(opportunity.origin_lead_id);
      return !isLeadArchived(originLead) && originLead?.channel === channel;
    })
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

function resolveActiveSource() {
  const screenSource = getScreenSource();
  if (screenSource) {
    return screenSource;
  }

  const sources = getAvailableSources();
  if (!sources.length) {
    return "all";
  }

  return sources.includes(state.activeSource) ? state.activeSource : sources[0];
}

function getLeadCapturedDate(lead) {
  return typeof lead.created_at === "string" ? lead.created_at.slice(0, 10) : "";
}

function getLeadFirstTouchDate(lead) {
  return typeof lead?.first_touch_at === "string" ? lead.first_touch_at.slice(0, 10) : "";
}

function getLeadFollowUpDueDate(lead) {
  return typeof lead?.follow_up_due_at === "string" ? lead.follow_up_due_at.slice(0, 10) : "";
}

function getLeadFollowUpSentDate(lead) {
  return typeof lead?.follow_up_sent_at === "string" ? lead.follow_up_sent_at.slice(0, 10) : "";
}

function getLeadRespondedDate(lead) {
  return typeof lead?.responded_at === "string" ? lead.responded_at.slice(0, 10) : "";
}

function shiftDate(dateValue, days = 0) {
  const anchor = dateValue || todayDate();
  const date = new Date(`${anchor}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function getLeadFollowUpTiming(lead) {
  const dueDate = getLeadFollowUpDueDate(lead);
  const today = todayDate();

  if (!dueDate) {
    return "none";
  }

  if (dueDate < today) {
    return "overdue";
  }

  if (dueDate === today) {
    return "due_today";
  }

  return "not_due_yet";
}

function leadFollowUpNeedsAction(lead) {
  const timing = getLeadFollowUpTiming(lead);
  const effectiveState = getEffectiveLeadOperationalState(lead);
  return effectiveState === "needs_follow_up" || timing === "due_today" || timing === "overdue";
}

function leadNeedsFirstTouch(lead) {
  return Boolean(lead) && Boolean(getLeadCapturedDate(lead)) && !getLeadFirstTouchDate(lead);
}

function getEffectiveLeadOperationalState(lead) {
  if (!lead) {
    return "active";
  }

  if (lead.operational_state === "waiting_response") {
    const followUpTiming = getLeadFollowUpTiming(lead);
    if (followUpTiming === "due_today" || followUpTiming === "overdue") {
      return "needs_follow_up";
    }
  }

  return lead.operational_state || "active";
}

function getLeadOperationalStateLabel(stateValue) {
  const labels = {
    active: copy().meta.lang === "ar" ? "نشط" : "Active",
    captured_today: copy().meta.lang === "ar" ? "تم التقاطه اليوم" : "Captured today",
    needs_first_touch: copy().meta.lang === "ar" ? "يحتاج أول تواصل" : "Needs first touch",
    first_touch_done: copy().meta.lang === "ar" ? "تم أول تواصل" : "First touch done",
    waiting_response: copy().meta.lang === "ar" ? "بانتظار الرد" : "Waiting response",
    needs_follow_up: copy().meta.lang === "ar" ? "يحتاج متابعة" : "Needs follow-up",
    responded: copy().meta.lang === "ar" ? "تم الرد" : "Responded",
  };

  return labels[stateValue] || stateValue || (copy().meta.lang === "ar" ? "نشط" : "Active");
}

function sourceMatchesAnalysisFilters(source) {
  return state.filters.source === "all" || source === state.filters.source;
}

function leadMatchesAnalysisFilters(lead) {
  if (!matchesArchivedVisibility(lead)) {
    return false;
  }

  const today = todayDate();
  const computedStage = getComputedLeadStage(lead, today);
  const sector = getSectorById(lead.sector_id);
  const matchesSector = state.filters.sector === "all" || sector?.id === state.filters.sector;
  const matchesSource = sourceMatchesAnalysisFilters(lead.channel);
  const isOverdue = computedStage === "Delayed";
  const matchesOverdue =
    state.filters.overdue === "all" ||
    (state.filters.overdue === "yes" && isOverdue) ||
    (state.filters.overdue === "no" && !isOverdue);

  return matchesSector && matchesSource && matchesOverdue;
}

function opportunityMatchesAnalysisFilters(opportunity) {
  const today = todayDate();
  const computedStage = getComputedOpportunityStage(opportunity, today);
  const originLead = getLeadById(opportunity.origin_lead_id);
  if (!matchesArchivedVisibility(originLead)) {
    return false;
  }
  const sector = getSectorById(opportunity.sector_id);
  const matchesSector = state.filters.sector === "all" || sector?.id === state.filters.sector;
  const matchesSource = sourceMatchesAnalysisFilters(originLead?.channel || "");
  const isOverdue = computedStage === "Delayed";
  const matchesOverdue =
    state.filters.overdue === "all" ||
    (state.filters.overdue === "yes" && isOverdue) ||
    (state.filters.overdue === "no" && !isOverdue);

  return matchesSector && matchesSource && matchesOverdue;
}

function leadMatchesCommonFilters(lead) {
  if (!matchesArchivedVisibility(lead)) {
    return false;
  }

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
  const originLead = getLeadById(opportunity.origin_lead_id);
  if (!matchesArchivedVisibility(originLead)) {
    return false;
  }
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

function getSourceLeads(source = resolveActiveSource()) {
  return state.data.leads.filter(
    (lead) => lead.channel === source && leadMatchesCommonFilters(lead),
  );
}

function getSourceOpportunities(source = resolveActiveSource()) {
  return state.data.opportunities.filter((opportunity) => {
    const originLead = getLeadById(opportunity.origin_lead_id);
    return (
      originLead?.channel === source &&
      opportunityMatchesCommonFilters(opportunity)
    );
  });
}

function getSourceMetrics(source = resolveActiveSource()) {
  const leads = getSourceLeads(source);
  const opportunities = getSourceOpportunities(source);
  const today = todayDate();
  const todayCaptured = leads.filter((lead) => getLeadCapturedDate(lead) === today).length;
  const firstTouchesDoneToday = leads.filter((lead) => getLeadFirstTouchDate(lead) === today).length;
  const untouchedCapturedToday = leads.filter(
    (lead) => getLeadCapturedDate(lead) === today && leadNeedsFirstTouch(lead),
  ).length;
  const waitingResponseCount = leads.filter((lead) => getEffectiveLeadOperationalState(lead) === "waiting_response").length;
  const followUpDueToday = leads.filter((lead) => getLeadFollowUpTiming(lead) === "due_today").length;
  const overdueFollowups = leads.filter((lead) => getLeadFollowUpTiming(lead) === "overdue").length;
  const respondedToday = leads.filter((lead) => getLeadRespondedDate(lead) === today).length;
  const readyForHandoff = leads.filter(
    (lead) => getLeadWorkflowBucket(lead, state.data.opportunities) === "Ready for Handoff",
  ).length;
  const needsReply = leads.filter(
    (lead) => getLeadWorkflowBucket(lead, state.data.opportunities) === "Needs Reply",
  ).length;
  const firstTouchWarning = untouchedCapturedToday > 0
    ? (copy().meta.lang === "ar"
        ? `${untouchedCapturedToday} جهات ملتقطة ما زالت تحتاج أول تواصل`
        : `${untouchedCapturedToday} captured leads still need first touch`)
    : "";
  const followUpDueWarning = followUpDueToday > 0
    ? (copy().meta.lang === "ar"
        ? `${followUpDueToday} جهات تحتاج متابعة اليوم`
        : `${followUpDueToday} leads need follow-up today`)
    : "";
  const overdueFollowUpWarning = overdueFollowups > 0
    ? (copy().meta.lang === "ar"
        ? `${overdueFollowups} متابعات متأخرة`
        : `${overdueFollowups} follow-ups are overdue`)
    : "";

  return {
    ...getSourceTargetProgress(source, todayCaptured),
    todayLeads: todayCaptured,
    leads: leads.length,
    firstTouchesDoneToday,
    untouchedCapturedToday,
    waitingResponseCount,
    followUpDueToday,
    overdueFollowups,
    respondedToday,
    firstTouchWarning,
    followUpDueWarning,
    overdueFollowUpWarning,
    needsReply,
    readyForHandoff,
    opportunities: opportunities.length,
  };
}

function getAnalysisSourceLeads(source) {
  return state.data.leads.filter(
    (lead) => lead.channel === source && leadMatchesAnalysisFilters(lead),
  );
}

function getAnalysisSourceOpportunities(source) {
  return state.data.opportunities.filter((opportunity) => {
    const originLead = getLeadById(opportunity.origin_lead_id);
    return originLead?.channel === source && opportunityMatchesAnalysisFilters(opportunity);
  });
}

function getAnalysisSourceMetrics(source) {
  const today = todayDate();
  const leads = getAnalysisSourceLeads(source);
  const opportunities = getAnalysisSourceOpportunities(source);
  const todayCaptured = leads.filter((lead) => getLeadCapturedDate(lead) === today).length;
  const firstTouchesDoneToday = leads.filter((lead) => getLeadFirstTouchDate(lead) === today).length;
  const untouchedCapturedToday = leads.filter(
    (lead) => getLeadCapturedDate(lead) === today && leadNeedsFirstTouch(lead),
  ).length;
  const waitingResponseCount = leads.filter((lead) => getEffectiveLeadOperationalState(lead) === "waiting_response").length;
  const followUpDueToday = leads.filter((lead) => getLeadFollowUpTiming(lead) === "due_today").length;
  const overdueFollowups = leads.filter((lead) => getLeadFollowUpTiming(lead) === "overdue").length;
  const respondedToday = leads.filter((lead) => getLeadRespondedDate(lead) === today).length;
  const firstTouchWarning = untouchedCapturedToday > 0
    ? (copy().meta.lang === "ar"
        ? `${untouchedCapturedToday} جهات ملتقطة ما زالت تحتاج أول تواصل`
        : `${untouchedCapturedToday} captured leads still need first touch`)
    : "";
  const followUpDueWarning = followUpDueToday > 0
    ? (copy().meta.lang === "ar"
        ? `${followUpDueToday} جهات تحتاج متابعة اليوم`
        : `${followUpDueToday} leads need follow-up today`)
    : "";
  const overdueFollowUpWarning = overdueFollowups > 0
    ? (copy().meta.lang === "ar"
        ? `${overdueFollowups} متابعات متأخرة`
        : `${overdueFollowups} follow-ups are overdue`)
    : "";

  return {
    ...getSourceTargetProgress(source, todayCaptured),
    todayLeads: todayCaptured,
    leads: leads.length,
    firstTouchesDoneToday,
    untouchedCapturedToday,
    waitingResponseCount,
    followUpDueToday,
    overdueFollowups,
    respondedToday,
    firstTouchWarning,
    followUpDueWarning,
    overdueFollowUpWarning,
    needsReply: leads.filter(
      (lead) => getLeadWorkflowBucket(lead, state.data.opportunities) === "Needs Reply",
    ).length,
    readyForHandoff: leads.filter(
      (lead) => getLeadWorkflowBucket(lead, state.data.opportunities) === "Ready for Handoff",
    ).length,
    opportunities: opportunities.length,
  };
}

function getSourceAnalytics(source) {
  return state.analytics?.sources?.[source] || buildDashboardAnalytics(state.data)?.sources?.[source] || null;
}

function formatPercent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function getLocalizedActionLabel(action) {
  const isArabic = copy().meta.lang === "ar";
  const labels = {
    opener: isArabic ? "افتتاحية" : "Opener",
    "follow-up": isArabic ? "متابعة" : "Follow-up",
    handoff: isArabic ? "تحويل" : "Handoff",
    disqualify: isArabic ? "استبعاد" : "Disqualify",
  };

  return labels[action] || action;
}

function getLocalizedActionReason(action, fallbackReason) {
  if (copy().meta.lang !== "ar") {
    return fallbackReason;
  }

  const labels = {
    opener: "ما زال يحتاج أول تواصل",
    "follow-up": "الخطوة التالية هي متابعة واضحة",
    handoff: "جاهز للتحويل إلى فرصة",
    disqualify: "لا يوجد مؤشر شراء واضح الآن",
  };

  return labels[action] || fallbackReason;
}

function getLocalizedSlaLabel(stateValue, fallbackLabel) {
  if (copy().meta.lang !== "ar") {
    return fallbackLabel;
  }

  const labels = {
    overdue: "متأخر",
    due_today: "اليوم",
    stale: "قديم",
    active: "على المسار",
  };

  return labels[stateValue] || fallbackLabel;
}

function getSourceTrendSeries(source, period = "daily") {
  return getSourceAnalytics(source)?.trend?.[period] || [];
}

function getSourceRoiMetrics(source) {
  return getSourceAnalytics(source)?.roi || null;
}

function getSourceFunnelMetrics(source) {
  return getSourceAnalytics(source)?.funnel || null;
}

function getSourceSlaRows(source) {
  const leads = state.data.leads.filter(
    (lead) => lead.channel === source && matchesArchivedVisibility(lead),
  );
  return SOURCE_WORKFLOW_BUCKETS.map((bucket) => {
    const bucketLeads = leads.filter((lead) => getLeadWorkflowBucket(lead, state.data.opportunities) === bucket);
    const summary = bucketLeads.reduce(
      (accumulator, lead) => {
        const sla = getLeadSlaState(lead, todayDate());
        accumulator.total += 1;
        accumulator[sla.state] += 1;
        return accumulator;
      },
      { total: 0, overdue: 0, due_today: 0, stale: 0, active: 0 },
    );

    return {
      bucket,
      total: summary.total,
      overdue: summary.overdue,
      due_today: summary.due_today,
      stale: summary.stale,
      active: summary.active,
    };
  });
}

function getSourceNextBestActions(source, limit = 4) {
  const leadActions = state.data.leads
    .filter((lead) => lead.channel === source && matchesArchivedVisibility(lead))
    .map((lead) => {
      const recommendation = getLeadNextBestAction(lead, state.data.opportunities, todayDate());
      return {
        kind: "lead",
        record: lead,
        recommendation,
      };
    });

  const opportunityActions = state.data.opportunities
    .map((opportunity) => {
      const originLead = getLeadById(opportunity.origin_lead_id);
      if (!originLead || originLead.channel !== source || !matchesArchivedVisibility(originLead)) {
        return null;
      }
      const recommendation = getOpportunityNextBestAction(opportunity, todayDate());
      return {
        kind: "opportunity",
        record: opportunity,
        recommendation,
      };
    })
    .filter(Boolean);

  return [...leadActions, ...opportunityActions]
    .sort((left, right) => right.recommendation.score - left.recommendation.score)
    .slice(0, limit);
}

function renderTrendRow(series, metricKey, label, tone = "", period = "daily") {
  const maxValue = Math.max(1, ...series.map((point) => Number(point?.[metricKey] || 0)));
  return `
    <div class="trend-row">
      <div class="trend-row-head">
        <span>${label}</span>
        <strong>${series.reduce((total, point) => total + Number(point?.[metricKey] || 0), 0)}</strong>
      </div>
      <div class="trend-row-bars ${period}">
        ${series
          .map((point) => {
            const value = Number(point?.[metricKey] || 0);
            const height = Math.max(8, Math.round((value / maxValue) * 100));
            const xLabel = period === "weekly" ? point.week : shortDate(point.date);
            return `
              <div class="trend-column" title="${xLabel}: ${value}">
                <span class="trend-column-value">${value}</span>
                <div class="trend-column-bar ${tone}" style="height: ${height}%"></div>
                <small>${xLabel}</small>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderTrendPanel(source, { compact = false } = {}) {
  const analytics = getSourceAnalytics(source);
  const daily = analytics?.trend?.daily || [];
  const weekly = analytics?.trend?.weekly || [];
  const dailyMetrics = compact
    ? [
        ["captured", copy().meta.lang === "ar" ? "التقاط" : "Captured", "captured"],
        ["replied", copy().meta.lang === "ar" ? "رد" : "Replies", "reply"],
        ["opportunities", copy().meta.lang === "ar" ? "فرص" : "Opportunities", "opportunity"],
        ["wins", copy().meta.lang === "ar" ? "فوز" : "Wins", "win"],
      ]
    : [
        ["captured", copy().meta.lang === "ar" ? "التقاط" : "Captured", "captured"],
        ["first_touch", copy().meta.lang === "ar" ? "أول تواصل" : "First touch", "first-touch"],
        ["replied", copy().meta.lang === "ar" ? "رد" : "Replies", "reply"],
        ["handoff", copy().meta.lang === "ar" ? "تسليم" : "Handoff", "handoff"],
        ["opportunities", copy().meta.lang === "ar" ? "فرص" : "Opportunities", "opportunity"],
        ["wins", copy().meta.lang === "ar" ? "فوز" : "Wins", "win"],
      ];

  return `
    <div class="trend-panels ${compact ? "compact" : ""}">
      <article class="analytics-block">
        <div class="analytics-block-head">
          <h4>${copy().meta.lang === "ar" ? "Trend يومي" : "Daily trend"}</h4>
          <span class="pill">${daily.length}</span>
        </div>
        <div class="trend-stack">
          ${dailyMetrics.map(([key, label, tone]) => renderTrendRow(daily, key, label, tone, "daily")).join("") || renderEmptyState()}
        </div>
      </article>
      <article class="analytics-block">
        <div class="analytics-block-head">
          <h4>${copy().meta.lang === "ar" ? "Trend أسبوعي" : "Weekly trend"}</h4>
          <span class="pill">${weekly.length}</span>
        </div>
        <div class="trend-stack">
          ${dailyMetrics.map(([key, label, tone]) => renderTrendRow(weekly, key, label, tone, "weekly")).join("") || renderEmptyState()}
        </div>
      </article>
    </div>
  `;
}

function renderRoiPanel(source) {
  const roi = getSourceRoiMetrics(source);
  const funnel = getSourceFunnelMetrics(source);
  if (!roi || !funnel) {
    return renderEmptyState();
  }

  const biggestGapLabelMap = {
    capture_to_first_touch: copy().meta.lang === "ar" ? "التقاط → أول تواصل" : "Capture → First touch",
    first_touch_to_reply: copy().meta.lang === "ar" ? "أول تواصل → رد" : "First touch → Reply",
    reply_to_handoff: copy().meta.lang === "ar" ? "رد → تسليم" : "Reply → Handoff",
    handoff_to_opportunity: copy().meta.lang === "ar" ? "تسليم → فرصة" : "Handoff → Opportunity",
    opportunity_to_win: copy().meta.lang === "ar" ? "فرصة → فوز" : "Opportunity → Win",
  };
  const biggestGapLabel = biggestGapLabelMap[funnel.biggest_gap] || funnel.biggest_gap || "—";

  const dropoffRows = [
    [copy().meta.lang === "ar" ? "التقاط → أول تواصل" : "Capture → First touch", funnel.capture_to_first_touch],
    [copy().meta.lang === "ar" ? "أول تواصل → رد" : "First touch → Reply", funnel.first_touch_to_reply],
    [copy().meta.lang === "ar" ? "رد → تسليم" : "Reply → Handoff", funnel.reply_to_handoff],
    [copy().meta.lang === "ar" ? "تسليم → فرصة" : "Handoff → Opportunity", funnel.handoff_to_opportunity],
    [copy().meta.lang === "ar" ? "فرصة → فوز" : "Opportunity → Win", funnel.opportunity_to_win],
  ];

  return `
    <article class="analytics-block roi-block">
      <div class="analytics-block-head">
        <h4>${copy().meta.lang === "ar" ? "ROI / Funnel" : "ROI / Funnel"}</h4>
        <span class="pill">${formatPercent(roi.win_rate)}</span>
      </div>
      <div class="roi-grid">
        <div><span>${copy().meta.lang === "ar" ? "Leads" : "Leads"}</span><strong>${roi.leads}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "Opportunities" : "Opportunities"}</span><strong>${roi.opportunities}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "Wins" : "Wins"}</span><strong>${roi.wins}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "Win rate" : "Win rate"}</span><strong>${formatPercent(roi.win_rate)}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "Conversion" : "Conversion"}</span><strong>${formatPercent(roi.conversion_rate)}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "Value / lead" : "Value / lead"}</span><strong>${formatCurrency(roi.value_per_lead)}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "Pipeline" : "Pipeline"}</span><strong>${formatCurrency(roi.pipeline_value)}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "Realized" : "Realized"}</span><strong>${formatCurrency(roi.realized_value)}</strong></div>
      </div>
      <div class="dropoff-grid">
        ${dropoffRows
          .map(([label, value]) => `<div class="dropoff-pill"><span>${label}</span><strong>${value}</strong></div>`)
          .join("")}
      </div>
      <p class="card-summary">
        ${
          copy().meta.lang === "ar"
            ? `أكبر تسرب حاليًا: ${biggestGapLabel} (${funnel.biggest_gap_value})`
            : `Current biggest drop-off: ${biggestGapLabel} (${funnel.biggest_gap_value})`
        }
      </p>
    </article>
  `;
}

function renderSlaPanel(source) {
  const rows = getSourceSlaRows(source);
  return `
    <article class="analytics-block sla-block">
      <div class="analytics-block-head">
        <h4>${copy().meta.lang === "ar" ? "SLA Timers" : "SLA timers"}</h4>
      </div>
      <div class="sla-grid">
        ${rows
          .map(
            (row) => `
              <div class="sla-row">
                <span>${displayWorkflowBucket(row.bucket)}</span>
                <strong>${row.total}</strong>
                <small>${row.overdue ? `${row.overdue} ${copy().meta.lang === "ar" ? "متأخر" : "overdue"}` : row.due_today ? `${row.due_today} ${copy().meta.lang === "ar" ? "اليوم" : "due today"}` : row.stale ? `${row.stale} ${copy().meta.lang === "ar" ? "قديم" : "stale"}` : copy().meta.lang === "ar" ? "على المسار" : "on track"}</small>
              </div>
            `,
          )
          .join("")}
      </div>
    </article>
  `;
}

function renderActionSuggestionsPanel(source, { compact = false } = {}) {
  const suggestions = getSourceNextBestActions(source, compact ? 3 : 4);
  return `
    <article class="analytics-block suggestions-block">
      <div class="analytics-block-head">
        <h4>${copy().meta.lang === "ar" ? "الاقتراحات التالية" : "Next best actions"}</h4>
      </div>
      <div class="suggestions-list">
        ${suggestions
          .map(
            ({ kind, record, recommendation }) => `
              <button class="suggestion-row" type="button" data-open-record="${kind}:${record.id}">
                <div>
                  <strong>${kind === "lead" ? record.company_name : record.company_name}</strong>
                  <div class="meta-row">${getLocalizedActionReason(recommendation.action, recommendation.reason)}</div>
                </div>
                <div class="suggestion-side">
                  <span class="badge">${getLocalizedActionLabel(recommendation.action)}</span>
                  <span class="pill">${recommendation.score}</span>
                </div>
              </button>
            `,
          )
          .join("") || renderEmptyState()}
      </div>
    </article>
  `;
}

function renderSourceAnalyticsPanel(source, { compact = false } = {}) {
  const analytics = getSourceAnalytics(source);
  if (!analytics) {
    return renderEmptyState();
  }

  return `
    <article class="panel analytics-panel ${compact ? "compact" : ""}">
      <div class="panel-head">
        <div>
          <p class="panel-label">${copy().meta.lang === "ar" ? "تحليل القناة" : "Source analytics"}</p>
          <h3>${displayChannel(source)}</h3>
        </div>
        <span class="pill">${formatPercent(analytics.roi.win_rate)}</span>
      </div>
      <div class="analytics-layout ${compact ? "compact" : ""}">
        ${renderTrendPanel(source, { compact })}
        ${renderRoiPanel(source)}
        ${compact ? "" : renderSlaPanel(source)}
        ${renderActionSuggestionsPanel(source, { compact })}
      </div>
    </article>
  `;
}

function getFilteredSectors() {
  const today = todayDate();
  return state.data.sectors.filter((sector) => {
    const computedStatus = getComputedSectorStatus(sector, today);
    const activeSource = resolveActiveSource();
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
  const leads = state.data.leads.filter((lead) => leadMatchesAnalysisFilters(lead));
  const openOpportunities = state.data.opportunities.filter((opportunity) => {
    if (!opportunityMatchesAnalysisFilters(opportunity)) {
      return false;
    }
    const stage = getComputedOpportunityStage(opportunity, today);
    return !["Won", "Lost"].includes(stage);
  });

  const sourceProgress = ensureActiveSource()
    .filter((source) => sourceMatchesAnalysisFilters(source))
    .map((source) => getAnalysisSourceMetrics(source));

  return {
    newToday: leads.filter((lead) => getLeadCapturedDate(lead) === today).length,
    firstTouchesDoneToday: leads.filter((lead) => getLeadFirstTouchDate(lead) === today).length,
    untouchedCapturedToday: leads.filter(
      (lead) => getLeadCapturedDate(lead) === today && leadNeedsFirstTouch(lead),
    ).length,
    waitingResponseCount: leads.filter((lead) => getEffectiveLeadOperationalState(lead) === "waiting_response").length,
    followUpDueToday: leads.filter((lead) => getLeadFollowUpTiming(lead) === "due_today").length,
    overdueFollowups: leads.filter((lead) => getLeadFollowUpTiming(lead) === "overdue").length,
    respondedToday: leads.filter((lead) => getLeadRespondedDate(lead) === today).length,
    needsContact: leads.filter((lead) => {
      const bucket = getLeadWorkflowBucket(lead, state.data.opportunities);
      return ["New", "Needs Extraction", "Needs Reply"].includes(bucket);
    }).length,
    readyForHandoff: leads.filter(
      (lead) => getLeadWorkflowBucket(lead, state.data.opportunities) === "Ready for Handoff",
    ).length,
    openOpportunities: openOpportunities.length,
    targetDone: sourceProgress.filter((item) => item.targetStatus === "done").length,
    remainingToTarget: sourceProgress.reduce((total, item) => total + item.remainingToTarget, 0),
  };
}

function getSourcePriorityRows() {
  return ensureActiveSource()
    .filter((source) => sourceMatchesAnalysisFilters(source))
    .map((source) => {
      const metrics = getAnalysisSourceMetrics(source);
      return {
        source,
        metrics,
        score:
          metrics.overdueFollowups * 5 +
          metrics.followUpDueToday * 4 +
          metrics.untouchedCapturedToday * 4 +
          metrics.readyForHandoff * 3 +
          metrics.needsReply * 2 +
          metrics.todayLeads * 2 +
          metrics.leads,
      };
    })
    .sort((left, right) => right.score - left.score || right.metrics.todayLeads - left.metrics.todayLeads || right.metrics.leads - left.metrics.leads);
}

function getTargetWarningRows() {
  return getSourcePriorityRows()
    .filter(({ metrics }) => metrics.targetStatus === "behind" && metrics.remainingToTarget > 0)
    .sort((left, right) => right.metrics.remainingToTarget - left.metrics.remainingToTarget);
}

function getUntouchedAlertRows() {
  return getSourcePriorityRows()
    .filter(({ metrics }) => metrics.untouchedCapturedToday > 0)
    .sort((left, right) => right.metrics.untouchedCapturedToday - left.metrics.untouchedCapturedToday);
}

function getFollowUpAlertRows() {
  return getSourcePriorityRows()
    .filter(({ metrics }) => metrics.overdueFollowups > 0 || metrics.followUpDueToday > 0)
    .sort((left, right) => right.metrics.overdueFollowups - left.metrics.overdueFollowups || right.metrics.followUpDueToday - left.metrics.followUpDueToday);
}

function getTodayActionQueue(limit = 6) {
  const today = todayDate();
  return state.data.leads
    .filter((lead) => leadMatchesAnalysisFilters(lead))
    .map((lead) => {
      const workflowBucket = getLeadWorkflowBucket(lead, state.data.opportunities);
      const computedStage = getComputedLeadStage(lead, today);
      let priority = 0;
      const followUpTiming = getLeadFollowUpTiming(lead);
      if (workflowBucket === "Ready for Handoff") priority += 5;
      if (workflowBucket === "Needs Reply") priority += 4;
      if (workflowBucket === "Needs Qualification") priority += 3;
      if (getLeadCapturedDate(lead) === today && leadNeedsFirstTouch(lead)) priority += 5;
      if (followUpTiming === "overdue") priority += 6;
      if (followUpTiming === "due_today") priority += 5;
      if (computedStage === "Delayed") priority += 3;
      if (lead.next_step_date && lead.next_step_date <= today) priority += 2;
      if (!lead.next_step) priority += 1;
      return { lead, workflowBucket, computedStage, priority };
    })
    .filter((item) => item.priority > 0)
    .sort((left, right) => right.priority - left.priority)
    .slice(0, limit);
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

function syncDrawerEnvironment(isLeadDetailOpen) {
  document.body.classList.toggle("modal-open", isLeadDetailOpen);
  document.body.style.overflow = isLeadDetailOpen ? "hidden" : "";
  elements?.appShell?.classList.toggle("lead-modal-active", isLeadDetailOpen);
}

function openRecord(recordToken) {
  const [entityType, entityId] = recordToken.split(":");
  setDrawer({ open: true, kind: "detail", entityType, entityId, mode: "view", message: "" });
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
  if (!elements.sidebarWeeklyFocus) return;
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
  const archivedLabel = copy().meta.lang === "ar" ? "المؤرشف" : "Archived";
  const hiddenArchivedLabel = copy().meta.lang === "ar" ? "مخفي" : "Hidden";
  const showArchivedLabel = copy().meta.lang === "ar" ? "إظهار" : "Show";

  if (state.activeScreen === "analysis") {
    elements.filters.innerHTML = `
      <label>
        <span>${getFieldLabel("source", "Source")}</span>
        <select data-filter="source">
          <option value="all">${copy().chrome.filters.all}</option>
          ${sourceOptions}
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
        <span>${archivedLabel}</span>
        <select data-filter="archived">
          <option value="hidden">${hiddenArchivedLabel}</option>
          <option value="show">${showArchivedLabel}</option>
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
      <label>
        <span>${archivedLabel}</span>
        <select data-filter="archived">
          <option value="hidden">${hiddenArchivedLabel}</option>
          <option value="show">${showArchivedLabel}</option>
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
      <label>
        <span>${archivedLabel}</span>
        <select data-filter="archived">
          <option value="hidden">${hiddenArchivedLabel}</option>
          <option value="show">${showArchivedLabel}</option>
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
      : copy().chrome.storage.localLoaded
    : copy().chrome.storage.memoryOnly;

  elements.screenActions.innerHTML = `
    <span class="storage-pill ${state.storage.available ? "" : "warning"}">${storageLabel}</span>
    ${
      DEBUG_MODE
        ? `<button class="ghost-button" type="button" data-action="restore-seed">${copy().chrome.buttons.restoreSeed}</button>
    <button class="ghost-button" type="button" data-action="reset-local">${copy().chrome.buttons.resetLocal}</button>`
        : ""
    }
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
        contextSource: resolveActiveSource(),
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
          contextSource: button.dataset.guidanceEntity === "lead" ? resolveActiveSource() : "",
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
    Email: isArabic
      ? {
          whereToLook: ["الرسائل الواردة غير المكتملة", "سلاسل الردود التي توقفت", "الاستفسارات التي وصلت بدون متابعة"],
          signals: ["طلب عرض أو تسعير", "سؤال تنفيذي لم يُغلق", "رد يصف ألمًا تشغيليًا"],
          tricks: ["ابدأ بأحدث thread غير محسوم", "حوّل كل pain واضح إلى lead مستقل", "اربط next step بالرد القادم مباشرة"],
          qualifies: "هناك طلب واضح أو ألم تشغيلي داخل رسالة يمكن تحريكها فورًا.",
        }
      : {
          whereToLook: ["Incomplete inbound threads", "Reply chains that went quiet", "Inquiries that arrived without a follow-up"],
          signals: ["Pricing or proposal ask", "Operational question left unresolved", "Reply describing a real workflow pain"],
          tricks: ["Start with the newest unresolved thread", "Turn each clear pain point into its own lead", "Tie the next step to the next reply directly"],
          qualifies: "There is a clear ask or operational pain inside an email thread we can move immediately.",
        },
    Google: isArabic
      ? {
          whereToLook: ["نماذج التواصل الواردة", "المراجعات السلبية", "استفسارات البحث والخرائط"],
          signals: ["شكوى من بطء الرد", "طلب حجز أو متابعة", "انطباع سلبي عن تجربة التواصل"],
          tricks: ["ابدأ بأحدث نموذج وصل", "استخرج الألم من نص المراجعة لا من التقييم فقط", "دوّن سبب الوصول من جوجل بوضوح"],
          qualifies: "الجهة جاءت من intent بحث واضح أو من شكوى يمكن تحويلها إلى متابعة عملية.",
        }
      : {
          whereToLook: ["Contact-form submissions", "Negative reviews", "Search and Maps inquiries"],
          signals: ["Complaint about slow response", "Booking or follow-up request", "Negative sentiment about communication"],
          tricks: ["Start with the newest form submission", "Extract pain from review text, not just the rating", "Capture why this surfaced from Google"],
          qualifies: "The lead comes from clear search intent or a complaint we can turn into a practical next move.",
        },
    Instagram: isArabic
      ? {
          whereToLook: ["الرسائل الخاصة غير المردود عليها", "تعليقات البوستات", "الردود على الستوري"],
          signals: ["سؤال مباشر عن الخدمة", "تعليق يطلب تواصلًا", "ألم ظاهر داخل DM أو تعليق"],
          tricks: ["ابدأ بالـ DMs قبل التعليقات العامة", "سجل اسم النشاط حتى لو الحساب شخصي", "حوّل التفاعل القصير إلى خطوة متابعة حقيقية"],
          qualifies: "هناك intent واضح داخل DM أو تعليق ويمكن نقل الحوار إلى متابعة مباشرة.",
        }
      : {
          whereToLook: ["Unanswered DMs", "Post comments", "Story replies"],
          signals: ["Direct service question", "Comment asking someone to reach out", "Visible pain inside a DM or comment"],
          tricks: ["Start with DMs before public comments", "Capture the business name even if the profile looks personal", "Turn short engagement into a real next step"],
          qualifies: "There is clear intent in a DM or comment and a direct path to continue the conversation.",
        },
    TikTok: isArabic
      ? {
          whereToLook: ["تعليقات الفيديوهات", "الرسائل بعد المحتوى", "تفاعل الحسابات المستهدفة"],
          signals: ["طلب تفاصيل في التعليقات", "مشكلة تتكرر في أكثر من فيديو", "اهتمام من نشاط تجاري واضح"],
          tricks: ["التقط التعليقات التي فيها intent لا المجاملة", "اربط lead بالفيديو أو الزاوية", "حدّد سريعًا هل تحتاج رد أم تأهيل"],
          qualifies: "هناك إشارة شراء أو ألم تشغيلي ظهرت من تفاعل فعلي داخل المنصة.",
        }
      : {
          whereToLook: ["Video comments", "Messages after content", "Engagement from target business accounts"],
          signals: ["Comment asking for details", "Problem repeated across videos", "Clear interest from a real business"],
          tricks: ["Capture intent-driven comments, not compliments", "Tie the lead to the video angle that surfaced it", "Decide fast whether it needs reply or qualification"],
          qualifies: "A buying signal or operational pain is visible through real platform engagement.",
        },
    YouTube: isArabic
      ? {
          whereToLook: ["تعليقات الفيديوهات التعليمية", "القنوات القطاعية", "التعليقات التي تصف مشكلة تشغيلية"],
          signals: ["سؤال مفصل عن الحل", "تعليق يشرح عطلًا متكررًا", "وجود شركة أو مدير في النقاش"],
          tricks: ["ابدأ بالتعليقات الطويلة الواضحة", "التقط اسم الشركة أو القطاع من سياق القناة", "اكتب next step تشير إلى الفيديو أو الموضوع"],
          qualifies: "التعليق يكشف ألمًا تشغيليًا حقيقيًا وشخصًا مناسبًا للمتابعة.",
        }
      : {
          whereToLook: ["Educational video comments", "Industry channels", "Comments describing operational pain"],
          signals: ["Detailed question about the solution", "Comment explaining recurring failure", "A business or manager visible in the thread"],
          tricks: ["Start with longer, clearer comments", "Capture the business or sector from channel context", "Reference the video topic in the next step"],
          qualifies: "The comment reveals real operational pain and a relevant person to follow up with.",
        },
    "Competitor Comments": isArabic
      ? {
          whereToLook: ["تعليقات العملاء الغاضبين عند المنافسين", "الشكاوى على البوستات الإعلانية", "المراجعات التي تذكر ضعف المتابعة"],
          signals: ["شكوى من عدم الرد", "تعليق عن فوضى أو تأخير", "طلب بديل أو توصية"],
          tricks: ["ابحث عن الشكوى القابلة للحل لا عن الهجوم العام", "التقط سبب التحول المحتمل", "اكتب next step بصياغة إنقاذ لا بيع مباشر"],
          qualifies: "هناك ألم معلن مع منافس وحافز واضح لتجربة بديل أفضل.",
        }
      : {
          whereToLook: ["Angry customer comments on competitor posts", "Complaint threads under ads", "Reviews mentioning weak follow-up"],
          signals: ["Complaint about no response", "Comment about chaos or delay", "Request for an alternative or recommendation"],
          tricks: ["Look for solvable complaints, not generic attacks", "Capture the switching reason", "Write the next step as a rescue move, not a hard sell"],
          qualifies: "There is public pain with a competitor and a believable reason to switch.",
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
  const executionAlert = getSourceExecutionAlert(source, metrics);
  return `
    <article class="panel source-panel snapshot-panel">
      <div class="panel-head">
        <div>
          <p class="panel-label">${copy().meta.lang === "ar" ? "ملخص القناة" : "Captured / Snapshot"}</p>
          <h3>${displayChannel(source)}</h3>
        </div>
      </div>
      <div class="detail-grid tight">
        <div><span>${copy().meta.lang === "ar" ? "التُقطوا اليوم" : "Captured today"}</span><strong>${metrics.todayLeads}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "أول تواصل اليوم" : "First touches today"}</span><strong>${metrics.firstTouchesDoneToday}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "بلا أول تواصل" : "Untouched captured"}</span><strong>${metrics.untouchedCapturedToday}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "بانتظار الرد" : "Waiting response"}</span><strong>${metrics.waitingResponseCount}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "متابعة اليوم" : "Follow-up due today"}</span><strong>${metrics.followUpDueToday}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "متابعات متأخرة" : "Overdue follow-ups"}</span><strong>${metrics.overdueFollowups}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "تم الرد اليوم" : "Responded today"}</span><strong>${metrics.respondedToday}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "هدف اليوم" : "Daily target"}</span><strong>${metrics.dailyTarget}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "المتبقي" : "Remaining"}</span><strong>${metrics.remainingToTarget}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "حالة الهدف" : "Target status"}</span><strong>${copy().meta.lang === "ar" ? (metrics.targetStatus === "done" ? "مكتمل" : metrics.targetStatus === "on_track" ? "على المسار" : "متأخر") : (metrics.targetStatus === "done" ? "Done" : metrics.targetStatus === "on_track" ? "On track" : "Behind")}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "إجمالي اللِيدز" : "Total leads"}</span><strong>${metrics.leads}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "تحتاج رد" : "Needs reply"}</span><strong>${metrics.needsReply}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "جاهزة للتحويل" : "Ready for handoff"}</span><strong>${metrics.readyForHandoff}</strong></div>
        <div><span>${copy().meta.lang === "ar" ? "فرص ناتجة" : "Progressed opportunities"}</span><strong>${metrics.opportunities}</strong></div>
      </div>
      ${renderSourceAnalyticsPanel(source)}
      ${executionAlert ? `<p class="source-target-banner warning inline-warning">${executionAlert}</p>` : ""}
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

function renderSourceLeadCard(lead) {
  const sector = getSectorById(lead.sector_id);
  const computedStage = getComputedLeadStage(lead, todayDate());
  const workflowBucket = getLeadWorkflowBucket(lead, state.data.opportunities);
  const sla = getLeadSlaState(lead, todayDate());
  const nextAction = getLeadNextBestAction(lead, state.data.opportunities, todayDate());
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
          <div class="badge-stack">
            <span class="badge ${computedStage === "Delayed" ? "danger" : ""}">${displayStage(computedStage)}</span>
            <span class="badge ${sla.state === "overdue" ? "danger" : sla.state === "due_today" ? "warning" : sla.state === "stale" ? "muted" : ""}">${getLocalizedSlaLabel(sla.state, sla.label)}${sla.age_days ? ` • ${sla.age_days}d` : ""}</span>
            <span class="badge action-${nextAction.action}">${getLocalizedActionLabel(nextAction.action)}</span>
          </div>
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
          ? `<div class="source-card-actions"><button class="success-button tight" type="button" data-convert-lead="${lead.id}">${copy().chrome.buttons.createOpportunityFromLead}</button></div>`
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
                        <button class="success-button tight" type="button" data-convert-lead="${lead.id}">${copy().chrome.buttons.createOpportunityFromLead}</button>
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

function renderKpiCell(label, value, tone = "") {
  return `
    <article class="kpi-cell ${tone}">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `;
}

function getLeadCommandState(lead) {
  const today = todayDate();
  const workflowBucket = getLeadWorkflowBucket(lead, state.data.opportunities);
  const computedStage = getComputedLeadStage(lead, today);
  const isOverdue = computedStage === "Delayed" || (lead.next_step_date && lead.next_step_date < today);
  const isDueToday = lead.next_step_date && lead.next_step_date === today;
  const followUpTiming = getLeadFollowUpTiming(lead);

  if (isOverdue || workflowBucket === "Ready for Handoff") {
    return {
      rowTone: "critical",
      urgencyClass: isOverdue ? "danger" : "accent",
      urgencyLabel: isOverdue
        ? (copy().meta.lang === "ar" ? "متأخر" : "Overdue")
        : (copy().meta.lang === "ar" ? "جاهز الآن" : "Ready now"),
    };
  }

  if (followUpTiming === "overdue") {
    return {
      rowTone: "critical",
      urgencyClass: "danger",
      urgencyLabel: copy().meta.lang === "ar" ? "متابعة متأخرة" : "Follow-up overdue",
    };
  }

  if (followUpTiming === "due_today") {
    return {
      rowTone: "active",
      urgencyClass: "warning",
      urgencyLabel: copy().meta.lang === "ar" ? "متابعة اليوم" : "Follow-up today",
    };
  }

  if (workflowBucket === "Needs Reply" || isDueToday) {
    return {
      rowTone: "active",
      urgencyClass: "warning",
      urgencyLabel: isDueToday
        ? (copy().meta.lang === "ar" ? "اليوم" : "Today")
      : (copy().meta.lang === "ar" ? "يحتاج رد" : "Needs reply"),
    };
  }

  if (getLeadCapturedDate(lead) === today && leadNeedsFirstTouch(lead)) {
    return {
      rowTone: "active",
      urgencyClass: "warning",
      urgencyLabel: copy().meta.lang === "ar" ? "أول تواصل" : "First touch",
    };
  }

  return {
    rowTone: "",
    urgencyClass: "",
    urgencyLabel: isDueToday
      ? (copy().meta.lang === "ar" ? "اليوم" : "Today")
      : shortDate(lead.next_step_date),
  };
}

function renderLeadCommandRow(lead, options = {}) {
  const sector = getSectorById(lead.sector_id);
  const workflowBucket = getLeadWorkflowBucket(lead, state.data.opportunities);
  const computedStage = getComputedLeadStage(lead, todayDate());
  const sla = getLeadSlaState(lead, todayDate());
  const nextAction = getLeadNextBestAction(lead, state.data.opportunities, todayDate());
  const linkedOpportunity = getOpportunityByLeadId(lead.id);
  const commandState = getLeadCommandState(lead);
  const signal = compactText(
    lead.pain_signal || lead.notes || getValueLabel("noSignalCaptured", "No signal captured yet."),
    options.signalLimit || 92,
  );
  const nextAction = compactText(
    lead.next_step || getValueLabel("noImmediateNextStep", "No immediate next step"),
    options.stepLimit || 58,
  );
  const operationalLabel = getLeadOperationalStateLabel(getEffectiveLeadOperationalState(lead));
  const ctaHtml =
    options.preferConvert &&
    workflowBucket === "Ready for Handoff" &&
    lead.current_stage === "Handoff Sent" &&
    lead.handoff_summary &&
    !linkedOpportunity
      ? `<button class="primary-button tight" type="button" data-convert-lead="${lead.id}">${copy().chrome.buttons.createOpportunityFromLead}</button>`
      : linkedOpportunity
        ? `<button class="ghost-button tight" type="button" data-open-record="opportunity:${linkedOpportunity.id}">${guidanceLabel("openOpportunity")}</button>`
        : `<button class="ghost-button tight" type="button" data-open-record="lead:${lead.id}">${copy().meta.lang === "ar" ? "راجع" : "Review"}</button>`;

  return `
    <article class="command-row ${options.compact ? "compact" : ""} ${commandState.rowTone} urgency-${commandState.urgencyClass || "none"}">
      <button class="command-row-main" type="button" data-open-record="lead:${lead.id}">
        <div class="command-company">
          <strong dir="${inferTextDirection(lead.company_name)}">${lead.company_name}</strong>
          <span class="mixed-meta" dir="auto">${lead.contact_name} • ${lead.role || getValueLabel("noRole", "No role")}</span>
        </div>
        <div class="command-signal" dir="${inferTextDirection(signal)}">${signal}</div>
        <div class="command-next" dir="${inferTextDirection(nextAction)}">${nextAction}</div>
      </button>
      <div class="command-row-meta">
        <span class="source-badge">${displayChannel(lead.channel)}</span>
        <span class="badge ${computedStage === "Delayed" ? "danger" : ""}">${displayWorkflowBucket(workflowBucket)}</span>
        <span class="badge ${sla.state === "overdue" ? "danger" : sla.state === "due_today" ? "warning" : sla.state === "stale" ? "muted" : ""}">${getLocalizedSlaLabel(sla.state, sla.label)}${sla.age_days ? ` • ${sla.age_days}d` : ""}</span>
        <span class="badge action-${nextAction.action}">${getLocalizedActionLabel(nextAction.action)}</span>
        <span class="badge">${sector?.sector_name || displayStage(computedStage)}</span>
        <span class="badge ${leadNeedsFirstTouch(lead) ? "warning" : ""}">${operationalLabel}</span>
        <span class="badge ${commandState.urgencyClass} command-urgency">${commandState.urgencyLabel}</span>
      </div>
      <div class="command-row-cta">${ctaHtml}</div>
    </article>
  `;
}

function renderAnalysisScreen() {
  const metrics = getAnalysisMetrics();
  const sourceRows = getSourcePriorityRows();
  const targetWarnings = getTargetWarningRows();
  const untouchedAlerts = getUntouchedAlertRows();
  const followUpAlerts = getFollowUpAlertRows();
  const actionQueue = getTodayActionQueue(5);

  setScreenActions("");

  return `
    <section class="command-deck">
      <section class="top-strip metrics-strip metrics-grid-8">
        ${renderKpiCell(copy().meta.lang === "ar" ? "إشارات اليوم" : "Signals today", metrics.newToday, "primary")}
        ${renderKpiCell(copy().meta.lang === "ar" ? "أول تواصل" : "First touch", metrics.firstTouchesDoneToday)}
        ${renderKpiCell(copy().meta.lang === "ar" ? "بانتظار الرد" : "Waiting", metrics.waitingResponseCount)}
        ${renderKpiCell(copy().meta.lang === "ar" ? "متابعة اليوم" : "Follow-up", metrics.followUpDueToday, metrics.followUpDueToday ? "alert" : "")}
        ${renderKpiCell(copy().meta.lang === "ar" ? "متأخر" : "Overdue", metrics.overdueFollowups, metrics.overdueFollowups ? "alert" : "")}
        ${renderKpiCell(copy().meta.lang === "ar" ? "تم الرد" : "Responded", metrics.respondedToday)}
        ${renderKpiCell(copy().meta.lang === "ar" ? "بلا تواصل" : "No touch", metrics.untouchedCapturedToday, metrics.untouchedCapturedToday ? "alert" : "")}
        ${renderKpiCell(copy().meta.lang === "ar" ? "المتبقي" : "Remaining", metrics.remainingToTarget, "target")}
      </section>


      <section class="command-zone">
        <div class="command-zone-head">
          <div>
            <p class="panel-label">${copy().meta.lang === "ar" ? "مركز القرار" : "Command Zone"}</p>
            <h2>${copy().meta.lang === "ar" ? "حركة الإيراد التالية" : "Next Revenue Moves"}</h2>
            <p class="zone-copy">${
              copy().meta.lang === "ar"
                ? "صفوف تنفيذ مباشرة: الشركة، الإشارة، الخطوة التالية، ثم تنفيذ فوري."
                : "Direct execution rows: company, signal, next move, then immediate action."
            }</p>
          </div>
          <div class="command-zone-stats">
            <div><span>${copy().meta.lang === "ar" ? "القنوات النشطة" : "Active sources"}</span><strong>${sourceRows.length}</strong></div>
            <div><span>${copy().meta.lang === "ar" ? "صف اليوم" : "Queue size"}</span><strong>${actionQueue.length}</strong></div>
          </div>
        </div>
        <div class="command-zone-list">
          ${actionQueue.length ? actionQueue.map(({ lead }) => renderLeadCommandRow(lead, { preferConvert: true })).join("") : renderEmptyState()}
        </div>
      </section>

      <section class="analysis-analytics-section">
        <div class="command-zone-head">
          <div>
            <p class="panel-label">${copy().meta.lang === "ar" ? "تحليلات القنوات" : "Source analytics"}</p>
            <h2>${copy().meta.lang === "ar" ? "Trend / ROI / SLA" : "Trend / ROI / SLA"}</h2>
            <p class="zone-copy">${
              copy().meta.lang === "ar"
                ? "كل مصدر يوضح أين ينمو، أين يتسرب، وأي إجراء هو التالي."
                : "Each source shows where it is growing, where it leaks, and what action comes next."
            }</p>
          </div>
        </div>
        <div class="analysis-analytics-grid">
          ${sourceRows.length ? sourceRows.map(({ source }) => renderSourceAnalyticsPanel(source, { compact: true })).join("") : renderEmptyState()}
        </div>
      </section>

      <section class="operational-grid">
        <article class="intent-section">
          <div class="intent-head">
            <div>
              <p class="panel-label">${copy().meta.lang === "ar" ? "اتجاه الصيد" : "Directional Focus"}</p>
              <h3>${copy().meta.lang === "ar" ? "أولوية القنوات" : "Source Priority"}</h3>
            </div>
          </div>
          <div class="intent-list">
            ${sourceRows
              .map(
                ({ source, metrics: sourceMetrics }) => `
                  <button class="system-row" type="button" data-source-tab="${source}">
                    <div class="system-row-main">
                      <strong>${displayChannel(source)}</strong>
                      <div class="meta-row">${
                        copy().meta.lang === "ar"
                          ? `${sourceMetrics.followUpDueToday} متابعة اليوم • ${sourceMetrics.overdueFollowups} متأخرة • ${sourceMetrics.untouchedCapturedToday} بلا لمس`
                          : `${sourceMetrics.followUpDueToday} due today • ${sourceMetrics.overdueFollowups} overdue • ${sourceMetrics.untouchedCapturedToday} untouched`
                      }</div>
                      <div class="meta-row source-action-copy">${getSourceActionPrompt(source, sourceMetrics)}</div>
                    </div>
                    <div class="system-row-side">
                      ${renderTargetStatusBadge(sourceMetrics.targetStatus)}
                    </div>
                  </button>
                `,
              )
              .join("")}
          </div>
        </article>

        <article class="intent-section faded">
          <div class="intent-head">
            <div>
              <p class="panel-label">${copy().meta.lang === "ar" ? "ضغط التنفيذ" : "Execution Pressure"}</p>
              <h3>${copy().meta.lang === "ar" ? "أين نتحرك الآن" : "Where to Move Now"}</h3>
            </div>
          </div>
          <div class="intent-list">
            ${
              (followUpAlerts.length || untouchedAlerts.length || targetWarnings.length)
                ? [
                    ...followUpAlerts,
                    ...untouchedAlerts.filter(({ source }) => !followUpAlerts.some((item) => item.source === source)),
                    ...targetWarnings.filter(({ source }) => !followUpAlerts.some((item) => item.source === source) && !untouchedAlerts.some((item) => item.source === source)),
                  ]
                    .map(
                      ({ source, metrics: sourceMetrics }) => `
                        <button class="system-row warning" type="button" data-source-tab="${source}">
                          <div class="system-row-main">
                            <strong>${displayChannel(source)}</strong>
                            <div class="meta-row">
                              ${getSourceExecutionAlert(source, sourceMetrics) || getSourceActionPrompt(source, sourceMetrics)}
                            </div>
                          </div>
                          <div class="system-row-side">
                            <span class="system-number">${sourceMetrics.overdueFollowups || sourceMetrics.followUpDueToday || sourceMetrics.untouchedCapturedToday || sourceMetrics.remainingToTarget}</span>
                            <span class="system-label">${copy().meta.lang === "ar" ? (sourceMetrics.overdueFollowups ? "متأخرة" : sourceMetrics.followUpDueToday ? "اليوم" : sourceMetrics.untouchedCapturedToday ? "تحتاج لمس" : "متبقٍ") : (sourceMetrics.overdueFollowups ? "overdue" : sourceMetrics.followUpDueToday ? "today" : sourceMetrics.untouchedCapturedToday ? "untouched" : "left")}</span>
                          </div>
                        </button>
                      `,
                    )
                    .join("")
                : renderEmptyState()
            }
          </div>
        </article>

        <article class="bottom-zone">
          <div class="intent-head">
            <div>
              <p class="panel-label">${copy().meta.lang === "ar" ? "نظام التشغيل" : "Operating Cadence"}</p>
              <h3>${copy().meta.lang === "ar" ? "قواعد قرار سريعة" : "Fast Decision Rules"}</h3>
            </div>
          </div>
          <div class="rule-grid">
            <div class="rule-tile">
              <span>${copy().meta.lang === "ar" ? "الحركة الأولى" : "First move"}</span>
              <strong>${copy().meta.lang === "ar" ? "ابدأ بالقنوات ذات الجاهزية الأعلى، لا بالأكثر ضجيجًا." : "Start with the most conversion-ready source, not the noisiest one."}</strong>
            </div>
            <div class="rule-tile">
              <span>${copy().meta.lang === "ar" ? "معيار التنفيذ" : "Execution test"}</span>
              <strong>${copy().meta.lang === "ar" ? "إذا لم توجد خطوة تالية، فالسجل متوقف حتى لو بدا نشطًا." : "If there is no next step, the record is stalled even if it looks active."}</strong>
            </div>
            <div class="rule-tile">
              <span>${copy().meta.lang === "ar" ? "ضغط اليوم" : "Daily push"}</span>
              <strong>${copy().meta.lang === "ar" ? "القناة المتأخرة عن هدفها اليومي يجب أن تتحرك قبل التوسّع في أعمال أقل إلحاحًا." : "Any source behind its daily target should move before expanding into lower-pressure work."}</strong>
            </div>
          </div>
        </article>
      </section>
    </section>
  `;
}

function renderAllLeadCard(lead) {
  return renderLeadCommandRow(lead, {
    preferConvert: true,
    compact: true,
    signalLimit: 110,
    stepLimit: 70,
  });
}

function renderAllLeadsScreen() {
  const leads = getAllLeads();
  const needsReplyCount = leads.filter(
    (lead) => getLeadWorkflowBucket(lead, state.data.opportunities) === "Needs Reply",
  ).length;
  const readyCount = leads.filter(
    (lead) => getLeadWorkflowBucket(lead, state.data.opportunities) === "Ready for Handoff",
  ).length;
  const progressedCount = leads.filter((lead) => getOpportunityByLeadId(lead.id)).length;

  setScreenActions(`<button class="primary-button" type="button" data-action="new-lead">${copy().chrome.buttons.newLead}</button>`);

  return `
    <section class="command-deck">
      <section class="top-strip metrics-strip">
        ${renderKpiCell(copy().meta.lang === "ar" ? "كل اللِيدز" : "All leads", leads.length, "primary")}
        ${renderKpiCell(copy().meta.lang === "ar" ? "تحتاج رد" : "Need reply", needsReplyCount, "alert")}
        ${renderKpiCell(copy().meta.lang === "ar" ? "جاهزة للتحويل" : "Ready to convert", readyCount)}
        ${renderKpiCell(copy().meta.lang === "ar" ? "مرتبطة بفرص" : "Progressed", progressedCount)}
      </section>

      <section class="command-zone light">
        <div class="command-zone-head">
          <div>
            <p class="panel-label">${copy().meta.lang === "ar" ? "الصندوق الرئيسي" : "Master Inbox"}</p>
            <h2>${copy().meta.lang === "ar" ? "كل اللِيدز في صف تنفيذ واحد" : "All Leads in One Execution Queue"}</h2>
            <p class="zone-copy">${
              copy().meta.lang === "ar"
                ? "نفس منطق القرار: من الشركة إلى الإشارة إلى الخطوة القادمة، بدون تشتت بصري."
                : "Same decision logic: company to signal to next move, without visual fragmentation."
            }</p>
          </div>
        </div>
        <div class="command-zone-list light-list">
          ${leads.length ? leads.map(renderAllLeadCard).join("") : renderEmptyState()}
        </div>
      </section>

      <section class="operational-grid single-column">
        <article class="bottom-zone">
          <div class="intent-head">
            <div>
              <p class="panel-label">${copy().meta.lang === "ar" ? "قراءة سريعة" : "Quick Read"}</p>
              <h3>${copy().meta.lang === "ar" ? "كيف تقرأ هذا الصف" : "How to Scan This Queue"}</h3>
            </div>
          </div>
          <div class="rule-grid">
            <div class="rule-tile"><span>${copy().meta.lang === "ar" ? "يسار الصف" : "Left"}</span><strong>${copy().meta.lang === "ar" ? "من نتعامل معه الآن." : "Who we are dealing with right now."}</strong></div>
            <div class="rule-tile"><span>${copy().meta.lang === "ar" ? "الوسط" : "Middle"}</span><strong>${copy().meta.lang === "ar" ? "لماذا هذه الجهة مهمة وماذا حدث فيها." : "Why the lead matters and what signal exists."}</strong></div>
            <div class="rule-tile"><span>${copy().meta.lang === "ar" ? "اليمين" : "Right"}</span><strong>${copy().meta.lang === "ar" ? "الإجراء التالي أو التحويل الفوري." : "The next action or instant conversion."}</strong></div>
          </div>
        </article>
      </section>
    </section>
  `;
}

function renderQuickCaptureForm(source) {
  const sectorOptions = state.data.sectors
    .map((sector) => `<option value="${sector.id}">${sector.sector_name}</option>`)
    .join("");

  return `
    <form class="quick-capture-card" data-quick-capture="${source}">
      <div class="quick-capture-head">
        <div>
          <p class="panel-label">${copy().meta.lang === "ar" ? "التقاط سريع" : "Quick Capture"}</p>
          <h3>${copy().meta.lang === "ar" ? "سجّل lead الآن" : "Log a lead now"}</h3>
        </div>
        <span class="source-badge">${displayChannel(source)}</span>
      </div>
      <div class="quick-capture-grid">
        <label><span>${getFormLabel("companyName", "company_name")}</span><input name="company_name" required /></label>
        <label><span>${getFormLabel("sectorId", "sector_id")}</span><select name="sector_id">${sectorOptions}</select></label>
        <label class="quick-capture-wide"><span>${getFormLabel("painSignal", "pain_signal")}</span><input name="pain_signal" required /></label>
      </div>
      <div class="form-actions">
        <button class="primary-button" type="submit">${copy().meta.lang === "ar" ? "التقاط الآن" : "Capture now"}</button>
      </div>
    </form>
  `;
}

function renderRecentCaptureActions(source) {
  const recentLead = state.data.leads.find((lead) => lead.id === state.recentCaptureLeadId);
  if (!recentLead || recentLead.channel !== source || isLeadArchived(recentLead)) {
    return "";
  }

  const nextMessage = leadNeedsFirstTouch(recentLead)
    ? (copy().meta.lang === "ar"
        ? `${recentLead.company_name} تم التقاطها وتحتاج أول تواصل الآن.`
        : `${recentLead.company_name} was captured and still needs first touch now.`)
    : leadFollowUpNeedsAction(recentLead)
      ? (copy().meta.lang === "ar"
          ? `${recentLead.company_name} تحتاج متابعة الآن. لا تدعها تبقى معلقة.`
          : `${recentLead.company_name} needs follow-up now. Do not let it stall.`)
    : (copy().meta.lang === "ar"
        ? `${recentLead.company_name} دخلت في المتابعة. الخطوة التالية واضحة.`
        : `${recentLead.company_name} is already in motion. The next step is clear.`);

  return `
    <div class="recent-capture-banner">
      <p>${nextMessage}</p>
      <div class="guidance-actions">
        <button class="ghost-button tight" type="button" data-open-record="lead:${recentLead.id}">${copy().meta.lang === "ar" ? "افتح الجهة" : "Open lead"}</button>
        <button class="ghost-button tight" type="button" data-open-opener="${recentLead.id}">${copy().meta.lang === "ar" ? "أضف opener note" : "Add opener note"}</button>
        <button class="primary-button tight" type="button" data-move-outreach="${recentLead.id}">${copy().meta.lang === "ar" ? "حرّك إلى outreach" : "Move to outreach"}</button>
        ${leadNeedsFirstTouch(recentLead) ? `<button class="success-button tight" type="button" data-mark-first-touch="${recentLead.id}">${copy().meta.lang === "ar" ? "تم أول تواصل" : "Mark first touch done"}</button>` : ""}
        ${!leadNeedsFirstTouch(recentLead) && recentLead.operational_state !== "waiting_response" ? `<button class="ghost-button tight" type="button" data-mark-waiting-response="${recentLead.id}">${copy().meta.lang === "ar" ? "بانتظار الرد" : "Move to waiting response"}</button>` : ""}
        ${leadFollowUpNeedsAction(recentLead) ? `<button class="success-button tight" type="button" data-mark-follow-up-sent="${recentLead.id}">${copy().meta.lang === "ar" ? "تمت المتابعة" : "Mark follow-up sent"}</button>` : ""}
      </div>
    </div>
  `;
}

function renderSourceScreen(source) {
  if (!source) {
    return renderEmptyState();
  }

  state.activeSource = source;
  const metrics = getSourceMetrics(source);
  const sourceLeads = getSourceLeads(source);
  const executionAlert = getSourceExecutionAlert(source, metrics);
  const actionPrompt = getSourceActionPrompt(source, metrics);
  const commandLeads = sourceLeads
    .filter((lead) => {
      const bucket = getLeadWorkflowBucket(lead, state.data.opportunities);
      return leadNeedsFirstTouch(lead) || leadFollowUpNeedsAction(lead) || ["Ready for Handoff", "Needs Reply", "Needs Qualification"].includes(bucket);
    })
    .slice(0, 5);

  setScreenActions(`<button class="primary-button" type="button" data-action="new-lead">${copy().chrome.buttons.newLead}</button>`);

  return `
    <section class="command-deck source-deck">
      <section class="top-strip metrics-strip">
        ${renderKpiCell(copy().meta.lang === "ar" ? "التُقطوا اليوم" : "Captured today", metrics.todayLeads, "primary")}
        ${renderKpiCell(copy().meta.lang === "ar" ? "أول تواصل اليوم" : "First touches today", metrics.firstTouchesDoneToday)}
        ${renderKpiCell(copy().meta.lang === "ar" ? "بانتظار الرد" : "Waiting response", metrics.waitingResponseCount)}
        ${renderKpiCell(copy().meta.lang === "ar" ? "متابعة اليوم" : "Follow-up due today", metrics.followUpDueToday, metrics.followUpDueToday ? "alert" : "")}
        ${renderKpiCell(copy().meta.lang === "ar" ? "متابعات متأخرة" : "Overdue follow-ups", metrics.overdueFollowups, metrics.overdueFollowups ? "alert" : "")}
        ${renderKpiCell(copy().meta.lang === "ar" ? "تم الرد اليوم" : "Responded today", metrics.respondedToday)}
        ${renderKpiCell(copy().meta.lang === "ar" ? "بلا أول تواصل" : "Untouched captured", metrics.untouchedCapturedToday, metrics.untouchedCapturedToday ? "alert" : "")}
        ${renderKpiCell(copy().meta.lang === "ar" ? "هدف اليوم" : "Daily target", metrics.dailyTarget)}
        ${renderKpiCell(copy().meta.lang === "ar" ? "المتبقي" : "Remaining", metrics.remainingToTarget, metrics.targetStatus === "behind" ? "alert" : "")}
      </section>

      <section class="command-zone">
        <div class="command-zone-head">
          <div>
            <p class="panel-label">${copy().meta.lang === "ar" ? "غرفة القيادة" : "Source Command"}</p>
            <h2>${copy().meta.lang === "ar" ? `تشغيل ${displayChannel(source)}` : `${displayChannel(source)} Control Room`}</h2>
            <p class="zone-copy">${actionPrompt}</p>
          </div>
        </div>
        ${executionAlert ? `<div class="source-target-banner warning">${executionAlert}</div>` : `<div class="source-target-banner">${copy().meta.lang === "ar" ? `الهدف اليومي: ${metrics.todayLeads} / ${metrics.dailyTarget}` : `Daily target: ${metrics.todayLeads} / ${metrics.dailyTarget}`}</div>`}
        ${renderQuickCaptureForm(source)}
        ${renderRecentCaptureActions(source)}
        <div class="command-zone-list">
          ${commandLeads.length ? commandLeads.map((lead) => renderLeadCommandRow(lead, { preferConvert: true })).join("") : renderEmptyState()}
        </div>
      </section>

      <section class="operational-grid source-ops-grid">
        <div class="intent-section elevated">
          <div class="intent-head">
            <div>
              <p class="panel-label">${copy().meta.lang === "ar" ? "طريقة الصيد" : "Hunt Protocol"}</p>
              <h3>${copy().meta.lang === "ar" ? "دليل التنفيذ داخل القناة" : "How to Work This Source"}</h3>
            </div>
          </div>
          ${renderSourceHuntPanel(source)}
        </div>

        <div class="intent-section">
          <div class="intent-head">
            <div>
              <p class="panel-label">${copy().meta.lang === "ar" ? "حالة القناة" : "Source Snapshot"}</p>
              <h3>${copy().meta.lang === "ar" ? "قراءة تشغيلية" : "Operational Read"}</h3>
            </div>
          </div>
          ${renderSourceSnapshot(source)}
        </div>

        <article class="bottom-zone full-span">
          <div class="intent-head">
            <div>
              <p class="panel-label">${copy().meta.lang === "ar" ? "التدفق التنفيذي" : "Execution Flow"}</p>
              <h3>${copy().meta.lang === "ar" ? "الصندوق والتقدم" : "Inbox and Progression"}</h3>
            </div>
          </div>
          <section class="source-layout">
            <div class="source-main">
              ${renderSourceWorkflow(source)}
            </div>
            ${renderSourceProgression(source)}
          </section>
        </article>
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

function renderLeadMetaCard(label, value, options = {}) {
  const toneClass = options.tone ? ` ${options.tone}` : "";
  const direction = options.dir || inferTextDirection(value);
  return `
    <article class="lead-meta-card${toneClass}">
      <span>${label}</span>
      <strong dir="${direction}">${value || "—"}</strong>
    </article>
  `;
}

function renderLeadSummaryStat(label, value, options = {}) {
  const toneClass = options.tone ? ` ${options.tone}` : "";
  return `
    <article class="lead-summary-stat${toneClass}">
      <span>${label}</span>
      <strong>${value || "—"}</strong>
    </article>
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
  const sla = getLeadSlaState(lead, todayDate());
  const nextAction = getLeadNextBestAction(lead, state.data.opportunities, todayDate());
  const eligibleForOpportunity =
    lead.current_stage === "Handoff Sent" &&
    lead.handoff_summary &&
    !hasOpportunityForLead(state.data.opportunities, lead.id);
  const guardFlags = getLeadGuardFlags(lead, todayDate());
  const needsFirstTouch = leadNeedsFirstTouch(lead);
  const effectiveOperationalState = getEffectiveLeadOperationalState(lead);
  const followUpDueDate = getLeadFollowUpDueDate(lead);
  const followUpTiming = getLeadFollowUpTiming(lead);
  const isArabic = copy().meta.lang === "ar";
  const contactLine = `${lead.contact_name} • ${lead.role || getValueLabel("noRole", "No role")}`;
  const leadStatusLabel = displayStage(computedStage);
  const channelLabel = displayChannel(lead.channel);
  const sectorLabel = sector?.sector_name || "—";
  const firstTouchLabel = lead.first_touch_at ? shortDate(getLeadFirstTouchDate(lead)) : (isArabic ? "لم يتم بعد" : "Not done yet");
  const followUpLabel = followUpDueDate ? shortDate(followUpDueDate) : (isArabic ? "غير محدد" : "Not scheduled");
  const respondedLabel = lead.responded_at ? shortDate(getLeadRespondedDate(lead)) : (isArabic ? "لا يوجد" : "Not yet");
  const lastFollowUpLabel = lead.follow_up_sent_at ? shortDate(getLeadFollowUpSentDate(lead)) : (isArabic ? "لا يوجد" : "None yet");
  const nextStepDateLabel = lead.next_step_date ? shortDate(lead.next_step_date) : (isArabic ? "غير محدد" : "Not scheduled");
  const nextActionCopy =
    needsFirstTouch
      ? (isArabic
          ? "هذه الجهة التُقطت لكن ما زالت بلا أول تواصل. لا تتركها معلقة: أضف opener سريع أو سجّل أول تواصل فورًا."
          : "This lead was captured but still has no first touch. Do not leave it hanging: add a quick opener or log the first touch now.")
      : effectiveOperationalState === "needs_follow_up"
        ? (isArabic
            ? (followUpTiming === "overdue"
                ? "هذه الجهة متأخرة في المتابعة. أرسل follow-up الآن أو snooze بشكل مقصود."
                : "هذه الجهة تحتاج متابعة اليوم. نفّذ follow-up الآن أو أجّلها بوضوح.")
            : (followUpTiming === "overdue"
                ? "This lead is overdue for follow-up. Send the follow-up now or snooze it deliberately."
                : "This lead needs follow-up today. Send the follow-up now or snooze it clearly."))
        : lead.operational_state === "first_touch_done"
          ? (isArabic
              ? "تم أول تواصل. إذا أُرسلت المحاولة بالفعل، حرّكها إلى انتظار الرد."
              : "First touch is done. If the opener has been sent, move it into waiting response.")
          : effectiveOperationalState === "waiting_response"
            ? (isArabic
                ? "هذه الجهة الآن بانتظار الرد. راقب الردود أو جهّز متابعة عند الحاجة."
                : "This lead is now waiting for a response. Watch for replies or prep follow-up when needed.")
            : (isArabic
                ? "اختر الحركة التالية التي تبقي هذا السجل متقدّمًا اليوم."
                : "Choose the next action that keeps this lead moving today.");
  return `
    <section class="drawer-section lead-hero-card">
      <div class="lead-hero-top">
        <div class="lead-hero-copy">
          <p class="drawer-eyebrow">${isArabic ? "سجل الجهة" : "Lead Record"}</p>
          <h4 dir="${inferTextDirection(lead.company_name)}">${lead.company_name}</h4>
          <p class="lead-hero-subtitle" dir="auto">${contactLine}</p>
        </div>
        <div class="lead-hero-status">
          <span class="badge ${computedStage === "Delayed" ? "danger" : ""}">${leadStatusLabel}</span>
          <span class="badge ${sla.state === "overdue" ? "danger" : sla.state === "due_today" ? "warning" : sla.state === "stale" ? "muted" : ""}">${getLocalizedSlaLabel(sla.state, sla.label)}${sla.age_days ? ` • ${sla.age_days}d` : ""}</span>
          <span class="badge action-${nextAction.action}">${getLocalizedActionLabel(nextAction.action)}</span>
          <span class="lead-score-pill">${isArabic ? "سكور" : "Score"} ${lead.lead_score}</span>
        </div>
      </div>
      ${
        guardFlags.length
          ? `<div class="guard-row">${guardFlags
              .map((flag) => `<span class="guard-pill ${flag.type}">${displayGuardFlag(flag.label)}</span>`)
              .join("")}</div>`
          : ""
      }
      ${lead.archived ? `<div class="guard-row"><span class="guard-pill warning">${copy().meta.lang === "ar" ? "مؤرشف" : "Archived"}</span></div>` : ""}
      <div class="lead-chip-row">
        <span class="lead-chip">${channelLabel}</span>
        <span class="lead-chip" dir="${inferTextDirection(sectorLabel)}">${sectorLabel}</span>
        <span class="lead-chip">${getLeadOperationalStateLabel(effectiveOperationalState)}</span>
      </div>
      <div class="lead-insight-row">
        <span class="insight-chip">${isArabic ? "اقتراح" : "Suggestion"}: ${getLocalizedActionLabel(nextAction.action)}</span>
        <span class="insight-chip">${isArabic ? "العمر" : "Age"}: ${sla.age_days}d</span>
        <span class="insight-chip">${getLocalizedSlaLabel(sla.state, sla.label)}</span>
      </div>
      <div class="lead-summary-grid">
        ${renderLeadSummaryStat(isArabic ? "أول تواصل" : "First touch", firstTouchLabel, { tone: needsFirstTouch ? "alert" : "" })}
        ${renderLeadSummaryStat(isArabic ? "استحقاق المتابعة" : "Follow-up due", followUpLabel, { tone: followUpTiming === "overdue" ? "alert" : "" })}
        ${renderLeadSummaryStat(isArabic ? "آخر متابعة" : "Last follow-up", lastFollowUpLabel)}
        ${renderLeadSummaryStat(isArabic ? "تم الرد" : "Responded", respondedLabel, { tone: lead.responded_at ? "primary" : "" })}
      </div>
      <div class="lead-meta-grid">
        ${renderLeadMetaCard(getFieldLabel("painSignal", "Pain Signal"), lead.pain_signal || getValueLabel("noSignalCaptured", "No signal captured yet."), { tone: "wide", dir: inferTextDirection(lead.pain_signal || lead.notes) })}
        ${renderLeadMetaCard(getFieldLabel("nextStep", "Next Step"), lead.next_step || getValueLabel("noImmediateNextStep", "No immediate next step"), { tone: "wide", dir: inferTextDirection(lead.next_step) })}
      </div>
    </section>
    <section class="drawer-section">
      <h4>${isArabic ? "ملخص الجهة" : "Lead Snapshot"}</h4>
      <div class="lead-meta-grid compact">
        ${renderLeadMetaCard(getFieldLabel("sector", "Sector"), sectorLabel)}
        ${renderLeadMetaCard(getFieldLabel("channel", "Channel"), channelLabel, { dir: "auto" })}
        ${renderLeadMetaCard(getFieldLabel("contact", "Contact"), contactLine, { dir: "auto" })}
        ${renderLeadMetaCard(getFieldLabel("interestType", "Interest Type"), displayInterestType(lead.interest_type))}
        ${renderLeadMetaCard(getFieldLabel("currentStage", "Current Stage"), leadStatusLabel)}
        ${renderLeadMetaCard(isArabic ? "تاريخ الخطوة التالية" : "Next step date", nextStepDateLabel)}
        ${renderLeadMetaCard(getFieldLabel("shortNote", "Short Note"), lead.notes || getValueLabel("noAdditionalNote", "No additional note"), { tone: "wide", dir: inferTextDirection(lead.notes) })}
        ${renderLeadMetaCard(getFieldLabel("handoffSummary", "Handoff Summary"), lead.handoff_summary || getValueLabel("notReadyYet", "Not ready yet"), { tone: "wide", dir: inferTextDirection(lead.handoff_summary) })}
      </div>
    </section>
    <section class="drawer-section">
      <h4>${copy().meta.lang === "ar" ? "الخطوة التنفيذية التالية" : "Next Execution Step"}</h4>
      <div class="progression-card">
        <p>${nextActionCopy}</p>
        <div class="guidance-actions">
          ${needsFirstTouch ? `<button class="success-button tight" type="button" data-mark-first-touch="${lead.id}">${copy().meta.lang === "ar" ? "تم أول تواصل" : "Mark first touch done"}</button>` : ""}
          ${effectiveOperationalState !== "waiting_response" && effectiveOperationalState !== "needs_follow_up" && effectiveOperationalState !== "responded" ? `<button class="ghost-button tight" type="button" data-mark-waiting-response="${lead.id}">${copy().meta.lang === "ar" ? "بانتظار الرد" : "Move to waiting response"}</button>` : ""}
          ${(effectiveOperationalState === "waiting_response" || effectiveOperationalState === "needs_follow_up") ? `<button class="success-button tight" type="button" data-mark-follow-up-sent="${lead.id}">${copy().meta.lang === "ar" ? "تمت المتابعة" : "Mark follow-up sent"}</button>` : ""}
          ${(effectiveOperationalState === "waiting_response" || effectiveOperationalState === "needs_follow_up") ? `<button class="ghost-button tight" type="button" data-snooze-follow-up="${lead.id}">${copy().meta.lang === "ar" ? "تأجيل المتابعة" : "Snooze follow-up"}</button>` : ""}
          ${effectiveOperationalState !== "responded" ? `<button class="ghost-button tight" type="button" data-mark-responded="${lead.id}">${copy().meta.lang === "ar" ? "تم الرد" : "Mark responded"}</button>` : ""}
          <button class="ghost-button tight" type="button" data-open-opener="${lead.id}">${copy().meta.lang === "ar" ? "أضف opener note" : "Add opener note"}</button>
        </div>
      </div>
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
          ${!lead.archived ? `<button class="ghost-button" type="button" data-archive-lead="${lead.id}">${copy().meta.lang === "ar" ? "أرشفة" : "Archive"}</button>` : ""}
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
  const sla = getOpportunitySlaState(opportunity, todayDate());
  const nextAction = getOpportunityNextBestAction(opportunity, todayDate());
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
      <div class="lead-insight-row">
        <span class="insight-chip">${isFinite(sla.age_days) ? `${getLocalizedSlaLabel(sla.state, sla.label)} • ${sla.age_days}d` : getLocalizedSlaLabel(sla.state, sla.label)}</span>
        <span class="insight-chip">${copy().meta.lang === "ar" ? "اقتراح" : "Suggestion"}: ${getLocalizedActionLabel(nextAction.action)}</span>
        <span class="insight-chip">${getLocalizedActionReason(nextAction.action, nextAction.reason)}</span>
      </div>
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
    const sectorOptions = state.data.sectors
      .map((sector) => {
        const activeLabel = sector.is_active
          ? (copy().meta.lang === "ar" ? "نشط" : "Active")
          : displayStage(sector.status);
        return `<option value="${sector.id}" data-active="${sector.is_active ? "1" : "0"}">${sector.sector_name} • ${activeLabel}</option>`;
      })
      .join("");
    const activeSource = state.drawer.contextSource || resolveActiveSource();
    return `
      <section class="drawer-section">
        <h4>${copy().chrome.forms.createLead}</h4>
        <form data-create-form="lead">
          <label><span>${getFormLabel("companyName", "company_name")}</span><input name="company_name" required /></label>
          <label><span>${getFormLabel("sectorId", "sector_id")}</span><select name="sector_id" data-sector-select>${sectorOptions}</select></label>
          <p class="form-note warning" data-sector-note>${
            copy().meta.lang === "ar"
              ? "يمكن التسجيل في أي قطاع، لكن القطاعات غير النشطة تحتاج قرارًا واعيًا حتى لا تشتت التركيز الأسبوعي."
              : "You can log a lead into any sector, but non-active sectors should be used intentionally so weekly focus does not drift."
          }</p>
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
          <button class="success-button" type="submit">${copy().chrome.buttons.createOpportunity}</button>
        </div>
      </form>
    </section>
  `;
}

function renderDrawer() {
  const { open, kind, entityType, entityId, message } = state.drawer;
  elements.drawer.classList.toggle("hidden", !open);
  elements.drawerBackdrop.classList.toggle("hidden", !open);
  elements.drawer.classList.remove("drawer-modal", "drawer-lead-detail");
  syncDrawerEnvironment(false);

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
    if (kind === "detail") {
      elements.drawer.classList.add("drawer-modal", "drawer-lead-detail");
      syncDrawerEnvironment(true);
    }
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
  elements.drawerBody.querySelectorAll("[data-open-record]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openRecord(button.dataset.openRecord);
    });
  });
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
  payload.updated_at = todayDate();
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
  const existing = state.data.sectors.find((sector) => sector.id === entityId);
  const patch = { ...existing, ...readFormValues(form) };
  patch.notes = patch.notes || "";
  patch.owner = "Admin";
  patch.next_step = patch.next_step || "";
  patch.next_step_date = patch.next_step_date || "";
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
  patch.first_touch_at = existing.first_touch_at || "";
  patch.follow_up_due_at = existing.follow_up_due_at || "";
  patch.follow_up_sent_at = existing.follow_up_sent_at || "";
  patch.responded_at = existing.responded_at || "";
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
      created_at: todayDate(),
      updated_at: todayDate(),
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
      archived: false,
      operational_state: "active",
      first_touch_at: "",
      follow_up_due_at: "",
      follow_up_sent_at: "",
      responded_at: "",
      stage_updated_at: todayDate(),
      created_at: todayDate(),
      updated_at: todayDate(),
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
      created_at: todayDate(),
      updated_at: todayDate(),
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

async function createQuickLead(form) {
  const values = readFormValues(form);
  const source = form.dataset.quickCapture || resolveActiveSource();
  const draft = {
    id: `lead-${crypto.randomUUID().slice(0, 8)}`,
    company_name: values.company_name,
    sector_id: values.sector_id,
    contact_name: values.company_name,
    role: "",
    channel: source,
    owner: "Admin",
    current_stage: "New",
    next_step: copy().meta.lang === "ar" ? "مراجعة الإشارة وتأهيل الجهة" : "Review signal and qualify lead",
    next_step_date: todayDate(),
    notes: "",
    pain_signal: values.pain_signal,
    urgency_level: "Medium",
    decision_level: "Unknown",
    interest_type: "New",
    lead_score: 5,
    last_contact_date: todayDate(),
    handoff_summary: "",
    archived: false,
    operational_state: "captured_today",
    first_touch_at: "",
    follow_up_due_at: "",
    follow_up_sent_at: "",
    responded_at: "",
    stage_updated_at: todayDate(),
    created_at: todayDate(),
    updated_at: todayDate(),
  };
  const errors = [
    ...localizeMessages(getRequiredValidationErrors("lead", draft)),
    ...localizeMessages(validateLeadTransition(draft, draft.current_stage)),
  ];

  if (errors.length) {
    setNotice(errors.join(" "));
    renderApp();
    return;
  }

  const nextState = await mutateState("/leads", {
    method: "POST",
    body: draft,
    message: copy().meta.lang === "ar" ? "تم تسجيل lead سريعًا." : "Lead captured quickly.",
  });
  const createdLead = nextState.leads.find((item) => item.id === draft.id);
  state.recentCaptureLeadId = createdLead.id;
  setGuidance({
    message:
      copy().meta.lang === "ar"
        ? `تم تسجيل ${createdLead.company_name}. الخطوة التالية الآن: افتح الجهة، أضف opener note، أو حرّكها إلى outreach.`
        : `${createdLead.company_name} captured. Next move now: open the lead, add an opener note, or move it to outreach.`,
    action: {
      type: "open-record",
      entityType: "lead",
      entityId: createdLead.id,
      label: copy().meta.lang === "ar" ? "أكمل التفاصيل" : "Enrich later",
    },
  });
  renderApp();
}

async function archiveLead(leadId) {
  const lead = state.data.leads.find((item) => item.id === leadId);
  if (!lead) {
    return;
  }

  await patchEntity("lead", leadId, { archived: true }, copy().meta.lang === "ar" ? "تمت أرشفة الجهة." : "Lead archived.");
  if (state.recentCaptureLeadId === leadId) {
    state.recentCaptureLeadId = "";
  }
  closeDrawer();
  renderApp();
}

function openLeadForOpener(leadId) {
  state.recentCaptureLeadId = leadId;
  setDrawer({
    open: true,
    kind: "detail",
    entityType: "lead",
    entityId: leadId,
    mode: "view",
    message: copy().meta.lang === "ar" ? "أضف opener note الآن ثم احفظ." : "Add the opener note now, then save.",
  });
}

async function moveLeadToOutreach(leadId) {
  const lead = state.data.leads.find((item) => item.id === leadId);
  if (!lead) {
    return;
  }

  const nextStep = lead.next_step || (copy().meta.lang === "ar" ? "إرسال opener أولي" : "Send first opener");
  await patchEntity("lead", leadId, {
    current_stage: lead.current_stage === "New" ? "Targeted" : lead.current_stage,
    next_step: nextStep,
    next_step_date: lead.next_step_date || todayDate(),
    operational_state: "needs_first_touch",
  }, copy().meta.lang === "ar" ? "تم تحريك الجهة إلى outreach." : "Lead moved to outreach.");

  state.recentCaptureLeadId = leadId;
  const updatedLead = state.data.leads.find((item) => item.id === leadId);
  setGuidance({
    message:
      copy().meta.lang === "ar"
        ? `${updatedLead.company_name} أصبحت الآن ضمن outreach. افتحها إذا أردت إضافة opener note قبل الإرسال.`
        : `${updatedLead.company_name} is now in outreach. Open it if you want to add an opener note before sending.`,
    action: {
      type: "open-record",
      entityType: "lead",
      entityId: leadId,
      label: copy().meta.lang === "ar" ? "افتح الجهة" : "Open lead",
    },
  });
  renderApp();
}

async function markLeadFirstTouchDone(leadId) {
  const lead = state.data.leads.find((item) => item.id === leadId);
  if (!lead) {
    return;
  }

  await patchEntity("lead", leadId, {
    operational_state: "first_touch_done",
    first_touch_at: todayDate(),
    next_step: lead.next_step || (copy().meta.lang === "ar" ? "انتظار الرد أو تحديد follow-up" : "Wait for response or set a follow-up"),
    next_step_date: lead.next_step_date || todayDate(),
  }, copy().meta.lang === "ar" ? "تم تسجيل أول تواصل." : "First touch marked as done.");

  state.recentCaptureLeadId = leadId;
  setGuidance({
    message:
      copy().meta.lang === "ar"
        ? `${lead.company_name} تم أول تواصل معها. إذا أُرسلت الرسالة بالفعل، انقلها الآن إلى انتظار الرد.`
        : `${lead.company_name} has its first touch logged. If the opener was sent, move it into waiting response now.`,
    action: {
      type: "open-record",
      entityType: "lead",
      entityId: leadId,
      label: copy().meta.lang === "ar" ? "افتح الجهة" : "Open lead",
    },
  });
  renderApp();
}

async function moveLeadToWaitingResponse(leadId) {
  const lead = state.data.leads.find((item) => item.id === leadId);
  if (!lead) {
    return;
  }

  await patchEntity("lead", leadId, {
    operational_state: "waiting_response",
    first_touch_at: lead.first_touch_at || todayDate(),
    follow_up_due_at: lead.follow_up_due_at || shiftDate(todayDate(), 2),
    next_step: lead.next_step || (copy().meta.lang === "ar" ? "متابعة الرد" : "Follow the response"),
    next_step_date: lead.next_step_date || todayDate(),
  }, copy().meta.lang === "ar" ? "الجهة الآن بانتظار الرد." : "Lead moved to waiting response.");

  state.recentCaptureLeadId = leadId;
  setGuidance({
    message:
      copy().meta.lang === "ar"
        ? `${lead.company_name} أصبحت الآن بانتظار الرد. راقب الردود أو جهّز متابعة عند الحاجة.`
        : `${lead.company_name} is now waiting for a response. Watch for replies or prepare a follow-up if needed.`,
    action: {
      type: "open-record",
      entityType: "lead",
      entityId: leadId,
      label: copy().meta.lang === "ar" ? "افتح الجهة" : "Open lead",
    },
  });
  renderApp();
}

async function markLeadFollowUpSent(leadId) {
  const lead = state.data.leads.find((item) => item.id === leadId);
  if (!lead) {
    return;
  }

  await patchEntity("lead", leadId, {
    operational_state: "waiting_response",
    first_touch_at: lead.first_touch_at || todayDate(),
    follow_up_sent_at: todayDate(),
    follow_up_due_at: shiftDate(todayDate(), 2),
    next_step: copy().meta.lang === "ar" ? "انتظار الرد بعد المتابعة" : "Wait for response after follow-up",
    next_step_date: shiftDate(todayDate(), 2),
  }, copy().meta.lang === "ar" ? "تم تسجيل المتابعة." : "Follow-up marked as sent.");

  state.recentCaptureLeadId = leadId;
  setGuidance({
    message:
      copy().meta.lang === "ar"
        ? `${lead.company_name} تمت متابعتها. راقب الرد أو راجعها مجددًا عند موعد المتابعة القادم.`
        : `${lead.company_name} has a follow-up logged. Watch for a response or revisit it on the next due date.`,
    action: {
      type: "open-record",
      entityType: "lead",
      entityId: leadId,
      label: copy().meta.lang === "ar" ? "افتح الجهة" : "Open lead",
    },
  });
  renderApp();
}

async function snoozeLeadFollowUp(leadId) {
  const lead = state.data.leads.find((item) => item.id === leadId);
  if (!lead) {
    return;
  }

  const nextDueDate = shiftDate(getLeadFollowUpDueDate(lead) || todayDate(), 1);
  await patchEntity("lead", leadId, {
    operational_state: "waiting_response",
    follow_up_due_at: nextDueDate,
    next_step: copy().meta.lang === "ar" ? "متابعة مؤجلة بوضوح" : "Follow-up intentionally snoozed",
    next_step_date: nextDueDate,
  }, copy().meta.lang === "ar" ? "تم تأجيل المتابعة." : "Follow-up snoozed.");

  setGuidance({
    message:
      copy().meta.lang === "ar"
        ? `${lead.company_name} أُجلت متابعتها إلى ${shortDate(nextDueDate)}.`
        : `${lead.company_name} follow-up was snoozed to ${shortDate(nextDueDate)}.`,
    action: {
      type: "open-record",
      entityType: "lead",
      entityId: leadId,
      label: copy().meta.lang === "ar" ? "افتح الجهة" : "Open lead",
    },
  });
  renderApp();
}

async function markLeadResponded(leadId) {
  const lead = state.data.leads.find((item) => item.id === leadId);
  if (!lead) {
    return;
  }

  await patchEntity("lead", leadId, {
    operational_state: "responded",
    responded_at: todayDate(),
    follow_up_due_at: "",
    next_step: copy().meta.lang === "ar" ? "راجع الرد وحدد الخطوة التالية" : "Review the response and set the next step",
    next_step_date: todayDate(),
  }, copy().meta.lang === "ar" ? "تم تسجيل الرد." : "Lead marked as responded.");

  setGuidance({
    message:
      copy().meta.lang === "ar"
        ? `${lead.company_name} تم الرد منها. راجع الرد وحدد الحركة التالية بسرعة.`
        : `${lead.company_name} has responded. Review the reply and define the next move quickly.`,
    action: {
      type: "open-record",
      entityType: "lead",
      entityId: leadId,
      label: copy().meta.lang === "ar" ? "افتح الجهة" : "Open lead",
    },
  });
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

  elements.drawerBody.querySelectorAll("[data-archive-lead]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await archiveLead(button.dataset.archiveLead);
      } catch {
        // Notice is already set by the mutation helper.
      }
    });
  });

  elements.drawerBody.querySelectorAll("[data-mark-first-touch]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await markLeadFirstTouchDone(button.dataset.markFirstTouch);
      } catch {
        // Notice is already set by the mutation helper.
      }
    });
  });

  elements.drawerBody.querySelectorAll("[data-mark-waiting-response]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await moveLeadToWaitingResponse(button.dataset.markWaitingResponse);
      } catch {
        // Notice is already set by the mutation helper.
      }
    });
  });

  elements.drawerBody.querySelectorAll("[data-mark-follow-up-sent]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await markLeadFollowUpSent(button.dataset.markFollowUpSent);
      } catch {
        // Notice is already set by the mutation helper.
      }
    });
  });

  elements.drawerBody.querySelectorAll("[data-snooze-follow-up]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await snoozeLeadFollowUp(button.dataset.snoozeFollowUp);
      } catch {
        // Notice is already set by the mutation helper.
      }
    });
  });

  elements.drawerBody.querySelectorAll("[data-mark-responded]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await markLeadResponded(button.dataset.markResponded);
      } catch {
        // Notice is already set by the mutation helper.
      }
    });
  });

  elements.drawerBody.querySelectorAll("[data-sector-select]").forEach((select) => {
    const note = elements.drawerBody.querySelector("[data-sector-note]");
    const updateSectorNote = () => {
      if (!note) return;
      const selected = select.selectedOptions[0];
      const isActive = selected?.dataset.active === "1";
      note.classList.toggle("warning", !isActive);
      note.textContent = isActive
        ? (copy().meta.lang === "ar"
            ? "القطاع النشط مناسب لالتقاط يومي مباشر."
            : "Active sector selected. Good fit for direct daily capture.")
        : (copy().meta.lang === "ar"
            ? "هذا القطاع غير نشط الآن. يمكنك التسجيل فيه، لكن لا تدعه يشتت التركيز الأسبوعي."
            : "This sector is not active right now. You can still log the lead there, but keep weekly focus intentional.");
    };

    updateSectorNote();
    select.addEventListener("change", updateSectorNote);
  });
}

function bindRecordOpeners() {
  elements.content.querySelectorAll("[data-quick-capture]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await createQuickLead(form);
      } catch {
        // Notice is already set by the mutation helper.
      }
    });
  });

  elements.content.querySelectorAll("[data-source-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeSource = button.dataset.sourceTab;
      state.activeScreen = `source:${button.dataset.sourceTab}`;
      renderApp();
    });
  });

  [elements.content, elements.drawerBody].forEach((scope) => {
    scope?.querySelectorAll("[data-open-record]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openRecord(button.dataset.openRecord);
      });
    });
  });

  elements.content.querySelectorAll("[data-convert-lead]").forEach((button) => {
    button.addEventListener("click", () => convertLeadToOpportunity(button.dataset.convertLead));
  });

  elements.content.querySelectorAll("[data-open-opener]").forEach((button) => {
    button.addEventListener("click", () => openLeadForOpener(button.dataset.openOpener));
  });

  elements.content.querySelectorAll("[data-move-outreach]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await moveLeadToOutreach(button.dataset.moveOutreach);
      } catch {
        // Notice is already set by the mutation helper.
      }
    });
  });

  elements.content.querySelectorAll("[data-mark-first-touch]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await markLeadFirstTouchDone(button.dataset.markFirstTouch);
      } catch {
        // Notice is already set by the mutation helper.
      }
    });
  });

  elements.content.querySelectorAll("[data-mark-waiting-response]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await moveLeadToWaitingResponse(button.dataset.markWaitingResponse);
      } catch {
        // Notice is already set by the mutation helper.
      }
    });
  });

  elements.content.querySelectorAll("[data-mark-follow-up-sent]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await markLeadFollowUpSent(button.dataset.markFollowUpSent);
      } catch {
        // Notice is already set by the mutation helper.
      }
    });
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
  if (elements.rulesList) {
    const sidebarRules = copy().chrome.sidebar.rules || [];
    elements.rulesList.innerHTML = sidebarRules.map((rule) => `<li>${rule}</li>`).join("");
    elements.rulesList.closest(".sidebar-panel")?.classList.toggle("hidden", !sidebarRules.length);
  }
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
    appShell: document.querySelector(".app-shell"),
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
  renderApp();
}

export { bootstrapApp };
