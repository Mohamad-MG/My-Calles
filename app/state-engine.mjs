import {
  MAPS_AGENT_SLOTS,
  MAPS_LEAD_STATUSES,
  MAPS_MISSION_STATUSES,
  MAPS_SCORE_KEYS,
  SEARCH_AGENT_SLOTS,
  SEARCH_CAMPAIGN_STATUSES,
  SERVICE_CONFIDENCE_OPTIONS,
  SERVICE_OPTIONS,
  createBlankScoreBreakdown,
  createId,
  createOpportunityFromQualifiedLead,
  createQualifiedLeadFromSource,
  createSeedData,
  deepClone,
  getCreateErrors,
  getDisplayStatus,
  getRequiredErrors,
  getScoreTier,
  getSourceRecord,
  getStatusField,
  hasDuplicateOpportunity,
  normalizeArticleIdeas,
  normalizeJsonText,
  normalizeScoreBreakdown,
  normalizeState,
  normalizeStringList,
  nowDate,
  resolveCollection,
  validateStatusPatch,
} from "./domain.mjs";

function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return deepClone(value);
}

function stripRuntimeFields(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }
  const next = { ...payload };
  delete next.recent_activity;
  return next;
}

function buildRecentActivity(records = []) {
  return records
    .slice(-6)
    .reverse()
    .map((entry) => ({
      id: `${entry.entity}-${entry.id}-${entry.state_version}`,
      entity: entry.entity,
      action: entry.action,
      record_id: entry.id,
      timestamp: entry.timestamp,
      summary:
        entry.after?.summary ||
        entry.after?.company_name ||
        entry.after?.profile_name ||
        entry.after?.primary_keyword ||
        entry.after?.title ||
        entry.after?.name ||
        entry.after?.pain_summary ||
        entry.after?.next_step ||
        entry.id,
    }));
}

function normalizeAuditRecords(records = []) {
  return (Array.isArray(records) ? records : []).filter(Boolean).map((entry) => ({
    action: entry.action || "patch",
    entity: entry.entity || "unknown",
    id: entry.id || "unknown",
    before: entry.before || null,
    after: entry.after || null,
    timestamp: entry.timestamp || new Date().toISOString(),
    user: entry.user || entry.actor || "system",
    state_version: Number(entry.state_version || 1),
  }));
}

function createEnvelope(candidate = null) {
  if (!candidate) {
    return {
      state: createSeedData(),
      audit_records: [],
    };
  }

  if ("state" in candidate) {
    return {
      state: normalizeState(stripRuntimeFields(candidate.state)),
      audit_records: normalizeAuditRecords(candidate.audit_records),
    };
  }

  return {
    state: normalizeState(stripRuntimeFields(candidate)),
    audit_records: normalizeAuditRecords(candidate.audit_records),
  };
}

function getPublicStateFromEnvelope(envelope) {
  return {
    ...clone(envelope.state),
    recent_activity: buildRecentActivity(envelope.audit_records),
  };
}

function withStateMeta(state, meta = {}) {
  return {
    ...state,
    _meta: {
      version: meta.version || 1,
      last_mutation_at: meta.lastMutationAt || null,
      last_mutation_by: meta.lastMutationBy || null,
    },
  };
}

function normalizeDraft(collection, draft, actor = "system", timestamp = nowDate()) {
  const normalizedCollection = resolveCollection(collection);
  const normalizedState = normalizeState(
    {
      [normalizedCollection]: [draft],
    },
    actor,
    timestamp,
  );
  return normalizedState[normalizedCollection][0];
}

function commitMutation(envelope, { action, entity, id, before, after, nextState, actor = "system", timestamp = nowDate() }) {
  const currentVersion = Number(envelope.state?._meta?.version || 1);
  const committedState = withStateMeta(normalizeState(nextState, actor, timestamp), {
    version: currentVersion + 1,
    lastMutationAt: timestamp,
    lastMutationBy: actor,
  });

  const auditEntry = {
    action,
    entity,
    id,
    before,
    after,
    timestamp,
    user: actor,
    state_version: currentVersion + 1,
  };

  const nextEnvelope = {
    state: committedState,
    audit_records: [...(envelope.audit_records || []), auditEntry].slice(-250),
  };

  return {
    envelope: nextEnvelope,
    payload: getPublicStateFromEnvelope(nextEnvelope),
    version: currentVersion + 1,
    auditEntry,
  };
}

