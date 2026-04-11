import {
  AGENTS,
  BREAK_OPTIONS,
  LEAD_STAGES,
  OPPORTUNITY_STAGES,
  createSeedData,
  deepClone,
  enforceSingleActiveSector,
  getAgentSummaries,
  getComputedLeadStage,
  getLeadGuardFlags,
  getOpportunityGuardFlags,
  getOpportunityReadinessGaps,
  getComputedOpportunityStage,
  getComputedSectorStatus,
  getMetrics,
  getRequiredValidationErrors,
  getTodayQueue,
  hydrateDashboardState,
  normalizeDashboardState,
  serializeDashboardState,
  stageIndex,
  todayDate,
  validateLeadTransition,
  validateOpportunityTransition,
} from "./logic.mjs";

const SCREENS = [
  { key: "executive" },
  { key: "sectors" },
  { key: "pipeline" },
  { key: "opportunities" },
  { key: "bottleneck" },
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
      executive: "Executive Focus",
      sectors: "Sector & Offer Board",
      pipeline: "Pipeline Board",
      opportunities: "Opportunity Board",
      bottleneck: "Bottleneck & Performance",
    },
    sidebar: {
      weeklyFocusLabel: "Weekly Focus",
      rulesLabel: "Operating Rules",
      rules: [],
    },
    filters: {
      sector: "Sector",
      source: "Source",
      owner: "Owner",
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
    agents: {},
    agentLabels: {},
    guardFlags: {},
    urgency: {},
    priorities: {},
    finalDecision: {},
    interestType: {},
    decisionLevel: {},
    channels: {},
    queueBuckets: {},
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
  activeScreen: "executive",
  filters: {
    sector: "all",
    source: "all",
    owner: "all",
    stage: "all",
    urgency: "all",
    overdue: "all",
  },
  drawer: {
    open: false,
    kind: null,
    entityType: null,
    entityId: null,
    mode: "view",
    message: "",
  },
  notice: "",
  storage: {
    key: "",
    available: true,
    source: "seed",
    lastSavedAt: null,
  },
};

let elements = null;

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

function displayAgentKey(value) {
  return displayFromMap("agents", value);
}

