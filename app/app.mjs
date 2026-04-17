import { createId, getStatusField } from "./domain.mjs";
import { getLocaleConfig } from "./i18n.mjs";
import { renderHome } from "./modules/home.mjs";
import { renderHandoff, renderHandoffDrawer } from "./modules/handoff.mjs";
import {
  buildPromptPreview,
  findTemplate,
  renderGoogleDrawer,
  renderGoogleShell,
  selectGoogleMapsMissions,
  selectGoogleSearchCampaigns,
} from "./modules/google-shell.mjs";
import { renderLinkedIn, renderLinkedInDrawer } from "./modules/linkedin.mjs";
import { getOpportunityById, renderOpportunityDetail } from "./modules/opportunities.mjs";
import { renderWhatsApp, renderWhatsAppDrawer } from "./modules/whatsapp.mjs";
import { createSessionId, fetchState, getRuntimeBasePath, sendRequest } from "./shared-state.mjs";
import { escapeHtml, localizeValue } from "./shared-ui.mjs";

const GOOGLE_TABS = new Set(["maps-ops", "search-ops"]);
const SPECIAL_DRAWER_ENTITIES = new Set(["google_prompt_templates_library"]);

const state = {
  locale: "en",
  copy: getLocaleConfig("en"),
  screenKey: "home",
  googleTab: "maps-ops",
  googleMissionId: "",
  googleCampaignId: "",
  googleFilters: {
    city: "all",
    category: "all",
    tier: "all",
  },
  data: null,
  version: 0,
  basePath: "",
  sessionId: createSessionId(),
  drawer: {
    open: false,
    entity: "",
    id: "",
  },
  notice: "",
};

let elements = null;

function normalizeGoogleTab(tab) {
  if (tab === "inbound") return "maps-ops";
  if (tab === "rank-ops") return "search-ops";
  return GOOGLE_TABS.has(tab) ? tab : "maps-ops";
}

function getGoogleTabFromSearch(search = window.location.search) {
  const params = new URLSearchParams(search);
  return normalizeGoogleTab(params.get("tab") || "");
}

function routeForPath(screenKey, { basePath = "", locale = "en", opportunityId = "", googleTab = "" } = {}) {
  const base = `${basePath}/${locale}`;
  if (screenKey === "home") return `${base}/`;
  if (screenKey === "whatsapp") return `${base}/whatsapp/`;
  if (screenKey === "linkedin") return `${base}/linkedin/`;
  if (screenKey === "google") {
    const tab = normalizeGoogleTab(googleTab);
    return `${base}/google/${tab === "search-ops" ? "?tab=search-ops" : ""}`;
  }
  if (screenKey === "handoff") return `${base}/handoff/`;
  if (screenKey === "opportunity-detail") return `${base}/opportunities/${opportunityId}/`;
  return `${base}/`;
}

function routeFor(screenKey, locale = state.locale, params = {}) {
  return routeForPath(screenKey, {
    basePath: state.basePath,
    locale,
    opportunityId: params.id || getOpportunityIdFromPath(),
    googleTab: params.tab || "",
  });
}

function getOpportunityIdFromPath() {
  const match = window.location.pathname.match(/\/opportunities\/([^/]+)\/?$/);
  return match?.[1] || "";
}

function findRecord(entity, id) {
  if (SPECIAL_DRAWER_ENTITIES.has(entity)) return null;
  return (state.data?.[entity] || []).find((item) => item.id === id) || null;
}

function getDrawerContent(entity, record) {
  if (entity === "google_prompt_templates_library") {
    return renderGoogleDrawer({ state, copy: state.copy }, entity, null);
  }
  if (entity === "whatsapp_items" && record) return renderWhatsAppDrawer({ state, copy: state.copy }, record);
  if (entity === "linkedin_prospects" && record) return renderLinkedInDrawer({ state, copy: state.copy }, record);
  if ((entity === "google_maps_missions" || entity === "google_inbound_items" || entity === "google_rank_tasks") && record) {
    return renderGoogleDrawer({ state, copy: state.copy }, entity, record);
  }
  if (entity === "qualified_leads" && record) return renderHandoffDrawer({ state, copy: state.copy }, record);
  return `<div class="app-empty">${escapeHtml(state.copy.chrome.empty)}</div>`;
}

