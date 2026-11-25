# Roadmap

## Available workbase

The initial application provides a local SVG city map, zone and market tables, category layers, candidate cost adjustments, explainable weighted baseline rankings, saved analysis snapshots, baseline comparison, and data-quality reporting.

SQLite persists the relational synthetic dataset, assumptions, scenarios, results, and audit events. APIs, deterministic domain tests, file persistence tests, and local HTTP checks support continued engineering.

Kota Reka contains six districts, eighty zones, forty-two competitors, twelve candidates, and a connected road graph. Every indicator is synthetic.

## Future engineering objectives

These capabilities remain substantial unfinished work.

### A. Road-network catchment modeling

Connect candidate and business points to road nodes. Implement weighted shortest paths, travel-distance or travel-time budgets, service-area generation, and tests for disconnected or directed links. Replace or compare the current whole-zone centroid radius with network accessibility.

### B. Spatial demand allocation

Design category preferences, distance decay, reachable demand, and competition-adjusted capture. Explicitly identify assumptions, avoid treating spending as revenue, and verify demand conservation across consumers and destinations.

### C. Market cannibalization

Calculate overlapping catchments and demand redistribution when another site opens. Compare incremental network demand with relocated demand and explain overlap attribution.

### D. Portfolio site optimization

Select combinations under investment limits, minimum separation, market capacity, and competing objectives. Establish a small exhaustive reference solver for validation before implementing scalable search. Portfolio profitability also requires a separate unit-economics model.

### E. Scenario and uncertainty engine

Add input distributions, sensitivity analysis, economic scenarios, seeded Monte Carlo execution, confidence ranges, and run reproducibility. Define versioned assumptions and compatible comparison rules across model changes.

### F. Advanced geospatial data pipeline

Build validated CSV/GeoJSON import, coordinate-system handling, robust geometry topology checks, spatial indexing, lineage, and reconciliation between overlapping data sources. Preserve clear provenance and explicit missing data.

### G. Explainable recommendations

Extend current component explanations to model assumptions, data-quality warnings, rank sensitivity, and auditable recommendation narratives. Explain what evidence supports a conclusion and what is uncertain.

## Cross-cutting work

- Introduce schema upgrades beyond the initial migration, with dataset compatibility and replay checks.
- Add asynchronous analysis jobs and reproducible result comparison when calculations become long-running.
- Improve map keyboard navigation and accessible geographic exploration.
- Define authentication, authorization, backups, and multi-user concurrency before deployment beyond a local workspace.
- Add performance profiling for larger polygons, candidate pools, and road graphs.

Road rendering, connected-graph validation, and radius screening are current foundations for these objectives. Full network allocation, uncertainty, portfolio optimization, and forecast engines require the work above.