function displayAgentLabel(value) {
  return displayFromMap("agentLabels", value);
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

function displayQueueBucket(value) {
  return displayFromMap("queueBuckets", value);
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

function localStorageAvailable() {
  try {
    const probe = "__mycalls_probe__";
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function setNotice(message) {
  state.notice = message;
}

function getSeedData() {
  const seedFactory = copy()?.seed?.factory || ((seed) => seed);
  return normalizeDashboardState(seedFactory(deepClone(createSeedData())));
}

function persistDashboardState() {
  if (!state.storage.available) {
    return;
  }

  window.localStorage.setItem(state.storage.key, serializeDashboardState(state.data));
  state.storage.lastSavedAt = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
  state.storage.source = "local";
}

function loadInitialDashboardState() {
  state.storage.available = localStorageAvailable();
  if (!state.storage.available) {
    state.storage.source = "memory-only";
    return getSeedData();
  }

  const raw = window.localStorage.getItem(state.storage.key);
  if (!raw) {
    state.storage.source = "seed";
    return getSeedData();
  }

  const hydrated = hydrateDashboardState(raw);
  state.storage.source = "local";
  if (hydrated.recovered) {
    setNotice(copy().messages.notices.recoveredSeed);
  }
  return hydrated.data;
}

function setData(nextData, message = "") {
  state.data = normalizeDashboardState(nextData);
  persistDashboardState();
  if (message) {
    setNotice(message);
  }
}

function resetToSeed({ clearStorage = false } = {}) {
  if (clearStorage && state.storage.available) {
    window.localStorage.removeItem(state.storage.key);
    state.storage.lastSavedAt = null;
    state.storage.source = "seed";
  }

  state.data = getSeedData();
  if (!clearStorage) {
    persistDashboardState();
  }
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
  return Object.keys(copy()?.display?.channels || {});
}

function getQueueContext(item) {
  if (item.kind === "lead") {
    const lead = getLeadById(item.id);
    const sector = getSectorById(lead?.sector_id);
    return [displayChannel(lead?.channel), sector?.sector_name].filter(Boolean).join(" • ");
  }

  if (item.kind === "opportunity") {
    const opportunity = state.data.opportunities.find((entry) => entry.id === item.id);
    const sector = getSectorById(opportunity?.sector_id);
    return [getValueLabel("opportunity", "Opportunity"), sector?.sector_name].filter(Boolean).join(" • ");
  }

  return [getValueLabel("sector", "Sector"), displayAgentKey(item.owner)].filter(Boolean).join(" • ");
}

function getSourceBreakdown() {
  const counts = new Map();

  state.data.leads.forEach((lead) => {
    const key = lead.channel || "Unknown";
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return [...counts.entries()]
    .map(([channel, count]) => ({ channel, count }))
    .sort((left, right) => right.count - left.count || left.channel.localeCompare(right.channel));
}

function getSectorPressure() {
  return state.data.sectors
    .map((sector) => {
      const liveLeads = state.data.leads.filter(
        (lead) =>
          lead.sector_id === sector.id &&
          !["Disqualified", "No Response"].includes(getComputedLeadStage(lead, todayDate())),
      ).length;
      const liveOpportunities = state.data.opportunities.filter(
        (opportunity) =>
          opportunity.sector_id === sector.id &&
          !["Won", "Lost", "Delayed"].includes(getComputedOpportunityStage(opportunity, todayDate())),
      ).length;

      return { sector, liveLeads, liveOpportunities };
    })
    .sort(
      (left, right) =>
        Number(right.sector.is_active) - Number(left.sector.is_active) ||
        right.liveOpportunities - left.liveOpportunities ||
        right.liveLeads - left.liveLeads ||
        (right.sector.score || 0) - (left.sector.score || 0),
    );
}

function getFilteredLeads() {
  const today = todayDate();
  return state.data.leads.filter((lead) => {
    const computedStage = getComputedLeadStage(lead, today);
    const sector = getSectorById(lead.sector_id);
    const matchesSector =
      state.filters.sector === "all" || sector?.id === state.filters.sector;
    const matchesSource =
      state.filters.source === "all" || lead.channel === state.filters.source;
    const matchesOwner = state.filters.owner === "all" || lead.owner === state.filters.owner;
    const matchesStage =
      state.filters.stage === "all" || computedStage === state.filters.stage || lead.current_stage === state.filters.stage;
    const matchesUrgency =
      state.filters.urgency === "all" || (lead.urgency_level || "None") === state.filters.urgency;
    const isOverdue = computedStage === "Delayed";
    const matchesOverdue =
      state.filters.overdue === "all" ||
      (state.filters.overdue === "yes" && isOverdue) ||
      (state.filters.overdue === "no" && !isOverdue);
    return matchesSector && matchesSource && matchesOwner && matchesStage && matchesUrgency && matchesOverdue;
  });
}

function getFilteredOpportunities() {
  const today = todayDate();
  return state.data.opportunities.filter((opportunity) => {
    const computedStage = getComputedOpportunityStage(opportunity, today);
    const sector = getSectorById(opportunity.sector_id);
    const originLead = getLeadById(opportunity.origin_lead_id);
    const matchesSector =
      state.filters.sector === "all" || sector?.id === state.filters.sector;
    const matchesSource =
      state.filters.source === "all" || originLead?.channel === state.filters.source;
    const matchesOwner = state.filters.owner === "all" || opportunity.owner === state.filters.owner;
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
    return matchesSector && matchesSource && matchesOwner && matchesStage && matchesUrgency && matchesOverdue;
  });
}

function getFilteredSectors() {
  const today = todayDate();
  return state.data.sectors.filter((sector) => {
    const computedStatus = getComputedSectorStatus(sector, today);
    const hasSourceLead =
      state.filters.source === "all" ||
      state.data.leads.some((lead) => lead.sector_id === sector.id && lead.channel === state.filters.source);
    const matchesSector =
      state.filters.sector === "all" || sector.id === state.filters.sector;
    const matchesOwner = state.filters.owner === "all" || sector.owner === state.filters.owner;
    const matchesStage =
      state.filters.stage === "all" || sector.status === state.filters.stage || computedStatus === state.filters.stage;
    const matchesUrgency = state.filters.urgency === "all" || sector.priority === state.filters.urgency;
    const isOverdue = computedStatus === "Delayed";
    const matchesOverdue =
      state.filters.overdue === "all" ||
      (state.filters.overdue === "yes" && isOverdue) ||
      (state.filters.overdue === "no" && !isOverdue);
    return hasSourceLead && matchesSector && matchesOwner && matchesStage && matchesUrgency && matchesOverdue;
  });
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
  };
  renderDrawer();
}

function renderNav() {
  elements.nav.innerHTML = SCREENS.map(
    (screen) => `
      <button
        class="nav-link ${screen.key === state.activeScreen ? "active" : ""}"
        data-screen="${screen.key}"
        type="button"
      >
        ${copy().chrome.screens[screen.key] || screen.key}
      </button>
    `,
  ).join("");

  elements.nav.querySelectorAll("[data-screen]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeScreen = button.dataset.screen;
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
    <p class="sidebar-copy">${state.data.weeklyFocus.current_offer}</p>
    <p class="sidebar-note">${state.data.weeklyFocus.weekly_target}</p>
  `;
}

function renderFilters() {
  const sectorOptions = state.data.sectors
    .map((sector) => `<option value="${sector.id}">${sector.sector_name}</option>`)
    .join("");
  const sourceOptions = getChannelOptions()
    .map((channel) => `<option value="${channel}">${displayChannel(channel)}</option>`)
    .join("");
  const stageOptions = [...new Set([...LEAD_STAGES, ...OPPORTUNITY_STAGES, "Active", "Testing", "Paused", "Rejected"])]
    .map((stage) => `<option value="${stage}">${displayStage(stage)}</option>`)
    .join("");

  elements.filters.innerHTML = `
    <label>
      <span>${copy().chrome.filters.sector}</span>
      <select data-filter="sector">
        <option value="all">${copy().chrome.filters.all}</option>
        ${sectorOptions}
      </select>
    </label>
    <label>
      <span>${copy().chrome.filters.source}</span>
      <select data-filter="source">
        <option value="all">${copy().chrome.filters.all}</option>
        ${sourceOptions}
      </select>
    </label>
    <label>
      <span>${copy().chrome.filters.owner}</span>
      <select data-filter="owner">
        <option value="all">${copy().chrome.filters.all}</option>
        <option value="Agent 1">${displayAgentKey("Agent 1")}</option>
        <option value="Agent 2">${displayAgentKey("Agent 2")}</option>
        <option value="Agent 3">${displayAgentKey("Agent 3")}</option>
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
      <span>${copy().chrome.filters.urgency}</span>
      <select data-filter="urgency">
        <option value="all">${copy().chrome.filters.all}</option>
        <option value="High">${displayUrgency("High")}</option>
        <option value="Medium">${displayUrgency("Medium")}</option>
        <option value="Low">${displayUrgency("Low")}</option>
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
      : state.storage.source === "local"
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
  elements.screenActions.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "restore-seed") {
        resetToSeed();
        setNotice(copy().messages.notices.seedRestored);
        renderApp();
      }
      if (action === "reset-local") {
        resetToSeed({ clearStorage: true });
        setNotice(copy().messages.notices.localCleared);
        renderApp();
      }
      if (action === "new-sector") {
        setDrawer({ open: true, kind: "create", entityType: "sector", mode: "create", message: "" });
      }
      if (action === "new-lead") {
        setDrawer({ open: true, kind: "create", entityType: "lead", mode: "create", message: "" });
      }
      if (action === "new-opportunity") {
        setDrawer({ open: true, kind: "create", entityType: "opportunity", mode: "create", message: "" });
      }
    });
  });
}

function renderNotice() {
  return state.notice ? `<div class="flash-banner">${state.notice}</div>` : "";
}

function formatAgentMission(agent, metrics) {
  if (agent.entity === "sector") {
    return agent.currentMission;
  }

  if (agent.entity === "lead") {
    return copy().meta.lang === "ar"
      ? `${metrics.targeted} ${displayStage("Targeted")} / ${metrics.qualified} ${displayStage("Qualified")}`
      : `${metrics.targeted} targeted / ${metrics.qualified} qualified`;
  }

  return copy().meta.lang === "ar"
    ? `${metrics.discoveries} ${getFieldLabel("discoveries", "Discoveries")} / ${formatCurrency(metrics.pipelineValue)}`
    : `${metrics.discoveries} discoveries / ${formatCurrency(metrics.pipelineValue)} pipeline`;
}

function renderOrganicLeadHuntingBoard() {
  const activeSector = getSectorById(state.data.weeklyFocus.active_sector_id) || state.data.sectors[0];
  const activeSectorId = activeSector?.id;
  
  const sectorLeads = state.data.leads.filter(l => l.sector_id === activeSectorId);
  const qualifiedLeads = sectorLeads.filter(l => l.current_stage === "Qualified" || l.current_stage === "Meeting Booked" || l.current_stage === "Handoff Sent");
  
  const sectorOpps = state.data.opportunities.filter(o => o.sector_id === activeSectorId);
  const opportunities = sectorOpps.filter(o => o.current_stage !== "Won" && o.current_stage !== "Lost");
  
  const definedChannels = getChannelOptions();
  const allChannels = definedChannels.length > 0 ? definedChannels : ["Email", "WhatsApp", "LinkedIn", "X/Twitter", "Google Inbound", "Competitor"];
  
  const activeChannelBlocks = [];
  const inactiveChannels = [];

  allChannels.forEach(channelKey => {
      const leadsInChannel = sectorLeads.filter(l => l.channel === channelKey);
      const oppsInChannel = sectorOpps.filter(o => {
          const originLead = getLeadById(o.origin_lead_id);
          return originLead?.channel === channelKey;
      });
      
      if (leadsInChannel.length === 0 && oppsInChannel.length === 0) {
          inactiveChannels.push(channelKey);
      } else {
          const totalSent = leadsInChannel.length; 
          const replies = leadsInChannel.filter(l => l.current_stage !== "Targeted" && l.current_stage !== "New").length;
          
          let queueItemsHtml = "";
          const activeQueueLeads = leadsInChannel.filter(l => !["Qualified", "Meeting Booked", "Handoff Sent", "Disqualified", "No Response"].includes(l.current_stage));
          
          if (activeQueueLeads.length === 0) {
              queueItemsHtml = `<div class="zero-state-placeholder">No pending actions</div>`;
          } else {
              queueItemsHtml = activeQueueLeads.map(l => {
                  let priority = "wait"; 
                  let label = "WAIT";
                  let actionText = l.next_step || l.company_name;
                  
                  if (["Targeted", "New"].includes(l.current_stage)) {
                      priority = "now"; label = "NOW"; actionText = "Send opener: " + l.company_name;
                  } else if (l.current_stage === "Replied" || (l.next_step && l.next_step.toLowerCase().includes("qualify"))) {
                      priority = "now"; label = "NOW"; actionText = "Qualify " + l.company_name;
                  } else if (["Engaged", "Negotiation"].includes(l.current_stage)) {
                      priority = "next"; label = "NEXT"; actionText = l.next_step || ("Follow up " + l.company_name);
                  }
                  
                  return `<div class="action-item"><span class="badge ${priority}">${label}</span> ${compactText(actionText, 35)}</div>`;
              }).join("");
          }

          const hasBottleneck = leadsInChannel.some(l => l.current_stage === "Delayed");
          const bottleneckHtml = hasBottleneck ? 
             `<div class="bottleneck">🔴 Attention Needed</div>` : 
             `<div class="bottleneck ok">🟢 Healthy</div>`;
             
          activeChannelBlocks.push(`
            <div class="channel-block">
              <div class="channel-head">${displayChannel(channelKey)} <span style="font-size: 0.8rem; font-weight: normal; color: var(--muted);">(${totalSent} leads)</span></div>
              <div class="channel-metrics meta-row">${totalSent} targeted | ${replies} engaged</div>
              ${bottleneckHtml}
              <div class="action-queue">${queueItemsHtml}</div>
            </div>
          `);
      }
  });

  const rawSignalsCount = sectorLeads.length;
  const highIntentCount = qualifiedLeads.length + opportunities.length;

  setScreenActions("");

  return `
    <div class="org-hunting-board">
      <div class="command-strip">
        <div class="target-block">
          <p class="eyebrow">Today Target &mdash; ${activeSector?.sector_name || "Any"} (Active Sources Only)</p>
          <div class="target-metrics">
            <span><strong>${rawSignalsCount}</strong> Signals</span>
            <span><strong>${highIntentCount}</strong> High Intent</span>
            <span><strong>${qualifiedLeads.length}</strong> Qual</span>
          </div>
        </div>
        <div class="sector-control">
          <p class="eyebrow">Sector Focus</p>
          <div class="sector-toggles" style="display: flex; gap: 8px;">
            ${state.data.sectors.map(s => `
              <button type="button" class="focus-chip ${s.id === activeSectorId ? 'active' : ''}" data-set-active="${s.id}" style="border:none; cursor:pointer;" title="${s.sector_name}">
                ${s.sector_name}
              </button>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="ops-layout">
        <aside class="left-rail">
          <div class="rail-section">
            <h4 class="rail-header">▼ Signal Triage</h4>
            <div class="triage-box">
               <div style="margin-bottom: 6px;"><span class="pill">${rawSignalsCount}</span> Raw Signals</div>
              <div style="margin-bottom: 12px;"><span class="pill danger">🔥 ${highIntentCount}</span> High Intent</div>
              <button class="ghost-button tight">Review High Intent</button>
            </div>
          </div>
          <div class="rail-section">
            <h4 class="rail-header">▼ Leads Qualified <span class="pill">${qualifiedLeads.length}</span></h4>
            <div class="rail-list">
              ${qualifiedLeads.length ? qualifiedLeads.map(l => `
                <div class="rail-item">
                  <strong>${l.company_name}</strong>
                  <div class="meta-row">↳ ${displayChannel(l.channel) || "Direct"}</div>
                </div>
              `).join('') : '<div class="zero-state-placeholder" style="min-height: 40px; border:none;">None</div>'}
            </div>
          </div>
          <div class="rail-section">
            <h4 class="rail-header">▼ Opportunities <span class="pill">${opportunities.length}</span></h4>
            <div class="rail-list">
              ${opportunities.length ? opportunities.map(o => {
                const originLead = getLeadById(o.origin_lead_id);
                return `
                <div class="rail-item">
                  <strong>${o.company_name}</strong>
                  <div class="meta-row">↳ ${displayChannel(originLead?.channel) || "Direct"}</div>
                </div>
                `
              }).join('') : '<div class="zero-state-placeholder" style="min-height: 40px; border:none;">None</div>'}
            </div>
          </div>
        </aside>

        <section class="main-execution-grid">
          <div class="channel-blocks">
            ${activeChannelBlocks.length ? activeChannelBlocks.join('') : '<div class="zero-state-placeholder" style="grid-column: 1 / -1; width: 100%;">No active channels heavily used in this sector.</div>'}
          </div>
          
          <details class="inactive-tray">
            <summary>▼ INACTIVE / UNUSED SOURCES (${activeSector?.sector_name || "Any"})</summary>
            <div class="tray-content" style="flex-wrap: wrap;">
              ${inactiveChannels.map(ch => `<span class="pill">${displayChannel(ch)}</span>`).join('')}
            </div>
          </details>
        </section>
      </div>
    </div>
  `;
}

function renderExecutiveScreen() {
  return renderOrganicLeadHuntingBoard();
}

function oldRenderExecutiveScreen() {
  const today = todayDate();
  const metrics = getMetrics(state.data, today);
  const queue = getTodayQueue(state.data, today);
  const queueGroups = ["Overdue", "Due Today", "Upcoming"];
  const agentSummaries = getAgentSummaries(state.data, today);
  const activeSector = getSectorById(state.data.weeklyFocus.active_sector_id);
  const sourceBreakdown = getSourceBreakdown().slice(0, 5);
  const sectorPressure = getSectorPressure();

  setScreenActions("");

  return `
    <section class="stat-strip">
      <article class="stat-card accent-stat"><span>${getFieldLabel("pipelineValue", "Pipeline Value")}</span><strong>${formatCurrency(metrics.pipelineValue)}</strong></article>
      <article class="stat-card"><span>${getFieldLabel("wins", "Wins")}</span><strong>${metrics.wins}</strong></article>
      <article class="stat-card"><span>${getFieldLabel("proposals", "Proposals")}</span><strong>${metrics.proposals}</strong></article>
      <article class="stat-card"><span>${getFieldLabel("demos", "Demos")}</span><strong>${metrics.demos}</strong></article>
      <article class="stat-card"><span>${getFieldLabel("qualified", "Qualified")}</span><strong>${metrics.qualified}</strong></article>
      <article class="stat-card"><span>${getFieldLabel("targeted", "Targeted")}</span><strong>${metrics.targeted}</strong></article>
    </section>

    <section class="hero-grid dense">
      <article class="hero-card accent">
        <p class="panel-label">${getFieldLabel("activeSector", "Active Sector")}</p>
        <h3 dir="${inferTextDirection(activeSector?.sector_name)}">${activeSector?.sector_name || getValueLabel("noActiveSector", "No active sector")}</h3>
        <p dir="${inferTextDirection(activeSector?.icp)}">${compactText(activeSector?.icp || getValueLabel("selectOneSector", "Select one sector only and focus it hard."), 88)}</p>
      </article>
      <article class="hero-card">
        <p class="panel-label">${getFieldLabel("currentOffer", "Current Offer")}</p>
        <h3 dir="${inferTextDirection(state.data.weeklyFocus.current_offer)}">${compactText(state.data.weeklyFocus.current_offer, 44)}</h3>
        <p dir="${inferTextDirection(activeSector?.offer_angle)}">${compactText(activeSector?.offer_angle || getValueLabel("noActiveOffer", "No active offer"), 72)}</p>
      </article>
      <article class="hero-card">
        <p class="panel-label">${getFieldLabel("weeklyTarget", "Weekly Target")}</p>
        <h3 dir="${inferTextDirection(state.data.weeklyFocus.weekly_target)}">${compactText(state.data.weeklyFocus.weekly_target, 58)}</h3>
        <p dir="${inferTextDirection(state.data.weeklyFocus.decisions_needed)}">${compactText(state.data.weeklyFocus.decisions_needed, 58)}</p>
      </article>
      <article class="hero-card danger">
        <p class="panel-label">${getFieldLabel("currentBottleneck", "Current Bottleneck")}</p>
        <h3>${displayBreakOption(metrics.breakSuggestion)}</h3>
        <p dir="${inferTextDirection(metrics.topObjection)}">${compactText(metrics.topObjection, 52)}</p>
      </article>
    </section>

    <section class="stat-strip secondary">
      <article class="stat-card"><span>${getFieldLabel("currentICP", "Current ICP")}</span><strong dir="${inferTextDirection(activeSector?.icp)}">${compactText(activeSector?.icp || "—", 64)}</strong></article>
      <article class="stat-card"><span>${getFieldLabel("decisionNeededToday", "Decision Needed Today")}</span><strong dir="${inferTextDirection(state.data.weeklyFocus.decisions_needed)}">${compactText(state.data.weeklyFocus.decisions_needed, 60)}</strong></article>
      <article class="stat-card"><span>${getFieldLabel("topObjection", "Top Objection")}</span><strong dir="${inferTextDirection(state.data.weeklyFocus.top_objection || metrics.topObjection)}">${compactText(state.data.weeklyFocus.top_objection || metrics.topObjection, 42)}</strong></article>
      <article class="stat-card"><span>${getFieldLabel("replyRate", "Reply Rate")}</span><strong>${Math.round(metrics.replyRate * 100)}%</strong></article>
    </section>

    <section class="ops-scan-grid">
      <article class="panel source-panel">
        <div class="panel-head">
          <div>
            <p class="panel-label">${copy().chrome.sections.sourceMixLabel || "Lead Sources"}</p>
            <h3>${copy().chrome.sections.sourceMixTitle || "Where usable leads are coming from"}</h3>
          </div>
        </div>
        <div class="source-list">
          ${
            sourceBreakdown.length
              ? sourceBreakdown
                  .map(
                    (entry) => `
                      <div class="source-row">
                        <div>
                          <strong>${displayChannel(entry.channel)}</strong>
                          <span>${getFieldLabel("source", "Source")}</span>
                        </div>
                        <span class="pill">${entry.count}</span>
                      </div>
                    `,
                  )
                  .join("")
              : renderEmptyState()
          }
        </div>
      </article>

      <article class="panel source-panel">
        <div class="panel-head">
          <div>
            <p class="panel-label">${copy().chrome.sections.focusSectorsLabel || "Priority Sectors"}</p>
            <h3>${copy().chrome.sections.focusSectorsTitle || "Where we should hunt this week"}</h3>
          </div>
        </div>
        <div class="sector-pressure-list">
          ${sectorPressure
            .map(
              ({ sector, liveLeads, liveOpportunities }) => `
                <div class="sector-pressure-row ${sector.is_active ? "active" : ""}">
                  <div>
                    <strong>${sector.sector_name}</strong>
                    <span>${displayPriority(sector.priority)} • ${displayStage(getComputedSectorStatus(sector, today))}</span>
                  </div>
                  <div class="pressure-metrics">
                    <small>${getFieldLabel("liveLeads", "Active leads")} ${liveLeads}</small>
                    <small>${getFieldLabel("liveOpportunities", "Active opportunities")} ${liveOpportunities}</small>
                  </div>
                </div>
              `,
            )
            .join("")}
        </div>
      </article>
    </section>

    <section class="section-heading">
      <div>
        <p class="panel-label">${copy().chrome.sections.agentStatusLabel}</p>
        <h3>${copy().chrome.sections.agentStatusTitle}</h3>
      </div>
    </section>

    <section class="agent-grid compact">
      ${agentSummaries
        .map(
          (agent) => `
            <article class="panel">
              <div class="panel-head">
                <div>
                  <p class="panel-label">${displayAgentKey(agent.key)}</p>
                  <h3>${displayAgentLabel(agent.key)}</h3>
                </div>
                <span class="pill">${getValueLabel("overdueCount", (count) => `${count} overdue`)(agent.overdue)}</span>
              </div>
              <p class="agent-mission">${formatAgentMission(agent, metrics)}</p>
              <div class="agent-stats">
                <div><span>${getFieldLabel("openItems", "Open items")}</span><strong>${agent.openItems}</strong></div>
                <div><span>${getFieldLabel("nextAction", "Next action")}</span><strong>${agent.nextAction === "No immediate next step" ? getValueLabel("noImmediateNextStep", "No immediate next step") : agent.nextAction}</strong></div>
              </div>
            </article>
          `,
        )
        .join("")}
    </section>

    <section class="section-heading">
      <div>
        <p class="panel-label">${copy().chrome.sections.todayQueueLabel}</p>
        <h3>${copy().chrome.sections.todayQueueTitle}</h3>
      </div>
    </section>

    <section class="queue-grid compact">
      ${queueGroups
        .map((bucket) => {
          const items = queue.filter((item) => item.bucket === bucket);
          return `
            <article class="panel">
              <div class="panel-head">
                <div>
                  <p class="panel-label">${copy().chrome.sections.todayQueueLabel}</p>
                  <h3>${displayQueueBucket(bucket)}</h3>
                </div>
                <span class="pill">${items.length}</span>
              </div>
              <div class="queue-list">
                ${
                  items.length
                    ? items
                        .map(
                          (item) => `
                            <button class="queue-item" type="button" data-open-record="${item.kind}:${item.id}">
                              <strong>${item.title}</strong>
                              <span class="queue-context" dir="auto">${getQueueContext(item)}</span>
                              <span class="queue-meta" dir="auto">${displayAgentKey(item.owner)} • ${displayStage(item.stage)}</span>
                              <bdi class="queue-action" dir="${inferTextDirection(item.next_step)}">${compactText(item.next_step, 42)}</bdi>
                              <small class="queue-date" dir="ltr">${shortDate(item.next_step_date)}</small>
                            </button>
                          `,
                        )
                        .join("")
                    : renderEmptyState()
                }
              </div>
            </article>
          `;
        })
        .join("")}
    </section>
  `;
}

function renderSectorScreen() {
  const sectors = getFilteredSectors();
  const selectedSector = sectors[0] || state.data.sectors[0];
  setScreenActions(`
    <button class="primary-button" type="button" data-action="new-sector">${copy().chrome.buttons.newSector}</button>
  `);

  return `
    <section class="list-detail-layout">
      <article class="panel">
        <div class="panel-head">
          <div>
            <p class="panel-label">${copy().chrome.sections.sectorListLabel}</p>
            <h3>${copy().chrome.sections.sectorListTitle}</h3>
          </div>
          <span class="pill">${sectors.length}</span>
        </div>
        <div class="stack-list">
          ${
            sectors.length
              ? sectors
                  .map((sector) => {
                    const computedStatus = getComputedSectorStatus(sector, todayDate());
                    return `
                      <button class="record-row" type="button" data-open-record="sector:${sector.id}">
                        <div>
                          <strong>${sector.sector_name}</strong>
                          <span>${displayPriority(sector.priority)} • ${displayStage(computedStatus)}</span>
                        </div>
                        <small>${getFieldLabel("score", "Score")} ${sector.score}</small>
                      </button>
                    `;
                  })
                  .join("")
              : renderEmptyState()
          }
        </div>
      </article>

      <article class="panel detail-panel">
        <div class="panel-head">
          <div>
            <p class="panel-label">${copy().chrome.sections.sectorDetailLabel}</p>
            <h3>${selectedSector?.sector_name || getValueLabel("noActiveSector", "No sector selected")}</h3>
          </div>
          ${
            selectedSector
              ? `<button class="ghost-button" type="button" data-set-active="${selectedSector.id}">${copy().chrome.buttons.setActive}</button>`
              : ""
          }
        </div>
        ${
          selectedSector
            ? `
              <div class="detail-grid">
                <div><span>${getFieldLabel("icp", "ICP")}</span><strong>${selectedSector.icp}</strong></div>
                <div><span>${getFieldLabel("pain", "Pain")}</span><strong>${selectedSector.pain}</strong></div>
                <div><span>${getFieldLabel("offerAngle", "Offer angle")}</span><strong>${selectedSector.offer_angle}</strong></div>
                <div><span>${getFieldLabel("urgencyAngle", "Urgency angle")}</span><strong>${selectedSector.urgency_angle}</strong></div>
                <div><span>${getFieldLabel("proofNeeded", "Proof needed")}</span><strong>${selectedSector.proof_needed}</strong></div>
                <div><span>${getFieldLabel("whyThisSector", "Why this sector")}</span><strong>${selectedSector.why_this_sector}</strong></div>
                <div><span>${getFieldLabel("whyNow", "Why now")}</span><strong>${selectedSector.why_now}</strong></div>
                <div><span>${getFieldLabel("disqualifyRules", "Disqualify rules")}</span><strong>${selectedSector.disqualify_rules}</strong></div>
                <div><span>${getFieldLabel("finalDecision", "Final decision")}</span><strong>${displayDecision(selectedSector.final_decision)}</strong></div>
                <div><span>${getFieldLabel("decisionBox", "Decision box")}</span><strong>${selectedSector.notes || getValueLabel("noAdditionalNote", "No additional note")}</strong></div>
              </div>
            `
            : renderEmptyState()
        }
      </article>
    </section>
  `;
}

function renderLeadCard(lead) {
  const sector = getSectorById(lead.sector_id);
  const computedStage = getComputedLeadStage(lead, todayDate());
  const guardFlags = getLeadGuardFlags(lead, todayDate());
  return `
    <button class="kanban-card" type="button" data-open-record="lead:${lead.id}">
      <div class="kanban-top">
        <div>
          <strong dir="${inferTextDirection(lead.company_name)}">${lead.company_name}</strong>
          <span class="mixed-meta" dir="auto">${sector?.sector_name || "—"} • ${displayAgentKey(lead.owner)}</span>
        </div>
        <span class="badge ${computedStage === "Delayed" ? "danger" : ""}">${displayStage(computedStage)}</span>
      </div>
      <div class="meta-list">
        <span class="mixed-meta" dir="auto">${lead.contact_name} • ${lead.role || getValueLabel("noRole", "No role")}</span>
        <span dir="auto"><span class="source-badge">${displayChannel(lead.channel)}</span> • ${getFieldLabel("score", "Score")} ${lead.lead_score || 0}</span>
        <span dir="auto">${displayUrgency(lead.urgency_level || "None")} • ${displayDecisionLevel(lead.decision_level || "Unknown")}</span>
      </div>
      ${
        guardFlags.length
          ? `<div class="guard-row">${guardFlags
              .map((flag) => `<span class="guard-pill ${flag.type}">${displayGuardFlag(flag.label)}</span>`)
              .join("")}</div>`
          : ""
      }
      <p class="card-summary" dir="${inferTextDirection(lead.pain_signal || lead.notes)}">${compactText(lead.pain_signal || lead.notes || getValueLabel("noSignalCaptured", "No signal captured yet."), 78)}</p>
      <div class="card-footer">
        <small dir="ltr">${getValueLabel("last", "Last")} ${shortDate(lead.last_contact_date)}</small>
        <small class="card-next" dir="${inferTextDirection(lead.next_step)}">${compactText(lead.next_step || "—", 40)} <span dir="ltr">${shortDate(lead.next_step_date)}</span></small>
      </div>
    </button>
  `;
}

function renderPipelineScreen() {
  const leads = getFilteredLeads();
  setScreenActions(`
    <button class="primary-button" type="button" data-action="new-lead">${copy().chrome.buttons.newLead}</button>
  `);

  return `
    <section class="kanban-board">
      ${LEAD_STAGES.map((stage) => {
        const items = leads.filter((lead) => getComputedLeadStage(lead, todayDate()) === stage);
        return `
          <article class="kanban-column">
            <header class="kanban-header">
              <div>
                <p class="panel-label">${getFieldLabel("leadStage", "Lead Stage")}</p>
                <h3>${displayStage(stage)}</h3>
              </div>
              <span class="pill">${items.length}</span>
            </header>
            <div class="kanban-stack">
              ${items.length ? items.map(renderLeadCard).join("") : renderEmptyState()}
            </div>
          </article>
        `;
      }).join("")}
    </section>
  `;
}

function renderOpportunityCard(opportunity) {
  const sector = getSectorById(opportunity.sector_id);
  const computedStage = getComputedOpportunityStage(opportunity, todayDate());
  const guardFlags = getOpportunityGuardFlags(opportunity, todayDate());
  return `
    <button class="kanban-card" type="button" data-open-record="opportunity:${opportunity.id}">
      <div class="kanban-top">
        <div>
          <strong dir="${inferTextDirection(opportunity.company_name)}">${opportunity.company_name}</strong>
          <span class="mixed-meta" dir="auto">${sector?.sector_name || "—"} • ${displayAgentKey(opportunity.owner)}</span>
        </div>
        <span class="badge ${computedStage === "Delayed" ? "danger" : ""}">${displayStage(computedStage)}</span>
      </div>
      <div class="meta-list">
        <span dir="ltr">${formatCurrency(opportunity.estimated_value)}</span>
        <span dir="${inferTextDirection(opportunity.buyer_readiness)}">${compactText(opportunity.buyer_readiness, 44)}</span>
        <span dir="${inferTextDirection(opportunity.stakeholder_status || getValueLabel("stakeholderPathUnclear", "Stakeholder path not clear"))}">${compactText(opportunity.stakeholder_status || getValueLabel("stakeholderPathUnclear", "Stakeholder path not clear"), 46)}</span>
      </div>
      ${
        guardFlags.length
          ? `<div class="guard-row">${guardFlags
              .map((flag) => `<span class="guard-pill ${flag.type}">${displayGuardFlag(flag.label)}</span>`)
              .join("")}</div>`
          : ""
      }
      <p class="card-summary" dir="${inferTextDirection(opportunity.pain_summary)}">${compactText(opportunity.pain_summary, 78)}</p>
      <div class="card-footer">
        <small dir="${inferTextDirection(opportunity.objection_summary)}">${compactText(opportunity.objection_summary || getValueLabel("noObjectionLogged", "No objection logged"), 48)}</small>
        <small class="card-next" dir="${inferTextDirection(opportunity.next_step)}">${compactText(opportunity.next_step, 40)} <span dir="ltr">${shortDate(opportunity.next_step_date)}</span></small>
      </div>
    </button>
  `;
}

function renderOpportunityScreen() {
  const opportunities = getFilteredOpportunities();
  setScreenActions(`
    <button class="primary-button" type="button" data-action="new-opportunity">${copy().chrome.buttons.newOpportunity}</button>
  `);

  return `
    <section class="kanban-board">
      ${OPPORTUNITY_STAGES.map((stage) => {
        const items = opportunities.filter(
          (opportunity) => getComputedOpportunityStage(opportunity, todayDate()) === stage,
        );
        return `
          <article class="kanban-column">
            <header class="kanban-header">
              <div>
                <p class="panel-label">${getFieldLabel("opportunityStage", "Opportunity Stage")}</p>
                <h3>${displayStage(stage)}</h3>
              </div>
              <span class="pill">${items.length}</span>
            </header>
            <div class="kanban-stack">
              ${items.length ? items.map(renderOpportunityCard).join("") : renderEmptyState()}
            </div>
          </article>
        `;
      }).join("")}
    </section>
  `;
}

function renderBottleneckScreen() {
  const metrics = getMetrics(state.data, todayDate());
  const funnelStages = [
    ["Targeted", metrics.targeted],
    ["Contacted", metrics.contacted],
    ["Qualified", metrics.qualified],
    ["Discoveries", metrics.discoveries],
    ["Demos", metrics.demos],
    ["Proposals", metrics.proposals],
    ["Wins", metrics.wins],
  ];
  const maxValue = Math.max(...funnelStages.map(([, value]) => value), 1);
  const delayedCounts = [
    ...state.data.leads.filter((lead) => getComputedLeadStage(lead, todayDate()) === "Delayed"),
    ...state.data.opportunities.filter(
      (opportunity) => getComputedOpportunityStage(opportunity, todayDate()) === "Delayed",
    ),
  ];

  setScreenActions("");

  return `
    <section class="stat-strip">
      <article class="stat-card"><span>${getFieldLabel("targeted", "Targeted")}</span><strong>${metrics.targeted}</strong></article>
      <article class="stat-card"><span>${getFieldLabel("contacted", "Contacted")}</span><strong>${metrics.contacted}</strong></article>
      <article class="stat-card"><span>${getFieldLabel("replyRate", "Reply rate")}</span><strong>${Math.round(metrics.replyRate * 100)}%</strong></article>
      <article class="stat-card"><span>${getFieldLabel("qualified", "Qualified")}</span><strong>${metrics.qualified}</strong></article>
      <article class="stat-card"><span>${getFieldLabel("meetingConversion", "Meeting conversion")}</span><strong>${Math.round(metrics.meetingConversion * 100)}%</strong></article>
      <article class="stat-card"><span>${getFieldLabel("pipelineValue", "Pipeline value")}</span><strong>${formatCurrency(metrics.pipelineValue)}</strong></article>
    </section>

    <section class="bottleneck-layout">
      <article class="panel">
        <div class="panel-head">
          <div>
            <p class="panel-label">${copy().chrome.sections.funnelLabel}</p>
            <h3>${copy().chrome.sections.funnelTitle}</h3>
          </div>
        </div>
        <div class="funnel-list">
          ${funnelStages
            .map(
              ([label, value]) => `
                <div class="funnel-row">
                  <span>${label === "Discoveries" ? getFieldLabel("discoveries", "Discoveries") : displayStage(label)}</span>
                  <div class="bar-track">
                    <div class="bar-fill" style="width:${(value / maxValue) * 100}%"></div>
                  </div>
                  <strong>${value}</strong>
                </div>
              `,
            )
            .join("")}
        </div>
      </article>

      <article class="panel">
        <div class="panel-head">
          <div>
            <p class="panel-label">${copy().chrome.sections.breakLabel}</p>
            <h3>${displayBreakOption(metrics.breakSuggestion)}</h3>
          </div>
          <span class="pill">${getValueLabel("delayedCount", (count) => `${count} delayed`)(delayedCounts.length)}</span>
        </div>
        <div class="break-grid">
          ${BREAK_OPTIONS.map(
            (option) => `
              <div class="break-option ${option === metrics.breakSuggestion ? "active" : ""}">
                ${displayBreakOption(option)}
              </div>
            `,
          ).join("")}
        </div>
        <div class="detail-grid tight">
          <div><span>${getFieldLabel("topRepeatedObjection", "Top repeated objection")}</span><strong>${metrics.topObjection}</strong></div>
          <div><span>${getFieldLabel("mostDelayedStage", "Most delayed stage")}</span><strong>${metrics.mostDelayedStage === "No delayed stage" ? getValueLabel("noDelayedStage", "No delayed stage") : displayStage(metrics.mostDelayedStage)}</strong></div>
          <div><span>${getFieldLabel("proposals", "Proposals")}</span><strong>${metrics.proposals}</strong></div>
          <div><span>${getFieldLabel("wins", "Wins")}</span><strong>${metrics.wins}</strong></div>
        </div>
      </article>
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
        <label><span>${getFieldLabel("owner", "Owner")}</span><input name="owner" value="${sector.owner || ""}" /></label>
        <label><span>${getFieldLabel("nextStep", "Next Step")}</span><input name="next_step" value="${sector.next_step || ""}" /></label>
        <label><span>${getFieldLabel("nextStepDate", "Next Step Date")}</span><input type="date" name="next_step_date" value="${sector.next_step_date || ""}" /></label>
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
  const eligibleForOpportunity = lead.current_stage === "Handoff Sent" && lead.handoff_summary;
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
      ${fieldRow(getFieldLabel("owner", "Owner"), displayAgentKey(lead.owner))}
      ${fieldRow(getFieldLabel("score", "Score"), lead.lead_score)}
      ${fieldRow(getFieldLabel("painSignal", "Pain Signal"), lead.pain_signal)}
      ${fieldRow(getFieldLabel("interestType", "Interest Type"), displayInterestType(lead.interest_type))}
      ${fieldRow(getFieldLabel("currentStage", "Current Stage"), displayStage(computedStage))}
      ${fieldRow(getFieldLabel("shortNote", "Short Note"), lead.notes)}
      ${fieldRow(getFieldLabel("handoffSummary", "Handoff Summary"), lead.handoff_summary || getValueLabel("notReadyYet", "Not ready yet"))}
    </section>
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
        <label>
          <span>${getFieldLabel("owner", "Owner")}</span>
          <select name="owner">
            ${AGENTS.filter((agent) => agent.entity === "lead")
              .map(
                (agent) =>
                  `<option value="${agent.key}" ${agent.key === lead.owner ? "selected" : ""}>${displayAgentKey(agent.key)}</option>`,
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
        <label>
          <span>${getFieldLabel("owner", "Owner")}</span>
          <select name="owner">
            ${AGENTS.filter((agent) => agent.entity === "opportunity")
              .map(
                (agent) =>
                  `<option value="${agent.key}" ${agent.key === opportunity.owner ? "selected" : ""}>${displayAgentKey(agent.key)}</option>`,
              )
              .join("")}
          </select>
        </label>
        <label><span>${getFieldLabel("nextStep", "Next Step")}</span><input name="next_step" value="${opportunity.next_step || ""}" /></label>
        <label><span>${getFieldLabel("nextStepDate", "Next Step Date")}</span><input type="date" name="next_step_date" value="${opportunity.next_step_date || ""}" /></label>
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
          <label><span>${getFormLabel("owner", "owner")}</span><select name="owner"><option value="Agent 1">${displayAgentKey("Agent 1")}</option></select></label>
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
    return `
      <section class="drawer-section">
        <h4>${copy().chrome.forms.createLead}</h4>
        <form data-create-form="lead">
          <label><span>${getFormLabel("companyName", "company_name")}</span><input name="company_name" required /></label>
          <label><span>${getFormLabel("sectorId", "sector_id")}</span><select name="sector_id">${activeSectors.map((sector) => `<option value="${sector.id}">${sector.sector_name}</option>`).join("")}</select></label>
          <label><span>${getFormLabel("contactName", "contact_name")}</span><input name="contact_name" required /></label>
          <label><span>${getFormLabel("role", "role")}</span><input name="role" /></label>
          <label><span>${getFieldLabel("channel", "Channel")}</span><select name="channel">${getChannelOptions()
            .map((channel) => `<option value="${channel}">${displayChannel(channel)}</option>`)
            .join("")}</select></label>
          <label><span>${getFormLabel("owner", "owner")}</span><select name="owner"><option value="Agent 2">${displayAgentKey("Agent 2")}</option></select></label>
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
    (lead) => lead.current_stage === "Handoff Sent" && lead.handoff_summary,
  );

  return `
    <section class="drawer-section">
      <h4>${copy().chrome.forms.createOpportunity}</h4>
      <form data-create-form="opportunity">
        <label><span>${getFormLabel("originLeadId", "origin_lead_id")}</span><select name="origin_lead_id">${eligibleLeads.map((lead) => `<option value="${lead.id}">${lead.company_name}</option>`).join("")}</select></label>
        <label><span>${getFormLabel("companyName", "company_name")}</span><input name="company_name" required /></label>
        <label><span>${getFormLabel("sectorId", "sector_id")}</span><select name="sector_id">${state.data.sectors.map((sector) => `<option value="${sector.id}">${sector.sector_name}</option>`).join("")}</select></label>
        <label><span>${getFormLabel("owner", "owner")}</span><select name="owner"><option value="Agent 3">${displayAgentKey("Agent 3")}</option></select></label>
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

function patchEntity(entityType, entityId, patch) {
  const nextData = deepClone(state.data);
  const collectionKey =
    entityType === "sector" ? "sectors" : entityType === "lead" ? "leads" : "opportunities";
  const index = nextData[collectionKey].findIndex((item) => item.id === entityId);
  nextData[collectionKey][index] = {
    ...nextData[collectionKey][index],
    ...patch,
    stage_updated_at:
      entityType !== "sector" && patch.current_stage ? todayDate() : nextData[collectionKey][index].stage_updated_at,
  };
  setData(nextData);
}

function saveSectorForm(form) {
  const entityId = form.dataset.entityId;
  const patch = readFormValues(form);
  patch.notes = patch.notes || "";
  patch.owner = patch.owner || "Agent 1";
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

  patchEntity("sector", entityId, patch);
  setDrawer({ message: copy().messages.notices.sectorUpdated });
  renderApp();
}

function saveLeadForm(form) {
  const entityId = form.dataset.entityId;
  const existing = state.data.leads.find((lead) => lead.id === entityId);
  const patch = { ...existing, ...readFormValues(form) };
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

  patchEntity("lead", entityId, patch);
  setDrawer({ message: copy().messages.notices.leadUpdated });
  renderApp();
}

function saveOpportunityForm(form) {
  const entityId = form.dataset.entityId;
  const existing = state.data.opportunities.find((opportunity) => opportunity.id === entityId);
  const patch = { ...existing, ...readFormValues(form) };
  patch.estimated_value = existing.estimated_value;
  patch.stakeholder_map = existing.stakeholder_map;
  patch.close_probability = existing.close_probability;
  patch.risk_flag = existing.risk_flag;
  patch.decision_status = existing.decision_status;
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

  patchEntity("opportunity", entityId, patch);
  setDrawer({ message: copy().messages.notices.opportunityUpdated });
  renderApp();
}

function createEntity(entityType, form) {
  const values = readFormValues(form);
  const nextData = deepClone(state.data);

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
      owner: values.owner,
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
    nextData.sectors.unshift(draft);
    setData(
      draft.is_active ? enforceSingleActiveSector(nextData, draft.id) : nextData,
      copy().messages.notices.sectorCreated,
    );
  }

  if (entityType === "lead") {
    const sector = nextData.sectors.find((item) => item.id === values.sector_id);
    if (!sector?.is_active) {
      setDrawer({ message: localizeMessage("Agent 2 can only create new leads for the active sector.") });
      return;
    }
    const draft = {
      id: `lead-${crypto.randomUUID().slice(0, 8)}`,
      company_name: values.company_name,
      sector_id: values.sector_id,
      contact_name: values.contact_name,
      role: values.role,
      channel: values.channel,
      owner: values.owner,
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
    nextData.leads.unshift(draft);
    setData(nextData, copy().messages.notices.leadCreated);
  }

  if (entityType === "opportunity") {
    const sourceLead = nextData.leads.find((lead) => lead.id === values.origin_lead_id);
    if (!sourceLead || sourceLead.current_stage !== "Handoff Sent" || !sourceLead.handoff_summary) {
      setDrawer({ message: localizeMessage("Opportunity can only be created from a Handoff Sent lead.") });
      return;
    }
    const draft = {
      id: `opp-${crypto.randomUUID().slice(0, 8)}`,
      origin_lead_id: values.origin_lead_id,
      company_name: values.company_name,
      sector_id: values.sector_id,
      owner: values.owner,
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
    nextData.opportunities.unshift(draft);
    setData(nextData, copy().messages.notices.opportunityCreated);
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
    setDrawer({ message: localizeMessage("Lead must be Handoff Sent with a handoff summary first.") });
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
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (form.dataset.saveForm === "sector") saveSectorForm(form);
      if (form.dataset.saveForm === "lead") saveLeadForm(form);
      if (form.dataset.saveForm === "opportunity") saveOpportunityForm(form);
    });
  });

  elements.drawerBody.querySelectorAll("[data-create-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      createEntity(form.dataset.createForm, form);
    });
  });

  elements.drawerBody.querySelectorAll("[data-set-active]").forEach((button) => {
    button.addEventListener("click", () => {
      setData(
        enforceSingleActiveSector(state.data, button.dataset.setActive),
        copy().messages.notices.activeSectorUpdated,
      );
      setDrawer({ message: copy().messages.notices.activeSectorUpdated });
      renderApp();
    });
  });

  elements.drawerBody.querySelectorAll("[data-convert-lead]").forEach((button) => {
    button.addEventListener("click", () => convertLeadToOpportunity(button.dataset.convertLead));
  });
}