function preparePatchErrors(collection, currentState, after) {
  if (collection === "opportunities") {
    return getCreateErrors(collection, currentState, after).filter(
      (error) => !error.includes("already exists") && !error.includes("only be created"),
    );
  }

  if (collection === "qualified_leads") {
    const errors = getRequiredErrors(collection, after);
    if (!SERVICE_OPTIONS.includes(after.recommended_service)) {
      errors.push('Field "recommended_service" is invalid.');
    }
    if (!SERVICE_CONFIDENCE_OPTIONS.includes(after.recommended_service_confidence)) {
      errors.push('Field "recommended_service_confidence" is invalid.');
    }
    return errors;
  }

  return getCreateErrors(collection, currentState, after);
}

function patchEntityState(envelope, entity, id, patch, actor = "system", timestamp = nowDate()) {
  const collection = resolveCollection(entity);
  const currentState = envelope.state;
  const nextState = clone(currentState);
  const index = nextState[collection].findIndex((item) => item.id === id);

  if (index < 0) {
    throw new Error("Record not found.");
  }

  const before = nextState[collection][index];
  const after = normalizeDraft(
    collection,
    {
      ...before,
      ...patch,
      updated_at: timestamp,
      updated_by: actor,
    },
    actor,
    timestamp,
  );

  const statusField = getStatusField(collection);
  if (statusField in patch) {
    validateStatusPatch(collection, before, after);
  }

  const errors = preparePatchErrors(collection, currentState, after);
  if (errors.length) {
    throw new Error(errors.join(" "));
  }

  nextState[collection][index] = after;
  return commitMutation(envelope, {
    action: "patch",
    entity: collection,
    id,
    before,
    after,
    nextState,
    actor,
    timestamp,
  });
}

function createEntityState(envelope, entity, values, actor = "system", timestamp = nowDate()) {
  const collection = resolveCollection(entity);
  const currentState = envelope.state;
  const existing = currentState[collection].find((item) => item.id === values.id);

  if (existing) {
    return {
      envelope,
      payload: getPublicStateFromEnvelope(envelope),
      version: Number(currentState?._meta?.version || 1),
      auditEntry: null,
      record: clone(existing),
      created: false,
      duplicate: true,
    };
  }

  const draft = normalizeDraft(
    collection,
    {
      ...values,
      created_at: values.created_at || timestamp,
      updated_at: timestamp,
      updated_by: actor,
    },
    actor,
    timestamp,
  );
  const errors = getCreateErrors(collection, currentState, draft);
  if (errors.length) {
    throw new Error(errors.join(" "));
  }

  const nextState = clone(currentState);
  nextState[collection].unshift(draft);
  const committed = commitMutation(envelope, {
    action: "create",
    entity: collection,
    id: draft.id,
    before: null,
    after: draft,
    nextState,
    actor,
    timestamp,
  });

  return {
    ...committed,
    record: clone(draft),
    created: true,
    duplicate: false,
  };
}

function convertQualifiedLeadState(envelope, payload, actor = "system", timestamp = nowDate()) {
  const currentState = envelope.state;
  const { source_entity, source_id } = payload;
  const sourceRecord = getSourceRecord(currentState, source_entity, source_id);

  if (!sourceRecord) {
    throw new Error("Source record not found.");
  }

  const qualifiedLead = normalizeDraft(
    "qualified_leads",
    createQualifiedLeadFromSource(
      sourceRecord,
      source_entity,
      {
        id: payload.id,
        pain_summary: payload.pain_summary,
        qualification_note: payload.qualification_note,
        recommended_service: payload.recommended_service,
        recommended_service_confidence: payload.recommended_service_confidence,
        handoff_status: payload.handoff_status || "New",
        owner: payload.owner || sourceRecord.owner,
        notes: payload.notes || "",
      },
      actor,
      timestamp,
    ),
    actor,
    timestamp,
  );
  const errors = getCreateErrors("qualified_leads", currentState, qualifiedLead);

  if (errors.length) {
    throw new Error(errors.join(" "));
  }

  const nextState = clone(currentState);
  const collection = resolveCollection(source_entity);
  const sourceIndex = nextState[collection].findIndex((item) => item.id === source_id);
  nextState[collection][sourceIndex] = normalizeDraft(
    collection,
    {
      ...nextState[collection][sourceIndex],
      converted_qualified_lead_id: qualifiedLead.id,
      updated_at: timestamp,
      updated_by: actor,
    },
    actor,
    timestamp,
  );
  nextState.qualified_leads.unshift(qualifiedLead);

  return commitMutation(envelope, {
    action: "convert-to-qualified-lead",
    entity: "qualified_leads",
    id: qualifiedLead.id,
    before: sourceRecord,
    after: qualifiedLead,
    nextState,
    actor,
    timestamp,
  });
}

