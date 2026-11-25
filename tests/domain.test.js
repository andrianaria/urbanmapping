import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ASSUMPTIONS, generateDataset } from "../src/data.js";
import {
  InputError, analyzeCandidates, monthlySpending, normalize,
  polygonAreaKm2, populationDensity, validateAssumptions, validateDataset, zoneIndicators,
} from "../src/domain.js";

test("polygon area and population density retain kilometre units", () => {
  const polygon = [[0, 0], [2, 0], [2, 3], [0, 3], [0, 0]];
  assert.equal(polygonAreaKm2(polygon), 6);
  assert.equal(polygonAreaKm2([...polygon].reverse()), 6);
  assert.equal(populationDensity(12_000, 6), 2_000);
  assert.equal(populationDensity(0, 0.64), 0);
  for (const [population, area] of [[-1, 1], [1, 0], [NaN, 1], [1, Infinity]]) {
    assert.throws(() => populationDensity(population, area), InputError);
  }
});

test("monthly spending and category indicators expose missing measurements", () => {
  assert.equal(monthlySpending(100, 2_000_000), 200_000_000);
  assert.equal(monthlySpending(100, 2_000_000, 0.18), 36_000_000);
  assert.equal(monthlySpending(100, null, 0.18), null);
  for (const args of [[-1, 10], [100, -1], [100, 10, 1.01], [100, NaN]]) {
    assert.throws(() => monthlySpending(...args), InputError);
  }
  const zone = { id: 1, population: 100, areaKm2: 0.5, spendingPerCapitaIdr: null };
  const indicators = zoneIndicators(zone, { id: 2, spendingShare: 0.2 }, [
    { zoneId: 1, categoryId: 2 }, { zoneId: 1, categoryId: 1 }, { zoneId: 2, categoryId: 2 },
  ]);
  assert.equal(indicators.densityPerKm2, 200);
  assert.equal(indicators.competitorCount, 1);
  assert.equal(indicators.categorySpendingIdr, null);
  assert.equal(indicators.spendingPerCompetitorIdr, null);
  assert.equal(indicators.spendingComplete, false);
});

test("normalization clips the range, reverses costs and handles equal inputs", () => {
  assert.equal(normalize(5, 0, 10), 50);
  assert.equal(normalize(0, 0, 10, true), 100);
  assert.equal(normalize(10, 0, 10, true), 0);
  assert.equal(normalize(-2, 0, 10), 0);
  assert.equal(normalize(15, 0, 10), 100);
  assert.equal(normalize(7, 7, 7), 50);
  assert.equal(normalize(7, 7, 7, true), 50);
  assert.throws(() => normalize(1, 2, 0), InputError);
  assert.throws(() => normalize(Infinity, 0, 1), InputError);
});

function smallMarket() {
  return {
    categories: [{ id: 1, spendingShare: 0.2 }],
    zones: [
      { id: 1, centerX: 0, centerY: 0, population: 100, spendingPerCapitaIdr: 1_000 },
      { id: 2, centerX: 0.5, centerY: 0, population: 100, spendingPerCapitaIdr: null },
      { id: 3, centerX: 5, centerY: 0, population: 500, spendingPerCapitaIdr: 1_000 },
    ],
    candidates: [
      { id: 1, x: 0, y: 0, investmentIdr: 100, rentMonthlyIdr: 10 },
      { id: 2, x: 5, y: 0, investmentIdr: 200, rentMonthlyIdr: 20 },
    ],
    competitors: [
      { id: 1, categoryId: 1, x: 0.2, y: 0 },
      { id: 2, categoryId: 2, x: 0.1, y: 0 },
    ],
  };
}

