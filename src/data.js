export const DATASET_VERSION = "kota-reka-1";
export const MODEL_VERSION = "baseline-1";

export const DEFAULT_ASSUMPTIONS = Object.freeze({
  categoryId: 1,
  radiusKm: 1.6,
  weights: { population: 25, spending: 40, competition: 20, cost: 15 },
  siteOverrides: {},
});

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function rectangle(x, y, width, height) {
  return [[x, y], [x + width, y], [x + width, y + height], [x, y + height], [x, y]];
}

export function generateDataset() {
  const next = random(20261125);
  const source = {
    id: 1,
    name: "Kota Reka synthetic generator",
    version: DATASET_VERSION,
    synthetic: 1,
    description: "Fictional local coordinates and simulated urban indicators. No observed people, businesses or forecasts.",
  };
  const city = { id: 1, name: "Kota Reka", coordinateSystem: "Local Cartesian kilometres, origin at southwest", sourceId: 1 };
  const districtNames = ["Taman Utara", "Pusat Reka", "Bukit Timur", "Kebun Barat", "Koridor Selatan", "Danau Tenggara"];
  const districtRanges = [[0, 4], [4, 7], [7, 10]];
  const districts = districtNames.map((name, i) => {
    const [start, end] = districtRanges[i % 3];
    return { id: i + 1, cityId: 1, name, geometry: rectangle(start * 0.8, Math.floor(i / 3) * 3.2, (end - start) * 0.8, 3.2) };
  });
  const zones = [];
  const landUses = ["residential", "mixed", "commercial", "industrial"];
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 10; column++) {
      const id = row * 10 + column + 1;
      const band = column < 4 ? 0 : column < 7 ? 1 : 2;
      const districtId = Math.floor(row / 4) * 3 + band + 1;
      const landUse = landUses[(row + column * 3) % 4];
      const centrality = 1 - Math.hypot(column - 4.5, row - 3.5) / 6;
      const population = Math.round(1700 + 4200 * next() + centrality * 2200 + (landUse === "residential" ? 1200 : 0));
      zones.push({
        id, districtId, code: `RK-${String(id).padStart(3, "0")}`,
        name: `Zone ${String(id).padStart(2, "0")}`,
        geometry: rectangle(column * 0.8, row * 0.8, 0.8, 0.8),
        centerX: column * 0.8 + 0.4, centerY: row * 0.8 + 0.4, areaKm2: 0.64,
        landUse, commercialIndex: Math.round(25 + 45 * centrality + 20 * next()),
        population, adultPopulation: Math.round(population * (0.60 + next() * 0.14)),
        households: Math.round(population / (3.0 + next() * 1.2)),
        spendingPerCapitaIdr: id === 17 || id === 68 ? null : Math.round((1100000 + next() * 1700000 + centrality * 500000) / 10000) * 10000,
        purchasingPowerIndex: id === 44 ? null : Math.round(30 + next() * 45 + centrality * 15),
        referencePeriod: "synthetic month 2026-01", sourceId: 1,
      });
    }
  }
  const categories = [
    { id: 1, name: "Food & drink", spendingShare: 0.18, description: "Illustrative share of monthly spending assigned to prepared food and drink." },
    { id: 2, name: "Daily retail", spendingShare: 0.24, description: "Illustrative share assigned to everyday household retail." },
    { id: 3, name: "Personal services", spendingShare: 0.09, description: "Illustrative share assigned to personal and household services." },
  ];
  const competitors = Array.from({ length: 42 }, (_, i) => {
    const zone = zones[(i * 17 + 9) % zones.length];
    return {
      id: i + 1, zoneId: zone.id, categoryId: i % 3 + 1,
      name: `Synthetic business ${String(i + 1).padStart(2, "0")}`,
      x: zone.centerX + (next() - 0.5) * 0.55,
      y: zone.centerY + (next() - 0.5) * 0.55, sourceId: 1,
    };
  });
  const candidateZoneIds = [5, 14, 23, 29, 34, 39, 45, 52, 57, 63, 71, 78];
  const candidates = candidateZoneIds.map((zoneId, i) => {
    const zone = zones[zoneId - 1];
    return {
      id: i + 1, zoneId, name: `Site ${String(i + 1).padStart(2, "0")}`,
      x: zone.centerX + 0.1, y: zone.centerY - 0.08,
      rentMonthlyIdr: Math.round((7000000 + next() * 20000000 + zone.commercialIndex * 100000) / 500000) * 500000,
      investmentIdr: Math.round((160000000 + next() * 300000000) / 10000000) * 10000000,
      floorAreaM2: 45 + Math.round(next() * 100), sourceId: 1,
    };
  });
  const existing = [19, 46, 75].map((zoneId, i) => {
    const zone = zones[zoneId - 1];
    return { id: i + 1, zoneId, categoryId: i % 3 + 1, name: `Reference outlet ${i + 1}`, x: zone.centerX - 0.12, y: zone.centerY + 0.13, sourceId: 1 };
  });
  const nodes = [];
  const edges = [];
  for (let row = 0; row <= 8; row++) {
    for (let column = 0; column <= 10; column++) {
      const id = row * 11 + column + 1;
      nodes.push({ id, cityId: 1, x: column * 0.8, y: row * 0.8 });
      if (column > 0) edges.push({ id: edges.length + 1, fromNode: id - 1, toNode: id, distanceKm: 0.8, speedKmh: row === 4 ? 35 : 25 });
      if (row > 0) edges.push({ id: edges.length + 1, fromNode: id - 11, toNode: id, distanceKm: 0.8, speedKmh: column === 5 ? 35 : 25 });
    }
  }
  return { source, city, districts, zones, categories, competitors, candidates, existing, nodes, edges };
}