function createOpportunityState(envelope, payload, actor = "system", timestamp = nowDate()) {
  const currentState = envelope.state;
  const qualifiedLead = currentState.qualified_leads.find((item) => item.id === payload.qualified_lead_id);

  if (!qualifiedLead) {
    throw new Error("Opportunity can only be created from a qualified lead.");
  }
  if (qualifiedLead.handoff_status !== "Ready for Opportunity") {
    throw new Error("Qualified lead must be Ready for Opportunity first.");
  }
  if (qualifiedLead.converted_opportunity_id || hasDuplicateOpportunity(currentState, qualifiedLead.id)) {
    throw new Error("An opportunity already exists for this qualified lead.");
  }

  const draft = normalizeDraft(
    "opportunities",
    createOpportunityFromQualifiedLead(qualifiedLead, payload, actor, timestamp),
    actor,
    timestamp,
  );
  const errors = getCreateErrors("opportunities", currentState, draft);
  if (errors.length) {
    throw new Error(errors.join(" "));
  }

  const nextState = clone(currentState);
  nextState.opportunities.unshift(draft);
  const handoffIndex = nextState.qualified_leads.findIndex((item) => item.id === qualifiedLead.id);
  nextState.qualified_leads[handoffIndex] = normalizeDraft(
    "qualified_leads",
    {
      ...nextState.qualified_leads[handoffIndex],
      converted_opportunity_id: draft.id,
      updated_at: timestamp,
      updated_by: actor,
    },
    actor,
    timestamp,
  );

  return commitMutation(envelope, {
    action: "converted-to-opportunity",
    entity: "opportunities",
    id: draft.id,
    before: qualifiedLead,
    after: draft,
    nextState,
    actor,
    timestamp,
  });
}

function restoreSeedState(envelope, actor = "system", timestamp = nowDate(), reason = "restore-seed") {
  const nextState = normalizeState(createSeedData(), actor, timestamp);
  return commitMutation(envelope, {
    action: reason,
    entity: "state",
    id: "dashboard",
    before: envelope.state,
    after: nextState,
    nextState,
    actor,
    timestamp,
  });
}

function parseImportBody(body = {}) {
  if (body.result_json) {
    try {
      return JSON.parse(body.result_json);
    } catch {
      throw new Error("Imported JSON is invalid.");
    }
  }
  return body;
}

function getMapsMission(state, missionId) {
  return (state.google_maps_missions || []).find((mission) => mission.id === missionId) || null;
}

function getSearchCampaign(state, campaignId) {
  return (state.google_rank_tasks || []).find((campaign) => campaign.id === campaignId) || null;
}

function updateMissionSlotResult(nextState, missionId, slotKey, rawJson, actor, timestamp, status) {
  const slot = MAPS_AGENT_SLOTS.find((item) => item.key === slotKey);
  if (!slot) {
    throw new Error("Unknown Google Maps agent slot.");
  }
  const missionIndex = nextState.google_maps_missions.findIndex((mission) => mission.id === missionId);
  if (missionIndex < 0) {
    throw new Error("Google Maps mission not found.");
  }
  const mission = nextState.google_maps_missions[missionIndex];
  nextState.google_maps_missions[missionIndex] = normalizeDraft(
    "google_maps_missions",
    {
      ...mission,
      [slot.resultField]: normalizeJsonText(rawJson, ""),
      status: status || mission.status,
      updated_at: timestamp,
      updated_by: actor,
    },
    actor,
    timestamp,
  );
}

function updateCampaignSlotResult(nextState, campaignId, slotKey, rawJson, actor, timestamp, campaignStatus) {
  const slot = SEARCH_AGENT_SLOTS.find((item) => item.key === slotKey);
  if (!slot) {
    throw new Error("Unknown Search Ops agent slot.");
  }
  const campaignIndex = nextState.google_rank_tasks.findIndex((campaign) => campaign.id === campaignId);
  if (campaignIndex < 0) {
    throw new Error("Google Search campaign not found.");
  }
  const campaign = nextState.google_rank_tasks[campaignIndex];
  nextState.google_rank_tasks[campaignIndex] = normalizeDraft(
    "google_rank_tasks",
    {
      ...campaign,
      [slot.resultField]: normalizeJsonText(rawJson, ""),
      campaign_status: campaignStatus || campaign.campaign_status,
      updated_at: timestamp,
      updated_by: actor,
    },
    actor,
    timestamp,
  );
}