function getDrawerTitle(entity, record) {
  if (entity === "google_prompt_templates_library") return state.copy.modules.google.templates;
  return (
    record?.company_name ||
    record?.profile_name ||
    record?.primary_keyword ||
    record?.keyword ||
    record?.title ||
    record?.name ||
    record?.pain_summary ||
    state.copy.chrome.open
  );
}

function renderNav() {
  const items = [
    ["home", state.copy.nav.home],
    ["whatsapp", state.copy.nav.whatsapp],
    ["linkedin", state.copy.nav.linkedin],
    ["google", state.copy.nav.google],
    ["handoff", state.copy.nav.handoff],
  ];
  elements.nav.innerHTML = items
    .map(
      ([screenKey, label]) => `
        <a class="app-nav-link ${state.screenKey === screenKey ? "active" : ""}" href="${routeFor(screenKey, state.locale, screenKey === "google" ? { tab: state.googleTab } : {})}" data-nav="${screenKey}">
          <span>${escapeHtml(label)}</span>
        </a>
      `,
    )
    .join("");
}

function renderNotice() {
  if (!state.notice) return "";
  return `<div class="app-notice">${escapeHtml(state.notice)}</div>`;
}

function renderScreen() {
  const titleMap = {
    home: state.copy.nav.home,
    whatsapp: state.copy.nav.whatsapp,
    linkedin: state.copy.nav.linkedin,
    google: state.copy.nav.google,
    handoff: state.copy.nav.handoff,
    "opportunity-detail": state.copy.modules.opportunity.title,
  };
  elements.screenTitle.textContent = titleMap[state.screenKey] || state.copy.nav.home;

  let html = "";
  if (state.screenKey === "home") {
    html = renderHome({ state, copy: state.copy });
  } else if (state.screenKey === "whatsapp") {
    html = renderWhatsApp({ state, copy: state.copy });
  } else if (state.screenKey === "linkedin") {
    html = renderLinkedIn({ state, copy: state.copy });
  } else if (state.screenKey === "google") {
    html = renderGoogleShell({ state, copy: state.copy });
  } else if (state.screenKey === "handoff") {
    html = renderHandoff({ state, copy: state.copy });
  } else if (state.screenKey === "opportunity-detail") {
    html = renderOpportunityDetail({ state, copy: state.copy }, getOpportunityById({ data: state.data }, getOpportunityIdFromPath()));
  }

  elements.content.innerHTML = `${renderNotice()}${html}`;
}

function renderDrawer() {
  const { open, entity, id } = state.drawer;
  elements.drawer.classList.toggle("hidden", !open);
  elements.drawerBackdrop.classList.toggle("hidden", !open);
  if (!open) {
    elements.drawerBody.innerHTML = "";
    return;
  }
  const record = findRecord(entity, id);
  elements.drawerTitle.textContent = getDrawerTitle(entity, record);
  elements.drawerBody.innerHTML = getDrawerContent(entity, record);
}

function renderChrome() {
  document.documentElement.lang = state.copy.meta.lang;
  document.documentElement.dir = state.copy.meta.dir;
  document.title = state.copy.meta.title;
  elements.brandMark.textContent = state.copy.meta.brandMark;
  elements.productName.textContent = state.copy.meta.productName;
  elements.productSubtitle.textContent = state.copy.meta.productSubtitle;
  elements.localeSwitch.href = routeFor(state.screenKey, state.locale === "en" ? "ar" : "en", {
    id: getOpportunityIdFromPath(),
    tab: state.screenKey === "google" ? state.googleTab : "",
  });
  elements.localeSwitch.textContent = state.locale === "en" ? "AR" : "EN";
}

