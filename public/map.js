const NS = "http://www.w3.org/2000/svg";
const palette = ["#e4efdc", "#bad4a9", "#86b89c", "#4b8c7b", "#205f56"];
const missing = "#d5d8d2";
const screenPoint = (x, y) => [65 + x * 108, 735 - y * 108];

function element(name, attributes = {}) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function pathData(points) {
  return points.map(([x, y], index) => `${index ? "L" : "M"}${screenPoint(x, y).join(",")}`).join(" ") + " Z";
}

export class CityMap {
  constructor(svg, dataset, onSelectZone, onSelectCandidate) {
    this.svg = svg;
    this.dataset = dataset;
    this.onSelectZone = onSelectZone;
    this.onSelectCandidate = onSelectCandidate;
    this.layer = "density";
    this.categoryId = 1;
    this.layers = { competitors: true, candidates: true, roads: false, districts: true };
    this.selectedZoneId = null;
    this.view = { x: 0, y: 0, width: 1000, height: 800 };
    this.drag = null;
    this.moved = false;
    this.tooltip = document.querySelector("#map-tooltip");
    svg.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.zoom(event.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });
    svg.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      this.drag = { x: event.clientX, y: event.clientY, view: { ...this.view } };
      this.moved = false;
    });
    svg.addEventListener("pointermove", (event) => {
      if (!this.drag) return;
      const rect = svg.getBoundingClientRect();
      const dx = event.clientX - this.drag.x;
      const dy = event.clientY - this.drag.y;
      if (Math.hypot(dx, dy) < 4 && !this.moved) return;
      this.moved = true;
      this.view.x = this.drag.view.x - dx / rect.width * this.view.width;
      this.view.y = this.drag.view.y - dy / rect.height * this.view.height;
      this.updateView();
      this.tooltip.classList.add("hidden");
    });
    window.addEventListener("pointerup", () => { this.drag = null; });
    svg.addEventListener("pointerleave", () => this.tooltip.classList.add("hidden"));
    this.render();
  }

  updateView() {
    this.svg.setAttribute("viewBox", `${this.view.x} ${this.view.y} ${this.view.width} ${this.view.height}`);
  }

  zoom(factor) {
    const newWidth = Math.min(1300, Math.max(300, this.view.width / factor));
    const newHeight = newWidth * 0.8;
    this.view.x += (this.view.width - newWidth) / 2;
    this.view.y += (this.view.height - newHeight) / 2;
    this.view.width = newWidth;
    this.view.height = newHeight;
    this.updateView();
  }

  reset() {
    this.view = { x: 0, y: 0, width: 1000, height: 800 };
    this.updateView();
  }

  setLayer(layer) {
    this.layer = layer;
    this.render();
  }

  selectZone(id) {
    this.selectedZoneId = id;
    this.render();
  }

  value(zone) {
    if (this.layer === "purchasing") return zone.purchasingPowerIndex;
    if (this.layer === "spending") {
      const category = this.dataset.categories.find((item) => item.id === this.categoryId);
      return zone.spendingPerCapitaIdr === null ? null : zone.population * zone.spendingPerCapitaIdr * category.spendingShare;
    }
    return zone.population / zone.areaKm2;
  }

  render() {
    this.svg.replaceChildren();
    const values = this.dataset.zones.map((zone) => this.value(zone)).filter((value) => value !== null);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const background = element("rect", { x: -3000, y: -3000, width: 7000, height: 7000, fill: "#edf0e9" });
    this.svg.append(background);
    const zones = element("g", { "aria-label": "Geographic zones" });
    for (const zone of this.dataset.zones) {
      const value = this.value(zone);
      const band = value === null ? -1 : Math.min(4, Math.floor((value - minimum) / (maximum - minimum || 1) * 5));
      const selected = zone.id === this.selectedZoneId;
      const shape = element("path", {
        d: pathData(zone.geometry), fill: band < 0 ? missing : palette[band],
        stroke: selected ? "#ed9c34" : "#ffffff", "stroke-width": selected ? 4.5 : 2,
        "stroke-linejoin": "round", tabindex: 0, role: "button",
        "aria-label": `${zone.name}, ${zone.population.toLocaleString("en")} synthetic residents`,
        class: "zone-shape",
      });
      const activate = () => {
        this.selectedZoneId = zone.id;
        this.onSelectZone(zone);
        this.render();
      };
      shape.addEventListener("click", () => { if (!this.moved) activate(); });
      shape.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); }
      });
      shape.addEventListener("pointermove", (event) => {
        if (this.drag && this.moved) return;
        const rect = this.svg.parentElement.getBoundingClientRect();
        this.tooltip.textContent = `${zone.code} · ${zone.name}`;
        this.tooltip.classList.remove("hidden");
        this.tooltip.style.left = `${Math.max(8, Math.min(rect.width - 180, event.clientX - rect.left + 12))}px`;
        this.tooltip.style.top = `${Math.max(8, event.clientY - rect.top - 38)}px`;
      });
      zones.append(shape);
    }
    this.svg.append(zones);
    if (this.layers.roads) this.drawRoads();
    if (this.layers.districts) this.drawDistricts();
    if (this.layers.competitors) this.drawCompetitors();
    if (this.layers.candidates) this.drawCandidates();
    this.drawScale();
    document.querySelector("#legend-title").textContent = this.layer === "density" ? "People / km²" : this.layer === "purchasing" ? "Synthetic index / 100" : "Category spend · IDR/month";
    const swatches = document.querySelector("#legend-swatches");
    swatches.replaceChildren(...palette.map((color) => {
      const item = document.createElement("i");
      item.style.backgroundColor = color;
      return item;
    }));
    const format = (value) => new Intl.NumberFormat("en", { notation: this.layer === "spending" ? "compact" : "standard", maximumFractionDigits: 0 }).format(value);
    document.querySelector("#legend-range").textContent = `${format(minimum)} – ${format(maximum)} · grey = missing`;
  }

  drawRoads() {
    const nodes = new Map(this.dataset.nodes.map((node) => [node.id, node]));
    const group = element("g", { "pointer-events": "none", opacity: 0.8 });
    for (const edge of this.dataset.edges) {
      const from = nodes.get(edge.fromNode);
      const to = nodes.get(edge.toNode);
      const [x1, y1] = screenPoint(from.x, from.y);
      const [x2, y2] = screenPoint(to.x, to.y);
      group.append(element("line", { x1, y1, x2, y2, stroke: "#fbfaf4", "stroke-width": edge.speedKmh > 25 ? 5 : 2.4 }));
    }
    this.svg.append(group);
  }

  drawDistricts() {
    const group = element("g", { "pointer-events": "none" });
    for (const district of this.dataset.districts) {
      group.append(element("path", { d: pathData(district.geometry), fill: "none", stroke: "#244a40", "stroke-width": 1.8, "stroke-dasharray": "5 4", opacity: 0.65 }));
      const corners = district.geometry.slice(0, 4);
      const [x, y] = screenPoint(corners.reduce((sum, point) => sum + point[0], 0) / 4, corners.reduce((sum, point) => sum + point[1], 0) / 4);
      const label = element("text", { x, y: y - 14, "text-anchor": "middle", class: "district-map-label", "paint-order": "stroke", stroke: "#f7fbf0", "stroke-width": 4 });
      label.textContent = district.name.toUpperCase();
      group.append(label);
    }
    this.svg.append(group);
  }

  drawCompetitors() {
    const group = element("g", { "aria-label": "Competitor markers" });
    for (const item of this.dataset.competitors.filter((record) => record.categoryId === this.categoryId)) {
      const [cx, cy] = screenPoint(item.x, item.y);
      const point = element("circle", { cx, cy, r: 4.5, fill: "#9e6146", stroke: "#fffaf0", "stroke-width": 2 });
      const title = element("title");
      title.textContent = item.name;
      point.append(title);
      group.append(point);
    }
    this.svg.append(group);
  }

  drawCandidates() {
    const group = element("g", { "aria-label": "Candidate sites" });
    for (const site of this.dataset.candidates) {
      const [cx, cy] = screenPoint(site.x, site.y);
      const marker = element("g", { tabindex: 0, role: "button", "aria-label": `Review ${site.name}`, class: "candidate-marker" });
      marker.append(element("circle", { cx, cy, r: 13, fill: "#163f38", stroke: "#ffffff", "stroke-width": 3 }));
      const label = element("text", { x: cx, y: cy + 4, "text-anchor": "middle", fill: "#fff", "font-size": 11, "font-weight": 700, "pointer-events": "none" });
      label.textContent = site.id;
      marker.append(label);
      marker.addEventListener("click", () => { if (!this.moved) this.onSelectCandidate(site.id); });
      marker.addEventListener("keydown", (event) => { if (event.key === "Enter") this.onSelectCandidate(site.id); });
      group.append(marker);
    }
    this.svg.append(group);
  }

  drawScale() {
    const group = element("g", { "pointer-events": "none" });
    group.append(element("path", { d: "M 72 775 L 72 765 L 180 765 L 180 775", fill: "none", stroke: "#28463c", "stroke-width": 2 }));
    const label = element("text", { x: 126, y: 757, "text-anchor": "middle", "font-size": 12, fill: "#28463c" });
    label.textContent = "1 km";
    group.append(label);
    this.svg.append(group);
  }
}