function importMapsSearchState(envelope, missionId, body, actor = "system", timestamp = nowDate()) {
  const mission = getMapsMission(envelope.state, missionId);
  if (!mission) {
    throw new Error("Google Maps mission not found.");
  }

  const parsed = parseImportBody(body);
  if (parsed.mission_id && parsed.mission_id !== missionId) {
    throw new Error("Imported mission_id does not match the selected mission.");
  }

  const results = Array.isArray(parsed.results) ? parsed.results : [];
  if (!results.length) {
    throw new Error("Maps search import must include results[].");
  }

  const seenUrls = new Set();
  const existingUrls = new Set(
    (envelope.state.google_inbound_items || [])
      .filter((item) => item.mission_id === missionId)
      .map((item) => item.maps_url),
  );
  const nextState = clone(envelope.state);

  const createdRecords = results.map((result) => {
    if (!result.company_name || !result.maps_url || !result.city || !result.category) {
      throw new Error("Each imported maps result needs company_name, maps_url, city, and category.");
    }
    if (seenUrls.has(result.maps_url) || existingUrls.has(result.maps_url)) {
      throw new Error("Duplicate maps_url detected inside the mission.");
    }
    seenUrls.add(result.maps_url);
    return normalizeDraft(
      "google_inbound_items",
      {
        id: createId("gmlead"),
        mission_id: missionId,
        company_name: result.company_name,
        maps_url: result.maps_url,
        city: result.city,
        category: result.category,
        website: result.website || "",
        phone: result.phone || "",
        rating: result.rating || 0,
        reviews_count: result.reviews_count || 0,
        branch_count_estimate: result.branch_count_estimate || 0,
        call_dependency_signal: result.call_dependency_signal || "",
        pain_signals: normalizeStringList(result.pain_signals),
        fit_notes: result.fit_notes || "",
        recommended_service: "",
        qualification_note: "",
        score_breakdown: createBlankScoreBreakdown(),
        lead_score: 0,
        score_tier: "D",
        summary: result.fit_notes || normalizeStringList(result.pain_signals).join(", "),
        status: "Discovered",
        next_step: "Run shortlist scoring on the imported Google Maps leads.",
        next_step_date: timestamp,
        created_at: timestamp,
        updated_at: timestamp,
        updated_by: actor,
      },
      actor,
      timestamp,
    );
  });

  nextState.google_inbound_items = [...createdRecords, ...nextState.google_inbound_items];
  updateMissionSlotResult(nextState, missionId, body.slot_key || "research_primary", body.result_json || parsed, actor, timestamp, "Shortlist Pending");

  return commitMutation(envelope, {
    action: "import-maps-search",
    entity: "google_maps_missions",
    id: missionId,
    before: mission,
    after: nextState.google_maps_missions.find((item) => item.id === missionId),
    nextState,
    actor,
    timestamp,
  });
}

function normalizeShortlistScoreBreakdown(value) {
  const breakdown = normalizeScoreBreakdown(value);
  let total = 0;
  for (const key of MAPS_SCORE_KEYS) {
    total += breakdown[key];
  }
  if (total > 100) {
    throw new Error("Score breakdown total cannot exceed 100.");
  }
  return breakdown;
}