function renderApp() {
  renderChrome();
  renderNav();
  renderScreen();
  renderDrawer();
}

function syncGoogleSelections() {
  const missions = selectGoogleMapsMissions(state);
  const campaigns = selectGoogleSearchCampaigns(state);
  if (!missions.some((mission) => mission.id === state.googleMissionId)) {
    state.googleMissionId = missions[0]?.id || "";
  }
  if (!campaigns.some((campaign) => campaign.id === state.googleCampaignId)) {
    state.googleCampaignId = campaigns[0]?.id || "";
  }
}

async function refreshState(message = "") {
  const remote = await fetchState({ sessionId: state.sessionId });
  state.data = remote.payload;
  state.version = remote.version;
  state.notice = message;
  syncGoogleSelections();
  renderApp();
}

function closeDrawer() {
  state.drawer = { open: false, entity: "", id: "" };
  renderDrawer();
}

function openDrawer(entity, id) {
  state.drawer = { open: true, entity, id };
  renderDrawer();
}

function navigate(screenKey, params = {}) {
  window.location.href = routeFor(screenKey, state.locale, params);
}

function syncGoogleTabFromLocation() {
  state.googleTab = getGoogleTabFromSearch();
}

function setGoogleTab(tab, historyMode = "push") {
  const nextTab = normalizeGoogleTab(tab);
  const nextUrl = routeFor("google", state.locale, { tab: nextTab });
  const currentUrl = `${window.location.pathname}${window.location.search}`;

  state.googleTab = nextTab;
  if (currentUrl !== nextUrl) {
    window.history[historyMode === "replace" ? "replaceState" : "pushState"]({}, "", nextUrl);
  }

  renderApp();
}

function setGoogleMission(missionId) {
  state.googleMissionId = missionId;
  renderApp();
}

function setGoogleCampaign(campaignId) {
  state.googleCampaignId = campaignId;
  renderApp();
}

function setGoogleFilter(key, value) {
  state.googleFilters[key] = value;
  renderScreen();
}

function formToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function getEntityPrefix(entity) {
  const prefixes = {
    whatsapp_items: "wa",
    linkedin_prospects: "li",
    google_prompt_templates: "tpl",
    google_maps_missions: "gm",
    google_inbound_items: "gmlead",
    google_rank_tasks: "gseo",
    qualified_leads: "ql",
    opportunities: "opp",
  };
  return prefixes[entity] || "rec";
}

async function handleCreateEntity(form) {
  const entity = form.dataset.createEntity;
  const values = formToObject(form);
  values.id = values.id || createId(getEntityPrefix(entity));
  if (entity === "google_prompt_templates" && !values.output_contract_json) {
    values.output_contract_json = "{}";
  }

  const next = await sendRequest(`/${entity}`, {
    method: "POST",
    body: values,
    sessionId: state.sessionId,
    version: state.version,
  });
  state.data = next.payload;
  state.version = next.version;
  syncGoogleSelections();
  state.notice = `${state.copy.chrome.create}: ${localizeValue(state.copy, entity)}`;
  renderApp();
}

async function handleEditRecord(form) {
  const [entity, id] = form.dataset.editRecord.split(":");
  const values = formToObject(form);
  const next = await sendRequest(`/${entity}/${id}`, {
    method: "PATCH",
    body: values,
    sessionId: state.sessionId,
    version: state.version,
  });
  state.data = next.payload;
  state.version = next.version;
  syncGoogleSelections();
  state.notice = `${state.copy.chrome.save}: ${id}`;
  renderApp();
}

