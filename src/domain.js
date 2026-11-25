export class InputError extends Error {
  constructor(message, details = [], status = 400) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function polygonAreaKm2(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 4) return 0;
  let signedArea = 0;
  for (let i = 0; i < polygon.length - 1; i++) {
    signedArea += polygon[i][0] * polygon[i + 1][1] - polygon[i + 1][0] * polygon[i][1];
  }
  return Math.abs(signedArea / 2);
}

export function populationDensity(population, areaKm2) {
  if (!Number.isFinite(population) || population < 0 || !Number.isFinite(areaKm2) || areaKm2 <= 0) {
    throw new InputError("Population and area must be finite and non-negative, with positive area.");
  }
  return population / areaKm2;
}

export function monthlySpending(population, perCapitaIdr, spendingShare = 1) {
  if (perCapitaIdr === null) return null;
  if (![population, perCapitaIdr, spendingShare].every(Number.isFinite) || population < 0 || perCapitaIdr < 0 || spendingShare < 0 || spendingShare > 1) {
    throw new InputError("Spending inputs must be finite and non-negative, with share between zero and one.");
  }
  return population * perCapitaIdr * spendingShare;
}

export function normalize(value, minimum, maximum, reverse = false) {
  if (![value, minimum, maximum].every(Number.isFinite) || maximum < minimum) throw new InputError("Invalid normalization range.");
  const score = maximum === minimum ? 50 : Math.max(0, Math.min(100, (value - minimum) / (maximum - minimum) * 100));
  return reverse ? 100 - score : score;
}

export function distanceKm(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function zoneIndicators(zone, category, competitors) {
  const count = competitors.filter((item) => item.zoneId === zone.id && item.categoryId === category.id).length;
  const categorySpendingIdr = monthlySpending(zone.population, zone.spendingPerCapitaIdr, category.spendingShare);
  return {
    ...zone,
    densityPerKm2: populationDensity(zone.population, zone.areaKm2),
    monthlySpendingIdr: monthlySpending(zone.population, zone.spendingPerCapitaIdr),
    categorySpendingIdr,
    competitorCount: count,
    spendingPerCompetitorIdr: categorySpendingIdr === null ? null : categorySpendingIdr / (count + 1),
    spendingComplete: zone.spendingPerCapitaIdr !== null,
  };
}

function numberInRange(value, minimum, maximum, field) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new InputError(`${field} must be a number between ${minimum} and ${maximum}.`, [field]);
  }
}

export function validateAssumptions(value, dataset) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError("Assumptions must be an object.");
  const allowed = new Set(["categoryId", "radiusKm", "weights", "siteOverrides"]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new InputError("Unknown assumption field.", [key]);
  if (!dataset.categories.some((item) => item.id === value.categoryId)) throw new InputError("Choose an existing category.", ["categoryId"]);
  numberInRange(value.radiusKm, 0.4, 4, "radiusKm");
  const names = ["population", "spending", "competition", "cost"];
  if (!value.weights || typeof value.weights !== "object" || Array.isArray(value.weights)) throw new InputError("Provide four score weights.", ["weights"]);
  if (Object.keys(value.weights).some((key) => !names.includes(key))) throw new InputError("Unknown score weight.");
  for (const name of names) numberInRange(value.weights[name], 0, 100, `weights.${name}`);
  if (names.reduce((total, name) => total + value.weights[name], 0) === 0) throw new InputError("At least one weight must be positive.", ["weights"]);
  const siteOverrides = value.siteOverrides ?? {};
  if (!siteOverrides || typeof siteOverrides !== "object" || Array.isArray(siteOverrides)) throw new InputError("Site overrides must be an object.");
  for (const [id, override] of Object.entries(siteOverrides)) {
    if (!/^[1-9]\d*$/.test(id) || !dataset.candidates.some((item) => item.id === Number(id))) throw new InputError("Unknown candidate override.", [id]);
    if (!override || typeof override !== "object" || Array.isArray(override)) throw new InputError("Invalid candidate override.", [id]);
    for (const key of Object.keys(override)) {
      if (!["rentMonthlyIdr", "investmentIdr"].includes(key)) throw new InputError("Unknown site cost field.", [key]);
      numberInRange(override[key], 0, 100000000000, `siteOverrides.${id}.${key}`);
    }
  }
  return { categoryId: value.categoryId, radiusKm: value.radiusKm, weights: { ...value.weights }, siteOverrides: structuredClone(siteOverrides) };
}