function importMapsShortlistState(envelope, missionId, body, actor = "system", timestamp = nowDate()) {
  const mission = getMapsMission(envelope.state, missionId);
  if (!mission) {
    throw new Error("Google Maps mission not found.");
  }

  const parsed = parseImportBody(body);
  if (parsed.mission_id && parsed.mission_id !== missionId) {
    throw new Error("Imported mission_id does not match the selected mission.");
  }

  const shortlist = Array.isArray(parsed.shortlist) ? parsed.shortlist : [];
  if (!shortlist.length) {
    throw new Error("Maps shortlist import must include shortlist[].");
  }

  const nextState = clone(envelope.state);
  const seenUrls = new Set();

  for (const candidate of shortlist) {
    if (!candidate.maps_url) {
      throw new Error("Each shortlist item must include maps_url.");
    }
    if (seenUrls.has(candidate.maps_url)) {
      throw new Error("Duplicate maps_url detected in shortlist import.");
    }
    seenUrls.add(candidate.maps_url);

    const index = nextState.google_inbound_items.findIndex(
      (item) => item.mission_id === missionId && item.maps_url === candidate.maps_url,
    );
    if (index < 0) {
      throw new Error("Shortlist import references a Google Maps lead that does not exist in the mission.");
    }

    const leadScore = Number(candidate.lead_score);
    if (!Number.isFinite(leadScore) || leadScore < 0 || leadScore > 100) {
      throw new Error("Shortlist lead_score must be between 0 and 100.");
    }

    const tier = candidate.tier || getScoreTier(leadScore);
    if (!["A", "B", "C", "D"].includes(tier)) {
      throw new Error("Shortlist tier must be one of A, B, C, or D.");
    }

    const breakdown = normalizeShortlistScoreBreakdown(candidate.score_breakdown);
    const nextStatus = leadScore >= 50 ? "Shortlisted" : "Disqualified";
    const current = nextState.google_inbound_items[index];
    nextState.google_inbound_items[index] = normalizeDraft(
      "google_inbound_items",
      {
        ...current,
        lead_score: leadScore,
        score_tier: tier,
        score_breakdown: breakdown,
        recommended_service: candidate.recommended_service || current.recommended_service || "",
        qualification_note: candidate.qualification_note || current.qualification_note || "",
        status: current.status === "Qualified" && nextStatus === "Shortlisted" ? "Qualified" : nextStatus,
        next_step:
          leadScore >= 50
            ? "Review the shortlist and decide whether to mark the lead as qualified."
            : "Keep the lead out of the shortlist unless new data appears.",
        next_step_date: timestamp,
        updated_at: timestamp,
        updated_by: actor,
      },
      actor,
      timestamp,
    );
  }

  updateMissionSlotResult(nextState, missionId, body.slot_key || "shortlist", body.result_json || parsed, actor, timestamp, "Ready for Review");

  return commitMutation(envelope, {
    action: "import-maps-shortlist",
    entity: "google_maps_missions",
    id: missionId,
    before: mission,
    after: nextState.google_maps_missions.find((item) => item.id === missionId),
    nextState,
    actor,
    timestamp,
  });
}

function importKeywordStrategyState(envelope, campaignId, body, actor = "system", timestamp = nowDate()) {
  const campaign = getSearchCampaign(envelope.state, campaignId);
  if (!campaign) {
    throw new Error("Google Search campaign not found.");
  }

  const parsed = parseImportBody(body);
  if (!parsed.primary_keyword || !parsed.target_intent || !parsed.target_page) {
    throw new Error("Keyword strategy import must include primary_keyword, target_intent, and target_page.");
  }

  const nextState = clone(envelope.state);
  const index = nextState.google_rank_tasks.findIndex((item) => item.id === campaignId);
  nextState.google_rank_tasks[index] = normalizeDraft(
    "google_rank_tasks",
    {
      ...nextState.google_rank_tasks[index],
      primary_keyword: parsed.primary_keyword,
      target_intent: parsed.target_intent,
      target_page: parsed.target_page,
      campaign_status: "Research Ready",
      summary: nextState.google_rank_tasks[index].summary || `Own the keyword ${parsed.primary_keyword}.`,
      updated_at: timestamp,
      updated_by: actor,
    },
    actor,
    timestamp,
  );
  updateCampaignSlotResult(nextState, campaignId, body.slot_key || "keyword_strategy", body.result_json || parsed, actor, timestamp, "Research Ready");

  return commitMutation(envelope, {
    action: "import-search-keyword-strategy",
    entity: "google_rank_tasks",
    id: campaignId,
    before: campaign,
    after: nextState.google_rank_tasks[index],
    nextState,
    actor,
    timestamp,
  });
}

function importSubkeywordClusterState(envelope, campaignId, body, actor = "system", timestamp = nowDate()) {
  const campaign = getSearchCampaign(envelope.state, campaignId);
  if (!campaign) {
    throw new Error("Google Search campaign not found.");
  }

  const parsed = parseImportBody(body);
  const subkeywords = normalizeStringList(parsed.subkeywords);
  if (!subkeywords.length) {
    throw new Error("Subkeyword cluster import must include subkeywords[].");
  }

  const nextState = clone(envelope.state);
  const index = nextState.google_rank_tasks.findIndex((item) => item.id === campaignId);
  nextState.google_rank_tasks[index] = normalizeDraft(
    "google_rank_tasks",
    {
      ...nextState.google_rank_tasks[index],
      subkeywords,
      campaign_status: "Cluster Ready",
      updated_at: timestamp,
      updated_by: actor,
    },
    actor,
    timestamp,
  );
  updateCampaignSlotResult(nextState, campaignId, body.slot_key || "subkeyword_cluster", body.result_json || parsed, actor, timestamp, "Cluster Ready");

  return commitMutation(envelope, {
    action: "import-search-subkeyword-cluster",
    entity: "google_rank_tasks",
    id: campaignId,
    before: campaign,
    after: nextState.google_rank_tasks[index],
    nextState,
    actor,
    timestamp,
  });
}

