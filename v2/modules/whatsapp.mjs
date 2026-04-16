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

const ENTITY = "whatsapp_items";

function selectWhatsAppItems(state) {
  return [...(state.data.whatsapp_items || [])].sort((left, right) =>
    String(left.next_step_date || "").localeCompare(String(right.next_step_date || "")),
  );
}

function getAllowedTransitions(record) {
  return TRANSITION_MAPS[ENTITY][record.status] || [];
}

function renderCreateForm(copy) {
  return `
    <form class="v2-create-form" data-create-entity="${ENTITY}">
      <div class="v2-form-grid">
        <label><span>${escapeHtml(copy.forms.phone)}</span><input name="phone" required /></label>
        <label><span>${escapeHtml(copy.forms.contactName)}</span><input name="contact_name" required /></label>
        <label><span>${escapeHtml(copy.forms.companyName)}</span><input name="company_name" required /></label>
        <label class="wide"><span>${escapeHtml(copy.chrome.summary)}</span><input name="summary" required /></label>
        <label class="wide"><span>${escapeHtml(copy.chrome.nextStep)}</span><input name="next_step" required /></label>
        <label><span>${escapeHtml(copy.chrome.nextStepDate)}</span><input type="date" name="next_step_date" value="${getTodayInputValue()}" required /></label>
      </div>
      <input type="hidden" name="channel" value="WhatsApp" />
      <input type="hidden" name="status" value="New" />
      <input type="hidden" name="conversation_source" value="inbound" />
      <div class="v2-form-actions"><button class="v2-button primary" type="submit">${escapeHtml(copy.chrome.create)}</button></div>
    </form>
  `;
}

function renderCard(record, copy) {
  const primaryTransition = getAllowedTransitions(record)[0] || "";
  const footer = record.status === "Qualified" && !record.converted_qualified_lead_id
    ? `<div class="v2-card-actions"><div class="v2-inline-note">${escapeHtml(copy.chrome.readyForHandoff)}</div></div>`
    : record.converted_qualified_lead_id
      ? `<div class="v2-card-actions"><div class="v2-inline-note">${escapeHtml(copy.chrome.alreadyConverted)}: ${escapeHtml(record.converted_qualified_lead_id)}</div></div>`
      : primaryTransition
        ? `<div class="v2-card-actions"><button class="v2-button primary" type="button" data-transition="${ENTITY}:${record.id}:${primaryTransition}">${escapeHtml(copy.chrome.doNext)}: ${escapeHtml(localizeValue(copy, primaryTransition))}</button></div>`
        : "";
  return `
    <article class="v2-record-card">
      <button class="v2-card-main" type="button" data-open-drawer="${ENTITY}:${record.id}">
        <div class="v2-card-head">
          <div>
            <strong>${escapeHtml(record.company_name || record.contact_name)}</strong>
            <p>${escapeHtml(record.contact_name)} • ${escapeHtml(record.phone)}</p>
          </div>
          ${renderBadge(localizeValue(copy, record.status))}
        </div>
        <p class="v2-card-summary">${escapeHtml(record.summary || "—")}</p>
        <div class="v2-card-meta">
          ${renderBadge(record.conversation_source || "inbound", "muted")}
          ${renderBadge(formatShortDate(record.next_step_date, copy.meta.lang), "outline")}
        </div>
      </button>
      ${footer}
    </article>
  `;
}