test("candidate components independently explain a weighted ranking", () => {
  const dataset = smallMarket();
  const assumptions = { categoryId: 1, radiusKm: 1, weights: { population: 1, spending: 1, competition: 1, cost: 1 } };
  const result = analyzeCandidates(dataset, assumptions);
  const first = result.candidates.find(site => site.id === 1);
  const second = result.candidates.find(site => site.id === 2);
  assert.equal(first.population, 200);
  assert.equal(first.addressableSpendingIdr, 20_000);
  assert.equal(first.spendingCoveragePercent, 50);
  assert.equal(first.missingSpendingZones, 1);
  assert.equal(first.competitorCount, 1);
  assert.equal(first.annualSiteCostIdr, 220);
  assert.equal(first.score, 25);
  assert.equal(second.score, 75);
  assert.equal(result.candidates[0].id, 2);
  assert.equal(first.components.cost.weight, 0.25);
  assert.equal(first.components.cost.contribution, 25);
  assert.equal(first.components.spending.unit, "IDR/month");
  assert.deepEqual(analyzeCandidates(dataset, assumptions), result);
});

test("rent overrides affect cost-only rankings without mutating fixtures", () => {
  const dataset = smallMarket();
  const before = structuredClone(dataset);
  const assumptions = { categoryId: 1, radiusKm: 1, weights: { population: 0, spending: 0, competition: 0, cost: 10 } };
  assert.equal(analyzeCandidates(dataset, assumptions).candidates[0].id, 1);
  const result = analyzeCandidates(dataset, { ...assumptions, siteOverrides: { 1: { rentMonthlyIdr: 100 } } });
  assert.equal(result.candidates[0].id, 2);
  assert.equal(result.candidates.find(site => site.id === 1).annualSiteCostIdr, 1_300);
  assert.deepEqual(dataset, before);
  const equal = structuredClone(dataset);
  equal.candidates[1] = { ...equal.candidates[0], id: 2 };
  const ranked = analyzeCandidates(equal, assumptions).candidates;
  assert.deepEqual(ranked.map(site => [site.id, site.score]), [[1, 50], [2, 50]]);
});

test("assumptions reject zero weights, unknown keys, categories and costs", () => {
  const dataset = generateDataset();
  const input = structuredClone(DEFAULT_ASSUMPTIONS);
  for (const invalid of [
    null, [], {},
    { ...input, categoryId: 999 },
    { ...input, radiusKm: 0 },
    { ...input, radiusKm: Infinity },
    { ...input, weights: { population: 0, spending: 0, competition: 0, cost: 0 } },
    { ...input, weights: { ...input.weights, cost: -1 } },
    { ...input, weights: { ...input.weights, extra: 10 } },
    { ...input, siteOverrides: { 99: { investmentIdr: 10 } } },
    { ...input, siteOverrides: { 1: { investmentIdr: -1 } } },
    { ...input, siteOverrides: { 1: { revenue: 10 } } },
    { ...input, externalData: true },
  ]) assert.throws(() => validateAssumptions(invalid, dataset), InputError);
});

test("deterministic seed has expected records, connected roads and visible data gaps", () => {
  const dataset = generateDataset();
  assert.deepEqual(dataset, generateDataset());
  assert.equal(dataset.districts.length, 6);
  assert.equal(dataset.zones.length, 80);
  assert.equal(dataset.competitors.length, 42);
  assert.equal(dataset.candidates.length, 12);
  assert.equal(dataset.nodes.length, 99);
  const report = validateDataset(dataset);
  assert.equal(report.errors, 0);
  assert.equal(report.warnings, 3);
  assert.equal(report.connectedRoadNodes, 99);
  assert.ok(report.issues.every(issue => issue.severity === "warning"));
});

test("record validation detects geometry, demographic, source and graph failures", () => {
  const invalid = generateDataset();
  invalid.source.synthetic = 0;
  invalid.zones[0].geometry[0] = [NaN, 0];
  invalid.zones[1].population = -1;
  invalid.zones[2].adultPopulation = invalid.zones[2].population + 1;
  invalid.zones[3].sourceId = 999;
  invalid.edges = [];
  const report = validateDataset(invalid);
  for (const field of ["synthetic", "geometry", "population", "adultPopulation", "sourceId", "connectivity"]) {
    assert.ok(report.issues.some(issue => issue.field === field && issue.severity === "error"), field);
  }
});
