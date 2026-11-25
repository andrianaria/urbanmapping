import assert from "node:assert/strict";
import test from "node:test";
import { createApplication } from "../src/server.js";

async function start(t) {
  const application = createApplication({ dbPath: ":memory:" });
  await new Promise(resolve => application.server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => application.server.close(error => error ? reject(error) : resolve())));
  const origin = `http://127.0.0.1:${application.server.address().port}`;
  return {
    ...application, origin,
    get: path => fetch(origin + path),
    post: (path, body) => fetch(origin + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  };
}

test("HTTP read endpoints return complete synthetic records and zone calculations", async t => {
  const app = await start(t);
  for (const [path, count] of [["districts", 6], ["competitors", 42], ["candidates", 12], ["zones", 80]]) {
    const response = await app.get(`/api/${path}`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).length, count);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  const dataset = await (await app.get("/api/dataset")).json();
  assert.equal(dataset.sources[0].synthetic, 1);
  assert.equal(dataset.city.name, "Kota Reka");
  const zones = await (await app.get("/api/zones?categoryId=1")).json();
  const sample = dataset.zones[0];
  assert.equal(zones[0].densityPerKm2, sample.population / 0.64);
  assert.equal(zones[0].categorySpendingIdr, sample.population * sample.spendingPerCapitaIdr * 0.18);
  assert.equal(zones.find(zone => zone.id === 17).categorySpendingIdr, null);
  const quality = await (await app.get("/api/quality")).json();
  assert.equal(quality.errors, 0);
  assert.equal(quality.completeSpendingZones, 78);
});

test("analysis and saved comparison retain deterministic inputs and full snapshots", async t => {
  const app = await start(t);
  const assumptions = await (await app.get("/api/assumptions")).json();
  const input = { ...assumptions, radiusKm: 1.1 };
  const analysis = await (await app.post("/api/analysis", input)).json();
  const response = await app.post("/api/scenarios", { name: "Tighter radius", assumptions: input });
  assert.equal(response.status, 201);
  const saved = await response.json();
  assert.deepEqual(saved.result, analysis);
  assert.deepEqual((await (await app.get(`/api/scenarios/${saved.id}`)).json()), saved);
  const comparison = await app.post("/api/scenarios/compare", { ids: [1, saved.id] });
  assert.equal(comparison.status, 200);
  const pair = await comparison.json();
  assert.equal(pair.scenarios.length, 2);
  assert.equal(pair.scenarios[0].baseline, 1);
  assert.deepEqual(pair.scenarios[1].result, analysis);
  assert.equal((await app.post("/api/scenarios", { name: "Tighter radius", assumptions: input })).status, 409);
});

test("invalid bodies, IDs, methods and origins get predictable client errors", async t => {
  const app = await start(t);
  for (const [path, status] of [["/api/missing", 404], ["/api/scenarios/nope", 400], ["/api/scenarios/999", 404], ["/api/zones?categoryId=999", 404]]) {
    const response = await app.get(path);
    assert.equal(response.status, status);
    assert.ok((await response.json()).error.message);
  }
  for (const payload of ["{", "null", "[]"]) {
    const response = await fetch(app.origin + "/api/analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });
    assert.equal(response.status, 400);
  }
  assert.equal((await fetch(app.origin + "/api/analysis", { method: "POST", body: "{}" })).status, 415);
  assert.equal((await fetch(app.origin + "/api/analysis", { method: "DELETE" })).status, 405);
  assert.equal((await app.post("/api/analysis", { externalData: true })).status, 400);
  assert.equal((await app.post("/api/scenarios/compare", { ids: [1, 1] })).status, 400);
  assert.equal((await app.post("/api/scenarios/compare", { ids: [1, "1"] })).status, 400);
  const foreign = await fetch(app.origin + "/api/analysis", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "http://unrelated.invalid" }, body: "{}",
  });
  assert.equal(foreign.status, 403);
  const invalidOrigin = await fetch(app.origin + "/api/analysis", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "invalid-origin" }, body: "{}",
  });
  assert.ok([400, 403].includes(invalidOrigin.status));
});

test("static assets serve offline with secure content types and bounded payloads", async t => {
  const app = await start(t);
  const page = await app.get("/");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  assert.match(page.headers.get("content-security-policy"), /default-src 'self'/);
  assert.match(await page.text(), /Kota Reka/);
  assert.equal((await fetch(app.origin + "/", { method: "HEAD" })).status, 200);
  for (const [path, type] of [["/app.js", /javascript/], ["/map.js", /javascript/], ["/style.css", /text\/css/], ["/favicon.svg", /image\/svg\+xml/]]) {
    const response = await app.get(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type"), type);
    assert.ok((await response.text()).length > 0);
  }
  const response = await fetch(app.origin + "/api/analysis", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ large: "x".repeat(70_000) }),
  });
  assert.equal(response.status, 413);
});
