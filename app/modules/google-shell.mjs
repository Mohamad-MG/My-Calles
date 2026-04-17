import {
  MAPS_AGENT_SLOTS,
  MAPS_LEAD_STATUSES,
  MAPS_MISSION_STATUSES,
  SEARCH_AGENT_SLOTS,
  SEARCH_CAMPAIGN_STATUSES,
  TRANSITION_MAPS,
} from "../domain.mjs";
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

function selectGoogleMapsMissions(state) {
  return [...(state.data.google_maps_missions || [])].sort((left, right) =>
    String(left.next_step_date || "").localeCompare(String(right.next_step_date || "")) || String(left.title || "").localeCompare(String(right.title || "")),
  );
}

function selectGoogleMapsLeads(state, missionId = "") {
  return [...(state.data.google_inbound_items || [])]
    .filter((item) => !missionId || item.mission_id === missionId)
    .sort((left, right) => Number(right.lead_score || 0) - Number(left.lead_score || 0));
}

function selectGoogleSearchCampaigns(state) {
  return [...(state.data.google_rank_tasks || [])].sort((left, right) =>
    String(left.next_step_date || "").localeCompare(String(right.next_step_date || "")) || String(left.primary_keyword || "").localeCompare(String(right.primary_keyword || "")),
  );
}

function selectPromptTemplates(state, workflow) {
  return [...(state.data.google_prompt_templates || [])]
    .filter((template) => template.workflow === workflow)
    .sort((left, right) => Number(Boolean(right.active)) - Number(Boolean(left.active)) || String(left.name || "").localeCompare(String(right.name || "")));
}

function findTemplate(state, id) {
  return (state.data.google_prompt_templates || []).find((item) => item.id === id) || null;
}

function buildPromptPreview(template, override = "") {
  if (!template) return "";
  return [
    template.base_prompt || "",
    override ? `\n\nBrief / Override:\n${override}` : "",
    template.output_contract_json ? `\n\nOutput Contract JSON:\n${template.output_contract_json}` : "",
  ]
    .filter(Boolean)
    .join("");
}

function toTextBlock(value) {
  if (!Array.isArray(value) || !value.length) return "";
  return value.join("\n");
}

function toJsonBlock(value) {
  if (!value || (Array.isArray(value) && !value.length)) return "";
  return JSON.stringify(value, null, 2);
}

function renderTemplateOptions(templates, selectedId, copy) {
  const options = templates
    .map(
      (template) => `
        <option value="${escapeHtml(template.id)}" ${template.id === selectedId ? "selected" : ""}>
          ${escapeHtml(template.name)}${template.active ? "" : ` • ${escapeHtml(copy.chrome.inactive)}`}
        </option>
      `,
    )
    .join("");
  return `<option value="">${escapeHtml(copy.chrome.chooseTemplate)}</option>${options}`;
}

function renderMapsLeadCard(record, copy) {
  const primaryTransition = (TRANSITION_MAPS.google_inbound_items[record.status] || [])[0] || "";
  const footer =
    record.status === "Qualified" && !record.converted_qualified_lead_id
      ? `<div class="app-card-actions"><div class="app-inline-note">${escapeHtml(copy.chrome.readyForHandoff)}</div></div>`
      : record.converted_qualified_lead_id
        ? `<div class="app-card-actions"><div class="app-inline-note">${escapeHtml(copy.chrome.alreadyConverted)}: ${escapeHtml(record.converted_qualified_lead_id)}</div></div>`
        : primaryTransition
          ? `<div class="app-card-actions"><button class="app-button primary" type="button" data-transition="google_inbound_items:${record.id}:${primaryTransition}">${escapeHtml(copy.chrome.doNext)}: ${escapeHtml(localizeValue(copy, primaryTransition))}</button></div>`
          : "";

  return `
    <article class="app-record-card">
      <button class="app-card-main" type="button" data-open-drawer="google_inbound_items:${record.id}">
        <div class="app-card-head">
          <div>
            <strong>${escapeHtml(record.company_name)}</strong>
            <p>${escapeHtml(record.category || "—")} • ${escapeHtml(record.city || "—")}</p>
          </div>
          ${renderBadge(localizeValue(copy, record.status))}
        </div>
        <p class="app-card-summary">${escapeHtml(record.fit_notes || record.summary || "—")}</p>
        <div class="app-card-meta">
          ${record.score_tier ? renderBadge(`${escapeHtml(copy.chrome.tier)} ${escapeHtml(record.score_tier)}`, "accent") : ""}
          ${renderBadge(`${escapeHtml(copy.chrome.score)} ${escapeHtml(String(record.lead_score || 0))}`, "muted")}
          ${renderBadge(formatShortDate(record.next_step_date, copy.meta.lang), "outline")}
        </div>
      </button>
      ${footer}
    </article>
  `;
}