async function handleConvertSource(form) {
  const [entity, id] = form.dataset.convertSource.split(":");
  const values = formToObject(form);
  const next = await sendRequest("/conversions/qualified-leads", {
    method: "POST",
    body: {
      id: createId("ql"),
      source_entity: entity,
      source_id: id,
      ...values,
    },
    sessionId: state.sessionId,
    version: state.version,
  });
  state.data = next.payload;
  state.version = next.version;
  state.notice = `${state.copy.chrome.convert}: ${id}`;
  closeDrawer();
  renderApp();
}

async function handleCreateOpportunity(form) {
  const qualifiedLeadId = form.dataset.createOpportunity;
  const values = formToObject(form);
  const opportunityId = createId("opp");
  const next = await sendRequest("/opportunities", {
    method: "POST",
    body: {
      id: opportunityId,
      qualified_lead_id: qualifiedLeadId,
      ...values,
    },
    sessionId: state.sessionId,
    version: state.version,
  });
  state.data = next.payload;
  state.version = next.version;
  navigate("opportunity-detail", { id: opportunityId });
}

async function handleTransition(token) {
  const [entity, id, nextStatus] = token.split(":");
  const statusField = getStatusField(entity);
  const next = await sendRequest(`/${entity}/${id}`, {
    method: "PATCH",
    body: { [statusField]: nextStatus },
    sessionId: state.sessionId,
    version: state.version,
  });
  state.data = next.payload;
  state.version = next.version;
  syncGoogleSelections();
  state.notice = `${state.copy.chrome.move}: ${localizeValue(state.copy, nextStatus)}`;
  renderApp();
}

function getImportRoute(token) {
  const [kind, id, slotKey] = token.split(":");
  if (kind === "maps") {
    return {
      path: `/google_maps_missions/${id}/${slotKey === "shortlist" ? "import-shortlist" : "import-search"}`,
      slot_key: slotKey,
    };
  }
  if (kind === "search") {
    const actionMap = {
      keyword_strategy: "import-keyword-strategy",
      subkeyword_cluster: "import-subkeyword-cluster",
      article_planner: "import-article-planner",
    };
    return {
      path: `/google_rank_tasks/${id}/${actionMap[slotKey]}`,
      slot_key: slotKey,
    };
  }
  throw new Error("Unknown import route.");
}

async function handleImportJson(form) {
  const token = form.dataset.importJson;
  const values = formToObject(form);
  const route = getImportRoute(token);
  const next = await sendRequest(route.path, {
    method: "POST",
    body: {
      slot_key: route.slot_key,
      result_json: values.result_json || "",
    },
    sessionId: state.sessionId,
    version: state.version,
  });
  state.data = next.payload;
  state.version = next.version;
  syncGoogleSelections();
  state.notice = state.copy.chrome.importSucceeded;
  renderApp();
}

function refreshPromptPreview(slotElement) {
  if (!slotElement) return;
  const select = slotElement.querySelector("[data-template-select]");
  const overrideInput = slotElement.querySelector("[data-override-input]");
  const preview = slotElement.querySelector("[data-prompt-preview]");
  const contract = slotElement.querySelector("[data-output-contract-preview]");
  const template = findTemplate(state, select?.value || "");
  const merged = buildPromptPreview(template, overrideInput?.value || "");
  if (preview) {
    preview.textContent = merged || state.copy.chrome.empty;
  }
  if (contract) {
    contract.textContent = template?.output_contract_json || state.copy.chrome.empty;
  }
}

async function handleCopySlotText(button) {
  const slotElement = button.closest("[data-prompt-slot]");
  const selector = button.dataset.copySource === "contract" ? "[data-output-contract-preview]" : "[data-prompt-preview]";
  const content = slotElement?.querySelector(selector)?.textContent || "";
  if (!content || content === state.copy.chrome.empty) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(content);
    const original = button.textContent;
    button.textContent = state.copy.chrome.copied;
    window.setTimeout(() => {
      button.textContent = original;
    }, 1200);
  }
}

