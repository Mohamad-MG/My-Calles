import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { StateStore } from "./backend/state-store.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_PORT = Number(process.env.PORT || 4173);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function jsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function jsonResponseWithHeaders(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

function redirectResponse(response, location, statusCode = 302) {
  response.writeHead(statusCode, { Location: location });
  response.end();
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  if (!chunks.length) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function getActor(request) {
  return request.headers["x-user"] || "dashboard-web";
}

function getKnownVersion(request) {
  const version = Number(request.headers["x-known-state-version"] || 0);
  return Number.isFinite(version) ? version : 0;
}

function getSessionId(request) {
  return request.headers["x-session-id"] || "unknown-session";
}

async function serveStaticFile(response, rootDir, pathname) {
  const cleanPath = decodeURIComponent(pathname.split("?")[0]);
  const rewrittenPath = cleanPath.replace(
    /^\/(en|ar)\/opportunities\/[^/]+\/?$/,
    "/$1/opportunities/index.html",
  );
  const relativePath = rewrittenPath === "/" ? "/index.html" : rewrittenPath;
  const resolvedPath = path.normalize(path.join(rootDir, relativePath));

  if (!resolvedPath.startsWith(rootDir)) {
    jsonResponse(response, 403, { error: "Forbidden" });
    return 403;
  }

  let filePath = resolvedPath;
  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
  } catch {
    if (!path.extname(filePath)) {
      filePath = path.join(filePath, "index.html");
    }
  }

  try {
    const data = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(data);
    return 200;
  } catch {
    jsonResponse(response, 404, { error: "Not found" });
    return 404;
  }
}