function candidateMetrics(site, dataset, assumptions) {
  const category = dataset.categories.find((item) => item.id === assumptions.categoryId);
  const zones = dataset.zones.filter((zone) => distanceKm(site, { x: zone.centerX, y: zone.centerY }) <= assumptions.radiusKm);
  const population = zones.reduce((total, zone) => total + zone.population, 0);
  const completeZones = zones.filter((zone) => zone.spendingPerCapitaIdr !== null);
  const knownPopulation = completeZones.reduce((total, zone) => total + zone.population, 0);
  const addressableSpendingIdr = completeZones.reduce((total, zone) => total + monthlySpending(zone.population, zone.spendingPerCapitaIdr, category.spendingShare), 0);
  const nearbyCompetitors = dataset.competitors
    .filter((item) => item.categoryId === category.id)
    .map((item) => ({ ...item, distanceKm: distanceKm(site, item) }))
    .filter((item) => item.distanceKm <= assumptions.radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm || a.id - b.id);
  const costs = { rentMonthlyIdr: site.rentMonthlyIdr, investmentIdr: site.investmentIdr, ...assumptions.siteOverrides[site.id] };
  return {
    ...site, ...costs,
    population, addressableSpendingIdr, competitorCount: nearbyCompetitors.length,
    nearbyCompetitors, annualSiteCostIdr: costs.investmentIdr + 12 * costs.rentMonthlyIdr,
    zoneIds: zones.map((zone) => zone.id),
    spendingCoveragePercent: population === 0 ? 0 : knownPopulation / population * 100,
    missingSpendingZones: zones.length - completeZones.length,
  };
}

export function analyzeCandidates(dataset, rawAssumptions) {
  const assumptions = validateAssumptions(rawAssumptions, dataset);
  const metrics = dataset.candidates.map((site) => candidateMetrics(site, dataset, assumptions));
  const fields = { population: "population", spending: "addressableSpendingIdr", competition: "competitorCount", cost: "annualSiteCostIdr" };
  const ranges = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, {
    minimum: Math.min(...metrics.map((site) => site[field])),
    maximum: Math.max(...metrics.map((site) => site[field])),
    unit: key === "population" ? "people" : key === "competition" ? "businesses" : key === "spending" ? "IDR/month" : "IDR",
  }]));
  const weightSum = Object.values(assumptions.weights).reduce((total, weight) => total + weight, 0);
  const candidates = metrics.map((site) => {
    const components = Object.fromEntries(Object.entries(fields).map(([key, field]) => {
      const range = ranges[key];
      const score = normalize(site[field], range.minimum, range.maximum, key === "competition" || key === "cost");
      return [key, { score, weight: assumptions.weights[key] / weightSum, contribution: score * assumptions.weights[key] / weightSum, input: site[field], unit: range.unit }];
    }));
    return { ...site, components, score: Object.values(components).reduce((total, component) => total + component.contribution, 0) };
  }).sort((a, b) => b.score - a.score || a.id - b.id).map((site, index) => ({ ...site, rank: index + 1 }));
  return { assumptions, ranges, candidates };
}