function bindEvents() {
  document.body.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-nav],[data-open-drawer],[data-transition],[data-set-google-tab],[data-close-drawer],[data-set-google-mission],[data-set-google-campaign],[data-copy-source]");
    if (!target) return;

    if (target.dataset.nav) {
      event.preventDefault();
      navigate(target.dataset.nav);
      return;
    }

    if (target.dataset.openDrawer) {
      const [entity, id] = target.dataset.openDrawer.split(":");
      openDrawer(entity, id);
      return;
    }

    if (target.dataset.transition) {
      try {
        await handleTransition(target.dataset.transition);
      } catch (error) {
        state.notice = error.message;
        renderApp();
      }
      return;
    }

    if (target.dataset.setGoogleTab) {
      setGoogleTab(target.dataset.setGoogleTab);
      return;
    }

    if (target.dataset.setGoogleMission) {
      setGoogleMission(target.dataset.setGoogleMission);
      return;
    }

    if (target.dataset.setGoogleCampaign) {
      setGoogleCampaign(target.dataset.setGoogleCampaign);
      return;
    }

    if (target.dataset.copySource) {
      try {
        await handleCopySlotText(target);
      } catch (error) {
        console.error(error);
      }
      return;
    }

    if (target.dataset.closeDrawer) {
      closeDrawer();
    }
  });

  document.body.addEventListener("submit", async (event) => {
    const form = event.target;
    event.preventDefault();
    try {
      if (form.dataset.createEntity) {
        await handleCreateEntity(form);
      } else if (form.dataset.editRecord) {
        await handleEditRecord(form);
      } else if (form.dataset.convertSource) {
        await handleConvertSource(form);
      } else if (form.dataset.createOpportunity) {
        await handleCreateOpportunity(form);
      } else if (form.dataset.importJson) {
        await handleImportJson(form);
      }
    } catch (error) {
      state.notice = error.message;
      renderApp();
    }
  });

  document.body.addEventListener("change", (event) => {
    const filterTarget = event.target.closest("[data-google-filter]");
    if (filterTarget) {
      setGoogleFilter(filterTarget.dataset.googleFilter, filterTarget.value);
      return;
    }

    const slotElement = event.target.closest("[data-prompt-slot]");
    if (slotElement) {
      refreshPromptPreview(slotElement);
    }
  });

  document.body.addEventListener("input", (event) => {
    const slotElement = event.target.closest("[data-prompt-slot]");
    if (slotElement) {
      refreshPromptPreview(slotElement);
    }
  });

  elements.drawerBackdrop.addEventListener("click", closeDrawer);
  elements.drawerClose.addEventListener("click", closeDrawer);
  window.addEventListener("popstate", () => {
    if (state.screenKey === "google") {
      syncGoogleTabFromLocation();
      renderApp();
    }
  });
}

async function bootstrapApp({ locale = "en", screenKey = "home" } = {}) {
  state.basePath = getRuntimeBasePath();
  state.locale = locale;
  state.copy = getLocaleConfig(locale);
  state.screenKey = screenKey;
  state.googleTab = screenKey === "google" ? getGoogleTabFromSearch() : "maps-ops";

  elements = {
    nav: document.querySelector("#app-nav"),
    brandMark: document.querySelector("#app-brand-mark"),
    productName: document.querySelector("#app-product-name"),
    productSubtitle: document.querySelector("#app-product-subtitle"),
    screenTitle: document.querySelector("#app-screen-title"),
    localeSwitch: document.querySelector("#app-locale-switch"),
    content: document.querySelector("#app-content"),
    drawer: document.querySelector("#app-drawer"),
    drawerBody: document.querySelector("#app-drawer-body"),
    drawerTitle: document.querySelector("#app-drawer-title"),
    drawerClose: document.querySelector("#app-drawer-close"),
    drawerBackdrop: document.querySelector("#app-drawer-backdrop"),
  };

  bindEvents();
  await refreshState();
}

export { bootstrapApp, normalizeGoogleTab, routeForPath };
