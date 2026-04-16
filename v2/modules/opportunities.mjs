import { OPPORTUNITY_ACTIVE_STAGES } from "../domain.mjs";
import { escapeHtml, formatShortDate, localizeValue, renderBadge, renderKeyValue, renderSectionHeading } from "../shared-ui.mjs";

function getOpportunityById(state, id) {
  return (state.data.opportunities || []).find((item) => item.id === id) || null;
}

function renderOpportunityDetail(app, opportunity) {
  const { copy } = app;
  if (!opportunity) {
    return `
      <section class="v2-screen workspace-screen">
        <article class="v2-panel"><h1>${escapeHtml(copy.modules.opportunity.title)}</h1><p>${escapeHtml(copy.chrome.empty)}</p></article>
      </section>
    `;
  }

  return `
    <section class="v2-screen workspace-screen">
      <header class="v2-hero compact">
        <div>
          <p class="v2-kicker">${escapeHtml(copy.labels.opportunities)}</p>
          <h1>${escapeHtml(opportunity.company_name)}</h1>
          <p class="v2-hero-copy">${escapeHtml(copy.modules.opportunity.subtitle)}</p>
        </div>
        <div class="v2-inline-badges">
          ${renderBadge(localizeValue(copy, opportunity.current_stage))}
          ${renderBadge(formatShortDate(opportunity.next_step_date, copy.meta.lang), "outline")}
        </div>
      </header>

      <section class="v2-detail-layout">
        <article class="v2-panel">
          ${renderSectionHeading(copy.modules.opportunity.title, opportunity.company_name)}
          <div class="v2-detail-grid">
            ${renderKeyValue(copy.forms.currentStage, localizeValue(copy, opportunity.current_stage))}
            ${renderKeyValue(copy.forms.buyerReadiness, localizeValue(copy, opportunity.buyer_readiness))}
            ${renderKeyValue(copy.forms.stakeholderStatus, localizeValue(copy, opportunity.stakeholder_status))}
            ${renderKeyValue(copy.forms.estimatedValue, String(opportunity.estimated_value || 0))}
            ${renderKeyValue(copy.chrome.nextStepDate, formatShortDate(opportunity.next_step_date, copy.meta.lang))}
            ${renderKeyValue(copy.chrome.origin, opportunity.origin_channel || "—")}
          </div>
        </article>
        <article class="v2-panel">
          ${renderSectionHeading(copy.chrome.edit, copy.chrome.edit)}
          <form data-edit-record="opportunities:${opportunity.id}">
            <div class="v2-form-grid">
              <label><span>${escapeHtml(copy.forms.currentStage)}</span><select name="current_stage">${OPPORTUNITY_ACTIVE_STAGES.map((stage) => `<option value="${stage}" ${opportunity.current_stage === stage ? "selected" : ""}>${escapeHtml(localizeValue(copy, stage))}</option>`).join("")}</select></label>
              <label><span>${escapeHtml(copy.forms.buyerReadiness)}</span><input name="buyer_readiness" value="${escapeHtml(opportunity.buyer_readiness)}" /></label>
              <label><span>${escapeHtml(copy.forms.estimatedValue)}</span><input type="number" name="estimated_value" value="${escapeHtml(String(opportunity.estimated_value || 0))}" /></label>
              <label><span>${escapeHtml(copy.forms.riskFlag)}</span><input name="risk_flag" value="${escapeHtml(opportunity.risk_flag || "")}" /></label>
              <label class="wide"><span>${escapeHtml(copy.forms.painSummary)}</span><textarea name="pain_summary">${escapeHtml(opportunity.pain_summary || "")}</textarea></label>
              <label class="wide"><span>${escapeHtml(copy.forms.useCase)}</span><textarea name="use_case">${escapeHtml(opportunity.use_case || "")}</textarea></label>
              <label class="wide"><span>${escapeHtml(copy.forms.stakeholderStatus)}</span><input name="stakeholder_status" value="${escapeHtml(opportunity.stakeholder_status || "")}" /></label>
              <label class="wide"><span>${escapeHtml(copy.forms.stakeholderMap)}</span><input name="stakeholder_map" value="${escapeHtml(opportunity.stakeholder_map || "")}" /></label>
              <label class="wide"><span>${escapeHtml(copy.chrome.nextStep)}</span><input name="next_step" value="${escapeHtml(opportunity.next_step || "")}" /></label>
              <label><span>${escapeHtml(copy.chrome.nextStepDate)}</span><input type="date" name="next_step_date" value="${escapeHtml(opportunity.next_step_date || "")}" /></label>
              <label class="wide"><span>${escapeHtml(copy.chrome.notes)}</span><textarea name="notes">${escapeHtml(opportunity.notes || "")}</textarea></label>
            </div>
            <div class="v2-form-actions"><button class="v2-button primary" type="submit">${escapeHtml(copy.chrome.save)}</button></div>
          </form>
        </article>
      </section>
    </section>
  `;
}

export { getOpportunityById, renderOpportunityDetail };
