import { CityMap } from "./map.js";

const $ = (selector) => document.querySelector(selector);
const integer = (value) => new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(value);
const compact = (value) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const idr = (value) => value === null ? "Missing" : `Rp ${compact(value)}`;
const percent = (value) => `${value.toFixed(1)}%`;
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

const state = {
  dataset: null,
  defaults: null,
  assumptions: null,
  analysis: null,
  map: null,
  selectedZone: null,
  selectedSite: null,
  comparisonIds: new Set(),
  scenarios: [],
};
const titles = {
  city: ["Kota Reka city explorer", "Explore the population, spending and competitive context of a fictional urban market."],
  market: ["Neighborhood market data", "Inspect every zone and understand the inputs behind market opportunity indicators."],
  sites: ["Candidate site workbench", "Evaluate candidate sites with transparent inputs and an explainable baseline score."],
  scenarios: ["Scenario comparison", "Save reproducible snapshots and compare how the candidate rankings change."],
  quality: ["Data quality & sources", "Review synthetic sources, missing indicators and data validation findings."],
};

async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "The request could not be completed.");
  return data;
}

let noticeTimeout;
function notice(message, error = false) {
  clearTimeout(noticeTimeout);
  $("#status").textContent = message;
  $("#status").className = error ? "status error" : "status";
  if (!error) noticeTimeout = setTimeout(() => $("#status").classList.add("hidden"), 4500);
}