export function validateDataset(dataset) {
  const issues = [];
  const add = (severity, kind, id, field, message) => issues.push({ severity, kind, id, field, message });
  const sourceIds = new Set(dataset.sources?.map((source) => source.id) ?? [dataset.source?.id]);
  for (const source of dataset.sources ?? [dataset.source]) {
    if (!source || source.synthetic !== 1) add("error", "source", source?.id ?? 0, "synthetic", "Every source must be explicitly synthetic.");
  }
  for (const zone of dataset.zones) {
    const points = zone.geometry;
    if (!Array.isArray(points) || points.length < 4 || points.some((point) => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite))) {
      add("error", "zone", zone.id, "geometry", "Polygon must contain finite coordinate pairs.");
    } else {
      if (points[0][0] !== points.at(-1)[0] || points[0][1] !== points.at(-1)[1]) add("error", "zone", zone.id, "geometry", "Polygon ring is not closed.");
      if (Math.abs(polygonAreaKm2(points) - zone.areaKm2) > 0.000001) add("error", "zone", zone.id, "areaKm2", "Polygon area does not match stored area.");
    }
    if (!Number.isInteger(zone.population) || zone.population < 0) add("error", "zone", zone.id, "population", "Population must be a non-negative integer.");
    if (!Number.isFinite(zone.areaKm2) || zone.areaKm2 <= 0) add("error", "zone", zone.id, "areaKm2", "Area must be positive.");
    if (!Number.isInteger(zone.adultPopulation) || zone.adultPopulation < 0 || zone.adultPopulation > zone.population) add("error", "zone", zone.id, "adultPopulation", "Adult population must fall inside total population.");
    if (!Number.isInteger(zone.households) || zone.households <= 0) add("error", "zone", zone.id, "households", "Households must be positive.");
    if (!dataset.districts.some((district) => district.id === zone.districtId)) add("error", "zone", zone.id, "districtId", "District reference is missing.");
    for (const [field, maximum] of [["spendingPerCapitaIdr", Infinity], ["purchasingPowerIndex", 100]]) {
      if (zone[field] === null || zone[field] === undefined) add("warning", "zone", zone.id, field, "Synthetic indicator is intentionally missing; no value is imputed.");
      else if (!Number.isFinite(zone[field]) || zone[field] < 0 || zone[field] > maximum) add("error", "zone", zone.id, field, "Indicator is outside its valid range.");
    }
    if (!sourceIds.has(zone.sourceId)) add("error", "zone", zone.id, "sourceId", "Source reference is missing.");
  }
  const nodeIds = new Set(dataset.nodes.map((node) => node.id));
  const adjacency = new Map(dataset.nodes.map((node) => [node.id, []]));
  for (const edge of dataset.edges) {
    if (!nodeIds.has(edge.fromNode) || !nodeIds.has(edge.toNode) || edge.fromNode === edge.toNode || !Number.isFinite(edge.distanceKm) || edge.distanceKm <= 0 || !Number.isFinite(edge.speedKmh) || edge.speedKmh <= 0) {
      add("error", "road", edge.id, "edge", "Road endpoints, distance or speed are invalid.");
    } else {
      adjacency.get(edge.fromNode).push(edge.toNode);
      adjacency.get(edge.toNode).push(edge.fromNode);
    }
  }
  const visited = new Set();
  const queue = dataset.nodes.length ? [dataset.nodes[0].id] : [];
  for (let i = 0; i < queue.length; i++) {
    if (visited.has(queue[i])) continue;
    visited.add(queue[i]);
    queue.push(...adjacency.get(queue[i]).filter((id) => !visited.has(id)));
  }
  if (visited.size !== nodeIds.size || !nodeIds.size) add("error", "road", 0, "connectivity", "Road network is not connected.");
  const zones = new Set(dataset.zones.map((zone) => zone.id));
  const categories = new Set(dataset.categories.map((category) => category.id));
  for (const category of dataset.categories) {
    if (!Number.isFinite(category.spendingShare) || category.spendingShare <= 0 || category.spendingShare > 1) add("error", "category", category.id, "spendingShare", "Category share must be in (0, 1].");
  }
  for (const [kind, records] of [["competitor", dataset.competitors], ["candidate", dataset.candidates], ["outlet", dataset.existing]]) {
    for (const record of records) {
      if (!zones.has(record.zoneId)) add("error", kind, record.id, "zoneId", "Zone reference is missing.");
      if (![record.x, record.y].every(Number.isFinite)) add("error", kind, record.id, "coordinates", "Coordinates must be finite.");
      if (kind !== "candidate" && !categories.has(record.categoryId)) add("error", kind, record.id, "categoryId", "Category reference is missing.");
      if (kind === "candidate" && (![record.rentMonthlyIdr, record.investmentIdr, record.floorAreaM2].every(Number.isFinite) || record.rentMonthlyIdr < 0 || record.investmentIdr < 0 || record.floorAreaM2 <= 0)) add("error", kind, record.id, "costs", "Site costs and floor area are invalid.");
    }
  }
  return { issues, errors: issues.filter((issue) => issue.severity === "error").length, warnings: issues.filter((issue) => issue.severity === "warning").length, connectedRoadNodes: visited.size };
}
