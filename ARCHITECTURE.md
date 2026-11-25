# Architecture

## Runtime

UrbanMapping runs as one Node.js process on a loopback HTTP interface. Node.js 22.13+ supplies HTTP, filesystem, SQLite, and testing APIs. Browser assets use native modules and SVG. No external service or package participates in runtime execution.

The default database is `.data/urbanmapping.sqlite`. `URBANMAPPING_DB` selects another path. `PORT` chooses the local listening port.

## Module boundaries

| Module | Responsibility |
| --- | --- |
| `src/data.js` | Pure deterministic fixture generation, reference assumptions, dataset/model identifiers |
| `src/domain.js` | Density, spending, distances, normalization, candidate analysis, record and input validation |
| `src/repository.js` | SQLite lifecycle, migration tracking, seed transaction, reads, saved snapshots, audit records |
| `src/server.js` | Request parsing, status codes, bounded JSON bodies, APIs, asset allowlist, response headers |
| `public/app.js` | Interface state, forms, category and scenario interactions, tables |
| `public/map.js` | SVG layers, map viewport, selections, legends, marker interaction |
| `public/style.css` | Responsive local presentation |

Domain calculations receive ordinary JavaScript objects. They can be tested without HTTP or persistent files. The server translates domain input errors to predictable JSON responses.

## Relational storage

`migrations/001_foundation.sql` creates strict tables with foreign keys, checks, and indexes. `schema_migrations` records applied versions. Initialization and seeding run inside synchronous `BEGIN IMMEDIATE` transactions.

The dataset links cities → districts → zones → demographic measurements. Sources identify the synthetic origin. Categories relate to competitor and existing-location records. Candidates refer to their containing zones. Road edges refer to road nodes. Scenarios own immutable analysis-result snapshots.

WAL mode supports separate readers against the local file. A five-second busy timeout handles short lock contention. Scenario saves validate assumptions, insert the scenario and result, and write an audit event in one transaction. A failure rolls back every insert.

The seed checks for the city before generating records, so reopening a workspace preserves saved scenarios. New generator versions require an intentional migration strategy rather than replacing an existing database silently.

## Analysis data flow

1. The browser loads the seeded dataset and reference assumptions.
2. Selected category and radius determine category-specific competitors and zone-centroid neighborhoods.
3. The domain calculates resident population, known category spending, spending coverage, nearby rivals, and first-year site cost.
4. Min/max normalization derives score components across the current candidate set.
5. Normalized weights combine the components into a relative suitability score.
6. The UI shows component inputs, units, contributions, and rankings.
7. Saving stores the exact assumptions and calculated result with dataset/model versions.
8. Comparison reads the saved snapshots and checks that versions match.

Changing a candidate cost in the workbench changes analysis assumptions. The base seeded candidate remains available for later scenarios.

## Geographic and analytical limits

The coordinate system is a fictional kilometre grid. Whole-zone centroid inclusion is a deliberate baseline approximation. Rendering the road graph does not make the score road-aware.

Missing spending produces explicit incomplete coverage. The baseline sums known spending without imputing missing values. Its output is a screening indicator, with no calibrated capture rate, revenue prediction, or profitability forecast.

Current validation checks finite polygon pairs, closed rings, stored polygon area, demographic ranges, source references, category values, site costs, and undirected road connectivity. Advanced topology validation, import reconciliation, coordinate transformation, and spatial indexing remain future work.

## Request handling

The HTTP server serves only an explicit asset list. APIs use prepared SQL for values. JSON bodies have a 64 KiB limit. Unsupported methods, invalid data, missing records, duplicate scenario names, and incompatible scenario versions produce client errors. Responses disable API caching and include local-only resource policy headers.

The initial local workspace has no account system. It is designed to bind to `127.0.0.1`. Multi-user authorization, deployment, and synchronization require separate design.

## Verification strategy

Domain tests check independent expected values and equal/invalid boundaries. Persistence tests open two connections, reopen files, inspect integrity, and exercise rollbacks. HTTP tests bind to an operating-system-assigned local port and exercise the actual routes and JSON bodies. They use temporary or in-memory SQLite databases.
