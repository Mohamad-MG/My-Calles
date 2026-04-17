import { TRANSITION_MAPS } from "../domain.mjs";
import { escapeHtml, formatShortDate, getTodayInputValue, localizeValue, renderBadge, renderEmptyState, renderKeyValue, renderSectionHeading } from "../shared-ui.mjs";

const HANDOFF_STATUSES = ["New", "Reviewing", "Ready for Opportunity", "Closed / Rejected"];

function selectQualifiedLeads(state) {
  return [...(state.data.qualified_leads || [])].sort((left, right) =>
    String(right.updated_at || "").localeCompare(String(left.updated_at || "")),
  );
}

function getAllowedHandoffStatuses(record) {
  return [record.handoff_status, ...(TRANSITION_MAPS.qualified_leads[record.handoff_status] || [])];
}

function renderHandoff(app) {
  const { copy, state } = app;
  const leads = selectQualifiedLeads(state);
  return `
    <section class="app-screen workspace-screen">
      <header class="app-hero compact">
        <div>
          <p class="app-kicker">${escapeHtml(copy.nav.handoff)}</p>
          <h1>${escapeHtml(copy.modules.handoff.title)}</h1>
          <p class="app-hero-copy">${escapeHtml(copy.modules.handoff.subtitle)}</p>
        </div>
      </header>
      <section class="app-board">
        ${HANDOFF_STATUSES
          .map((status) => {
            const items = leads.filter((lead) => lead.handoff_status === status);
            return `
              <article class="app-panel app-column">
                ${renderSectionHeading(copy.chrome.status, localizeValue(copy, status), renderBadge(String(items.length), "muted"))}
                <div class="app-column-stack">
                  ${
                    items.length
                      ? items
                          .map(
                            (item) => `
                              <article class="app-record-card">
                                <button class="app-card-main" type="button" data-open-drawer="qualified_leads:${item.id}">
                                  <div class="app-card-head">
                                    <div>
                                      <strong>${escapeHtml(item.pain_summary)}</strong>
                                      <p>${escapeHtml(localizeValue(copy, item.origin_channel))} • ${escapeHtml(localizeValue(copy, item.origin_entity))}</p>
                                    </div>
                                    ${renderBadge(localizeValue(copy, item.handoff_status))}
                                  </div>
                                  <p class="app-card-summary">${escapeHtml(item.qualification_note || "—")}</p>
                                  <div class="app-card-meta">
                                    ${renderBadge(localizeValue(copy, item.recommended_service), "accent")}
                                    ${renderBadge(localizeValue(copy, item.recommended_service_confidence), "muted")}
                                  </div>
                                </button>
                              </article>
                            `,
                          )
                          .join("")
                      : renderEmptyState(copy)
                  }
                </div>
              </article>
            `;
          })
          .join("")}
      </section>
    </section>
  `;
}

function renderHandoffDrawer(app, record) {
  const { copy } = app;
  return `
    <div class="app-drawer-stack">
      ${renderSectionHeading(copy.nav.handoff, record.pain_summary)}
      <div class="app-detail-grid">
        ${renderKeyValue(copy.chrome.origin, `${localizeValue(copy, record.origin_channel)} / ${localizeValue(copy, record.origin_entity)}`)}
        ${renderKeyValue(copy.chrome.handoffStatus, localizeValue(copy, record.handoff_status))}
        ${renderKeyValue(copy.chrome.service, localizeValue(copy, record.recommended_service))}
        ${renderKeyValue(copy.chrome.confidence, localizeValue(copy, record.recommended_service_confidence))}
        ${renderKeyValue(copy.chrome.nextStepDate, formatShortDate(record.updated_at, copy.meta.lang))}
      </div>
      <form data-edit-record="qualified_leads:${record.id}">
        <div class="app-form-grid">
          <label class="wide"><span>${escapeHtml(copy.forms.painSummary)}</span><textarea name="pain_summary">${escapeHtml(record.pain_summary)}</textarea></label>
          <label class="wide"><span>${escapeHtml(copy.forms.qualificationNote)}</span><textarea name="qualification_note">${escapeHtml(record.qualification_note)}</textarea></label>
          <label><span>${escapeHtml(copy.chrome.service)}</span><select name="recommended_service"><option value="mycalls" ${record.recommended_service === "mycalls" ? "selected" : ""}>${escapeHtml(copy.values.mycalls)}</option><option value="nicechat" ${record.recommended_service === "nicechat" ? "selected" : ""}>${escapeHtml(copy.values.nicechat)}</option><option value="both" ${record.recommended_service === "both" ? "selected" : ""}>${escapeHtml(copy.values.both)}</option></select></label>
          <label><span>${escapeHtml(copy.chrome.confidence)}</span><select name="recommended_service_confidence"><option value="high" ${record.recommended_service_confidence === "high" ? "selected" : ""}>${escapeHtml(copy.values.high)}</option><option value="medium" ${record.recommended_service_confidence === "medium" ? "selected" : ""}>${escapeHtml(copy.values.medium)}</option><option value="low" ${record.recommended_service_confidence === "low" ? "selected" : ""}>${escapeHtml(copy.values.low)}</option></select></label>
          <label><span>${escapeHtml(copy.chrome.handoffStatus)}</span><select name="handoff_status">${getAllowedHandoffStatuses(record).map((status) => `<option value="${status}" ${record.handoff_status === status ? "selected" : ""}>${escapeHtml(localizeValue(copy, status))}</option>`).join("")}</select></label>
          <label class="wide"><span>${escapeHtml(copy.chrome.notes)}</span><textarea name="notes">${escapeHtml(record.notes || "")}</textarea></label>
        </div>
        <div class="app-form-actions"><button class="app-button primary" type="submit">${escapeHtml(copy.chrome.save)}</button></div>
      </form>
      ${
        record.handoff_status === "Ready for Opportunity" && !record.converted_opportunity_id
          ? `
            <form data-create-opportunity="${record.id}">
              <div class="app-form-grid">
                <label><span>${escapeHtml(copy.forms.companyName)}</span><input name="company_name" required /></label>
                <label class="wide"><span>${escapeHtml(copy.forms.useCase)}</span><input name="use_case" required /></label>
                <label><span>${escapeHtml(copy.forms.estimatedValue)}</span><input type="number" name="estimated_value" value="0" /></label>
                <label class="wide"><span>${escapeHtml(copy.chrome.nextStep)}</span><input name="next_step" value="${escapeHtml(localizeValue(copy, "Run discovery"))}" required /></label>
                <label><span>${escapeHtml(copy.chrome.nextStepDate)}</span><input type="date" name="next_step_date" value="${getTodayInputValue()}" required /></label>
              </div>
              <input type="hidden" name="current_stage" value="Discovery" />
              <input type="hidden" name="buyer_readiness" value="Qualified" />
              <input type="hidden" name="stakeholder_status" value="Primary contact identified" />
              <input type="hidden" name="stakeholder_map" value="${escapeHtml(record.qualification_note || "")}" />
              <input type="hidden" name="pain_summary" value="${escapeHtml(record.pain_summary || "")}" />
              <div class="app-form-actions"><button class="app-button primary" type="submit">${escapeHtml(copy.chrome.createOpportunity)}</button></div>
            </form>
          `
          : record.converted_opportunity_id
            ? `<div class="app-inline-note">${escapeHtml(copy.chrome.alreadyConverted)}: ${escapeHtml(record.converted_opportunity_id)}</div>`
            : ""
      }
    </div>
  `;
}

export { HANDOFF_STATUSES, renderHandoff, renderHandoffDrawer, selectQualifiedLeads };
