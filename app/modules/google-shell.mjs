import { escapeHtml, renderBadge } from "../shared-ui.mjs";
import { renderGoogleInbound, renderGoogleInboundDrawer, selectGoogleInboundItems } from "./google-inbound.mjs";
import { renderGoogleRankDrawer, renderGoogleRankOps, selectGoogleRankTasks } from "./google-rank-ops.mjs";

function renderGoogleShell(app) {
  const { copy, state } = app;
  const activeTab = state.googleTab || "inbound";
  const inbound = selectGoogleInboundItems(state);
  const rankOps = selectGoogleRankTasks(state);

  return `
    <section class="app-screen workspace-screen">
      <header class="app-hero compact">
        <div>
          <p class="app-kicker">${escapeHtml(copy.nav.google)}</p>
          <h1>${escapeHtml(copy.modules.google.title)}</h1>
          <p class="app-hero-copy">${escapeHtml(copy.modules.google.subtitle)}</p>
        </div>
        <div class="app-tab-row">
          <button class="app-tab ${activeTab === "inbound" ? "active" : ""}" type="button" data-set-google-tab="inbound">${escapeHtml(copy.modules.google.inbound)} ${renderBadge(String(inbound.length), "muted")}</button>
          <button class="app-tab ${activeTab === "rank-ops" ? "active" : ""}" type="button" data-set-google-tab="rank-ops">${escapeHtml(copy.modules.google.rankOps)} ${renderBadge(String(rankOps.length), "muted")}</button>
        </div>
      </header>
      ${activeTab === "inbound" ? renderGoogleInbound(copy, inbound) : renderGoogleRankOps(copy, rankOps)}
    </section>
  `;
}

function renderGoogleDrawer(app, entity, record) {
  return entity === "google_inbound_items"
    ? renderGoogleInboundDrawer(app, record)
    : renderGoogleRankDrawer(app, record);
}

export { renderGoogleDrawer, renderGoogleShell };
