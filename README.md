# UrbanMapping

UrbanMapping is a local location-intelligence workbase for exploring a fictional city, comparing candidate sites, and saving transparent baseline analyses.

Every geographic, demographic, competitor, and spending record in Kota Reka is synthetic. Amounts express illustrative monthly spending potential. They must be interpreted as assumptions for model development and should never be presented as census observations, observed consumer behavior, or business revenue forecasts.

## Run

Use Node.js 22.13 or newer. The application uses the built-in HTTP server and `node:sqlite`. There are no packages to install.

```sh
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The server creates and seeds `.data/urbanmapping.sqlite` on first startup.

Use a different port or database path when needed.

```sh
PORT=3010 URBANMAPPING_DB=.data/alternative.sqlite npm start
```

Node 22 can print an experimental SQLite warning. HTTP traffic and assets remain on the local machine. Development and automated checks work without internet access.

## Explore

- **City explorer** renders 80 zone polygons, six district boundaries, category-specific competitors, and twelve candidate sites in SVG. Switch density, purchasing power, and spending layers. Click a zone for measurements. Pan, zoom, and toggle roads or markers.
- **Market data** shows population, density, per-capita spending, category spending, competitor count, and missing-data coverage. Search zone names or filter a district.
- **Candidate sites** ranks the twelve candidates using an editable radius, four weights, and individual rent and investment assumptions. Inspect nearby competitors and compare up to three candidates.
- **Scenarios** saves assumptions with their complete candidate results and model/dataset versions. Save another analysis, then compare it with the seeded reference baseline.
- **Data quality** reports demographic, polygon, relational, source, and road-connectivity findings alongside local audit events.

## Baseline calculation

All map coordinates use a local Cartesian grid in kilometres. A site's neighborhood includes a whole zone when its centroid is within the selected straight-line radius. Road edges are rendered and validated, while accessibility algorithms remain on the roadmap.

Population density equals population divided by zone area in km². Category spending potential equals population × monthly per-capita spending × category share. Missing spending values remain missing in the market table and are excluded from candidate spending sums. Each candidate exposes the population coverage represented by known spending.

The score normalizes population, category spending, competitive space, and first-year site cost to 0–100 across the twelve candidates. Population and spending score higher as their values increase. Competition and cost score higher as values decrease. First-year site cost equals initial investment + 12 × monthly rent. Weights are normalized by their sum. Equal inputs receive 50, and ties are ordered by candidate ID.

The score supports transparent screening of these synthetic assumptions. Sales capture, profitability, travel-time catchments, cannibalization, and portfolio optimization are future work.

## Verification

```sh
npm test
npm run check
```

Tests cover independently calculated density and spending, missing values, normalized scores, weight and override validation, deterministic ranking, scenario rollback, SQLite restart and simultaneous connections, live HTTP errors, static assets, and saved comparisons. Each test uses an in-memory or temporary database.

The check command validates JavaScript syntax, fixture counts, foreign keys, SQLite integrity, and reproduction of the saved baseline.

For a manual pass, select a map zone, change category, inspect candidate score components, change one site's rent, recalculate, save a named scenario, compare it with the baseline, restart the server, and confirm that the saved scenario is still present.

## API

Responses are JSON. Requests that contain JSON use `Content-Type: application/json`. Error responses have `error.code`, `error.message`, and `error.details`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Local health and synthetic status |
| GET | `/api/dataset` | Complete seeded relational dataset |
| GET | `/api/districts` | Six districts and polygon geometry |
| GET | `/api/zones?categoryId=1` | Zone measurements and derived indicators |
| GET | `/api/competitors` | Synthetic competitors |
| GET | `/api/candidates` | Candidate base assumptions |
| GET | `/api/assumptions` | Seeded reference assumptions |
| POST | `/api/analysis` | Deterministic candidate ranking |
| GET | `/api/scenarios` | Saved snapshot summaries |
| GET | `/api/scenarios/:id` | Saved assumptions and full result |
| POST | `/api/scenarios` | Save `{name, assumptions}` atomically |
| POST | `/api/scenarios/compare` | Compare `{ids: [firstId, secondId]}` |
| GET | `/api/quality` | Validation, sources, coverage, audit events |

## Repository

- `src/data.js` generates the deterministic synthetic dataset.
- `src/domain.js` contains calculations and validation.
- `src/repository.js` owns SQLite access and snapshot persistence.
- `src/server.js` handles native HTTP APIs and local assets.
- `public/` contains original HTML, CSS, JavaScript, and SVG.
- `migrations/` contains the initial relational schema.
- `tests/` contains automated checks.
- [ARCHITECTURE.md](ARCHITECTURE.md) explains data flow and boundaries.
- [DATA_DICTIONARY.md](DATA_DICTIONARY.md) defines fields, units, and missing values.
- [ROADMAP.md](ROADMAP.md) lists implemented work and future engineering objectives.

Generated SQLite databases, journals, caches, logs, dependencies, and archives are excluded by `.gitignore`. Share source and the seed generator so the recipient can create a fresh synthetic workspace.

Licensed under [MIT](LICENSE).