function renderWhatsApp(app) {
  const { copy, state } = app;
  const items = selectWhatsAppItems(state);
  const statuses = Object.keys(TRANSITION_MAPS[ENTITY]);
  return `
    <section class="v2-screen workspace-screen">
      <header class="v2-hero compact">
        <div>
          <p class="v2-kicker">WhatsApp</p>
          <h1>${escapeHtml(copy.modules.whatsapp.title)}</h1>
          <p class="v2-hero-copy">${escapeHtml(copy.modules.whatsapp.subtitle)}</p>
        </div>
      </header>
      <article class="v2-panel">
        ${renderSectionHeading(copy.modules.whatsapp.createTitle, copy.modules.whatsapp.createTitle)}
        ${renderCreateForm(copy)}
      </article>
      <section class="v2-board">
        ${statuses
          .map((status) => {
            const columnItems = items.filter((item) => item.status === status);
            return `
              <article class="v2-panel v2-column">
                ${renderSectionHeading(copy.chrome.status, localizeValue(copy, status), renderBadge(String(columnItems.length), "muted"))}
                <div class="v2-column-stack">
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

function renderWhatsAppDrawer(app, record) {
  const { copy } = app;
  return `
    <div class="v2-drawer-stack">
      ${renderSectionHeading(copy.nav.whatsapp, record.company_name || record.contact_name)}
      <div class="v2-detail-grid">
        ${renderKeyValue(copy.forms.contactName, record.contact_name)}
        ${renderKeyValue(copy.forms.companyName, record.company_name)}
        ${renderKeyValue(copy.forms.phone, record.phone)}
        ${renderKeyValue(copy.forms.conversationSource, record.conversation_source)}
        ${renderKeyValue(copy.chrome.nextStepDate, formatShortDate(record.next_step_date, copy.meta.lang))}
      </div>
      <form data-edit-record="${ENTITY}:${record.id}">
        <div class="v2-form-grid">
          <label class="wide"><span>${escapeHtml(copy.chrome.summary)}</span><textarea name="summary">${escapeHtml(record.summary)}</textarea></label>
          <label class="wide"><span>${escapeHtml(copy.forms.painSignal)}</span><input name="pain_signal" value="${escapeHtml(record.pain_signal)}" /></label>
          <label class="wide"><span>${escapeHtml(copy.chrome.nextStep)}</span><input name="next_step" value="${escapeHtml(record.next_step)}" /></label>
          <label><span>${escapeHtml(copy.chrome.nextStepDate)}</span><input type="date" name="next_step_date" value="${escapeHtml(record.next_step_date)}" /></label>
          <label class="wide"><span>${escapeHtml(copy.chrome.notes)}</span><textarea name="notes">${escapeHtml(record.notes || "")}</textarea></label>
        </div>
        <div class="v2-form-actions"><button class="v2-button primary" type="submit">${escapeHtml(copy.chrome.save)}</button></div>
      </form>
      <div class="v2-action-row">
        ${getAllowedTransitions(record)
          .map(
            (status) => `<button class="v2-button ghost" type="button" data-transition="${ENTITY}:${record.id}:${status}">${escapeHtml(localizeValue(copy, status))}</button>`,
          )
          .join("")}
      </div>
      ${
        record.status === "Qualified" && !record.converted_qualified_lead_id
          ? `
            <form data-convert-source="${ENTITY}:${record.id}">
              <div class="v2-form-grid">
                <label class="wide"><span>${escapeHtml(copy.forms.painSummary)}</span><input name="pain_summary" value="${escapeHtml(record.pain_signal || record.summary)}" /></label>
                <label class="wide"><span>${escapeHtml(copy.forms.qualificationNote)}</span><textarea name="qualification_note">${escapeHtml(record.summary || "")}</textarea></label>
                <label><span>${escapeHtml(copy.chrome.service)}</span><select name="recommended_service"><option value="mycalls">${escapeHtml(copy.values.mycalls)}</option><option value="nicechat">${escapeHtml(copy.values.nicechat)}</option><option value="both">${escapeHtml(copy.values.both)}</option></select></label>
                <label><span>${escapeHtml(copy.chrome.confidence)}</span><select name="recommended_service_confidence"><option value="high">${escapeHtml(copy.values.high)}</option><option value="medium" selected>${escapeHtml(copy.values.medium)}</option><option value="low">${escapeHtml(copy.values.low)}</option></select></label>
              </div>
              <div class="v2-form-actions"><button class="v2-button primary" type="submit">${escapeHtml(copy.chrome.convert)}</button></div>
            </form>
          `
          : record.converted_qualified_lead_id
            ? `<div class="v2-inline-note">${escapeHtml(copy.chrome.alreadyConverted)}: ${escapeHtml(record.converted_qualified_lead_id)}</div>`
            : ""
      }
    </div>
  `;
}

export { ENTITY as WHATSAPP_ENTITY, renderWhatsApp, renderWhatsAppDrawer, selectWhatsAppItems };
