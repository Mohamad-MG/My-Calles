import { V2_STORAGE_KEY } from "./domain.mjs";
import { applyLocalRequest, createEnvelope, getPublicStateFromEnvelope, stripRuntimeFields } from "./state-engine.mjs";

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

function getRuntimeMode() {
  if (typeof window === "undefined") return "live";
  return window.location.hostname.includes("github.io") ? "static" : "live";
}

function withBasePath(path) {
  const basePath = getRuntimeBasePath();
  return `${basePath}${path}`;
}

function getStaticStatePath() {
  return withBasePath("/data/dashboard-state.json");
}

async function readJson(response, fallbackMessage) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(fallbackMessage);
  }
}

function getStorage() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  return window.localStorage;
}

function readStoredEnvelope() {
  const storage = getStorage();
  if (!storage) return null;
  const serialized = storage.getItem(V2_STORAGE_KEY);
  if (!serialized) return null;
  try {
    return createEnvelope(JSON.parse(serialized));
  } catch {
    return null;
  }
}

function writeStoredEnvelope(envelope) {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(V2_STORAGE_KEY, JSON.stringify(envelope));
}

async function loadStaticEnvelope(headers) {
  const stored = readStoredEnvelope();
  if (stored) {
    return stored;
  }

  const response = await fetch(getStaticStatePath(), { headers });
  const payload = await readJson(response, "Failed to load static state.");
  if (!response.ok) {
    throw new Error(payload.error || "Failed to load static state.");
  }

  const envelope = createEnvelope(stripRuntimeFields(payload));
  writeStoredEnvelope(envelope);
  return envelope;
}

async function fetchState({ sessionId }) {
  const headers = {
    "X-User": "dashboard-web",
    "X-Session-Id": sessionId,
  };

  if (getRuntimeMode() === "static") {
    const envelope = await loadStaticEnvelope(headers);
    return {
      payload: getPublicStateFromEnvelope(envelope),
      version: Number(envelope.state?._meta?.version || 0),
    };
  }

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

async function sendRequest(path, { method = "GET", body, sessionId, version = 0 } = {}) {
  if (getRuntimeMode() === "static") {
    const envelope = await loadStaticEnvelope({
      "X-User": "dashboard-web",
      "X-Session-Id": sessionId,
    });
    const next = applyLocalRequest(envelope, {
      path,
      method,
      body: body || {},
      actor: "dashboard-web",
    });
    writeStoredEnvelope(next.envelope);
    return {
      payload: next.payload,
      version: Number(next.version || version || 0),
    };
  }

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

export {
  createSessionId,
  fetchState,
  getRuntimeBasePath,
  getRuntimeMode,
  getStaticStatePath,
  sendRequest,
};
