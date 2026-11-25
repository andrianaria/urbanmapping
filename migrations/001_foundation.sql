CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  synthetic INTEGER NOT NULL CHECK (synthetic = 1),
  description TEXT NOT NULL
) STRICT;

CREATE TABLE cities (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  coordinate_system TEXT NOT NULL,
  source_id INTEGER NOT NULL REFERENCES sources(id)
) STRICT;

CREATE TABLE districts (
  id INTEGER PRIMARY KEY,
  city_id INTEGER NOT NULL REFERENCES cities(id),
  name TEXT NOT NULL,
  geometry TEXT NOT NULL CHECK (json_valid(geometry)),
  UNIQUE (city_id, name)
) STRICT;

CREATE TABLE zones (
  id INTEGER PRIMARY KEY,
  district_id INTEGER NOT NULL REFERENCES districts(id),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  geometry TEXT NOT NULL CHECK (json_valid(geometry)),
  center_x REAL NOT NULL,
  center_y REAL NOT NULL,
  area_km2 REAL NOT NULL CHECK (area_km2 > 0),
  land_use TEXT NOT NULL CHECK (land_use IN ('residential', 'mixed', 'commercial', 'industrial')),
  commercial_index REAL NOT NULL CHECK (commercial_index BETWEEN 0 AND 100),
  source_id INTEGER NOT NULL REFERENCES sources(id)
) STRICT;

CREATE TABLE measurements (
  zone_id INTEGER PRIMARY KEY REFERENCES zones(id) ON DELETE CASCADE,
  population INTEGER NOT NULL CHECK (population >= 0),
  adult_population INTEGER NOT NULL CHECK (adult_population BETWEEN 0 AND population),
  households INTEGER NOT NULL CHECK (households > 0),
  spending_per_capita_idr REAL CHECK (spending_per_capita_idr >= 0),
  purchasing_power_index REAL CHECK (purchasing_power_index BETWEEN 0 AND 100),
  reference_period TEXT NOT NULL,
  source_id INTEGER NOT NULL REFERENCES sources(id)
) STRICT;

CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  spending_share REAL NOT NULL CHECK (spending_share > 0 AND spending_share <= 1),
  description TEXT NOT NULL
) STRICT;

CREATE TABLE competitors (
  id INTEGER PRIMARY KEY,
  zone_id INTEGER NOT NULL REFERENCES zones(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  source_id INTEGER NOT NULL REFERENCES sources(id)
) STRICT;

CREATE TABLE business_locations (
  id INTEGER PRIMARY KEY,
  zone_id INTEGER NOT NULL REFERENCES zones(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  source_id INTEGER NOT NULL REFERENCES sources(id)
) STRICT;

CREATE TABLE candidate_sites (
  id INTEGER PRIMARY KEY,
  zone_id INTEGER NOT NULL REFERENCES zones(id),
  name TEXT NOT NULL UNIQUE,
  x REAL NOT NULL,
  y REAL NOT NULL,
  rent_monthly_idr REAL NOT NULL CHECK (rent_monthly_idr >= 0),
  investment_idr REAL NOT NULL CHECK (investment_idr >= 0),
  floor_area_m2 REAL NOT NULL CHECK (floor_area_m2 > 0),
  source_id INTEGER NOT NULL REFERENCES sources(id)
) STRICT;

CREATE TABLE road_nodes (
  id INTEGER PRIMARY KEY,
  city_id INTEGER NOT NULL REFERENCES cities(id),
  x REAL NOT NULL,
  y REAL NOT NULL,
  UNIQUE (city_id, x, y)
) STRICT;

CREATE TABLE road_edges (
  id INTEGER PRIMARY KEY,
  from_node INTEGER NOT NULL REFERENCES road_nodes(id),
  to_node INTEGER NOT NULL REFERENCES road_nodes(id),
  distance_km REAL NOT NULL CHECK (distance_km > 0),
  speed_kmh REAL NOT NULL CHECK (speed_kmh > 0),
  CHECK (from_node <> to_node),
  UNIQUE (from_node, to_node)
) STRICT;

CREATE TABLE assumptions (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  values_json TEXT NOT NULL CHECK (json_valid(values_json)),
  source_id INTEGER NOT NULL REFERENCES sources(id)
) STRICT;

CREATE TABLE scenarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  assumptions_json TEXT NOT NULL CHECK (json_valid(assumptions_json)),
  created_at TEXT NOT NULL,
  baseline INTEGER NOT NULL DEFAULT 0 CHECK (baseline IN (0, 1)),
  model_version TEXT NOT NULL
) STRICT;

CREATE TABLE analysis_results (
  scenario_id INTEGER PRIMARY KEY REFERENCES scenarios(id) ON DELETE CASCADE,
  results_json TEXT NOT NULL CHECK (json_valid(results_json)),
  dataset_version TEXT NOT NULL,
  model_version TEXT NOT NULL
) STRICT;

CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id INTEGER,
  created_at TEXT NOT NULL,
  details_json TEXT NOT NULL CHECK (json_valid(details_json))
) STRICT;

CREATE INDEX zones_district_idx ON zones(district_id);
CREATE INDEX competitors_category_zone_idx ON competitors(category_id, zone_id);
CREATE INDEX candidates_zone_idx ON candidate_sites(zone_id);
CREATE INDEX road_edges_to_idx ON road_edges(to_node);
CREATE INDEX audit_created_idx ON audit_events(created_at);
CREATE UNIQUE INDEX baseline_scenario_idx ON scenarios(baseline) WHERE baseline = 1;
