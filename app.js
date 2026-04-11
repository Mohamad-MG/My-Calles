import {
  AGENTS,
  BREAK_OPTIONS,
  LEAD_STAGES,
  OPPORTUNITY_STAGES,
  STORAGE_KEY,
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
  { key: "executive", label: "Executive Focus" },
  { key: "sectors", label: "Sector & Offer Board" },
  { key: "pipeline", label: "Pipeline Board" },
  { key: "opportunities", label: "Opportunity Board" },
  { key: "bottleneck", label: "Bottleneck & Performance" },
];

const state = {
  data: createSeedData(),
  activeScreen: "executive",
  filters: {
    sector: "all",
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
    available: true,
    source: "seed",
    lastSavedAt: null,
  },
};

let elements = null;

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

function persistDashboardState() {
  if (!state.storage.available) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, serializeDashboardState(state.data));
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
    return createSeedData();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    state.storage.source = "seed";
    return createSeedData();
  }

  const hydrated = hydrateDashboardState(raw);
  state.storage.source = "local";
  if (hydrated.recovered) {
    setNotice("Saved state was invalid, so the dashboard recovered to a safe seed state.");
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
    window.localStorage.removeItem(STORAGE_KEY);
    state.storage.lastSavedAt = null;
    state.storage.source = "seed";
  }

  state.data = normalizeDashboardState(createSeedData());
  if (!clearStorage) {
    persistDashboardState();
  }
}

state.data = loadInitialDashboardState();

function formatDate(dateValue) {
  if (!dateValue) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${dateValue}T12:00:00`));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
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

  return new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${dateValue}T12:00:00`));
}

function getSectorById(sectorId) {
  return state.data.sectors.find((sector) => sector.id === sectorId);
}

function getFilteredLeads() {
  const today = todayDate();
  return state.data.leads.filter((lead) => {
    const computedStage = getComputedLeadStage(lead, today);
    const sector = getSectorById(lead.sector_id);
    const matchesSector =
      state.filters.sector === "all" || sector?.id === state.filters.sector;
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
    return matchesSector && matchesOwner && matchesStage && matchesUrgency && matchesOverdue;
  });
}

function getFilteredOpportunities() {
  const today = todayDate();
  return state.data.opportunities.filter((opportunity) => {
    const computedStage = getComputedOpportunityStage(opportunity, today);
    const sector = getSectorById(opportunity.sector_id);
    const matchesSector =
      state.filters.sector === "all" || sector?.id === state.filters.sector;
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
    return matchesSector && matchesOwner && matchesStage && matchesUrgency && matchesOverdue;
  });
}

