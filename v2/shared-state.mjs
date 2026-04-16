function createSessionId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `session-${Math.random().toString(16).slice(2)}`;
}

async function fetchV2State({ sessionId }) {
  const response = await fetch("/v2/state", {
    headers: {
      "X-User": "dashboard-v2-web",
      "X-Session-Id": sessionId,
    },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Failed to load V2 state.");
  }
  return {
    payload,
    version: Number(response.headers.get("X-State-Version") || 0),
  };
}

async function sendV2Request(path, { method = "GET", body, sessionId, version = 0 } = {}) {
  const response = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-User": "dashboard-v2-web",
      "X-Session-Id": sessionId,
      "X-Known-State-Version": String(version || 0),
    },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "V2 request failed.");
  }
  return {
    payload,
    version: Number(response.headers.get("X-State-Version") || version || 0),
  };
}

export { createSessionId, fetchV2State, sendV2Request };
