# Data dictionary

Every value described here belongs to the synthetic Kota Reka fixture. Geographic names, coordinates, people counts, businesses, costs, and spending assumptions are fictional.

## Units and conventions

| Value | Unit or representation |
| --- | --- |
| Map coordinates | Local Cartesian kilometres, origin at southwest |
| Zone geometry | Closed array of `[x, y]` coordinate pairs |
| Area | km² |
| Population | Integer people |
| Households | Integer households |
| Density | People per km² |
| Monthly spending | IDR per person per month |
| Category share | Fraction from 0 to 1 |
| Purchasing power | Synthetic index from 0 to 100 |
| Rent | IDR per month |
| Investment | IDR at opening |
| Radius | Straight-line kilometres |
| Weights | Nonnegative values, normalized by their total |
| Score | Relative index from 0 to 100 |
| Timestamps | UTC ISO 8601 text |

Derived estimates can contain fractions. The UI applies display formatting. Dataset and model version identifiers accompany saved analytical snapshots.

## Tables

| Table | Key and relationships | Main fields |
| --- | --- | --- |
| `sources` | `id` | Generator name, version, `synthetic=1`, description |
| `cities` | `id`, `source_id → sources` | Name, coordinate-system description |
| `districts` | `id`, `city_id → cities` | Unique name within city, polygon geometry |
| `zones` | `id`, `district_id → districts`, `source_id → sources` | Code, name, polygon, centre coordinates, area, land use, commercial index |
| `measurements` | `zone_id → zones` | Population, adults, households, per-capita spending, purchasing power, reference period, source |
| `categories` | `id` | Name, spending-share fraction, description |
| `competitors` | `id`, `zone_id → zones`, `category_id → categories` | Fictional name, coordinates, source |
| `business_locations` | `id`, zone/category/source references | Reference outlet name and coordinates |
| `candidate_sites` | `id`, `zone_id → zones` | Name, coordinates, monthly rent, investment, floor area, source |
| `road_nodes` | `id`, `city_id → cities` | Unique city coordinates |
| `road_edges` | `id`, endpoints → road nodes | Distance in km, speed in km/h |
| `assumptions` | `id`, source reference | Named JSON reference assumptions |
| `scenarios` | `id` | Unique name, assumptions JSON, creation time, baseline flag, model version |
| `analysis_results` | `scenario_id → scenarios` | Full result JSON, dataset and model versions |
| `audit_events` | `id` | Event, record type and ID, UTC time, details JSON |
| `schema_migrations` | `version` | Migration application time |

Foreign keys enforce references. Table checks enforce nonnegative measures and costs, positive area and road distance, adult population within total population, valid land use, JSON validity, and synthetic sources.

## Synthetic dataset inventory

- One city and six districts.
- Eighty 0.8 × 0.8 km zones, each 0.64 km².
- Three spending categories.
- Forty-two competitors and three existing reference outlets.
- Twelve candidate sites.
- Ninety-nine road nodes and 178 edges forming a connected grid.
- One reference assumption set and one seeded baseline scenario.
- Two missing spending measurements and one missing purchasing-power measurement.

The reference period is an illustrative synthetic month. The seed generator is deterministic and is unrelated to live data collection.

## Derived zone indicators

| API field | Calculation |
| --- | --- |
| `densityPerKm2` | Population ÷ area |
| `monthlySpendingIdr` | Population × monthly per-capita spending |
| `categorySpendingIdr` | Monthly spending × selected category share |
| `competitorCount` | Competitors inside the zone in the selected category |
| `spendingPerCompetitorIdr` | Category spending ÷ (competitor count + 1) |
| `spendingComplete` | Whether per-capita spending is available |

The extra denominator unit in spending-per-competitor is an illustrative baseline screen. It does not estimate sales captured by a new business.

## Candidate analysis output

| Field | Meaning |
| --- | --- |
| `zoneIds` | Zones whose centroids fall inside the radius |
| `population` | Population sum across included zones |
| `addressableSpendingIdr` | Selected-category spending sum over included zones with known spending |
| `spendingCoveragePercent` | Included population with known spending ÷ all included population × 100 |
| `missingSpendingZones` | Count of included zones with missing spending |
| `nearbyCompetitors` | Selected-category competitors within the straight-line radius |
| `annualSiteCostIdr` | Investment + 12 × monthly rent |
| `components` | Raw input, unit, normalized score, normalized weight, weighted contribution |
| `score` | Sum of weighted component contributions |
| `rank` | Descending score order, then ascending ID for ties |

A category-spending estimate expresses potential resident spending. It supplies no market-capture assumption and therefore supplies no outlet revenue forecast.

## Missing values

`null` in spending or purchasing power remains explicit. The map uses a missing-data color and the quality page lists the missing indicator. Missing spending stays `null` for zone calculations. Candidate analysis excludes unavailable spending and displays coverage, enabling comparison with complete zones.

Zero represents a known zero input. The UI and API should preserve that distinction.

## Saved assumptions

Assumptions contain a valid `categoryId`, a radius from 0.4 to 4 km, four named weights, and optional rent/investment overrides keyed by candidate ID. At least one weight is positive. Cost overrides affect only the scenario, and saved results retain the exact assumptions that produced them.