function getFilteredSectors() {
  const today = todayDate();
  return state.data.sectors.filter((sector) => {
    const computedStatus = getComputedSectorStatus(sector, today);
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
    return matchesSector && matchesOwner && matchesStage && matchesUrgency && matchesOverdue;
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
        ${screen.label}
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
    <div class="focus-chip">${activeSector?.sector_name || "No active sector"}</div>
    <p class="sidebar-copy">${state.data.weeklyFocus.current_offer}</p>
    <p class="sidebar-note">${state.data.weeklyFocus.weekly_target}</p>
  `;
}

function renderFilters() {
  const sectorOptions = state.data.sectors
    .map((sector) => `<option value="${sector.id}">${sector.sector_name}</option>`)
    .join("");
  const stageOptions = [...new Set([...LEAD_STAGES, ...OPPORTUNITY_STAGES, "Active", "Testing", "Paused", "Rejected"])]
    .map((stage) => `<option value="${stage}">${stage}</option>`)
    .join("");

  elements.filters.innerHTML = `
    <label>
      <span>Sector</span>
      <select data-filter="sector">
        <option value="all">All</option>
        ${sectorOptions}
      </select>
    </label>
    <label>
      <span>Owner</span>
      <select data-filter="owner">
        <option value="all">All</option>
        <option value="Agent 1">Agent 1</option>
        <option value="Agent 2">Agent 2</option>
        <option value="Agent 3">Agent 3</option>
      </select>
    </label>
    <label>
      <span>Stage / Status</span>
      <select data-filter="stage">
        <option value="all">All</option>
        ${stageOptions}
      </select>
    </label>
    <label>
      <span>Urgency</span>
      <select data-filter="urgency">
        <option value="all">All</option>
        <option value="High">High</option>
        <option value="Medium">Medium</option>
        <option value="Low">Low</option>
      </select>
    </label>
    <label>
      <span>Overdue</span>
      <select data-filter="overdue">
        <option value="all">All</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
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
      ? `Saved locally ${state.storage.lastSavedAt}`
      : state.storage.source === "local"
        ? "Local state loaded"
        : "Seed mode"
    : "Memory only";

  elements.screenActions.innerHTML = `
    <span class="storage-pill ${state.storage.available ? "" : "warning"}">${storageLabel}</span>
    <button class="ghost-button" type="button" data-action="restore-seed">Restore Seed</button>
    <button class="ghost-button" type="button" data-action="reset-local">Reset Local</button>
    ${html}
  `;
}

function attachActionListeners() {
  elements.screenActions.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "restore-seed") {
        resetToSeed();
        setNotice("Seed data restored and saved locally.");
        renderApp();
      }
      if (action === "reset-local") {
        resetToSeed({ clearStorage: true });
        setNotice("Local saved state cleared. Dashboard returned to fresh seed mode.");
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

function renderExecutiveScreen() {
  const today = todayDate();
  const metrics = getMetrics(state.data, today);
  const queue = getTodayQueue(state.data, today);
  const queueGroups = ["Overdue", "Due Today", "Upcoming"];
  const agentSummaries = getAgentSummaries(state.data, today);
  const activeSector = getSectorById(state.data.weeklyFocus.active_sector_id);

  setScreenActions("");

  return `
    <section class="stat-strip">
      <article class="stat-card accent-stat"><span>Pipeline Value</span><strong>${formatCurrency(metrics.pipelineValue)}</strong></article>
      <article class="stat-card"><span>Wins</span><strong>${metrics.wins}</strong></article>
      <article class="stat-card"><span>Proposals</span><strong>${metrics.proposals}</strong></article>
      <article class="stat-card"><span>Demos</span><strong>${metrics.demos}</strong></article>
      <article class="stat-card"><span>Qualified</span><strong>${metrics.qualified}</strong></article>
      <article class="stat-card"><span>Targeted</span><strong>${metrics.targeted}</strong></article>
    </section>

    <section class="hero-grid dense">
      <article class="hero-card accent">
        <p class="panel-label">Active Sector</p>
        <h3 dir="${inferTextDirection(activeSector?.sector_name)}">${activeSector?.sector_name || "No active sector"}</h3>
        <p dir="${inferTextDirection(activeSector?.icp)}">${compactText(activeSector?.icp || "Select one sector only and focus it hard.", 88)}</p>
      </article>
      <article class="hero-card">
        <p class="panel-label">Current Offer</p>
        <h3 dir="${inferTextDirection(state.data.weeklyFocus.current_offer)}">${compactText(state.data.weeklyFocus.current_offer, 44)}</h3>
        <p dir="${inferTextDirection(activeSector?.offer_angle)}">${compactText(activeSector?.offer_angle || "No active offer", 72)}</p>
      </article>
      <article class="hero-card">
        <p class="panel-label">Weekly Target</p>
        <h3 dir="${inferTextDirection(state.data.weeklyFocus.weekly_target)}">${compactText(state.data.weeklyFocus.weekly_target, 58)}</h3>
        <p dir="${inferTextDirection(state.data.weeklyFocus.decisions_needed)}">${compactText(state.data.weeklyFocus.decisions_needed, 58)}</p>
      </article>
      <article class="hero-card danger">
        <p class="panel-label">Current Bottleneck</p>
        <h3>${metrics.breakSuggestion}</h3>
        <p dir="${inferTextDirection(metrics.topObjection)}">${compactText(metrics.topObjection, 52)}</p>
      </article>
    </section>

    <section class="stat-strip secondary">
      <article class="stat-card"><span>Current ICP</span><strong dir="${inferTextDirection(activeSector?.icp)}">${compactText(activeSector?.icp || "—", 64)}</strong></article>
      <article class="stat-card"><span>Decision Needed Today</span><strong dir="${inferTextDirection(state.data.weeklyFocus.decisions_needed)}">${compactText(state.data.weeklyFocus.decisions_needed, 60)}</strong></article>
      <article class="stat-card"><span>Top Objection</span><strong dir="${inferTextDirection(state.data.weeklyFocus.top_objection || metrics.topObjection)}">${compactText(state.data.weeklyFocus.top_objection || metrics.topObjection, 42)}</strong></article>
      <article class="stat-card"><span>Reply Rate</span><strong>${Math.round(metrics.replyRate * 100)}%</strong></article>
    </section>

    <section class="section-heading">
      <div>
        <p class="panel-label">Agent Status</p>
        <h3>Daily agent operating view</h3>
      </div>
    </section>

    <section class="agent-grid compact">
      ${agentSummaries
        .map(
          (agent) => `
            <article class="panel">
              <div class="panel-head">
                <div>
                  <p class="panel-label">${agent.key}</p>
                  <h3>${agent.label}</h3>
                </div>
                <span class="pill">${agent.overdue} overdue</span>
              </div>
              <p class="agent-mission">${agent.currentMission}</p>
              <div class="agent-stats">
                <div><span>Open items</span><strong>${agent.openItems}</strong></div>
                <div><span>Next action</span><strong>${agent.nextAction}</strong></div>
              </div>
            </article>
          `,
        )
        .join("")}
    </section>

    <section class="section-heading">
      <div>
        <p class="panel-label">Today Queue</p>
        <h3>What must move today</h3>
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
                  <p class="panel-label">Today Queue</p>
                  <h3>${bucket}</h3>
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
                              <span class="queue-meta" dir="ltr">${item.owner} • ${item.stage}</span>
                              <bdi class="queue-action" dir="${inferTextDirection(item.next_step)}">${compactText(item.next_step, 42)}</bdi>
                              <small class="queue-date" dir="ltr">${shortDate(item.next_step_date)}</small>
                            </button>
                          `,
                        )
                        .join("")
                    : elements.emptyTemplate.innerHTML
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
    <button class="primary-button" type="button" data-action="new-sector">New Sector</button>
  `);

  return `
    <section class="list-detail-layout">
      <article class="panel">
        <div class="panel-head">
          <div>
            <p class="panel-label">Sector List</p>
            <h3>Focus sectors</h3>
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
                          <span>${sector.priority} • ${computedStatus}</span>
                        </div>
                        <small>Score ${sector.score}</small>
                      </button>
                    `;
                  })
                  .join("")
              : elements.emptyTemplate.innerHTML
          }
        </div>
      </article>

      <article class="panel detail-panel">
        <div class="panel-head">
          <div>
            <p class="panel-label">Sector Detail</p>
            <h3>${selectedSector?.sector_name || "No sector selected"}</h3>
          </div>
          ${
            selectedSector
              ? `<button class="ghost-button" type="button" data-set-active="${selectedSector.id}">Set as Active</button>`
              : ""
          }
        </div>
        ${
          selectedSector
            ? `
              <div class="detail-grid">
                <div><span>ICP</span><strong>${selectedSector.icp}</strong></div>
                <div><span>Pain</span><strong>${selectedSector.pain}</strong></div>
                <div><span>Offer angle</span><strong>${selectedSector.offer_angle}</strong></div>
                <div><span>Urgency angle</span><strong>${selectedSector.urgency_angle}</strong></div>
                <div><span>Proof needed</span><strong>${selectedSector.proof_needed}</strong></div>
                <div><span>Why this sector</span><strong>${selectedSector.why_this_sector}</strong></div>
                <div><span>Why now</span><strong>${selectedSector.why_now}</strong></div>
                <div><span>Disqualify rules</span><strong>${selectedSector.disqualify_rules}</strong></div>
                <div><span>Final decision</span><strong>${selectedSector.final_decision}</strong></div>
                <div><span>Decision box</span><strong>${selectedSector.notes || "No additional note"}</strong></div>
              </div>
            `
            : elements.emptyTemplate.innerHTML
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
          <span class="mixed-meta" dir="auto">${sector?.sector_name || "—"} • ${lead.owner}</span>
        </div>
        <span class="badge ${computedStage === "Delayed" ? "danger" : ""}">${computedStage}</span>
      </div>
      <div class="meta-list">
        <span class="mixed-meta" dir="auto">${lead.contact_name} • ${lead.role || "No role"}</span>
        <span dir="ltr">${lead.channel} • Score ${lead.lead_score || 0}</span>
        <span dir="ltr">${lead.urgency_level || "No urgency"} • ${lead.decision_level || "No decision level"}</span>
      </div>
      ${
        guardFlags.length
          ? `<div class="guard-row">${guardFlags
              .map((flag) => `<span class="guard-pill ${flag.type}">${flag.label}</span>`)
              .join("")}</div>`
          : ""
      }
      <p class="card-summary" dir="${inferTextDirection(lead.pain_signal || lead.notes)}">${compactText(lead.pain_signal || lead.notes || "No signal captured yet.", 78)}</p>
      <div class="card-footer">
        <small dir="ltr">Last ${shortDate(lead.last_contact_date)}</small>
        <small class="card-next" dir="${inferTextDirection(lead.next_step)}">${compactText(lead.next_step || "—", 40)} <span dir="ltr">${shortDate(lead.next_step_date)}</span></small>
      </div>
    </button>
  `;
}

function renderPipelineScreen() {
  const leads = getFilteredLeads();
  setScreenActions(`
    <button class="primary-button" type="button" data-action="new-lead">New Lead</button>
  `);

  return `
    <section class="kanban-board">
      ${LEAD_STAGES.map((stage) => {
        const items = leads.filter((lead) => getComputedLeadStage(lead, todayDate()) === stage);
        return `
          <article class="kanban-column">
            <header class="kanban-header">
              <div>
                <p class="panel-label">Lead Stage</p>
                <h3>${stage}</h3>
              </div>
              <span class="pill">${items.length}</span>
            </header>
            <div class="kanban-stack">
              ${items.length ? items.map(renderLeadCard).join("") : elements.emptyTemplate.innerHTML}
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
          <span class="mixed-meta" dir="auto">${sector?.sector_name || "—"} • ${opportunity.owner}</span>
        </div>
        <span class="badge ${computedStage === "Delayed" ? "danger" : ""}">${computedStage}</span>
      </div>
      <div class="meta-list">
        <span dir="ltr">${formatCurrency(opportunity.estimated_value)}</span>
        <span dir="${inferTextDirection(opportunity.buyer_readiness)}">${compactText(opportunity.buyer_readiness, 44)}</span>
        <span dir="${inferTextDirection(opportunity.stakeholder_status || "Stakeholder path not clear")}">${compactText(opportunity.stakeholder_status || "Stakeholder path not clear", 46)}</span>
      </div>
      ${
        guardFlags.length
          ? `<div class="guard-row">${guardFlags
              .map((flag) => `<span class="guard-pill ${flag.type}">${flag.label}</span>`)
              .join("")}</div>`
          : ""
      }
      <p class="card-summary" dir="${inferTextDirection(opportunity.pain_summary)}">${compactText(opportunity.pain_summary, 78)}</p>
      <div class="card-footer">
        <small dir="${inferTextDirection(opportunity.objection_summary)}">${compactText(opportunity.objection_summary || "No objection logged", 48)}</small>
        <small class="card-next" dir="${inferTextDirection(opportunity.next_step)}">${compactText(opportunity.next_step, 40)} <span dir="ltr">${shortDate(opportunity.next_step_date)}</span></small>
      </div>
    </button>
  `;
}

function renderOpportunityScreen() {
  const opportunities = getFilteredOpportunities();
  setScreenActions(`
    <button class="primary-button" type="button" data-action="new-opportunity">New Opportunity</button>
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
                <p class="panel-label">Opportunity Stage</p>
                <h3>${stage}</h3>
              </div>
              <span class="pill">${items.length}</span>
            </header>
            <div class="kanban-stack">
              ${items.length ? items.map(renderOpportunityCard).join("") : elements.emptyTemplate.innerHTML}
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
      <article class="stat-card"><span>Targeted</span><strong>${metrics.targeted}</strong></article>
      <article class="stat-card"><span>Contacted</span><strong>${metrics.contacted}</strong></article>
      <article class="stat-card"><span>Reply rate</span><strong>${Math.round(metrics.replyRate * 100)}%</strong></article>
      <article class="stat-card"><span>Qualified</span><strong>${metrics.qualified}</strong></article>
      <article class="stat-card"><span>Meeting conversion</span><strong>${Math.round(metrics.meetingConversion * 100)}%</strong></article>
      <article class="stat-card"><span>Pipeline value</span><strong>${formatCurrency(metrics.pipelineValue)}</strong></article>
    </section>

    <section class="bottleneck-layout">
      <article class="panel">
        <div class="panel-head">
          <div>
            <p class="panel-label">Funnel conversion</p>
            <h3>From outreach to revenue</h3>
          </div>
        </div>
        <div class="funnel-list">
          ${funnelStages
            .map(
              ([label, value]) => `
                <div class="funnel-row">
                  <span>${label}</span>
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
            <p class="panel-label">Where is the break?</p>
            <h3>${metrics.breakSuggestion}</h3>
          </div>
          <span class="pill">${delayedCounts.length} delayed</span>
        </div>
        <div class="break-grid">
          ${BREAK_OPTIONS.map(
            (option) => `
              <div class="break-option ${option === metrics.breakSuggestion ? "active" : ""}">
                ${option}
              </div>
            `,
          ).join("")}
        </div>
        <div class="detail-grid tight">
          <div><span>Top repeated objection</span><strong>${metrics.topObjection}</strong></div>
          <div><span>Most delayed stage</span><strong>${metrics.mostDelayedStage}</strong></div>
          <div><span>Proposals</span><strong>${metrics.proposals}</strong></div>
          <div><span>Wins</span><strong>${metrics.wins}</strong></div>
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
        <span>Status</span>
        <strong>${computedStatus}</strong>
        <span class="badge">${sector.priority}</span>
      </div>
      ${fieldRow("ICP", sector.icp)}
      ${fieldRow("Pain", sector.pain)}
      ${fieldRow("Offer angle", sector.offer_angle)}
      ${fieldRow("Urgency angle", sector.urgency_angle)}
      ${fieldRow("Proof needed", sector.proof_needed)}
      ${fieldRow("Why this sector", sector.why_this_sector)}
      ${fieldRow("Why now", sector.why_now)}
      ${fieldRow("Disqualify rules", sector.disqualify_rules)}
      ${fieldRow("Final decision", sector.final_decision)}
    </section>
    <section class="drawer-section">
      <h4>Quick Edit</h4>
      <form data-save-form="sector" data-entity-id="${sector.id}">
        <label><span>Owner</span><input name="owner" value="${sector.owner || ""}" /></label>
        <label><span>Next Step</span><input name="next_step" value="${sector.next_step || ""}" /></label>
        <label><span>Next Step Date</span><input type="date" name="next_step_date" value="${sector.next_step_date || ""}" /></label>
        <label><span>Notes</span><textarea name="notes">${sector.notes || ""}</textarea></label>
        <div class="form-actions">
          <button class="ghost-button" type="button" data-set-active="${sector.id}">Set as Active</button>
          <button class="primary-button" type="submit">Save</button>
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
      <h4>Lead Snapshot</h4>
      ${
        guardFlags.length
          ? `<div class="guard-row">${guardFlags
              .map((flag) => `<span class="guard-pill ${flag.type}">${flag.label}</span>`)
              .join("")}</div>`
          : ""
      }
      ${fieldRow("Sector", sector?.sector_name)}
      ${fieldRow("Contact", `${lead.contact_name} • ${lead.role || "No role"}`)}
      ${fieldRow("Channel", lead.channel)}
      ${fieldRow("Owner", lead.owner)}
      ${fieldRow("Score", lead.lead_score)}
      ${fieldRow("Pain Signal", lead.pain_signal)}
      ${fieldRow("Interest Type", lead.interest_type)}
      ${fieldRow("Current Stage", computedStage)}
      ${fieldRow("Short Note", lead.notes)}
      ${fieldRow("Handoff Summary", lead.handoff_summary || "Not ready yet")}
    </section>
    <section class="drawer-section">
      <h4>Quick Edit</h4>
      <form data-save-form="lead" data-entity-id="${lead.id}">
        <label>
          <span>Stage</span>
          <select name="current_stage">
            ${LEAD_STAGES.filter((stage) => stage !== "Delayed")
              .map(
                (stage) =>
                  `<option value="${stage}" ${stage === lead.current_stage ? "selected" : ""}>${stage}</option>`,
              )
              .join("")}
          </select>
        </label>
        <label>
          <span>Owner</span>
          <select name="owner">
            ${AGENTS.filter((agent) => agent.entity === "lead")
              .map(
                (agent) =>
                  `<option value="${agent.key}" ${agent.key === lead.owner ? "selected" : ""}>${agent.key}</option>`,
              )
              .join("")}
          </select>
        </label>
        <label><span>Next Step</span><input name="next_step" value="${lead.next_step || ""}" /></label>
        <label><span>Next Step Date</span><input type="date" name="next_step_date" value="${lead.next_step_date || ""}" /></label>
        <label><span>Pain Signal</span><input name="pain_signal" value="${lead.pain_signal || ""}" /></label>
        <label><span>Notes</span><textarea name="notes">${lead.notes || ""}</textarea></label>
        <label><span>Handoff Summary</span><textarea name="handoff_summary">${lead.handoff_summary || ""}</textarea></label>
        <div class="form-actions">
          ${
            eligibleForOpportunity
              ? `<button class="ghost-button" type="button" data-convert-lead="${lead.id}">Create Opportunity</button>`
              : ""
          }
          <button class="primary-button" type="submit">Save</button>
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
      <h4>Business Snapshot</h4>
      ${
        guardFlags.length
          ? `<div class="guard-row">${guardFlags
              .map((flag) => `<span class="guard-pill ${flag.type}">${flag.label}</span>`)
              .join("")}</div>`
          : ""
      }
      ${fieldRow("Sector", sector?.sector_name)}
      ${fieldRow("Estimated Value", formatCurrency(opportunity.estimated_value))}
      ${fieldRow("Current Stage", computedStage)}
      ${fieldRow("Buyer Readiness", opportunity.buyer_readiness)}
    </section>
    <section class="drawer-section">
      <h4>Pain & Value</h4>
      ${fieldRow("Pain Summary", opportunity.pain_summary)}
      ${fieldRow("Use Case", opportunity.use_case || "Missing")}
      ${fieldRow("Close Probability", `${opportunity.close_probability || 0}%`)}
    </section>
    <section class="drawer-section">
      <h4>Buyer Readiness</h4>
      ${fieldRow("Decision Status", opportunity.decision_status)}
      ${fieldRow("Stakeholder Status", opportunity.stakeholder_status)}
      ${fieldRow(
        "Proposal Gate",
        readinessGaps.length ? `Missing: ${readinessGaps.join(", ")}` : "Ready for Proposal Stage",
      )}
    </section>
    <section class="drawer-section">
      <h4>Stakeholder Mapping</h4>
      ${fieldRow("Stakeholder Map", opportunity.stakeholder_map)}
    </section>
    <section class="drawer-section">
      <h4>Objections</h4>
      ${fieldRow("Objection Summary", opportunity.objection_summary)}
      ${fieldRow("Risk Flag", opportunity.risk_flag)}
    </section>
    <section class="drawer-section">
      <h4>Next Step Logic</h4>
      ${fieldRow("Next Step", opportunity.next_step)}
      ${fieldRow("Next Step Date", formatDate(opportunity.next_step_date))}
    </section>
    <section class="drawer-section">
      <h4>Quick Edit</h4>
      <form data-save-form="opportunity" data-entity-id="${opportunity.id}">
        <label>
          <span>Stage</span>
          <select name="current_stage">
            ${OPPORTUNITY_STAGES.filter((stage) => stage !== "Delayed")
              .map(
                (stage) =>
                  `<option value="${stage}" ${stage === opportunity.current_stage ? "selected" : ""}>${stage}</option>`,
              )
              .join("")}
          </select>
        </label>
        <label>
          <span>Owner</span>
          <select name="owner">
            ${AGENTS.filter((agent) => agent.entity === "opportunity")
              .map(
                (agent) =>
                  `<option value="${agent.key}" ${agent.key === opportunity.owner ? "selected" : ""}>${agent.key}</option>`,
              )
              .join("")}
          </select>
        </label>
        <label><span>Next Step</span><input name="next_step" value="${opportunity.next_step || ""}" /></label>
        <label><span>Next Step Date</span><input type="date" name="next_step_date" value="${opportunity.next_step_date || ""}" /></label>
        <label><span>Buyer Readiness</span><input name="buyer_readiness" value="${opportunity.buyer_readiness || ""}" /></label>
        <label><span>Use Case</span><textarea name="use_case">${opportunity.use_case || ""}</textarea></label>
        <label><span>Stakeholder Status</span><textarea name="stakeholder_status">${opportunity.stakeholder_status || ""}</textarea></label>
        <label><span>Pain Summary</span><textarea name="pain_summary">${opportunity.pain_summary || ""}</textarea></label>
        <label><span>Objection Summary</span><textarea name="objection_summary">${opportunity.objection_summary || ""}</textarea></label>
        <div class="form-actions">
          <button class="primary-button" type="submit">Save</button>
        </div>
      </form>
    </section>
  `;
}

function renderCreateForm(entityType) {
  if (entityType === "sector") {
    return `
      <section class="drawer-section">
        <h4>Create Sector</h4>
        <form data-create-form="sector">
          <label><span>sector_name</span><input name="sector_name" required /></label>
          <label><span>priority</span><select name="priority"><option>High</option><option>Medium</option><option>Low</option></select></label>
          <label><span>status</span><select name="status"><option>Testing</option><option>Paused</option><option>Rejected</option><option>Active</option></select></label>
          <label><span>icp</span><textarea name="icp" required></textarea></label>
          <label><span>pain</span><textarea name="pain" required></textarea></label>
          <label><span>offer_angle</span><textarea name="offer_angle" required></textarea></label>
          <label><span>proof_needed</span><textarea name="proof_needed" required></textarea></label>
          <label><span>final_decision</span><select name="final_decision"><option>Go</option><option>Test</option><option>Pause</option><option>Reject</option></select></label>
          <label><span>owner</span><select name="owner"><option value="Agent 1">Agent 1</option></select></label>
          <label><span>next_step</span><input name="next_step" /></label>
          <label><span>next_step_date</span><input type="date" name="next_step_date" /></label>
          <div class="form-actions">
            <button class="primary-button" type="submit">Create sector</button>
          </div>
        </form>
      </section>
    `;
  }

  if (entityType === "lead") {
    const activeSectors = state.data.sectors.filter((sector) => sector.is_active);
    return `
      <section class="drawer-section">
        <h4>Create Lead</h4>
        <form data-create-form="lead">
          <label><span>company_name</span><input name="company_name" required /></label>
          <label><span>sector_id</span><select name="sector_id">${activeSectors.map((sector) => `<option value="${sector.id}">${sector.sector_name}</option>`).join("")}</select></label>
          <label><span>contact_name</span><input name="contact_name" required /></label>
          <label><span>role</span><input name="role" /></label>
          <label><span>channel</span><select name="channel"><option>WhatsApp</option><option>Call</option><option>LinkedIn</option></select></label>
          <label><span>owner</span><select name="owner"><option value="Agent 2">Agent 2</option></select></label>
          <label><span>current_stage</span><select name="current_stage">${LEAD_STAGES.filter((stage) => stage !== "Delayed").map((stage) => `<option value="${stage}">${stage}</option>`).join("")}</select></label>
          <label><span>pain_signal</span><textarea name="pain_signal"></textarea></label>
          <label><span>next_step</span><input name="next_step" required /></label>
          <label><span>next_step_date</span><input type="date" name="next_step_date" required /></label>
          <label><span>notes</span><textarea name="notes"></textarea></label>
          <div class="form-actions">
            <button class="primary-button" type="submit">Create lead</button>
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
      <h4>Create Opportunity</h4>
      <form data-create-form="opportunity">
        <label><span>origin_lead_id</span><select name="origin_lead_id">${eligibleLeads.map((lead) => `<option value="${lead.id}">${lead.company_name}</option>`).join("")}</select></label>
        <label><span>company_name</span><input name="company_name" required /></label>
        <label><span>sector_id</span><select name="sector_id">${state.data.sectors.map((sector) => `<option value="${sector.id}">${sector.sector_name}</option>`).join("")}</select></label>
        <label><span>owner</span><select name="owner"><option value="Agent 3">Agent 3</option></select></label>
        <label><span>current_stage</span><select name="current_stage">${OPPORTUNITY_STAGES.filter((stage) => !["Delayed", "Won", "Lost"].includes(stage)).map((stage) => `<option value="${stage}">${stage}</option>`).join("")}</select></label>
        <label><span>buyer_readiness</span><textarea name="buyer_readiness" required></textarea></label>
        <label><span>pain_summary</span><textarea name="pain_summary" required></textarea></label>
        <label><span>use_case</span><textarea name="use_case"></textarea></label>
        <label><span>stakeholder_status</span><textarea name="stakeholder_status"></textarea></label>
        <label><span>next_step</span><input name="next_step" required /></label>
        <label><span>next_step_date</span><input type="date" name="next_step_date" required /></label>
        <div class="form-actions">
          <button class="primary-button" type="submit">Create opportunity</button>
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
  let kicker = "Details";
  let content = "";

  if (kind === "create") {
    title = `Create ${entityType}`;
    kicker = "New Record";
    content = renderCreateForm(entityType);
  }

  if (entityType === "sector" && entityId) {
    const sector = state.data.sectors.find((item) => item.id === entityId);
    title = sector?.sector_name || "Sector";
    kicker = "Sector & Offer";
    content = renderSectorDrawer(sector);
  }

  if (entityType === "lead" && entityId) {
    const lead = state.data.leads.find((item) => item.id === entityId);
    title = lead?.company_name || "Lead";
    kicker = "Pipeline";
    content = renderLeadDrawer(lead);
  }

  if (entityType === "opportunity" && entityId) {
    const opportunity = state.data.opportunities.find((item) => item.id === entityId);
    title = opportunity?.company_name || "Opportunity";
    kicker = "Revenue";
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
    setDrawer({ message: errors.join(" ") });
    return;
  }

  patchEntity("sector", entityId, patch);
  setDrawer({ message: "Sector updated successfully." });
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
    ...getRequiredValidationErrors("lead", patch),
    ...validateLeadTransition(patch, patch.current_stage),
  ];

  if (errors.length) {
    setDrawer({ message: errors.join(" ") });
    return;
  }

  patchEntity("lead", entityId, patch);
  setDrawer({ message: "Lead updated successfully." });
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
    ...getRequiredValidationErrors("opportunity", patch),
    ...validateOpportunityTransition(patch, patch.current_stage),
  ];

  if (errors.length) {
    setDrawer({ message: errors.join(" ") });
    return;
  }

  patchEntity("opportunity", entityId, patch);
  setDrawer({ message: "Opportunity updated successfully." });
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
      setDrawer({ message: errors.join(" ") });
      return;
    }
    nextData.sectors.unshift(draft);
    setData(
      draft.is_active ? enforceSingleActiveSector(nextData, draft.id) : nextData,
      "Sector created successfully.",
    );
  }

  if (entityType === "lead") {
    const sector = nextData.sectors.find((item) => item.id === values.sector_id);
    if (!sector?.is_active) {
      setDrawer({ message: "Agent 2 can only create new leads for the active sector." });
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
      ...getRequiredValidationErrors("lead", draft),
      ...validateLeadTransition(draft, draft.current_stage),
    ];
    if (errors.length) {
      setDrawer({ message: errors.join(" ") });
      return;
    }
    nextData.leads.unshift(draft);
    setData(nextData, "Lead created successfully.");
  }

  if (entityType === "opportunity") {
    const sourceLead = nextData.leads.find((lead) => lead.id === values.origin_lead_id);
    if (!sourceLead || sourceLead.current_stage !== "Handoff Sent" || !sourceLead.handoff_summary) {
      setDrawer({ message: "Opportunity can only be created from a Handoff Sent lead." });
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
      ...getRequiredValidationErrors("opportunity", draft),
      ...validateOpportunityTransition(draft, draft.current_stage),
    ];
    if (errors.length) {
      setDrawer({ message: errors.join(" ") });
      return;
    }
    nextData.opportunities.unshift(draft);
    setData(nextData, "Opportunity created successfully.");
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
    setDrawer({ message: "Lead must be Handoff Sent with a handoff summary first." });
    return;
  }
  setDrawer({
    open: true,
    kind: "create",
    entityType: "opportunity",
    mode: "create",
    message: `Opportunity prefill ready from ${lead.company_name}. Choose the final fields and save.`,
  });
  requestAnimationFrame(() => {
    const form = document.querySelector('[data-create-form="opportunity"]');
    if (!form) return;
    form.querySelector('[name="origin_lead_id"]').value = lead.id;
    form.querySelector('[name="company_name"]').value = lead.company_name;
    form.querySelector('[name="sector_id"]').value = lead.sector_id;
    form.querySelector('[name="pain_summary"]').value = lead.pain_signal || lead.notes || "";
    form.querySelector('[name="next_step"]').value = "Run discovery call";
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
        "Active sector updated. Agent 2 should only work this sector now.",
      );
      setDrawer({ message: "Active sector updated. Agent 2 should only work this sector now." });
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
        "Active sector updated. Agent 2 should only work this sector now.",
      );
      renderApp();
    });
  });
}

function renderScreen() {
  const title = SCREENS.find((screen) => screen.key === state.activeScreen)?.label;
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
  renderSidebarWeeklyFocus();
  renderFilters();
  renderScreen();
  renderDrawer();
}

function bootstrapApp() {
  document.documentElement.classList.remove("app-pending");
  document.documentElement.classList.add("app-ready");

  elements = {
    nav: document.querySelector("#main-nav"),
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
    emptyTemplate: document.querySelector("#empty-state-template"),
  };

  elements.drawerClose.addEventListener("click", closeDrawer);
  elements.drawerBackdrop.addEventListener("click", closeDrawer);
  renderApp();
}

export { bootstrapApp };
