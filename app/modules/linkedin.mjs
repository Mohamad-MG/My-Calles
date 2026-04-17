import { TRANSITION_MAPS } from "../domain.mjs";
import {
  escapeHtml,
  formatShortDate,
  getTodayInputValue,
  localizeValue,
  renderBadge,
  renderEmptyState,
  renderKeyValue,
  renderSectionHeading,
} from "../shared-ui.mjs";

const ENTITY = "linkedin_prospects";

function selectLinkedInProspects(state) {
  return [...(state.data.linkedin_prospects || [])].sort((left, right) =>
    String(left.next_step_date || "").localeCompare(String(right.next_step_date || "")),
  );
}

function getAllowedTransitions(record) {
  return TRANSITION_MAPS[ENTITY][record.status] || [];
}

function renderCreateForm(copy) {
  return `
    <form class="app-create-form" data-create-entity="${ENTITY}">
      <div class="app-form-grid">
        <label><span>${escapeHtml(copy.forms.profileName)}</span><input name="profile_name" required /></label>
        <label><span>${escapeHtml(copy.forms.companyName)}</span><input name="company_name" required /></label>
        <label><span>${escapeHtml(copy.forms.role)}</span><input name="role" required /></label>
        <label class="wide"><span>${escapeHtml(copy.chrome.summary)}</span><input name="summary" required /></label>
        <label class="wide"><span>${escapeHtml(copy.chrome.nextStep)}</span><input name="next_step" required /></label>
        <label><span>${escapeHtml(copy.chrome.nextStepDate)}</span><input type="date" name="next_step_date" value="${getTodayInputValue()}" required /></label>
      </div>
      <input type="hidden" name="channel" value="LinkedIn" />
      <input type="hidden" name="status" value="Target List" />
      <div class="app-form-actions"><button class="app-button primary" type="submit">${escapeHtml(copy.chrome.create)}</button></div>
    </form>
  `;
}

function renderCard(record, copy) {
  const primaryTransition = getAllowedTransitions(record)[0] || "";
  const footer = record.status === "Qualified" && !record.converted_qualified_lead_id
    ? `<div class="app-card-actions"><div class="app-inline-note">${escapeHtml(copy.chrome.readyForHandoff)}</div></div>`
    : record.converted_qualified_lead_id
      ? `<div class="app-card-actions"><div class="app-inline-note">${escapeHtml(copy.chrome.alreadyConverted)}: ${escapeHtml(record.converted_qualified_lead_id)}</div></div>`
      : primaryTransition
        ? `<div class="app-card-actions"><button class="app-button primary" type="button" data-transition="${ENTITY}:${record.id}:${primaryTransition}">${escapeHtml(copy.chrome.doNext)}: ${escapeHtml(localizeValue(copy, primaryTransition))}</button></div>`
        : "";
  return `
    <article class="app-record-card">
      <button class="app-card-main" type="button" data-open-drawer="${ENTITY}:${record.id}">
        <div class="app-card-head">
          <div>
            <strong>${escapeHtml(record.profile_name)}</strong>
            <p>${escapeHtml(record.company_name)} • ${escapeHtml(record.role)}</p>
          </div>
          ${renderBadge(localizeValue(copy, record.status))}
        </div>
        <p class="app-card-summary">${escapeHtml(record.summary || "—")}</p>
        <div class="app-card-meta">
          ${record.outreach_angle ? renderBadge(record.outreach_angle, "muted") : ""}
          ${renderBadge(formatShortDate(record.next_step_date, copy.meta.lang), "outline")}
        </div>
      </button>
      ${footer}
    </article>
  `;
}

function renderLinkedIn(app) {
  const { copy, state } = app;
  const items = selectLinkedInProspects(state);
  const statuses = Object.keys(TRANSITION_MAPS[ENTITY]);
  return `
    <section class="app-screen workspace-screen">
      <header class="app-hero compact">
        <div>
          <p class="app-kicker">${escapeHtml(copy.nav.linkedin)}</p>
          <h1>${escapeHtml(copy.modules.linkedin.title)}</h1>
          <p class="app-hero-copy">${escapeHtml(copy.modules.linkedin.subtitle)}</p>
        </div>
      </header>
      <article class="app-panel">
        ${renderSectionHeading(copy.modules.linkedin.createTitle, copy.modules.linkedin.createTitle)}
        ${renderCreateForm(copy)}
      </article>
      <section class="app-board">
        ${statuses
          .map((status) => {
            const columnItems = items.filter((item) => item.status === status);
            return `
              <article class="app-panel app-column">
                ${renderSectionHeading(copy.chrome.status, localizeValue(copy, status), renderBadge(String(columnItems.length), "muted"))}
                <div class="app-column-stack">
                  ${columnItems.length ? columnItems.map((item) => renderCard(item, copy)).join("") : renderEmptyState(copy)}
                </div>
              </article>
            `;
          })
          .join("")}
      </section>
    </section>
  `;
}

