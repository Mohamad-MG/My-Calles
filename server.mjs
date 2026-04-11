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
  const relativePath = cleanPath === "/" ? "/index.html" : cleanPath;
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
  const store = new StateStore({ dataDir });

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

    try {
      if (request.method === "GET" && url.pathname === "/state") {
        kind = "read";
        const state = await store.getState();
        jsonResponseWithHeaders(response, 200, state, {
          "X-State-Version": String(store.getVersion()),
          "X-Session-Id": String(sessionId),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/debug/observability") {
        const payload = store.getObservabilitySnapshot();
        jsonResponse(response, 200, payload);
        return;
      }

      if (request.method === "POST" && url.pathname === "/state/restore-seed") {
        kind = "mutation";
        const state = await store.restoreSeed(actor, "restore-seed");
        jsonResponseWithHeaders(response, 200, state, {
          "X-State-Version": String(store.getVersion()),
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/state/reset-shared") {
        kind = "mutation";
        const state = await store.restoreSeed(actor, "reset-shared");
        jsonResponseWithHeaders(response, 200, state, {
          "X-State-Version": String(store.getVersion()),
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/sectors") {
        kind = "mutation";
        const payload = await readJsonBody(request);
        conflictDetected = knownVersion > 0 && knownVersion !== store.getVersion();
        const result = await store.createEntity("sectors", payload, actor);
        statusCode = result.created ? 201 : 200;
        jsonResponseWithHeaders(response, statusCode, result.state, {
          "X-State-Version": String(store.getVersion()),
          "X-Conflict-Detected": conflictDetected ? "1" : "0",
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/leads") {
        kind = "mutation";
        const payload = await readJsonBody(request);
        conflictDetected = knownVersion > 0 && knownVersion !== store.getVersion();
        const result = await store.createEntity("leads", payload, actor);
        statusCode = result.created ? 201 : 200;
        jsonResponseWithHeaders(response, statusCode, result.state, {
          "X-State-Version": String(store.getVersion()),
          "X-Conflict-Detected": conflictDetected ? "1" : "0",
          "X-Duplicate-Detected": result.duplicate ? "1" : "0",
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/opportunities") {
        kind = "mutation";
        const payload = await readJsonBody(request);
        conflictDetected = knownVersion > 0 && knownVersion !== store.getVersion();
        const result = await store.createEntity("opportunities", payload, actor);
        statusCode = result.created ? 201 : 200;
        jsonResponseWithHeaders(response, statusCode, result.state, {
          "X-State-Version": String(store.getVersion()),
          "X-Conflict-Detected": conflictDetected ? "1" : "0",
        });
        return;
      }

      if (request.method === "PATCH") {
        const match = url.pathname.match(/^\/([^/]+)\/([^/]+)$/);
        if (match) {
          kind = "mutation";
          const [, entity, id] = match;
          const payload = await readJsonBody(request);
          conflictDetected = knownVersion > 0 && knownVersion !== store.getVersion();
          const state = await store.patchEntity(entity, id, payload, actor);
          jsonResponseWithHeaders(response, 200, state, {
            "X-State-Version": String(store.getVersion()),
            "X-Conflict-Detected": conflictDetected ? "1" : "0",
          });
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
        await store.recordEvent({
          route: url.pathname,
          method: request.method,
          actor,
          session_id: sessionId,
          known_version: knownVersion,
          current_version: store.getVersion(),
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
      await store.init();
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