function importArticlePlanState(envelope, campaignId, body, actor = "system", timestamp = nowDate()) {
  const campaign = getSearchCampaign(envelope.state, campaignId);
  if (!campaign) {
    throw new Error("Google Search campaign not found.");
  }

  const parsed = parseImportBody(body);
  const articleIdeas = normalizeArticleIdeas(parsed.article_ideas);
  if (articleIdeas.length !== 10) {
    throw new Error("Article planner import must include exactly 10 article ideas.");
  }

  const nextState = clone(envelope.state);
  const index = nextState.google_rank_tasks.findIndex((item) => item.id === campaignId);
  nextState.google_rank_tasks[index] = normalizeDraft(
    "google_rank_tasks",
    {
      ...nextState.google_rank_tasks[index],
      article_ideas: articleIdeas,
      campaign_status: "Writing",
      updated_at: timestamp,
      updated_by: actor,
    },
    actor,
    timestamp,
  );
  updateCampaignSlotResult(nextState, campaignId, body.slot_key || "article_planner", body.result_json || parsed, actor, timestamp, "Writing");

  return commitMutation(envelope, {
    action: "import-search-article-plan",
    entity: "google_rank_tasks",
    id: campaignId,
    before: campaign,
    after: nextState.google_rank_tasks[index],
    nextState,
    actor,
    timestamp,
  });
}

function applyLocalRequest(envelope, { path, method = "GET", body = {}, actor = "dashboard-web" } = {}) {
  const timestamp = nowDate();

  if (method === "POST" && path === "/state/restore-seed") {
    return restoreSeedState(envelope, actor, timestamp, "restore-seed");
  }

  if (method === "POST" && path === "/conversions/qualified-leads") {
    return convertQualifiedLeadState(envelope, body, actor, timestamp);
  }

  if (method === "POST" && path === "/opportunities") {
    return createOpportunityState(envelope, body, actor, timestamp);
  }

  let match = null;

  match = path.match(/^\/google_maps_missions\/([^/]+)\/import-search$/);
  if (method === "POST" && match) {
    return importMapsSearchState(envelope, match[1], body, actor, timestamp);
  }

  match = path.match(/^\/google_maps_missions\/([^/]+)\/import-shortlist$/);
  if (method === "POST" && match) {
    return importMapsShortlistState(envelope, match[1], body, actor, timestamp);
  }

  match = path.match(/^\/google_rank_tasks\/([^/]+)\/import-keyword-strategy$/);
  if (method === "POST" && match) {
    return importKeywordStrategyState(envelope, match[1], body, actor, timestamp);
  }

  match = path.match(/^\/google_rank_tasks\/([^/]+)\/import-subkeyword-cluster$/);
  if (method === "POST" && match) {
    return importSubkeywordClusterState(envelope, match[1], body, actor, timestamp);
  }

  match = path.match(/^\/google_rank_tasks\/([^/]+)\/import-article-planner$/);
  if (method === "POST" && match) {
    return importArticlePlanState(envelope, match[1], body, actor, timestamp);
  }

  match = path.match(/^\/([^/]+)$/);
  if (method === "POST" && match && match[1] !== "opportunities") {
    return createEntityState(envelope, match[1], body, actor, timestamp);
  }

  match = path.match(/^\/([^/]+)\/([^/]+)$/);
  if (method === "PATCH" && match) {
    return patchEntityState(envelope, match[1], match[2], body, actor, timestamp);
  }

  throw new Error(`Unsupported local mutation route: ${method} ${path}`);
}

export {
  applyLocalRequest,
  buildRecentActivity,
  createEnvelope,
  createEntityState,
  createOpportunityState,
  getDisplayStatus,
  getPublicStateFromEnvelope,
  importArticlePlanState,
  importKeywordStrategyState,
  importMapsSearchState,
  importMapsShortlistState,
  importSubkeywordClusterState,
  patchEntityState,
  restoreSeedState,
  stripRuntimeFields,
};
