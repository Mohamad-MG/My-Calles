import { createId, getStatusField } from "./domain.mjs";
import { getV2LocaleConfig } from "./i18n.mjs";
import { renderHome } from "./modules/home.mjs";
import { renderHandoff, renderHandoffDrawer } from "./modules/handoff.mjs";
import { renderGoogleDrawer, renderGoogleShell } from "./modules/google-shell.mjs";
import { renderLinkedIn, renderLinkedInDrawer } from "./modules/linkedin.mjs";
import { getOpportunityById, renderOpportunityDetail } from "./modules/opportunities.mjs";
import { renderWhatsApp, renderWhatsAppDrawer } from "./modules/whatsapp.mjs";
import { createSessionId, fetchV2State, getRuntimeBasePath, sendV2Request } from "./shared-state.mjs";
import { escapeHtml, localizeValue } from "./shared-ui.mjs";

const state = {
  locale: "en",
  copy: getV2LocaleConfig("en"),
  screenKey: "home",
  googleTab: "inbound",
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

function routeFor(screenKey, locale = state.locale, params = {}) {
  const base = `${state.basePath}/${locale}`;
  if (screenKey === "home") return `${base}/`;
  if (screenKey === "whatsapp") return `${base}/whatsapp/`;
  if (screenKey === "linkedin") return `${base}/linkedin/`;
  if (screenKey === "google") return `${base}/google/`;
  if (screenKey === "handoff") return `${base}/handoff/`;
  if (screenKey === "opportunity-detail") return `${base}/opportunities/${params.id || getOpportunityIdFromPath()}/`;
  return `${base}/`;
}

function getOpportunityIdFromPath() {
  const match = window.location.pathname.match(/\/opportunities\/([^/]+)\/?$/);
  return match?.[1] || "";
}

function findRecord(entity, id) {
  return (state.data?.[entity] || []).find((item) => item.id === id) || null;
}

function getDrawerContent(entity, record) {
  if (!record) return `<div class="v2-empty">${escapeHtml(state.copy.chrome.empty)}</div>`;
  if (entity === "whatsapp_items") return renderWhatsAppDrawer({ state, copy: state.copy }, record);
  if (entity === "linkedin_prospects") return renderLinkedInDrawer({ state, copy: state.copy }, record);
  if (entity === "google_inbound_items" || entity === "google_rank_tasks") {
    return renderGoogleDrawer({ state, copy: state.copy }, entity, record);
  }
  if (entity === "qualified_leads") return renderHandoffDrawer({ state, copy: state.copy }, record);
  return `<div class="v2-empty">${escapeHtml(state.copy.chrome.empty)}</div>`;
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
        <a class="v2-nav-link ${state.screenKey === screenKey ? "active" : ""}" href="${routeFor(screenKey)}" data-nav="${screenKey}">
          <span>${escapeHtml(label)}</span>
        </a>
      `,
    )
    .join("");
}

function renderNotice() {
  if (!state.notice) return "";
  return `<div class="v2-notice">${escapeHtml(state.notice)}</div>`;
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
  elements.drawerTitle.textContent = record?.company_name || record?.profile_name || record?.keyword || record?.pain_summary || state.copy.chrome.open;
  elements.drawerBody.innerHTML = getDrawerContent(entity, record);
}

function renderChrome() {
  document.documentElement.lang = state.copy.meta.lang;
  document.documentElement.dir = state.copy.meta.dir;
  document.title = state.copy.meta.title;
  elements.brandMark.textContent = state.copy.meta.brandMark;
  elements.productName.textContent = state.copy.meta.productName;
  elements.productSubtitle.textContent = state.copy.meta.productSubtitle;
  elements.localeSwitch.href = routeFor(state.screenKey, state.locale === "en" ? "ar" : "en", { id: getOpportunityIdFromPath() });
  elements.localeSwitch.textContent = state.locale === "en" ? "AR" : "EN";
}

function renderApp() {
  renderChrome();
  renderNav();
  renderScreen();
  renderDrawer();
}

async function refreshState(message = "") {
  const remote = await fetchV2State({ sessionId: state.sessionId });
  state.data = remote.payload;
  state.version = remote.version;
  state.notice = message;
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

function formToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function getEntityPrefix(entity) {
  const prefixes = {
    whatsapp_items: "wa",
    linkedin_prospects: "li",
    google_inbound_items: "gi",
    google_rank_tasks: "gr",
    qualified_leads: "ql",
    opportunities: "opp",
  };
  return prefixes[entity] || "rec";
}

async function handleCreateEntity(form) {
  const entity = form.dataset.createEntity;
  const values = formToObject(form);
  if (entity === "google_rank_tasks" && !values.task_summary) {
    values.task_summary = values.summary || "";
  }
  values.id = values.id || createId(getEntityPrefix(entity));
  const endpoint = `/${entity}`;
  const next = await sendV2Request(endpoint, {
    method: "POST",
    body: values,
    sessionId: state.sessionId,
    version: state.version,
  });
  state.data = next.payload;
  state.version = next.version;
  state.notice = `${state.copy.chrome.create}: ${localizeValue(state.copy, entity)}`;
  renderApp();
}

async function handleEditRecord(form) {
  const [entity, id] = form.dataset.editRecord.split(":");
  const values = formToObject(form);
  const next = await sendV2Request(`/${entity}/${id}`, {
    method: "PATCH",
    body: values,
    sessionId: state.sessionId,
    version: state.version,
  });
  state.data = next.payload;
  state.version = next.version;
  state.notice = `${state.copy.chrome.save}: ${id}`;
  renderApp();
}

async function handleConvertSource(form) {
  const [entity, id] = form.dataset.convertSource.split(":");
  const values = formToObject(form);
  const next = await sendV2Request("/conversions/qualified-leads", {
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
  const next = await sendV2Request("/opportunities", {
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
  const next = await sendV2Request(`/${entity}/${id}`, {
    method: "PATCH",
    body: { [statusField]: nextStatus },
    sessionId: state.sessionId,
    version: state.version,
  });
  state.data = next.payload;
  state.version = next.version;
  state.notice = `${state.copy.chrome.move}: ${localizeValue(state.copy, nextStatus)}`;
  renderApp();
}

function bindEvents() {
  document.body.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-nav],[data-open-drawer],[data-transition],[data-set-google-tab],[data-close-drawer]");
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
      state.googleTab = target.dataset.setGoogleTab;
      renderScreen();
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
      }
    } catch (error) {
      state.notice = error.message;
      renderApp();
    }
  });

  elements.drawerBackdrop.addEventListener("click", closeDrawer);
  elements.drawerClose.addEventListener("click", closeDrawer);
}

async function bootstrapV2({ locale = "en", screenKey = "home" } = {}) {
  state.basePath = getRuntimeBasePath();
  state.locale = locale;
  state.copy = getV2LocaleConfig(locale);
  state.screenKey = screenKey;

  elements = {
    nav: document.querySelector("#v2-nav"),
    brandMark: document.querySelector("#v2-brand-mark"),
    productName: document.querySelector("#v2-product-name"),
    productSubtitle: document.querySelector("#v2-product-subtitle"),
    screenTitle: document.querySelector("#v2-screen-title"),
    localeSwitch: document.querySelector("#v2-locale-switch"),
    content: document.querySelector("#v2-content"),
    drawer: document.querySelector("#v2-drawer"),
    drawerBody: document.querySelector("#v2-drawer-body"),
    drawerTitle: document.querySelector("#v2-drawer-title"),
    drawerClose: document.querySelector("#v2-drawer-close"),
    drawerBackdrop: document.querySelector("#v2-drawer-backdrop"),
  };

  bindEvents();
  await refreshState();
}

export { bootstrapV2 };
