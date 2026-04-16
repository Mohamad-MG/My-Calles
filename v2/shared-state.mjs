function createSessionId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `session-${Math.random().toString(16).slice(2)}`;
}

function getRuntimeBasePath() {
  if (typeof window === "undefined") return "";
  const match = window.location.pathname.match(/^(.*)\/(en|ar)(?:\/|$)/);
  return match?.[1] || "";
}

function withBasePath(path) {
  const basePath = getRuntimeBasePath();
  return `${basePath}${path}`;
}

async function readJson(response, fallbackMessage) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(fallbackMessage);
  }
}

async function fetchV2State({ sessionId }) {
  const headers = {
    "X-User": "dashboard-web",
    "X-Session-Id": sessionId,
  };

  try {
    const response = await fetch(withBasePath("/state"), { headers });
    const payload = await readJson(response, "Failed to load live state.");
    if (!response.ok) {
      throw new Error(payload.error || "Failed to load live state.");
    }
    return {
      payload,
      version: Number(response.headers.get("X-State-Version") || payload?._meta?.version || 0),
    };
  } catch (error) {
    const fallback = await fetch(withBasePath("/data/dashboard-state.json"), { headers });
    const payload = await readJson(fallback, error.message || "Failed to load state.");
    if (!fallback.ok) {
      throw new Error("Failed to load state.");
    }
    return {
      payload,
      version: Number(payload?._meta?.version || 0),
    };
  }
}

async function sendV2Request(path, { method = "GET", body, sessionId, version = 0 } = {}) {
  const response = await fetch(withBasePath(path), {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-User": "dashboard-web",
      "X-Session-Id": sessionId,
      "X-Known-State-Version": String(version || 0),
    },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  });
  const payload = await readJson(
    response,
    "This deployment is read-only. Run the Node server for live state changes.",
  );
  if (!response.ok) {
    throw new Error(
      payload.error || "This deployment is read-only. Run the Node server for live state changes.",
    );
  }
  return {
    payload,
    version: Number(response.headers.get("X-State-Version") || version || 0),
  };
}

export { createSessionId, fetchV2State, getRuntimeBasePath, sendV2Request };