async function task(callback, button) {
  if (button) button.disabled = true;
  try {
    await callback();
  } catch (error) {
    notice(error.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}

function category() {
  return state.dataset.categories.find((item) => item.id === state.assumptions.categoryId);
}

function districtName(id) {
  return state.dataset.districts.find((item) => item.id === id)?.name ?? "Unknown district";
}

function showView(name) {
  for (const view of document.querySelectorAll(".view")) view.classList.toggle("active", view.id === `view-${name}`);
  for (const item of document.querySelectorAll(".nav-item")) {
    const active = item.dataset.view === name;
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  }
  $("#page-title").innerHTML = titles[name][0];
  $("#page-description").textContent = titles[name][1];
  if (name === "quality") task(loadQuality);
}

function metric(label, value, detail) {
  return `<article class="kpi">
    <small>${escape(label)}</small><strong>${escape(value)}</strong><p>${escape(detail)}</p>
  </article>`;
}

function renderKpis() {
  const population = state.dataset.zones.reduce((sum, zone) => sum + zone.population, 0);
  const spending = state.dataset.zones.reduce((sum, zone) => sum + zone.population * (zone.spendingPerCapitaIdr ?? 0) * category().spendingShare, 0);
  const rivals = state.dataset.competitors.filter((item) => item.categoryId === category().id).length;
  $("#city-kpis").innerHTML = [
    metric("Synthetic population", integer(population), "80 geographic zones · 6 districts"),
    metric("Category spending / month", idr(spending), `${category().name} · 78/80 zone inputs available`),
    metric("Competing businesses", integer(rivals), "Selected category · synthetic locations"),
    metric("Candidate sites", "12", "Explore, compare and test assumptions"),
  ].join("");
  $("#version-label").textContent = `${state.dataset.datasetVersion} · ${state.dataset.modelVersion}`;
}

function detailRow(label, value) {
  return `<div class="detail-stat"><span>${escape(label)}</span><strong>${escape(value)}</strong></div>`;
}

function selectZone(zone) {
  state.selectedZone = zone;
  $("#zone-name").textContent = zone.name;
  $("#zone-code").textContent = zone.code;
  const density = zone.population / zone.areaKm2;
  const spend = zone.spendingPerCapitaIdr === null ? null : zone.population * zone.spendingPerCapitaIdr * category().spendingShare;
  const competitorCount = state.dataset.competitors.filter((item) => item.zoneId === zone.id && item.categoryId === category().id).length;
  $("#zone-detail").innerHTML = `
    <p class="zone-subtitle">${escape(districtName(zone.districtId))} · ${escape(zone.landUse)}</p>
    ${detailRow("Population", `${integer(zone.population)} people`)}
    ${detailRow("Population density", `${integer(density)} / km²`)}
    ${detailRow("Polygon area", `${zone.areaKm2.toFixed(2)} km²`)}
    ${detailRow("Households", integer(zone.households))}
    <div class="detail-divider">
      ${detailRow("Spend / person / month", idr(zone.spendingPerCapitaIdr))}
      ${detailRow("Category spend / month", idr(spend))}
      ${detailRow("Category share", percent(category().spendingShare * 100))}
      ${detailRow("Local competitors", competitorCount)}
      ${detailRow("Purchasing power", zone.purchasingPowerIndex === null ? "Missing" : `${zone.purchasingPowerIndex} / 100`)}
    </div>
    <p class="info-line">Synthetic reference month 2026-01. Whole-zone spending indicates category demand, with no sales capture assumed.</p>`;
}

function renderMarket() {
  const district = $("#district-filter").value;
  const query = $("#zone-search").value.trim().toLowerCase();
  const rows = state.dataset.zones.filter((zone) => {
    const matchesDistrict = district === "all" || zone.districtId === Number(district);
    const matchesSearch = `${zone.name} ${zone.code}`.toLowerCase().includes(query);
    return matchesDistrict && matchesSearch;
  });
  $("#market-rows").innerHTML = rows.map((zone) => {
    const count = state.dataset.competitors.filter((item) => item.zoneId === zone.id && item.categoryId === category().id).length;
    const spend = zone.spendingPerCapitaIdr === null ? null : zone.population * zone.spendingPerCapitaIdr * category().spendingShare;
    return `<tr>
      <td><button data-market-zone="${zone.id}">${escape(zone.name)}<small>${escape(zone.code)} · ${escape(zone.landUse)}</small></button></td>
      <td>${escape(districtName(zone.districtId))}</td>
      <td>${integer(zone.population)}</td>
      <td>${integer(zone.population / zone.areaKm2)}</td>
      <td>${idr(zone.spendingPerCapitaIdr)}</td>
      <td>${idr(spend)}</td>
      <td>${count}</td>
      <td><span class="coverage ${spend === null ? "incomplete" : ""}">${spend === null ? "Missing spend" : "Available"}</span></td>
    </tr>`;
  }).join("");
  if (!rows.length) $("#market-rows").innerHTML = '<tr><td colspan="8">No zones match the current filters.</td></tr>';
  $("#market-count").textContent = `${rows.length} of 80 zones · monthly spending is synthetic potential, separate from revenue.`;
}

function score(value) {
  return `<span class="score">${value.toFixed(1)}<progress class="score-track" value="${value}" max="100" aria-label="Suitability score"></progress></span>`;
}

function renderRankings() {
  $("#ranking-summary").textContent = `${category().name} · ${state.assumptions.radiusKm.toFixed(1)} km centroid neighborhood · relative score out of 100`;
  $("#candidate-rows").innerHTML = state.analysis.candidates.map((site) => `<tr class="${site.id === state.selectedSite ? "selected" : ""}">
    <td><input type="checkbox" data-compare-site="${site.id}" aria-label="Compare ${site.name}" ${state.comparisonIds.has(site.id) ? "checked" : ""}></td>
    <td><button data-select-site="${site.id}">${escape(site.name)}<small>Rank ${site.rank} · ${site.floorAreaM2} m²</small></button></td>
    <td>${score(site.score)}</td>
    <td>${integer(site.population)}</td>
    <td>${idr(site.addressableSpendingIdr)}</td>
    <td>${site.competitorCount}</td>
    <td><span class="coverage ${site.missingSpendingZones ? "incomplete" : ""}">${percent(site.spendingCoveragePercent)}</span></td>
  </tr>`).join("");
  const top = state.analysis.candidates[0];
  $("#top-site").textContent = `${top.name} leads the shortlist.`;
  $("#top-site-note").textContent = `A ${top.score.toFixed(1)} / 100 relative score with ${integer(top.population)} people in the illustrative neighborhood. Review all four score components.`;
}

function selectSite(id, navigate = true) {
  state.selectedSite = id;
  renderRankings();
  renderSiteDetail();
  if (navigate) showView("sites");
}

function renderSiteDetail() {
  const site = state.analysis.candidates.find((item) => item.id === state.selectedSite);
  if (!site) return;
  const labels = { population: "Population", spending: "Category spending", competition: "Competitive space", cost: "Site cost" };
  const components = Object.entries(site.components).map(([key, component]) => `
    <div class="component-row">
      <span>${labels[key]}</span>
      <progress class="component-bar" value="${component.score}" max="100" aria-label="${labels[key]} score"></progress>
      <strong>${component.score.toFixed(1)}</strong>
      <small>${percent(component.weight * 100)} weight</small>
    </div>`).join("");
  const inputs = Object.entries(site.components).map(([key, component]) => {
    const range = state.analysis.ranges[key];
    return `<tr>
      <td>${labels[key]}</td><td>${integer(component.input)} ${escape(component.unit)}</td>
      <td>${integer(range.minimum)}</td><td>${integer(range.maximum)}</td>
      <td>${component.contribution.toFixed(2)}</td>
    </tr>`;
  }).join("");
  const nearby = site.nearbyCompetitors.map((rival) => `<span class="rival">${escape(rival.name)} · ${rival.distanceKm.toFixed(2)} km</span>`).join("");
  $("#candidate-detail").innerHTML = `
    <div class="panel-title">
      <div><div class="eyebrow">CANDIDATE DETAIL · RANK ${site.rank}</div><h2>${escape(site.name)}</h2><p>${site.zoneIds.length} zone centroids inside the neighborhood</p></div>
      <span class="score">${site.score.toFixed(1)} / 100</span>
    </div>
    <div class="candidate-detail-body">
      <div class="site-metrics">
        <span>Neighborhood population<strong>${integer(site.population)}</strong></span>
        <span>Category spend / month<strong>${idr(site.addressableSpendingIdr)}</strong></span>
        <span>Spending input coverage<strong>${percent(site.spendingCoveragePercent)}</strong></span>
        <span>First-year site cost<strong>${idr(site.annualSiteCostIdr)}</strong></span>
      </div>
      <h3>Score components</h3>${components}
      <p class="info-line">Weighted score = the sum of each component score × its normalized weight. ${site.missingSpendingZones} zone(s) have missing spending inputs; those zones contribute zero to the spending sum without an imputed value.</p>
      <details class="scoring-inputs">
        <summary>View scoring inputs and comparison ranges</summary>
        <p class="info-line">Higher-is-better score = 100 × (input − minimum) ÷ (maximum − minimum). Competition and cost use 100 minus that result. Ranges use all twelve candidates.</p>
        <div class="table-scroll"><table>
          <thead><tr><th>Component</th><th>Current input</th><th>Minimum</th><th>Maximum</th><th>Weighted points</th></tr></thead>
          <tbody>${inputs}</tbody>
        </table></div>
      </details>
      <form id="site-cost-form" class="cost-form">
        <label>Monthly rent · IDR<input type="number" name="rentMonthlyIdr" min="0" max="100000000000" step="1" value="${site.rentMonthlyIdr}" required></label>
        <label>Initial investment · IDR<input type="number" name="investmentIdr" min="0" max="100000000000" step="1" value="${site.investmentIdr}" required></label>
        <button class="secondary" type="submit">Apply site costs</button>
      </form>
      <h3 class="detail-divider">Nearby category competitors</h3>
      <div class="rivals">${nearby || '<span class="rival">No category competitors within this radius</span>'}</div>
    </div>`;
  $("#site-cost-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const assumptions = structuredClone(state.assumptions);
    assumptions.siteOverrides[site.id] = {
      rentMonthlyIdr: Number(data.get("rentMonthlyIdr")),
      investmentIdr: Number(data.get("investmentIdr")),
    };
    task(() => runAnalysis(assumptions), event.submitter);
  });
}

function renderCandidateComparison() {
  const selected = state.analysis.candidates.filter((site) => state.comparisonIds.has(site.id));
  $("#candidate-comparison").innerHTML = selected.map((site) => `
    <article class="comparison-card">
      <h3>${escape(site.name)}</h3><div class="big-score">${site.score.toFixed(1)}<small> / 100</small></div>
      ${detailRow("Population", integer(site.population))}
      ${detailRow("Category spend / month", idr(site.addressableSpendingIdr))}
      ${detailRow("Nearby competitors", site.competitorCount)}
      ${detailRow("Monthly rent", idr(site.rentMonthlyIdr))}
      ${detailRow("Initial investment", idr(site.investmentIdr))}
      ${detailRow("Spending coverage", percent(site.spendingCoveragePercent))}
    </article>`).join("") || '<p class="empty-text">Select a candidate in the table to start a comparison.</p>';
}

function syncAssumptions() {
  const form = $("#assumptions-form");
  form.elements.radiusKm.value = state.assumptions.radiusKm;
  for (const [key, value] of Object.entries(state.assumptions.weights)) form.elements[key].value = value;
  $("#category").value = state.assumptions.categoryId;
  $("#current-assumptions").textContent = `Current inputs · ${category().name}, ${state.assumptions.radiusKm} km, ${Object.keys(state.assumptions.siteOverrides).length} site cost override(s).`;
}

async function runAnalysis(assumptions, message = "Rankings updated.") {
  const analysis = await api("/api/analysis", assumptions);
  state.analysis = analysis;
  state.assumptions = analysis.assumptions;
  state.map.categoryId = state.assumptions.categoryId;
  state.map.render();
  syncAssumptions();
  renderKpis();
  renderMarket();
  renderRankings();
  renderSiteDetail();
  renderCandidateComparison();
  if (state.selectedZone) selectZone(state.selectedZone);
  notice(message);
}

async function loadScenarios(preferredId) {
  state.scenarios = await api("/api/scenarios");
  const options = state.scenarios.map((scenario) => `<option value="${scenario.id}">${escape(scenario.name)}</option>`).join("");
  $("#scenario-a").innerHTML = options;
  $("#scenario-b").innerHTML = options;
  $("#scenario-a").value = state.scenarios.find((item) => item.baseline)?.id ?? state.scenarios[0].id;
  $("#scenario-b").value = preferredId ?? state.scenarios.at(-1).id;
  $("#saved-scenarios").innerHTML = state.scenarios.map((scenario) => `
    <article class="saved-card">
      <h3>${escape(scenario.name)}</h3>
      <p>${scenario.baseline ? "Reference baseline" : "Saved scenario"} · ${escape(scenario.modelVersion)}</p>
      <p>${escape(new Date(scenario.createdAt).toLocaleString())}</p>
      <button class="text-button" data-load-scenario="${scenario.id}">Load assumptions into workbench ↗</button>
    </article>`).join("");
}

async function compareScenarios() {
  const ids = [Number($("#scenario-a").value), Number($("#scenario-b").value)];
  const { scenarios } = await api("/api/scenarios/compare", { ids });
  const [reference, comparison] = scenarios;
  const rows = reference.result.candidates.map((site) => {
    const other = comparison.result.candidates.find((item) => item.id === site.id);
    const change = other.score - site.score;
    return `<tr>
      <td>${escape(site.name)}</td>
      <td>${site.rank}</td><td>${other.rank}</td>
      <td>${site.score.toFixed(1)}</td><td>${other.score.toFixed(1)}</td>
      <td class="${change >= 0 ? "positive" : "negative"}">${change > 0 ? "+" : ""}${change.toFixed(1)}</td>
      <td>${idr(site.addressableSpendingIdr)}</td><td>${idr(other.addressableSpendingIdr)}</td>
    </tr>`;
  }).join("");
  $("#scenario-comparison").innerHTML = `
    <div class="scenario-summary">
      <div><strong>${escape(reference.name)}</strong><p>${reference.assumptions.radiusKm} km · category ${reference.assumptions.categoryId}</p></div>
      <div><strong>${escape(comparison.name)}</strong><p>${comparison.assumptions.radiusKm} km · category ${comparison.assumptions.categoryId}</p></div>
    </div>
    <div class="table-scroll"><table>
      <thead><tr><th>Candidate</th><th>Reference rank</th><th>New rank</th><th>Reference score</th><th>New score</th><th>Score change</th><th>Reference spend / month</th><th>New spend / month</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

async function loadQuality() {
  const quality = await api("/api/quality");
  $("#quality-kpis").innerHTML = [
    metric("Validation errors", quality.errors, "Geometry, ranges and references"),
    metric("Incomplete indicators", quality.warnings, "Intentionally missing synthetic values"),
    metric("Spending completeness", `${quality.completeSpendingZones}/${quality.totalZones}`, "No values silently imputed"),
    metric("Connected road nodes", quality.connectedRoadNodes, "Undirected road graph validated"),
  ].join("");
  $("#quality-rows").innerHTML = quality.issues.map((issue) => `
    <tr><td><span class="issue-tag ${issue.severity}">${escape(issue.severity)}</span></td>
      <td>${escape(issue.kind)} #${issue.id}</td><td>${escape(issue.field)}</td><td>${escape(issue.message)}</td>
    </tr>`).join("") || '<tr><td colspan="4">No validation findings.</td></tr>';
  $("#sources").innerHTML = `<h2>Source & measurement lineage</h2>${quality.sources.map((source) => `
    <p><strong>${escape(source.name)}</strong> · ${escape(source.version)}</p>
    <p>${escape(source.description)}</p>
    <p><span class="coverage">EXPLICITLY SYNTHETIC</span></p>
  `).join("")}<p>All measurement records reference their source and synthetic reference month. Data are generated deterministically and describe no actual city or customer.</p>`;
  $("#audit-events").innerHTML = quality.events.map((event) => `
    <div class="audit-item"><strong>${escape(event.event)}<br><small>${escape(event.recordType)} #${event.recordId}</small></strong><small>${escape(new Date(event.createdAt).toLocaleString())}</small></div>
  `).join("");
}

function bindEvents() {
  for (const button of document.querySelectorAll("[data-view]")) button.addEventListener("click", () => showView(button.dataset.view));
  for (const button of document.querySelectorAll("[data-layer]")) button.addEventListener("click", () => {
    for (const item of document.querySelectorAll("[data-layer]")) item.classList.toggle("selected", item === button);
    state.map.setLayer(button.dataset.layer);
  });
  for (const layer of ["competitors", "candidates", "roads", "districts"]) {
    $(`#show-${layer}`).addEventListener("change", (event) => {
      state.map.layers[layer] = event.target.checked;
      state.map.render();
    });
  }
  $("#zoom-in").addEventListener("click", () => state.map.zoom(1.25));
  $("#zoom-out").addEventListener("click", () => state.map.zoom(0.8));
  $("#map-reset").addEventListener("click", () => state.map.reset());
  $("#explore-sites").addEventListener("click", () => showView("sites"));
  $("#open-method").addEventListener("click", () => {
    showView("sites");
    $(".assumptions-panel").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  $("#category").addEventListener("change", (event) => task(() => runAnalysis({ ...state.assumptions, categoryId: Number(event.target.value) })));
  $("#district-filter").addEventListener("change", renderMarket);
  $("#zone-search").addEventListener("input", renderMarket);
  $("#market-rows").addEventListener("click", (event) => {
    const button = event.target.closest("[data-market-zone]");
    if (!button) return;
    const zone = state.dataset.zones.find((item) => item.id === Number(button.dataset.marketZone));
    selectZone(zone);
    state.map.selectZone(zone.id);
    showView("city");
  });
  $("#candidate-rows").addEventListener("click", (event) => {
    const button = event.target.closest("[data-select-site]");
    if (button) selectSite(Number(button.dataset.selectSite), false);
  });
  $("#candidate-rows").addEventListener("change", (event) => {
    if (!event.target.matches("[data-compare-site]")) return;
    const id = Number(event.target.dataset.compareSite);
    if (event.target.checked && state.comparisonIds.size >= 3) {
      event.target.checked = false;
      return notice("Choose up to three candidates.", true);
    }
    if (event.target.checked) state.comparisonIds.add(id);
    else state.comparisonIds.delete(id);
    renderCandidateComparison();
  });
  $("#assumptions-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const weights = Object.fromEntries(["population", "spending", "competition", "cost"].map((key) => [key, Number(data.get(key))]));
    task(() => runAnalysis({ ...state.assumptions, radiusKm: Number(data.get("radiusKm")), weights }), event.submitter);
  });
  $("#reset-assumptions").addEventListener("click", (event) => task(() => runAnalysis(structuredClone(state.defaults)), event.currentTarget));
  $("#save-scenario-form").addEventListener("submit", (event) => {
    event.preventDefault();
    task(async () => {
      const saved = await api("/api/scenarios", { name: $("#scenario-name").value, assumptions: state.assumptions });
      await loadScenarios(saved.id);
      $("#scenario-name").value = "";
      await compareScenarios();
      notice("Scenario and analysis results saved locally.");
    }, event.submitter);
  });
  $("#compare-scenarios-form").addEventListener("submit", (event) => {
    event.preventDefault();
    task(compareScenarios, event.submitter);
  });
  $("#saved-scenarios").addEventListener("click", (event) => {
    const button = event.target.closest("[data-load-scenario]");
    if (!button) return;
    task(async () => {
      const scenario = await api(`/api/scenarios/${button.dataset.loadScenario}`);
      await runAnalysis(scenario.assumptions, `Loaded assumptions from ${scenario.name}.`);
      showView("sites");
    }, button);
  });
  $("#refresh-quality").addEventListener("click", (event) => task(loadQuality, event.currentTarget));
}

async function initialize() {
  const [dataset, assumptions] = await Promise.all([api("/api/dataset"), api("/api/assumptions")]);
  state.dataset = dataset;
  state.defaults = structuredClone(assumptions);
  state.assumptions = assumptions;
  $("#category").innerHTML = dataset.categories.map((item) => `<option value="${item.id}">${escape(item.name)}</option>`).join("");
  $("#district-filter").insertAdjacentHTML("beforeend", dataset.districts.map((item) => `<option value="${item.id}">${escape(item.name)}</option>`).join(""));
  state.map = new CityMap($("#city-map"), dataset, selectZone, selectSite);
  state.analysis = await api("/api/analysis", assumptions);
  state.selectedSite = state.analysis.candidates[0].id;
  state.comparisonIds = new Set(state.analysis.candidates.slice(0, 2).map((item) => item.id));
  bindEvents();
  syncAssumptions();
  renderKpis();
  renderMarket();
  renderRankings();
  renderSiteDetail();
  renderCandidateComparison();
  selectZone(dataset.zones[34]);
  state.map.selectZone(35);
  await loadScenarios();
}

task(initialize);