function bindRecordOpeners() {
  elements.content.querySelectorAll("[data-open-record]").forEach((button) => {
    button.addEventListener("click", () => {
      const [entityType, entityId] = button.dataset.openRecord.split(":");
      setDrawer({ open: true, kind: "detail", entityType, entityId, mode: "view", message: "" });
    });
  });

  elements.content.querySelectorAll("[data-set-active]").forEach((button) => {
    button.addEventListener("click", () => {
      setData(
        enforceSingleActiveSector(state.data, button.dataset.setActive),
        copy().messages.notices.activeSectorUpdated,
      );
      renderApp();
    });
  });
}

function renderScreen() {
  const title = copy().chrome.screens[state.activeScreen];
  elements.screenTitle.textContent = title;

  let screenHtml = "";
  if (state.activeScreen === "executive") {
    screenHtml = renderExecutiveScreen();
  }
  if (state.activeScreen === "sectors") {
    screenHtml = renderSectorScreen();
  }
  if (state.activeScreen === "pipeline") {
    screenHtml = renderPipelineScreen();
  }
  if (state.activeScreen === "opportunities") {
    screenHtml = renderOpportunityScreen();
  }
  if (state.activeScreen === "bottleneck") {
    screenHtml = renderBottleneckScreen();
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
  elements.sidebarWeeklyLabel.textContent = copy().chrome.sidebar.weeklyFocusLabel;
  elements.sidebarRulesLabel.textContent = copy().chrome.sidebar.rulesLabel;
  elements.rulesList.innerHTML = copy().chrome.sidebar.rules.map((rule) => `<li>${rule}</li>`).join("");
  elements.topbarEyebrow.textContent = copy().meta.dashboardEyebrow;
  elements.drawerClose.setAttribute(
    "aria-label",
    copy().meta.lang === "ar" ? "إغلاق اللوحة" : "Close drawer",
  );
}

function bootstrapApp({ locale = "en", localeConfig = FALLBACK_COPY, storageKey = "" } = {}) {
  document.documentElement.classList.remove("app-pending");
  document.documentElement.classList.add("app-ready");

  state.locale = locale;
  state.copy = localeConfig;
  state.storage.key = storageKey;
  state.data = loadInitialDashboardState();

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
  renderApp();
}

export { bootstrapApp };