function renderLinkedInDrawer(app, record) {
  const { copy } = app;
  return `
    <div class="app-drawer-stack">
      ${renderSectionHeading(copy.nav.linkedin, record.profile_name)}
      <div class="app-detail-grid">
        ${renderKeyValue(copy.forms.companyName, record.company_name)}
        ${renderKeyValue(copy.forms.role, record.role)}
        ${renderKeyValue(copy.forms.profileUrl, record.profile_url)}
        ${renderKeyValue(copy.chrome.nextStepDate, formatShortDate(record.next_step_date, copy.meta.lang))}
      </div>
      <form data-edit-record="${ENTITY}:${record.id}">
        <div class="app-form-grid">
          <label class="wide"><span>${escapeHtml(copy.chrome.summary)}</span><textarea name="summary">${escapeHtml(record.summary)}</textarea></label>
          <label class="wide"><span>${escapeHtml(copy.forms.outreachAngle)}</span><input name="outreach_angle" value="${escapeHtml(record.outreach_angle)}" /></label>
          <label class="wide"><span>${escapeHtml(copy.forms.qualificationSignal)}</span><input name="qualification_signal" value="${escapeHtml(record.qualification_signal)}" /></label>
          <label class="wide"><span>${escapeHtml(copy.chrome.nextStep)}</span><input name="next_step" value="${escapeHtml(record.next_step)}" /></label>
          <label><span>${escapeHtml(copy.chrome.nextStepDate)}</span><input type="date" name="next_step_date" value="${escapeHtml(record.next_step_date)}" /></label>
          <label class="wide"><span>${escapeHtml(copy.chrome.notes)}</span><textarea name="notes">${escapeHtml(record.notes || "")}</textarea></label>
        </div>
        <div class="app-form-actions"><button class="app-button primary" type="submit">${escapeHtml(copy.chrome.save)}</button></div>
      </form>
      <div class="app-action-row">
        ${getAllowedTransitions(record)
          .map(
            (status) => `<button class="app-button ghost" type="button" data-transition="${ENTITY}:${record.id}:${status}">${escapeHtml(localizeValue(copy, status))}</button>`,
          )
          .join("")}
      </div>
      ${
        record.status === "Qualified" && !record.converted_qualified_lead_id
          ? `
            <form data-convert-source="${ENTITY}:${record.id}">
              <div class="app-form-grid">
                <label class="wide"><span>${escapeHtml(copy.forms.painSummary)}</span><input name="pain_summary" value="${escapeHtml(record.qualification_signal || record.summary)}" /></label>
                <label class="wide"><span>${escapeHtml(copy.forms.qualificationNote)}</span><textarea name="qualification_note">${escapeHtml(record.summary || "")}</textarea></label>
                <label><span>${escapeHtml(copy.chrome.service)}</span><select name="recommended_service"><option value="mycalls">${escapeHtml(copy.values.mycalls)}</option><option value="nicechat">${escapeHtml(copy.values.nicechat)}</option><option value="both">${escapeHtml(copy.values.both)}</option></select></label>
                <label><span>${escapeHtml(copy.chrome.confidence)}</span><select name="recommended_service_confidence"><option value="high">${escapeHtml(copy.values.high)}</option><option value="medium" selected>${escapeHtml(copy.values.medium)}</option><option value="low">${escapeHtml(copy.values.low)}</option></select></label>
              </div>
              <div class="app-form-actions"><button class="app-button primary" type="submit">${escapeHtml(copy.chrome.convert)}</button></div>
            </form>
          `
          : record.converted_qualified_lead_id
            ? `<div class="app-inline-note">${escapeHtml(copy.chrome.alreadyConverted)}: ${escapeHtml(record.converted_qualified_lead_id)}</div>`
            : ""
      }
    </div>
  `;
}

export { ENTITY as LINKEDIN_ENTITY, renderLinkedIn, renderLinkedInDrawer, selectLinkedInProspects };
