import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Repository } from "../src/repository.js";
import { InputError } from "../src/domain.js";

test("SQLite preserves scenario assumptions and exact results across connections and restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "urbanmapping-persistence-"));
  const path = join(directory, "workspace.sqlite");
  let first;
  let second;
  try {
    first = new Repository(path);
    const input = { ...first.assumptions(), radiusKm: 1.2 };
    const saved = first.saveScenario("Smaller neighborhood", input);
    assert.equal(saved.baseline, 0);
    assert.equal(first.scenarios().length, 2);
    second = new Repository(path);
    assert.deepEqual(second.scenario(saved.id), saved);
    const another = second.saveScenario("Retail alternative", { ...input, categoryId: 2 });
    assert.equal(first.scenarios().length, 3);
    assert.deepEqual(first.scenario(another.id), another);
    first.close();
    first = null;
    second.close();
    second = null;
    first = new Repository(path);
    assert.equal(first.dataset().zones.length, 80);
    assert.equal(first.scenarios().length, 3);
    assert.deepEqual(first.scenario(saved.id), saved);
    assert.equal(first.db.prepare("SELECT COUNT(*) AS total FROM schema_migrations").get().total, 1);
    assert.deepEqual(first.db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(first.db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  } finally {
    second?.close();
    first?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("failed scenario saves preserve scenarios, results and audit events", () => {
  const repository = new Repository(":memory:");
  try {
    repository.saveScenario("Keep this scenario", repository.assumptions());
    const counts = () => ["scenarios", "analysis_results", "audit_events"].map(table =>
      repository.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
    const before = counts();
    assert.throws(() => repository.saveScenario("Keep this scenario", repository.assumptions()), error =>
      error instanceof InputError && error.status === 409);
    assert.throws(() => repository.saveScenario("Invalid weights", {
      ...repository.assumptions(), weights: { population: 0, spending: 0, competition: 0, cost: 0 },
    }), InputError);
    assert.deepEqual(counts(), before);
    assert.throws(() => repository.transaction(() => {
      repository.audit("rollback.test", "scenario", 1, {});
      throw new Error("force rollback");
    }), /force rollback/);
    assert.deepEqual(counts(), before);
    assert.throws(() => repository.db.prepare("UPDATE zones SET district_id=? WHERE id=?").run(999, 1), /FOREIGN KEY/);
    assert.throws(() => repository.scenario(999), error => error.status === 404);
  } finally {
    repository.close();
  }
});
