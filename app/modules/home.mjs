import { getAllHomeSummaries } from "../domain.mjs";
import { escapeHtml, formatShortDate, localizeValue, renderBadge, renderEmptyState, renderSectionHeading } from "../shared-ui.mjs";

function getWorkspaceRoute(channel) {
  if (channel === "WhatsApp") return "whatsapp";
  if (channel === "LinkedIn") return "linkedin";
  return "google";
}

function getChannelLabel(copy, channel) {
  if (channel === "WhatsApp") return copy.nav.whatsapp;
  if (channel === "LinkedIn") return copy.nav.linkedin;
  return copy.nav.google;
}

function renderResume(summary, copy) {
  if (!summary.resume_item) {
    return `<p class="app-muted">${escapeHtml(copy.chrome.empty)}</p>`;
  }

  const record = summary.resume_item;
  return `
    <div class="app-resume-box">
      <strong>${escapeHtml(record.company_name || record.profile_name || record.keyword || record.contact_name || "Resume item")}</strong>
      <p>${escapeHtml(record.summary || record.next_step || "—")}</p>
      <small>${escapeHtml(copy.chrome.nextStep)}: ${escapeHtml(record.next_step || "—")} • ${formatShortDate(record.next_step_date, copy.meta.lang)}</small>
    </div>
  `;
}

function renderHome(app) {
  const { copy, state } = app;
  const summaries = getAllHomeSummaries(state.data);
  const handoffItems = (state.data.qualified_leads || [])
    .filter((item) => !item.converted_opportunity_id && item.handoff_status !== "Closed / Rejected")
    .slice(0, 4);
  const recent = (state.data.recent_activity || []).slice(0, 3);

  return `
    <section class="app-screen home-screen">
      <header class="app-hero">
        <div>
          <p class="app-kicker">${escapeHtml(copy.meta.productSubtitle)}</p>
          <h1>${escapeHtml(copy.home.title)}</h1>
          <p class="app-hero-copy">${escapeHtml(copy.home.subtitle)}</p>
        </div>
      </header>

      <section class="app-home-grid">
        ${summaries
          .map(
            (summary) => `
              <article class="app-panel app-channel-card">
                ${renderSectionHeading(getChannelLabel(copy, summary.channel), getChannelLabel(copy, summary.channel), `<button class="app-button primary" type="button" data-nav="${getWorkspaceRoute(summary.channel)}">${escapeHtml(copy.home.openWorkspace)}</button>`)}
                <div class="app-stats-grid compact">
                  <div class="app-stat"><span>${escapeHtml(copy.chrome.todayCaptured)}</span><strong>${summary.today_captured}</strong></div>
                  <div class="app-stat"><span>${escapeHtml(copy.chrome.needsAction)}</span><strong>${summary.needs_action}</strong></div>
                  <div class="app-stat"><span>${escapeHtml(copy.chrome.qualifiedReady)}</span><strong>${summary.qualified_ready}</strong></div>
                </div>
                <div class="app-subpanel">
                  <div class="app-subpanel-head">
                    <span>${escapeHtml(copy.chrome.resume)}</span>
                    ${renderBadge(getChannelLabel(copy, summary.channel))}
                  </div>
                  ${renderResume(summary, copy)}
                </div>
              </article>
            `,
          )
          .join("")}
      </section>

      <section class="app-home-lower">
        <article class="app-panel">
          ${renderSectionHeading(copy.chrome.handoffCenter, copy.nav.handoff)}
          <div class="app-list">
            ${
              handoffItems.length
                ? handoffItems
                    .map(
                      (item) => `
                        <button class="app-list-row" type="button" data-open-drawer="qualified_leads:${item.id}">
                          <div>
                            <strong>${escapeHtml(item.pain_summary || item.origin_channel)}</strong>
                            <p>${escapeHtml(item.qualification_note || "—")}</p>
                          </div>
                          <div class="app-list-meta">
                            ${renderBadge(localizeValue(copy, item.handoff_status))}
                            ${renderBadge(localizeValue(copy, item.recommended_service), "accent")}
                          </div>
                        </button>
                      `,
                    )
                    .join("")
                : renderEmptyState(copy)
            }
          </div>
        </article>

        <article class="app-panel">
          ${renderSectionHeading(copy.chrome.recentActivity, copy.chrome.recentActivity)}
          <div class="app-list">
            ${
              recent.length
                ? recent
                    .map(
                      (item) => `
                        <div class="app-list-row static">
                          <div>
                            <strong>${escapeHtml(item.summary || item.entity)}</strong>
                            <p>${escapeHtml(localizeValue(copy, item.action))}</p>
                          </div>
                          <small>${formatShortDate(item.timestamp, copy.meta.lang)}</small>
                        </div>
                      `,
                    )
                    .join("")
                : renderEmptyState(copy)
            }
          </div>
        </article>
      </section>
    </section>
  `;
}

export { renderHome };