function createAppServer({ rootDir = __dirname, dataDir = path.join(__dirname, "data") } = {}) {
  const stateStore = new StateStore({ dataDir });

  const server = createServer(async (request, response) => {
    const startedAt = performance.now();
    const actor = getActor(request);
    const sessionId = getSessionId(request);
    const knownVersion = getKnownVersion(request);
    const url = new URL(request.url, "http://localhost");
    let statusCode = 200;
    let conflictDetected = false;
    let kind = "read";
    let errorMessage = null;
    const targetStore = stateStore;

    try {
      const legacyRouteMatch = url.pathname.match(/^\/(en|ar)\/v2(?:\/(.*))?$/);
      if (legacyRouteMatch) {
        const [, locale, tail = ""] = legacyRouteMatch;
        const normalizedTail = tail ? `/${tail}` : "/";
        redirectResponse(response, `/${locale}${normalizedTail}${url.search}`);
        statusCode = 302;
        return;
      }

      if (request.method === "GET" && url.pathname === "/state") {
        kind = "read";
        const state = await stateStore.getState();
        jsonResponseWithHeaders(response, 200, state, {
          "X-State-Version": String(stateStore.getVersion()),
          "X-Session-Id": String(sessionId),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/debug/observability") {
        jsonResponse(response, 200, stateStore.getObservabilitySnapshot());
        return;
      }

      if (request.method === "POST" && url.pathname === "/state/restore-seed") {
        kind = "mutation";
        const state = await stateStore.restoreSeed(actor, "restore-seed");
        jsonResponseWithHeaders(response, 200, state, {
          "X-State-Version": String(stateStore.getVersion()),
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/conversions/qualified-leads") {
        kind = "mutation";
        const payload = await readJsonBody(request);
        conflictDetected = knownVersion > 0 && knownVersion !== stateStore.getVersion();
        const state = await stateStore.convertQualifiedLead(payload, actor);
        jsonResponseWithHeaders(response, 201, state, {
          "X-State-Version": String(stateStore.getVersion()),
          "X-Conflict-Detected": conflictDetected ? "1" : "0",
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/opportunities") {
        kind = "mutation";
        const payload = await readJsonBody(request);
        conflictDetected = knownVersion > 0 && knownVersion !== stateStore.getVersion();
        const state = await stateStore.createOpportunityFromQualifiedLead(payload, actor);
        jsonResponseWithHeaders(response, 201, state, {
          "X-State-Version": String(stateStore.getVersion()),
          "X-Conflict-Detected": conflictDetected ? "1" : "0",
        });
        return;
      }

      let importMatch = url.pathname.match(/^\/google_maps_missions\/([^/]+)\/import-search$/);
      if (request.method === "POST" && importMatch) {
        kind = "mutation";
        const payload = await readJsonBody(request);
        conflictDetected = knownVersion > 0 && knownVersion !== stateStore.getVersion();
        const state = await stateStore.importMapsSearchResults(importMatch[1], payload, actor);
        jsonResponseWithHeaders(response, 200, state, {
          "X-State-Version": String(stateStore.getVersion()),
          "X-Conflict-Detected": conflictDetected ? "1" : "0",
        });
        return;
      }

      importMatch = url.pathname.match(/^\/google_maps_missions\/([^/]+)\/import-shortlist$/);
      if (request.method === "POST" && importMatch) {
        kind = "mutation";
        const payload = await readJsonBody(request);
        conflictDetected = knownVersion > 0 && knownVersion !== stateStore.getVersion();
        const state = await stateStore.importMapsShortlistResults(importMatch[1], payload, actor);
        jsonResponseWithHeaders(response, 200, state, {
          "X-State-Version": String(stateStore.getVersion()),
          "X-Conflict-Detected": conflictDetected ? "1" : "0",
        });
        return;
      }

      importMatch = url.pathname.match(/^\/google_rank_tasks\/([^/]+)\/import-keyword-strategy$/);
      if (request.method === "POST" && importMatch) {
        kind = "mutation";
        const payload = await readJsonBody(request);
        conflictDetected = knownVersion > 0 && knownVersion !== stateStore.getVersion();
        const state = await stateStore.importKeywordStrategy(importMatch[1], payload, actor);
        jsonResponseWithHeaders(response, 200, state, {
          "X-State-Version": String(stateStore.getVersion()),
          "X-Conflict-Detected": conflictDetected ? "1" : "0",
        });
        return;
      }

      importMatch = url.pathname.match(/^\/google_rank_tasks\/([^/]+)\/import-subkeyword-cluster$/);
      if (request.method === "POST" && importMatch) {
        kind = "mutation";
        const payload = await readJsonBody(request);
        conflictDetected = knownVersion > 0 && knownVersion !== stateStore.getVersion();
        const state = await stateStore.importSubkeywordCluster(importMatch[1], payload, actor);
        jsonResponseWithHeaders(response, 200, state, {
          "X-State-Version": String(stateStore.getVersion()),
          "X-Conflict-Detected": conflictDetected ? "1" : "0",
        });
        return;
      }

      importMatch = url.pathname.match(/^\/google_rank_tasks\/([^/]+)\/import-article-planner$/);
      if (request.method === "POST" && importMatch) {
        kind = "mutation";
        const payload = await readJsonBody(request);
        conflictDetected = knownVersion > 0 && knownVersion !== stateStore.getVersion();
        const state = await stateStore.importArticlePlan(importMatch[1], payload, actor);
        jsonResponseWithHeaders(response, 200, state, {
          "X-State-Version": String(stateStore.getVersion()),
          "X-Conflict-Detected": conflictDetected ? "1" : "0",
        });
        return;
      }

      if (request.method === "POST" && /^\/[^/]+$/.test(url.pathname) && url.pathname !== "/opportunities") {
        kind = "mutation";
        const [, entity] = url.pathname.split("/");
        const allowedEntities = new Set([
          "whatsapp_items",
          "linkedin_prospects",
          "google_prompt_templates",
          "google_maps_missions",
          "google_inbound_items",
          "google_rank_tasks",
          "qualified_leads",
        ]);
        if (allowedEntities.has(entity)) {
          const payload = await readJsonBody(request);
          conflictDetected = knownVersion > 0 && knownVersion !== stateStore.getVersion();
          const result = await stateStore.createEntity(entity, payload, actor);
          statusCode = result.created ? 201 : 200;
          jsonResponseWithHeaders(response, statusCode, result.state, {
            "X-State-Version": String(stateStore.getVersion()),
            "X-Conflict-Detected": conflictDetected ? "1" : "0",
            "X-Duplicate-Detected": result.duplicate ? "1" : "0",
          });
          return;
        }
      }

      if (request.method === "PATCH") {
        const match = url.pathname.match(/^\/([^/]+)\/([^/]+)$/);
        if (match) {
          kind = "mutation";
          const [, entity, id] = match;
          const allowedEntities = new Set([
            "whatsapp_items",
            "linkedin_prospects",
            "google_prompt_templates",
            "google_maps_missions",
            "google_inbound_items",
            "google_rank_tasks",
            "qualified_leads",
            "opportunities",
          ]);
          if (allowedEntities.has(entity)) {
            const payload = await readJsonBody(request);
            conflictDetected = knownVersion > 0 && knownVersion !== stateStore.getVersion();
            const state = await stateStore.patchEntity(entity, id, payload, actor);
            jsonResponseWithHeaders(response, 200, state, {
              "X-State-Version": String(stateStore.getVersion()),
              "X-Conflict-Detected": conflictDetected ? "1" : "0",
            });
            return;
          }
        }
      }

      if (request.method === "GET" && url.pathname === "/v2/state") {
        redirectResponse(response, `/state${url.search}`);
        statusCode = 302;
        return;
      }

      if (request.method === "GET" && url.pathname === "/v2/debug/observability") {
        redirectResponse(response, `/debug/observability${url.search}`);
        statusCode = 302;
        return;
      }

      if (request.method === "POST" && url.pathname === "/v2/state/restore-seed") {
        redirectResponse(response, `/state/restore-seed${url.search}`);
        statusCode = 302;
        return;
      }

      if (request.method === "POST" && url.pathname === "/v2/conversions/qualified-leads") {
        redirectResponse(response, `/conversions/qualified-leads${url.search}`);
        statusCode = 302;
        return;
      }

      if (request.method === "POST" && url.pathname === "/v2/opportunities") {
        redirectResponse(response, `/opportunities${url.search}`);
        statusCode = 302;
        return;
      }

      if (request.method === "POST" && /^\/v2\/[^/]+$/.test(url.pathname) && url.pathname !== "/v2/opportunities") {
        const [, , entity] = url.pathname.split("/");
        redirectResponse(response, `/${entity}${url.search}`);
        statusCode = 302;
        return;
      }

      if (request.method === "PATCH") {
        const legacyMutationMatch = url.pathname.match(/^\/v2\/([^/]+)\/([^/]+)$/);
        if (legacyMutationMatch) {
          const [, entity, id] = legacyMutationMatch;
          redirectResponse(response, `/${entity}/${id}${url.search}`);
          statusCode = 302;
          return;
        }
      }

      statusCode = await serveStaticFile(response, rootDir, url.pathname);
    } catch (error) {
      statusCode = 400;
      errorMessage = error.message;
      jsonResponse(response, 400, { error: error.message });
    } finally {
      const latencyMs = Number((performance.now() - startedAt).toFixed(2));
      const level = statusCode >= 400 ? "error" : conflictDetected ? "warning" : "info";
      try {
        await targetStore.recordEvent({
          route: url.pathname,
          method: request.method,
          actor,
          session_id: sessionId,
          known_version: knownVersion,
          current_version: targetStore.getVersion(),
          conflict_detected: conflictDetected,
          latency_ms: latencyMs,
          status_code: statusCode,
          level,
          kind,
          error: errorMessage,
        });
      } catch (eventError) {
        console.error(`[observability-error] ${eventError.message}`);
      }
      if (latencyMs > 250 || conflictDetected || statusCode >= 400) {
        console.log(
          `[${level}] ${request.method} ${url.pathname} ${statusCode} ${latencyMs}ms actor=${actor} session=${sessionId} conflict=${conflictDetected ? "yes" : "no"}${errorMessage ? ` error="${errorMessage}"` : ""}`,
        );
      }
    }
  });

  return {
    server,
    start: async (port = DEFAULT_PORT) => {
      await stateStore.init();
      await mkdir(dataDir, { recursive: true });
      return new Promise((resolve) => {
        server.listen(port, () => resolve(server));
      });
    },
    stop: async () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

if (process.argv[1] === __filename) {
  const app = createAppServer();
  app.start().then(() => {
    console.log(`MyCalls server running on http://localhost:${DEFAULT_PORT}`);
  });
}

export { createAppServer };
