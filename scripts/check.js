import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { Repository } from "../src/repository.js";
import { analyzeCandidates, validateDataset } from "../src/domain.js";

const root = fileURLToPath(new URL("../", import.meta.url));
function javascriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? javascriptFiles(path) : entry.name.endsWith(".js") ? [path] : [];
  });
}
const files = ["src", "public", "tests", "scripts"].flatMap(folder => javascriptFiles(join(root, folder)));
for (const file of files) {
  const checked = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stderr || `Syntax failed: ${file}`);
}
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0);
const repository = new Repository(":memory:");
try {
  const dataset = repository.dataset();
  assert.deepEqual([dataset.districts.length, dataset.zones.length, dataset.competitors.length, dataset.candidates.length], [6, 80, 42, 12]);
  assert.equal(validateDataset(dataset).errors, 0);
  assert.deepEqual(repository.db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(repository.db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  const baseline = repository.scenario(1);
  assert.deepEqual(analyzeCandidates(dataset, baseline.assumptions), baseline.result);
  console.log(`Checked ${files.length} JavaScript files, synthetic dataset, SQLite integrity, and deterministic baseline.`);
} finally {
  repository.close();
}
