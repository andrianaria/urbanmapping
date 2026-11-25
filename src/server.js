import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Repository } from "./repository.js";
import { InputError, analyzeCandidates, zoneIndicators } from "./domain.js";

const staticFiles = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/map.js": ["map.js", "text/javascript; charset=utf-8"],
  "/style.css": ["style.css", "text/css; charset=utf-8"],
  "/favicon.svg": ["favicon.svg", "image/svg+xml"],
};

function json(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

function idNumber(value) {
  if (!/^[1-9]\d*$/.test(value ?? "")) throw new InputError("A positive integer ID is required.");
  const id = Number(value);
  if (!Number.isSafeInteger(id)) throw new InputError("ID is outside the supported range.");
  return id;
}

async function readBody(request) {
  if (!(request.headers["content-type"] ?? "").startsWith("application/json")) throw new InputError("Use application/json.", [], 415);
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 65536) throw new InputError("Request exceeds 64 KiB.", [], 413);
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new InputError("Body must be a valid JSON object.");
  }
}

function protect(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
}

export function createApplication({ dbPath = ".data/urbanmapping.sqlite" } = {}) {
  const repository = new Repository(dbPath);
  const server = createServer(async (request, response) => {
    protect(response);
    try {
      const url = new URL(request.url, "http://localhost");
      const { pathname } = url;
      if (request.method === "POST") {
        const origin = request.headers.origin;
        let originHost;
        if (origin) {
          try {
            const parsed = new URL(origin);
            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
            originHost = parsed.host;
          } catch {
            throw new InputError("Request origin is not permitted.", [], 403);
          }
        }
        if ((originHost && originHost !== request.headers.host) || request.headers["sec-fetch-site"] === "cross-site") {
          throw new InputError("Request origin is not permitted.", [], 403);
        }
      }
      if (pathname.startsWith("/api/")) {
        if (request.method === "GET") {
          if (pathname === "/api/health") return json(response, 200, { status: "ok", synthetic: true });
          if (pathname === "/api/dataset") return json(response, 200, repository.dataset());
          if (pathname === "/api/districts") return json(response, 200, repository.dataset().districts);
          if (pathname === "/api/competitors") return json(response, 200, repository.dataset().competitors);
          if (pathname === "/api/candidates") return json(response, 200, repository.dataset().candidates);
          if (pathname === "/api/assumptions") return json(response, 200, repository.assumptions());
          if (pathname === "/api/quality") return json(response, 200, repository.quality());
          if (pathname === "/api/scenarios") return json(response, 200, repository.scenarios());
          if (/^\/api\/scenarios\/[^/]+$/.test(pathname)) return json(response, 200, repository.scenario(idNumber(pathname.split("/").at(-1))));
          if (pathname === "/api/zones") {
            const dataset = repository.dataset();
            const categoryId = url.searchParams.has("categoryId") ? idNumber(url.searchParams.get("categoryId")) : 1;
            const category = dataset.categories.find((item) => item.id === categoryId);
            if (!category) throw new InputError("Category not found.", ["categoryId"], 404);
            return json(response, 200, dataset.zones.map((zone) => zoneIndicators(zone, category, dataset.competitors)));
          }
        } else if (request.method === "POST") {
          const body = await readBody(request);
          if (pathname === "/api/analysis") return json(response, 200, analyzeCandidates(repository.dataset(), body));
          if (pathname === "/api/scenarios") return json(response, 201, repository.saveScenario(body.name, body.assumptions));
          if (pathname === "/api/scenarios/compare") {
            if (!Array.isArray(body.ids) || body.ids.length !== 2) throw new InputError("Choose two different scenario IDs.", ["ids"]);
            const ids = body.ids.map((id) => idNumber(String(id)));
            if (new Set(ids).size !== 2) throw new InputError("Choose two different scenario IDs.", ["ids"]);
            const scenarios = ids.map((id) => repository.scenario(id));
            if (scenarios[0].datasetVersion !== scenarios[1].datasetVersion || scenarios[0].modelVersion !== scenarios[1].modelVersion) throw new InputError("Scenario versions cannot be compared.", [], 409);
            return json(response, 200, { scenarios });
          }
        } else {
          throw new InputError("Method not supported.", [], 405);
        }
        throw new InputError("API endpoint not found.", [], 404);
      }
      if (request.method !== "GET" && request.method !== "HEAD") throw new InputError("Method not supported.", [], 405);
      const asset = staticFiles[pathname];
      if (!asset) throw new InputError("Page not found.", [], 404);
      const content = await readFile(new URL(`../public/${asset[0]}`, import.meta.url));
      response.writeHead(200, { "Content-Type": asset[1], "Cache-Control": "no-cache" });
      response.end(request.method === "HEAD" ? undefined : content);
    } catch (error) {
      if (response.headersSent) return response.end();
      if (error instanceof InputError) return json(response, error.status, { error: { code: `HTTP_${error.status}`, message: error.message, details: error.details } });
      console.error("Request failed:", error.message);
      json(response, 500, { error: { code: "INTERNAL_ERROR", message: "The request could not be completed.", details: [] } });
    }
  });
  server.on("close", () => repository.close());
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return { server, repository };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer from 1 to 65535.");
  const { server } = createApplication({ dbPath: process.env.URBANMAPPING_DB ?? ".data/urbanmapping.sqlite" });
  server.listen(port, "127.0.0.1", () => console.log(`UrbanMapping is running at http://127.0.0.1:${port}. Dataset is synthetic.`));
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close());
}
