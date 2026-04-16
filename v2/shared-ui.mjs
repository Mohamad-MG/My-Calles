function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getTodayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function localizeValue(copy, value = "") {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const key = String(value);
  return (
    copy?.statuses?.[key] ||
    copy?.values?.[key] ||
    copy?.actions?.[key] ||
    copy?.labels?.[key] ||
    key
  );
}

function formatShortDate(value, locale = "en") {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-CA", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${String(value).slice(0, 10)}T12:00:00`));
}

function renderBadge(label, tone = "") {
  return `<span class="v2-badge ${tone}">${escapeHtml(label)}</span>`;
}

function renderEmptyState(copy) {
  return `<div class="v2-empty">${escapeHtml(copy.chrome.empty)}</div>`;
}

function renderSectionHeading(label, title, actions = "") {
  return `
    <div class="v2-section-head">
      <div>
        <p class="v2-kicker">${escapeHtml(label)}</p>
        <h3>${escapeHtml(title)}</h3>
      </div>
      ${actions ? `<div class="v2-section-actions">${actions}</div>` : ""}
    </div>
  `;
}

function renderKeyValue(label, value) {
  return `<div class="v2-kv"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "—")}</strong></div>`;
}

export {
  escapeHtml,
  formatShortDate,
  getTodayInputValue,
  localizeValue,
  renderBadge,
  renderEmptyState,
  renderKeyValue,
  renderSectionHeading,
};
