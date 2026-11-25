import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DATASET_VERSION, MODEL_VERSION, DEFAULT_ASSUMPTIONS, generateDataset } from "./data.js";
import { InputError, analyzeCandidates, validateDataset } from "./domain.js";

const parseGeometry = (record) => ({ ...record, geometry: JSON.parse(record.geometry) });
const plain = (rows) => rows.map((row) => ({ ...row }));

export class Repository {
  constructor(filename = ".data/urbanmapping.sqlite") {
    if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    if (filename !== ":memory:") this.db.exec("PRAGMA journal_mode = WAL;");
    this.migrate();
    this.seed();
  }

  transaction(callback) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  migrate() {
    this.db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL) STRICT;");
    this.transaction(() => {
      if (this.db.prepare("SELECT version FROM schema_migrations WHERE version = ?").get(1)) return;
      const path = fileURLToPath(new URL("../migrations/001_foundation.sql", import.meta.url));
      this.db.exec(readFileSync(path, "utf8"));
      this.db.prepare("INSERT INTO schema_migrations VALUES (?, ?)").run(1, new Date().toISOString());
    });
  }

  seed() {
    this.transaction(() => {
      if (this.db.prepare("SELECT id FROM cities WHERE id = ?").get(1)) return;
      const data = generateDataset();
      const report = validateDataset(data);
      if (report.errors) throw new Error("Synthetic generator produced invalid records.");
      const source = data.source;
      this.db.prepare("INSERT INTO sources VALUES (?, ?, ?, ?, ?)").run(source.id, source.name, source.version, source.synthetic, source.description);
      this.db.prepare("INSERT INTO cities VALUES (?, ?, ?, ?)").run(data.city.id, data.city.name, data.city.coordinateSystem, data.city.sourceId);
      const insertDistrict = this.db.prepare("INSERT INTO districts VALUES (?, ?, ?, ?)");
      for (const district of data.districts) insertDistrict.run(district.id, district.cityId, district.name, JSON.stringify(district.geometry));
      const insertZone = this.db.prepare("INSERT INTO zones VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      const insertMeasurement = this.db.prepare("INSERT INTO measurements VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      for (const zone of data.zones) {
        insertZone.run(zone.id, zone.districtId, zone.code, zone.name, JSON.stringify(zone.geometry), zone.centerX, zone.centerY, zone.areaKm2, zone.landUse, zone.commercialIndex, zone.sourceId);
        insertMeasurement.run(zone.id, zone.population, zone.adultPopulation, zone.households, zone.spendingPerCapitaIdr, zone.purchasingPowerIndex, zone.referencePeriod, zone.sourceId);
      }
      const insertCategory = this.db.prepare("INSERT INTO categories VALUES (?, ?, ?, ?)");
      for (const category of data.categories) insertCategory.run(category.id, category.name, category.spendingShare, category.description);
      const insertCompetitor = this.db.prepare("INSERT INTO competitors VALUES (?, ?, ?, ?, ?, ?, ?)");
      for (const competitor of data.competitors) insertCompetitor.run(competitor.id, competitor.zoneId, competitor.categoryId, competitor.name, competitor.x, competitor.y, competitor.sourceId);
      const insertOutlet = this.db.prepare("INSERT INTO business_locations VALUES (?, ?, ?, ?, ?, ?, ?)");
      for (const site of data.existing) insertOutlet.run(site.id, site.zoneId, site.categoryId, site.name, site.x, site.y, site.sourceId);
      const insertCandidate = this.db.prepare("INSERT INTO candidate_sites VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
      for (const site of data.candidates) insertCandidate.run(site.id, site.zoneId, site.name, site.x, site.y, site.rentMonthlyIdr, site.investmentIdr, site.floorAreaM2, site.sourceId);
      const insertNode = this.db.prepare("INSERT INTO road_nodes VALUES (?, ?, ?, ?)");
      for (const node of data.nodes) insertNode.run(node.id, node.cityId, node.x, node.y);
      const insertEdge = this.db.prepare("INSERT INTO road_edges VALUES (?, ?, ?, ?, ?)");
      for (const edge of data.edges) insertEdge.run(edge.id, edge.fromNode, edge.toNode, edge.distanceKm, edge.speedKmh);
      this.db.prepare("INSERT INTO assumptions VALUES (?, ?, ?, ?)").run(1, "Reference assumptions", JSON.stringify(DEFAULT_ASSUMPTIONS), 1);
      this.audit("dataset.seeded", "city", 1, { version: DATASET_VERSION, warnings: report.warnings });
      const result = analyzeCandidates(data, DEFAULT_ASSUMPTIONS);
      this.insertScenario("Reference baseline", result, true);
    });
  }

  dataset() {
    const city = this.db.prepare("SELECT id, name, coordinate_system AS coordinateSystem, source_id AS sourceId FROM cities WHERE id = ?").get(1);
    const sources = plain(this.db.prepare("SELECT * FROM sources ORDER BY id").all());
    const districts = this.db.prepare("SELECT id, city_id AS cityId, name, geometry FROM districts ORDER BY id").all().map(parseGeometry);
    const zones = this.db.prepare(`
      SELECT z.id, district_id AS districtId, code, name, geometry,
             center_x AS centerX, center_y AS centerY, area_km2 AS areaKm2,
             land_use AS landUse, commercial_index AS commercialIndex,
             population, adult_population AS adultPopulation, households,
             spending_per_capita_idr AS spendingPerCapitaIdr,
             purchasing_power_index AS purchasingPowerIndex,
             reference_period AS referencePeriod, z.source_id AS sourceId
      FROM zones z JOIN measurements m ON m.zone_id = z.id ORDER BY z.id
    `).all().map(parseGeometry);
    const categories = plain(this.db.prepare("SELECT id, name, spending_share AS spendingShare, description FROM categories ORDER BY id").all());
    const competitors = plain(this.db.prepare("SELECT id, zone_id AS zoneId, category_id AS categoryId, name, x, y, source_id AS sourceId FROM competitors ORDER BY id").all());
    const existing = plain(this.db.prepare("SELECT id, zone_id AS zoneId, category_id AS categoryId, name, x, y, source_id AS sourceId FROM business_locations ORDER BY id").all());
    const candidates = plain(this.db.prepare("SELECT id, zone_id AS zoneId, name, x, y, rent_monthly_idr AS rentMonthlyIdr, investment_idr AS investmentIdr, floor_area_m2 AS floorAreaM2, source_id AS sourceId FROM candidate_sites ORDER BY id").all());
    const nodes = plain(this.db.prepare("SELECT id, city_id AS cityId, x, y FROM road_nodes ORDER BY id").all());
    const edges = plain(this.db.prepare("SELECT id, from_node AS fromNode, to_node AS toNode, distance_km AS distanceKm, speed_kmh AS speedKmh FROM road_edges ORDER BY id").all());
    return { city: { ...city }, sources, districts, zones, categories, competitors, candidates, existing, nodes, edges, datasetVersion: sources[0].version, modelVersion: MODEL_VERSION };
  }

  assumptions() {
    return JSON.parse(this.db.prepare("SELECT values_json FROM assumptions WHERE id = ?").get(1).values_json);
  }

  scenarios() {
    return plain(this.db.prepare("SELECT id, name, created_at AS createdAt, baseline, model_version AS modelVersion FROM scenarios ORDER BY id").all());
  }

  scenario(id) {
    const row = this.db.prepare(`
      SELECT s.id, s.name, s.created_at AS createdAt, s.baseline, s.model_version AS modelVersion,
             s.assumptions_json, r.results_json, r.dataset_version AS datasetVersion
      FROM scenarios s JOIN analysis_results r ON s.id = r.scenario_id WHERE s.id = ?
    `).get(id);
    if (!row) throw new InputError("Scenario not found.", ["id"], 404);
    const { assumptions_json, results_json, ...rest } = row;
    return { ...rest, assumptions: JSON.parse(assumptions_json), result: JSON.parse(results_json) };
  }

  saveScenario(name, assumptions) {
    if (typeof name !== "string" || !name.trim() || name.trim().length > 70) throw new InputError("Scenario name must contain 1 to 70 characters.", ["name"]);
    return this.transaction(() => {
      const cleanName = name.trim();
      if (this.db.prepare("SELECT id FROM scenarios WHERE name = ?").get(cleanName)) throw new InputError("A scenario with this name already exists.", ["name"], 409);
      const result = analyzeCandidates(this.dataset(), assumptions);
      const id = this.insertScenario(cleanName, result, false);
      this.audit("scenario.saved", "scenario", id, { modelVersion: MODEL_VERSION, categoryId: result.assumptions.categoryId });
      return this.scenario(id);
    });
  }

  insertScenario(name, result, baseline) {
    const record = this.db.prepare("INSERT INTO scenarios (name, assumptions_json, created_at, baseline, model_version) VALUES (?, ?, ?, ?, ?)").run(name, JSON.stringify(result.assumptions), new Date().toISOString(), baseline ? 1 : 0, MODEL_VERSION);
    const id = Number(record.lastInsertRowid);
    this.db.prepare("INSERT INTO analysis_results VALUES (?, ?, ?, ?)").run(id, JSON.stringify(result), DATASET_VERSION, MODEL_VERSION);
    return id;
  }

  audit(event, recordType, recordId, details) {
    this.db.prepare("INSERT INTO audit_events (event, record_type, record_id, created_at, details_json) VALUES (?, ?, ?, ?, ?)").run(event, recordType, recordId, new Date().toISOString(), JSON.stringify(details));
  }

  quality() {
    const dataset = this.dataset();
    const report = validateDataset(dataset);
    const events = plain(this.db.prepare("SELECT id, event, record_type AS recordType, record_id AS recordId, created_at AS createdAt FROM audit_events ORDER BY id DESC LIMIT ?").all(15));
    return { ...report, sources: dataset.sources, events, totalZones: dataset.zones.length, completeSpendingZones: dataset.zones.filter((zone) => zone.spendingPerCapitaIdr !== null).length };
  }

  close() {
    this.db.close();
  }
}