function safeJsonParse(value, fallback = null) {
  if (!value || typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function defaultText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function isArabicText(value = "") {
  return /[\u0600-\u06FF]/.test(String(value || ""));
}

function getMapsAgentCopy(state, record, copy) {
  const primaryTemplate = findTemplate(state, record.research_primary_template_id);
  const secondaryTemplate = findTemplate(state, record.research_secondary_template_id);
  const shortlistTemplate = findTemplate(state, record.shortlist_template_id);

  return {
    agentOne: {
      boxOne: defaultText(record.maps_agent_one_box_one, primaryTemplate?.base_prompt || copy.modules.google.mapsSearchBoxOneFallback),
      boxTwo: defaultText(record.maps_agent_one_box_two, secondaryTemplate?.base_prompt || primaryTemplate?.base_prompt || copy.modules.google.mapsSearchBoxTwoFallback),
      boxThree: defaultText(record.maps_agent_one_box_three, record.search_goal || record.research_primary_override || copy.modules.google.mapsSearchBoxThreeFallback),
    },
    agentTwo: {
      boxOne: defaultText(record.maps_agent_two_box_one, shortlistTemplate?.base_prompt || copy.modules.google.mapsAnalysisBoxOneFallback),
      boxTwo: defaultText(record.maps_agent_two_box_two, record.shortlist_override || copy.modules.google.mapsAnalysisBoxTwoFallback),
      boxThree: defaultText(record.maps_agent_two_box_three, shortlistTemplate?.output_contract_json || copy.modules.google.mapsAnalysisBoxThreeFallback),
    },
  };
}

function getSearchAgentRole(state, record, copy) {
  const strategyTemplate = findTemplate(state, record.keyword_strategy_template_id);
  return defaultText(record.search_agent_role, strategyTemplate?.base_prompt || copy.modules.google.searchRoleFallback);
}

function getKeywordRows(record) {
  const pairs = safeJsonParse(record.article_title_pairs_json, []);
  const pairList = Array.isArray(pairs) ? pairs : [];
  const subkeywords = Array.isArray(record.subkeywords) ? record.subkeywords : [];
  const articleIdeas = Array.isArray(record.article_ideas) ? record.article_ideas : [];

  return Array.from({ length: 10 }, (_, index) => {
    const pair = pairList[index] && typeof pairList[index] === "object" ? pairList[index] : {};
    const idea = articleIdeas[index] && typeof articleIdeas[index] === "object" ? articleIdeas[index] : {};

    return {
      index,
      subkeyword: defaultText(pair.subkeyword, subkeywords[index] || ""),
      primaryTitle: defaultText(pair.primary_title, idea.title || ""),
      secondaryTitle: defaultText(pair.secondary_title, ""),
      status: idea.status || "Idea",
    };
  });
}

function renderAgentTextarea(name, label, value, rows = 8) {
  return `
    <label class="app-agent-copy-box">
      <span>${escapeHtml(label)}</span>
      <textarea name="${escapeHtml(name)}" rows="${rows}">${escapeHtml(value)}</textarea>
    </label>
  `;
}

function renderImportCard(title, subtitle, token, value, copy) {
  return `
    <form class="app-panel app-result-card" data-import-json="${escapeHtml(token)}">
      <div class="app-subpanel-head">
        <div>
          <p class="app-kicker">${escapeHtml(title)}</p>
          <h4>${escapeHtml(subtitle)}</h4>
        </div>
      </div>
      <label class="app-agent-copy-box">
        <span>${escapeHtml(copy.chrome.resultJson)}</span>
        <textarea name="result_json" rows="12">${escapeHtml(value || "")}</textarea>
      </label>
      <div class="app-form-actions">
        <button class="app-button primary" type="submit">${escapeHtml(copy.chrome.importJson)}</button>
      </div>
    </form>
  `;
}

function renderKeywordWorkbenchRow(row, copy) {
  return `
    <div class="app-keyword-row" data-keyword-row>
      <div class="app-keyword-cell">
        <span>${escapeHtml(copy.chrome.subkeywords)} ${row.index + 1}</span>
        <input type="text" value="${escapeHtml(row.subkeyword)}" data-subkeyword-item />
      </div>
      <div class="app-keyword-cell">
        <span>${escapeHtml(copy.chrome.primaryTitleModel)}</span>
        <input
          type="text"
          value="${escapeHtml(row.primaryTitle)}"
          data-title-primary
          data-article-status="${escapeHtml(row.status)}"
          data-original-value="${escapeHtml(row.primaryTitle)}"
          placeholder="${escapeHtml(copy.modules.google.primaryTitlePlaceholder)}"
        />
      </div>
      <div class="app-keyword-cell">
        <span>${escapeHtml(copy.chrome.secondaryTitleModel)}</span>
        <input
          type="text"
          value="${escapeHtml(row.secondaryTitle)}"
          data-title-secondary
          data-original-value="${escapeHtml(row.secondaryTitle)}"
          placeholder="${escapeHtml(copy.modules.google.secondaryTitlePlaceholder)}"
        />
      </div>
    </div>
  `;
}

function renderKeywordTab(campaign, activeCampaignId, copy) {
  const active = campaign.id === activeCampaignId;
  const languageBadge = isArabicText(campaign.primary_keyword) ? copy.modules.google.keywordArabicGroup : copy.modules.google.keywordEnglishGroup;
  return `
    <button class="app-tab ${active ? "active" : ""}" type="button" data-set-google-campaign="${campaign.id}">
      ${escapeHtml(campaign.primary_keyword || copy.chrome.empty)} ${renderBadge(languageBadge, "muted")}
    </button>
  `;
}

function renderKeywordPlaceholder(label) {
  return `<span class="app-tab app-tab-placeholder">${escapeHtml(label)}</span>`;
}

function renderMapsOps(app) {
  const { copy, state } = app;
  const missions = selectGoogleMapsMissions(state);
  const activeMission = missions.find((mission) => mission.id === state.googleMissionId) || missions[0] || null;
  const missionLeads = activeMission ? selectGoogleMapsLeads(state, activeMission.id) : [];
  const cityOptions = [...new Set(missionLeads.map((item) => item.city).filter(Boolean))].sort();
  const categoryOptions = [...new Set(missionLeads.map((item) => item.category).filter(Boolean))].sort();
  const tierOptions = [...new Set(missionLeads.map((item) => item.score_tier).filter(Boolean))].sort();
  const filteredLeads = missionLeads.filter((item) => {
    if (state.googleFilters.city && state.googleFilters.city !== "all" && item.city !== state.googleFilters.city) return false;
    if (state.googleFilters.category && state.googleFilters.category !== "all" && item.category !== state.googleFilters.category) return false;
    if (state.googleFilters.tier && state.googleFilters.tier !== "all" && item.score_tier !== state.googleFilters.tier) return false;
    return true;
  });

  const counts = {
    total: missionLeads.length,
    shortlist: missionLeads.filter((item) => item.status === "Shortlisted").length,
    qualified: missionLeads.filter((item) => item.status === "Qualified").length,
  };

  const qualifiedLeads = filteredLeads.filter((item) => item.status === "Qualified");
  const promptCopy = activeMission ? getMapsAgentCopy(state, activeMission, copy) : null;

  return `
    <section class="app-google-layout">
      <aside class="app-panel app-google-side">
        ${renderSectionHeading(copy.modules.google.mapsMissions, copy.modules.google.mapsMissions)}
        <form class="app-create-form" data-create-entity="google_maps_missions">
          <div class="app-form-grid">
            <label><span>${escapeHtml(copy.forms.title)}</span><input name="title" required /></label>
            <label><span>${escapeHtml(copy.forms.country)}</span><input name="country" value="Saudi Arabia" required /></label>
            <label><span>${escapeHtml(copy.forms.cityScope)}</span><input name="city_scope" required /></label>
            <label class="wide"><span>${escapeHtml(copy.forms.searchGoal)}</span><textarea name="search_goal" required></textarea></label>
            <label class="wide"><span>${escapeHtml(copy.chrome.nextStep)}</span><input name="next_step" value="${escapeHtml(copy.google.defaultMissionNextStep)}" required /></label>
            <label><span>${escapeHtml(copy.chrome.nextStepDate)}</span><input type="date" name="next_step_date" value="${getTodayInputValue()}" required /></label>
          </div>
          <input type="hidden" name="status" value="Draft" />
          <input type="hidden" name="icp_focus" value="${escapeHtml(copy.google.defaultIcpFocus)}" />
          <div class="app-form-actions"><button class="app-button primary" type="submit">${escapeHtml(copy.chrome.createMission)}</button></div>
        </form>
        <div class="app-list">
          ${
            missions.length
              ? missions
                  .map(
                    (mission) => `
                      <button class="app-list-row app-selection-row ${mission.id === activeMission?.id ? "active" : ""}" type="button" data-set-google-mission="${mission.id}">
                        <div>
                          <strong>${escapeHtml(mission.title)}</strong>
                          <p>${escapeHtml(mission.city_scope)} • ${escapeHtml(localizeValue(copy, mission.status))}</p>
                        </div>
                        <div class="app-list-meta">${renderBadge(formatShortDate(mission.next_step_date, copy.meta.lang), "outline")}</div>
                      </button>
                    `,
                  )
                  .join("")
              : renderEmptyState(copy)
          }
        </div>
      </aside>
      <div class="app-screen">
        ${
          activeMission && promptCopy
            ? `
              <article class="app-panel">
                ${renderSectionHeading(
                  copy.modules.google.mapsMissionOverview,
                  activeMission.title,
                  `<div class="app-topbar-actions">
                    ${renderBadge(localizeValue(copy, activeMission.status))}
                    <button class="app-button ghost" type="button" data-open-drawer="google_maps_missions:${activeMission.id}">${escapeHtml(copy.chrome.manageMission)}</button>
                  </div>`,
                )}
                <p class="app-card-summary">${escapeHtml(activeMission.search_goal || activeMission.summary || "—")}</p>
                <div class="app-stats-grid compact">
                  <div class="app-stat"><span>${escapeHtml(copy.chrome.totalLeads)}</span><strong>${counts.total}</strong></div>
                  <div class="app-stat"><span>${escapeHtml(copy.chrome.shortlistCount)}</span><strong>${counts.shortlist}</strong></div>
                  <div class="app-stat"><span>${escapeHtml(copy.chrome.qualifiedReady)}</span><strong>${counts.qualified}</strong></div>
                </div>
                <div class="app-inline-badges">
                  ${renderBadge(`${escapeHtml(copy.forms.country)}: ${escapeHtml(activeMission.country)}`, "muted")}
                  ${renderBadge(`${escapeHtml(copy.forms.cityScope)}: ${escapeHtml(activeMission.city_scope)}`, "muted")}
                </div>
              </article>

              <form class="app-panel" data-edit-record="google_maps_missions:${activeMission.id}">
                ${renderSectionHeading(copy.modules.google.mapsAgentOne, copy.modules.google.mapsAgentOne)}
                <p class="app-google-section-note">${escapeHtml(copy.modules.google.mapsAgentOneHint)}</p>
                <div class="app-agent-copy-grid">
                  ${renderAgentTextarea("maps_agent_one_box_one", copy.modules.google.mapsSearchBoxOne, promptCopy.agentOne.boxOne)}
                  ${renderAgentTextarea("maps_agent_one_box_two", copy.modules.google.mapsSearchBoxTwo, promptCopy.agentOne.boxTwo)}
                  ${renderAgentTextarea("maps_agent_one_box_three", copy.modules.google.mapsSearchBoxThree, promptCopy.agentOne.boxThree)}
                </div>
                <div class="app-form-actions"><button class="app-button primary" type="submit">${escapeHtml(copy.chrome.saveAgentCopy)}</button></div>
              </form>

              <article class="app-panel">
                ${renderSectionHeading(copy.modules.google.mapsResults, copy.modules.google.mapsResults)}
                <p class="app-google-section-note">${escapeHtml(copy.modules.google.mapsResultsHint)}</p>
                <div class="app-inline-badges">
                  ${renderBadge(`${escapeHtml(copy.chrome.totalLeads)} ${counts.total}`, "muted")}
                  ${renderBadge(`${escapeHtml(copy.chrome.shortlistCount)} ${counts.shortlist}`, "muted")}
                  ${renderBadge(`${escapeHtml(copy.chrome.qualifiedReady)} ${counts.qualified}`, "accent")}
                </div>
              </article>

              <section class="app-google-results-grid">
                ${renderImportCard(copy.modules.google.mapsResults, copy.chrome.resultLanePrimary, `maps:${activeMission.id}:research_primary`, activeMission.research_primary_result_json, copy)}
                ${renderImportCard(copy.modules.google.mapsResults, copy.chrome.resultLaneSecondary, `maps:${activeMission.id}:research_secondary`, activeMission.research_secondary_result_json, copy)}
              </section>

              <form class="app-panel" data-edit-record="google_maps_missions:${activeMission.id}">
                ${renderSectionHeading(copy.modules.google.mapsAgentTwo, copy.modules.google.mapsAgentTwo)}
                <p class="app-google-section-note">${escapeHtml(copy.modules.google.mapsAgentTwoHint)}</p>
                <div class="app-agent-copy-grid">
                  ${renderAgentTextarea("maps_agent_two_box_one", copy.modules.google.mapsAnalysisBoxOne, promptCopy.agentTwo.boxOne)}
                  ${renderAgentTextarea("maps_agent_two_box_two", copy.modules.google.mapsAnalysisBoxTwo, promptCopy.agentTwo.boxTwo)}
                  ${renderAgentTextarea("maps_agent_two_box_three", copy.modules.google.mapsAnalysisBoxThree, promptCopy.agentTwo.boxThree)}
                </div>
                <div class="app-form-actions"><button class="app-button primary" type="submit">${escapeHtml(copy.chrome.saveAgentCopy)}</button></div>
              </form>

              <section class="app-panel">
                ${renderSectionHeading(copy.chrome.filters, copy.chrome.filters)}
                <div class="app-form-grid">
                  <label>
                    <span>${escapeHtml(copy.forms.city)}</span>
                    <select data-google-filter="city">
                      <option value="all">${escapeHtml(copy.chrome.all)}</option>
                      ${cityOptions.map((city) => `<option value="${escapeHtml(city)}" ${state.googleFilters.city === city ? "selected" : ""}>${escapeHtml(city)}</option>`).join("")}
                    </select>
                  </label>
                  <label>
                    <span>${escapeHtml(copy.forms.category)}</span>
                    <select data-google-filter="category">
                      <option value="all">${escapeHtml(copy.chrome.all)}</option>
                      ${categoryOptions.map((category) => `<option value="${escapeHtml(category)}" ${state.googleFilters.category === category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}
                    </select>
                  </label>
                  <label>
                    <span>${escapeHtml(copy.chrome.tier)}</span>
                    <select data-google-filter="tier">
                      <option value="all">${escapeHtml(copy.chrome.all)}</option>
                      ${tierOptions.map((tier) => `<option value="${escapeHtml(tier)}" ${state.googleFilters.tier === tier ? "selected" : ""}>${escapeHtml(tier)}</option>`).join("")}
                    </select>
                  </label>
                </div>
              </section>

              <section class="app-board">
                ${MAPS_LEAD_STATUSES
                  .map((status) => {
                    const columnItems = filteredLeads.filter((item) => item.status === status);
                    return `
                      <article class="app-panel app-column">
                        ${renderSectionHeading(copy.chrome.status, localizeValue(copy, status), renderBadge(String(columnItems.length), "muted"))}
                        <div class="app-column-stack">
                          ${columnItems.length ? columnItems.map((item) => renderMapsLeadCard(item, copy)).join("") : renderEmptyState(copy)}
                        </div>
                      </article>
                    `;
                  })
                  .join("")}
              </section>

              <article class="app-panel">
                ${renderSectionHeading(copy.modules.google.mapsQualified, copy.modules.google.mapsQualified)}
                <p class="app-google-section-note">${escapeHtml(copy.modules.google.mapsQualifiedHint)}</p>
                <div class="app-qualified-grid">
                  ${
                    qualifiedLeads.length
                      ? qualifiedLeads
                          .map(
                            (record) => `
                              <div class="app-list-row static">
                                <div>
                                  <strong>${escapeHtml(record.company_name)}</strong>
                                  <p>${escapeHtml(record.category || "—")} • ${escapeHtml(copy.chrome.score)} ${escapeHtml(String(record.lead_score || 0))} • ${escapeHtml(copy.chrome.tier)} ${escapeHtml(record.score_tier || "D")}</p>
                                </div>
                                <div class="app-list-meta">
                                  ${record.converted_qualified_lead_id ? renderBadge(`${escapeHtml(copy.chrome.alreadyConverted)}: ${escapeHtml(record.converted_qualified_lead_id)}`, "muted") : renderBadge(localizeValue(copy, record.status), "accent")}
                                  <button class="app-button ghost" type="button" data-open-drawer="google_inbound_items:${record.id}">${escapeHtml(copy.chrome.open)}</button>
                                </div>
                              </div>
                            `,
                          )
                          .join("")
                      : renderEmptyState(copy)
                  }
                </div>
              </article>
            `
            : `<article class="app-panel">${renderEmptyState(copy)}</article>`
        }
      </div>
    </section>
  `;
}

function renderSearchOps(app) {
  const { copy, state } = app;
  const campaigns = selectGoogleSearchCampaigns(state);
  const activeCampaign = campaigns.find((campaign) => campaign.id === state.googleCampaignId) || campaigns[0] || null;
  const arabicCampaigns = campaigns.filter((campaign) => isArabicText(campaign.primary_keyword));
  const englishCampaigns = campaigns.filter((campaign) => !isArabicText(campaign.primary_keyword));
  const keywordRows = activeCampaign ? getKeywordRows(activeCampaign) : [];
  const agentRole = activeCampaign ? getSearchAgentRole(state, activeCampaign, copy) : copy.modules.google.searchRoleFallback;

  return `
    <section class="app-screen">
      <article class="app-panel">
        ${renderSectionHeading(copy.modules.google.searchCampaigns, copy.modules.google.searchCampaigns)}
        <form class="app-create-form" data-create-entity="google_rank_tasks">
          <div class="app-form-grid">
            <label><span>${escapeHtml(copy.forms.primaryKeyword)}</span><input name="primary_keyword" required /></label>
            <label><span>${escapeHtml(copy.forms.country)}</span><input name="country" value="Saudi Arabia" required /></label>
            <label><span>${escapeHtml(copy.forms.targetIntent)}</span><input name="target_intent" value="commercial" required /></label>
            <label><span>${escapeHtml(copy.forms.targetPage)}</span><input name="target_page" value="/services/mycalls" required /></label>
            <label class="wide"><span>${escapeHtml(copy.chrome.summary)}</span><input name="summary" required /></label>
            <label class="wide"><span>${escapeHtml(copy.chrome.nextStep)}</span><input name="next_step" value="${escapeHtml(copy.google.defaultCampaignNextStep)}" required /></label>
            <label><span>${escapeHtml(copy.chrome.nextStepDate)}</span><input type="date" name="next_step_date" value="${getTodayInputValue()}" required /></label>
          </div>
          <input type="hidden" name="campaign_status" value="Brief" />
          <div class="app-form-actions"><button class="app-button primary" type="submit">${escapeHtml(copy.chrome.createCampaign)}</button></div>
        </form>
      </article>

      <article class="app-panel">
        ${renderSectionHeading(copy.modules.google.keywordTabs, copy.modules.google.keywordTabs)}
        <p class="app-google-section-note">${escapeHtml(copy.modules.google.keywordTabsHint)}</p>
        <div class="app-keyword-tab-groups">
          <div class="app-tab-group">
            <p class="app-kicker">${escapeHtml(copy.modules.google.keywordArabicGroup)}</p>
            <div class="app-tab-row">
              ${arabicCampaigns.map((campaign) => renderKeywordTab(campaign, activeCampaign?.id, copy)).join("")}
              ${Array.from({ length: Math.max(0, 5 - arabicCampaigns.length) }, () => renderKeywordPlaceholder(copy.modules.google.emptyArabicKeyword)).join("")}
            </div>
          </div>
          <div class="app-tab-group">
            <p class="app-kicker">${escapeHtml(copy.modules.google.keywordEnglishGroup)}</p>
            <div class="app-tab-row">
              ${englishCampaigns.map((campaign) => renderKeywordTab(campaign, activeCampaign?.id, copy)).join("")}
              ${Array.from({ length: Math.max(0, 3 - englishCampaigns.length) }, () => renderKeywordPlaceholder(copy.modules.google.emptyEnglishKeyword)).join("")}
            </div>
          </div>
        </div>
      </article>

      ${
        activeCampaign
          ? `
            <form class="app-panel" data-edit-record="google_rank_tasks:${activeCampaign.id}">
              ${renderSectionHeading(copy.modules.google.searchAgent, activeCampaign.primary_keyword, renderBadge(localizeValue(copy, activeCampaign.campaign_status), "muted"))}
              <p class="app-google-section-note">${escapeHtml(copy.modules.google.searchAgentHint)}</p>
              ${renderAgentTextarea("search_agent_role", copy.modules.google.searchRoleBox, agentRole, 10)}
              <div class="app-form-actions"><button class="app-button primary" type="submit">${escapeHtml(copy.chrome.saveAgentCopy)}</button></div>
            </form>

            <section class="app-google-results-grid three-up">
              ${renderImportCard(copy.modules.google.searchAgent, copy.modules.google.searchImportLaneStrategy, `search:${activeCampaign.id}:keyword_strategy`, activeCampaign.keyword_strategy_result_json, copy)}
              ${renderImportCard(copy.modules.google.searchAgent, copy.modules.google.searchImportLaneCluster, `search:${activeCampaign.id}:subkeyword_cluster`, activeCampaign.subkeyword_cluster_result_json, copy)}
              ${renderImportCard(copy.modules.google.searchAgent, copy.modules.google.searchImportLanePlanner, `search:${activeCampaign.id}:article_planner`, activeCampaign.article_planner_result_json, copy)}
            </section>

            <form class="app-panel app-keyword-workbench" data-edit-record="google_rank_tasks:${activeCampaign.id}" data-search-keyword-workbench="true">
              ${renderSectionHeading(copy.modules.google.keywordWorkbench, activeCampaign.primary_keyword, `<button class="app-button ghost" type="button" data-open-drawer="google_rank_tasks:${activeCampaign.id}">${escapeHtml(copy.chrome.manageCampaign)}</button>`)}
              <p class="app-google-section-note">${escapeHtml(copy.modules.google.keywordWorkbenchHint)}</p>
              <div class="app-form-grid">
                <label><span>${escapeHtml(copy.forms.primaryKeyword)}</span><input name="primary_keyword" value="${escapeHtml(activeCampaign.primary_keyword)}" /></label>
                <label><span>${escapeHtml(copy.forms.country)}</span><input name="country" value="${escapeHtml(activeCampaign.country)}" /></label>
                <label><span>${escapeHtml(copy.forms.targetIntent)}</span><input name="target_intent" value="${escapeHtml(activeCampaign.target_intent)}" /></label>
                <label><span>${escapeHtml(copy.forms.targetPage)}</span><input name="target_page" value="${escapeHtml(activeCampaign.target_page)}" /></label>
                <label class="wide"><span>${escapeHtml(copy.chrome.summary)}</span><input name="summary" value="${escapeHtml(activeCampaign.summary || "")}" /></label>
              </div>
              <textarea class="app-hidden-field" data-hidden-subkeywords name="subkeywords">${escapeHtml(toTextBlock(activeCampaign.subkeywords))}</textarea>
              <textarea class="app-hidden-field" data-hidden-title-pairs name="article_title_pairs_json">${escapeHtml(activeCampaign.article_title_pairs_json || "[]")}</textarea>
              <textarea class="app-hidden-field" data-hidden-article-ideas>${escapeHtml(toJsonBlock(activeCampaign.article_ideas))}</textarea>
              <div class="app-keyword-rows">
                ${keywordRows.map((row) => renderKeywordWorkbenchRow(row, copy)).join("")}
              </div>
              <div class="app-form-actions"><button class="app-button primary" type="submit">${escapeHtml(copy.chrome.editKeywordSet)}</button></div>
            </form>
          `
          : `<article class="app-panel">${renderEmptyState(copy)}</article>`
      }
    </section>
  `;
}

function renderAgentSlot(app, record, slot, templates, copy, importToken) {
  const selectedTemplate = findTemplate(app.state, record[slot.templateField]);
  const preview = buildPromptPreview(selectedTemplate, record[slot.overrideField]);

  return `
    <article class="app-slot-card" data-prompt-slot="${escapeHtml(slot.key)}">
      <div class="app-slot-head">
        <div>
          <p class="app-kicker">${escapeHtml(localizeValue(copy, slot.key))}</p>
          <h4>${escapeHtml(localizeValue(copy, slot.workflow))}</h4>
        </div>
        <div class="app-topbar-actions">
          <button class="app-button ghost" type="button" data-copy-source="contract">${escapeHtml(copy.chrome.copyContract)}</button>
          <button class="app-button ghost" type="button" data-copy-source="prompt">${escapeHtml(copy.chrome.copyPrompt)}</button>
        </div>
      </div>
      <div class="app-form-grid">
        <label>
          <span>${escapeHtml(copy.chrome.template)}</span>
          <select name="${escapeHtml(slot.templateField)}" data-template-select>
            ${renderTemplateOptions(templates, record[slot.templateField], copy)}
          </select>
        </label>
        <label class="wide">
          <span>${escapeHtml(copy.chrome.taskOverride)}</span>
          <textarea name="${escapeHtml(slot.overrideField)}" data-override-input>${escapeHtml(record[slot.overrideField] || "")}</textarea>
        </label>
      </div>
      <div class="app-prompt-grid">
        <div>
          <p class="app-kicker">${escapeHtml(copy.chrome.promptPreview)}</p>
          <pre class="app-code-block" data-prompt-preview>${escapeHtml(preview || copy.chrome.empty)}</pre>
        </div>
        <div>
          <p class="app-kicker">${escapeHtml(copy.chrome.outputContract)}</p>
          <pre class="app-code-block" data-output-contract-preview>${escapeHtml(selectedTemplate?.output_contract_json || copy.chrome.empty)}</pre>
        </div>
      </div>
      <form class="app-create-form" data-import-json="${escapeHtml(importToken)}">
        <label class="wide"><span>${escapeHtml(copy.chrome.resultJson)}</span><textarea name="result_json">${escapeHtml(record[slot.resultField] || "")}</textarea></label>
        <div class="app-form-actions"><button class="app-button primary" type="submit">${escapeHtml(copy.chrome.importJson)}</button></div>
      </form>
    </article>
  `;
}

function renderGoogleMapsMissionDrawer(app, record) {
  const { copy, state } = app;
  return `
    <div class="app-drawer-stack">
      ${renderSectionHeading(copy.modules.google.mapsMissionOverview, record.title)}
      <form data-edit-record="google_maps_missions:${record.id}">
        <div class="app-form-grid">
          <label><span>${escapeHtml(copy.forms.title)}</span><input name="title" value="${escapeHtml(record.title)}" /></label>
          <label><span>${escapeHtml(copy.forms.country)}</span><input name="country" value="${escapeHtml(record.country)}" /></label>
          <label><span>${escapeHtml(copy.forms.cityScope)}</span><input name="city_scope" value="${escapeHtml(record.city_scope)}" /></label>
          <label><span>${escapeHtml(copy.forms.icpFocus)}</span><input name="icp_focus" value="${escapeHtml(record.icp_focus)}" /></label>
          <label class="wide"><span>${escapeHtml(copy.forms.businessTypes)}</span><textarea name="business_types">${escapeHtml(toTextBlock(record.business_types))}</textarea></label>
          <label class="wide"><span>${escapeHtml(copy.forms.mustHaveSignals)}</span><textarea name="must_have_signals">${escapeHtml(toTextBlock(record.must_have_signals))}</textarea></label>
          <label class="wide"><span>${escapeHtml(copy.forms.excludeSignals)}</span><textarea name="exclude_signals">${escapeHtml(toTextBlock(record.exclude_signals))}</textarea></label>
          <label class="wide"><span>${escapeHtml(copy.forms.searchGoal)}</span><textarea name="search_goal">${escapeHtml(record.search_goal)}</textarea></label>
          <label><span>${escapeHtml(copy.chrome.status)}</span><select name="status">${MAPS_MISSION_STATUSES.map((status) => `<option value="${status}" ${record.status === status ? "selected" : ""}>${escapeHtml(localizeValue(copy, status))}</option>`).join("")}</select></label>
          <label><span>${escapeHtml(copy.chrome.nextStepDate)}</span><input type="date" name="next_step_date" value="${escapeHtml(record.next_step_date)}" /></label>
          <label class="wide"><span>${escapeHtml(copy.chrome.nextStep)}</span><input name="next_step" value="${escapeHtml(record.next_step)}" /></label>
          <label class="wide"><span>${escapeHtml(copy.chrome.notes)}</span><textarea name="notes">${escapeHtml(record.notes || "")}</textarea></label>
        </div>
        <section class="app-slot-stack">
          ${MAPS_AGENT_SLOTS.map((slot) => renderAgentSlot(app, record, slot, selectPromptTemplates(state, slot.workflow), copy, `maps:${record.id}:${slot.key}`)).join("")}
        </section>
        <div class="app-form-actions"><button class="app-button primary" type="submit">${escapeHtml(copy.chrome.save)}</button></div>
      </form>
    </div>
  `;
}

function renderGoogleMapsLeadDrawer(app, record) {
  const { copy } = app;
  return `
    <div class="app-drawer-stack">
      ${renderSectionHeading(copy.modules.google.mapsLead, record.company_name)}
      <div class="app-detail-grid">
        ${renderKeyValue(copy.forms.city, record.city)}
        ${renderKeyValue(copy.forms.category, record.category)}
        ${renderKeyValue(copy.chrome.score, String(record.lead_score || 0))}
        ${renderKeyValue(copy.chrome.tier, record.score_tier || "D")}
        ${renderKeyValue(copy.forms.rating, String(record.rating || 0))}
        ${renderKeyValue(copy.forms.reviewsCount, String(record.reviews_count || 0))}
      </div>
      <a class="app-button ghost" href="${escapeHtml(record.maps_url)}" target="_blank" rel="noreferrer">${escapeHtml(copy.chrome.openMapsProfile)}</a>
      <form data-edit-record="google_inbound_items:${record.id}">
        <div class="app-form-grid">
          <label><span>${escapeHtml(copy.forms.city)}</span><input name="city" value="${escapeHtml(record.city)}" /></label>
          <label><span>${escapeHtml(copy.forms.category)}</span><input name="category" value="${escapeHtml(record.category)}" /></label>
          <label class="wide"><span>${escapeHtml(copy.chrome.summary)}</span><textarea name="summary">${escapeHtml(record.summary || "")}</textarea></label>
          <label class="wide"><span>${escapeHtml(copy.forms.fitNotes)}</span><textarea name="fit_notes">${escapeHtml(record.fit_notes || "")}</textarea></label>
          <label class="wide"><span>${escapeHtml(copy.forms.callDependencySignal)}</span><input name="call_dependency_signal" value="${escapeHtml(record.call_dependency_signal || "")}" /></label>
          <label class="wide"><span>${escapeHtml(copy.forms.painSignals)}</span><textarea name="pain_signals">${escapeHtml(toTextBlock(record.pain_signals))}</textarea></label>
          <label><span>${escapeHtml(copy.chrome.score)}</span><input type="number" name="lead_score" value="${escapeHtml(String(record.lead_score || 0))}" /></label>
          <label><span>${escapeHtml(copy.chrome.tier)}</span><select name="score_tier">${["A", "B", "C", "D"].map((tier) => `<option value="${tier}" ${record.score_tier === tier ? "selected" : ""}>${escapeHtml(tier)}</option>`).join("")}</select></label>
          <label class="wide"><span>${escapeHtml(copy.forms.scoreBreakdown)}</span><textarea name="score_breakdown">${escapeHtml(toJsonBlock(record.score_breakdown))}</textarea></label>
          <label><span>${escapeHtml(copy.chrome.service)}</span><select name="recommended_service"><option value="">${escapeHtml(copy.chrome.chooseService)}</option><option value="mycalls" ${record.recommended_service === "mycalls" ? "selected" : ""}>${escapeHtml(copy.values.mycalls)}</option><option value="nicechat" ${record.recommended_service === "nicechat" ? "selected" : ""}>${escapeHtml(copy.values.nicechat)}</option><option value="both" ${record.recommended_service === "both" ? "selected" : ""}>${escapeHtml(copy.values.both)}</option></select></label>
          <label class="wide"><span>${escapeHtml(copy.forms.qualificationNote)}</span><textarea name="qualification_note">${escapeHtml(record.qualification_note || "")}</textarea></label>
          <label class="wide"><span>${escapeHtml(copy.chrome.nextStep)}</span><input name="next_step" value="${escapeHtml(record.next_step || "")}" /></label>
          <label><span>${escapeHtml(copy.chrome.nextStepDate)}</span><input type="date" name="next_step_date" value="${escapeHtml(record.next_step_date || "")}" /></label>
          <label class="wide"><span>${escapeHtml(copy.chrome.notes)}</span><textarea name="notes">${escapeHtml(record.notes || "")}</textarea></label>
        </div>
        <div class="app-form-actions"><button class="app-button primary" type="submit">${escapeHtml(copy.chrome.save)}</button></div>
      </form>
      <div class="app-action-row">
        ${(TRANSITION_MAPS.google_inbound_items[record.status] || []).map((status) => `<button class="app-button ghost" type="button" data-transition="google_inbound_items:${record.id}:${status}">${escapeHtml(localizeValue(copy, status))}</button>`).join("")}
      </div>
      ${
        record.status === "Qualified" && !record.converted_qualified_lead_id
          ? `
            <form data-convert-source="google_inbound_items:${record.id}">
              <div class="app-form-grid">
                <label class="wide"><span>${escapeHtml(copy.forms.painSummary)}</span><input name="pain_summary" value="${escapeHtml(record.fit_notes || record.summary || "")}" /></label>
                <label class="wide"><span>${escapeHtml(copy.forms.qualificationNote)}</span><textarea name="qualification_note">${escapeHtml(record.qualification_note || record.summary || "")}</textarea></label>
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

function renderGoogleSearchCampaignDrawer(app, record) {
  const { copy, state } = app;
  return `
    <div class="app-drawer-stack">
      ${renderSectionHeading(copy.modules.google.searchCampaigns, record.primary_keyword)}
      <form data-edit-record="google_rank_tasks:${record.id}">
        <div class="app-form-grid">
          <label><span>${escapeHtml(copy.forms.primaryKeyword)}</span><input name="primary_keyword" value="${escapeHtml(record.primary_keyword)}" /></label>
          <label><span>${escapeHtml(copy.forms.country)}</span><input name="country" value="${escapeHtml(record.country)}" /></label>
          <label><span>${escapeHtml(copy.forms.targetIntent)}</span><input name="target_intent" value="${escapeHtml(record.target_intent)}" /></label>
          <label><span>${escapeHtml(copy.forms.targetPage)}</span><input name="target_page" value="${escapeHtml(record.target_page)}" /></label>
          <label><span>${escapeHtml(copy.chrome.status)}</span><select name="campaign_status">${SEARCH_CAMPAIGN_STATUSES.map((status) => `<option value="${status}" ${record.campaign_status === status ? "selected" : ""}>${escapeHtml(localizeValue(copy, status))}</option>`).join("")}</select></label>
          <label><span>${escapeHtml(copy.chrome.nextStepDate)}</span><input type="date" name="next_step_date" value="${escapeHtml(record.next_step_date || "")}" /></label>
          <label class="wide"><span>${escapeHtml(copy.chrome.summary)}</span><textarea name="summary">${escapeHtml(record.summary || "")}</textarea></label>
          <label class="wide"><span>${escapeHtml(copy.chrome.nextStep)}</span><input name="next_step" value="${escapeHtml(record.next_step || "")}" /></label>
          <label class="wide"><span>${escapeHtml(copy.forms.subkeywords)}</span><textarea name="subkeywords">${escapeHtml(toTextBlock(record.subkeywords))}</textarea></label>
          <label class="wide"><span>${escapeHtml(copy.forms.articleIdeasJson)}</span><textarea name="article_ideas">${escapeHtml(toJsonBlock(record.article_ideas))}</textarea></label>
          <label class="wide"><span>${escapeHtml(copy.chrome.notes)}</span><textarea name="notes">${escapeHtml(record.notes || "")}</textarea></label>
        </div>
        <section class="app-slot-stack">
          ${SEARCH_AGENT_SLOTS.map((slot) => renderAgentSlot(app, record, slot, selectPromptTemplates(state, slot.workflow), copy, `search:${record.id}:${slot.key}`)).join("")}
        </section>
        <div class="app-form-actions"><button class="app-button primary" type="submit">${escapeHtml(copy.chrome.save)}</button></div>
      </form>
    </div>
  `;
}

function renderGoogleTemplatesLibraryDrawer(app) {
  const { copy, state } = app;
  const templates = [...(state.data.google_prompt_templates || [])].sort((left, right) => String(left.name || "").localeCompare(String(right.name || "")));

  return `
    <div class="app-drawer-stack">
      ${renderSectionHeading(copy.modules.google.templates, copy.modules.google.templates)}
      <form class="app-create-form" data-create-entity="google_prompt_templates">
        <div class="app-form-grid">
          <label><span>${escapeHtml(copy.chrome.workflow)}</span><select name="workflow">${["maps-search", "maps-shortlist", "seo-keyword-strategy", "seo-subkeyword-cluster", "seo-article-planner"].map((workflow) => `<option value="${workflow}">${escapeHtml(localizeValue(copy, workflow))}</option>`).join("")}</select></label>
          <label><span>${escapeHtml(copy.forms.name)}</span><input name="name" required /></label>
          <label><span>${escapeHtml(copy.chrome.status)}</span><select name="active"><option value="true">${escapeHtml(copy.chrome.active)}</option><option value="false">${escapeHtml(copy.chrome.inactive)}</option></select></label>
          <label class="wide"><span>${escapeHtml(copy.chrome.basePrompt)}</span><textarea name="base_prompt" required></textarea></label>
          <label class="wide"><span>${escapeHtml(copy.chrome.outputContract)}</span><textarea name="output_contract_json" required>{}</textarea></label>
        </div>
        <div class="app-form-actions"><button class="app-button primary" type="submit">${escapeHtml(copy.chrome.createTemplate)}</button></div>
      </form>
      <div class="app-slot-stack">
        ${
          templates.length
            ? templates
                .map(
                  (template) => `
                    <form class="app-panel" data-edit-record="google_prompt_templates:${template.id}">
                      ${renderSectionHeading(localizeValue(copy, template.workflow), template.name, renderBadge(template.active ? copy.chrome.active : copy.chrome.inactive, template.active ? "accent" : "muted"))}
                      <div class="app-form-grid">
                        <label><span>${escapeHtml(copy.chrome.workflow)}</span><select name="workflow">${["maps-search", "maps-shortlist", "seo-keyword-strategy", "seo-subkeyword-cluster", "seo-article-planner"].map((workflow) => `<option value="${workflow}" ${template.workflow === workflow ? "selected" : ""}>${escapeHtml(localizeValue(copy, workflow))}</option>`).join("")}</select></label>
                        <label><span>${escapeHtml(copy.forms.name)}</span><input name="name" value="${escapeHtml(template.name)}" /></label>
                        <label><span>${escapeHtml(copy.chrome.status)}</span><select name="active"><option value="true" ${template.active ? "selected" : ""}>${escapeHtml(copy.chrome.active)}</option><option value="false" ${!template.active ? "selected" : ""}>${escapeHtml(copy.chrome.inactive)}</option></select></label>
                        <label class="wide"><span>${escapeHtml(copy.chrome.basePrompt)}</span><textarea name="base_prompt">${escapeHtml(template.base_prompt || "")}</textarea></label>
                        <label class="wide"><span>${escapeHtml(copy.chrome.outputContract)}</span><textarea name="output_contract_json">${escapeHtml(template.output_contract_json || "{}")}</textarea></label>
                      </div>
                      <div class="app-form-actions"><button class="app-button primary" type="submit">${escapeHtml(copy.chrome.save)}</button></div>
                    </form>
                  `,
                )
                .join("")
            : renderEmptyState(copy)
        }
      </div>
    </div>
  `;
}

function renderGoogleShell(app) {
  const { copy, state } = app;
  const activeTab = state.googleTab || "maps-ops";

  return `
    <section class="app-screen workspace-screen">
      <header class="app-hero compact">
        <div>
          <p class="app-kicker">Google</p>
          <h1>${escapeHtml(copy.modules.google.title)}</h1>
          <p class="app-hero-copy">${escapeHtml(copy.modules.google.subtitle)}</p>
        </div>
        <div class="app-topbar-actions">
          <button class="app-button ghost" type="button" data-open-drawer="google_prompt_templates_library:library">${escapeHtml(copy.modules.google.templates)}</button>
          <div class="app-tab-row">
            <button class="app-tab ${activeTab === "maps-ops" ? "active" : ""}" type="button" data-set-google-tab="maps-ops">${escapeHtml(copy.modules.google.mapsOps)} ${renderBadge(String((state.data.google_maps_missions || []).length), "muted")}</button>
            <button class="app-tab ${activeTab === "search-ops" ? "active" : ""}" type="button" data-set-google-tab="search-ops">${escapeHtml(copy.modules.google.searchOps)} ${renderBadge(String((state.data.google_rank_tasks || []).length), "muted")}</button>
          </div>
        </div>
      </header>
      ${activeTab === "maps-ops" ? renderMapsOps(app) : renderSearchOps(app)}
    </section>
  `;
}

function renderGoogleDrawer(app, entity, record) {
  if (entity === "google_prompt_templates_library") {
    return renderGoogleTemplatesLibraryDrawer(app);
  }
  if (entity === "google_maps_missions") {
    return renderGoogleMapsMissionDrawer(app, record);
  }
  if (entity === "google_inbound_items") {
    return renderGoogleMapsLeadDrawer(app, record);
  }
  if (entity === "google_rank_tasks") {
    return renderGoogleSearchCampaignDrawer(app, record);
  }
  return `<div class="app-empty">${escapeHtml(app.copy.chrome.empty)}</div>`;
}

export {
  buildPromptPreview,
  findTemplate,
  renderGoogleDrawer,
  renderGoogleShell,
  selectGoogleMapsMissions,
  selectGoogleSearchCampaigns,
};
