-- ADDRESS-DATA-1A: dedicated address-reference D1 schema.
-- This schema is intentionally separate from ./drizzle and the main application DB.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS address_dataset_releases (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  dataset TEXT NOT NULL,
  catalog_url TEXT NOT NULL,
  source_modified_max TEXT NOT NULL,
  downloaded_at TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  importer_version TEXT NOT NULL,
  license TEXT NOT NULL,
  integrity_status TEXT NOT NULL CHECK (integrity_status IN ('PENDING','PASS','FAILED','QUARANTINED')),
  status TEXT NOT NULL CHECK (status IN ('CANDIDATE','ACTIVE','PREVIOUS_GOOD','HISTORICAL','FAILED','QUARANTINED')),
  municipality_count INTEGER NOT NULL DEFAULT 0 CHECK (municipality_count >= 0),
  street_count INTEGER NOT NULL DEFAULT 0 CHECK (street_count >= 0),
  address_count INTEGER NOT NULL DEFAULT 0 CHECK (address_count >= 0),
  provenance_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  activated_at TEXT,
  failure_reason TEXT
);

CREATE TABLE IF NOT EXISTS address_release_regions (
  release_id TEXT NOT NULL,
  nuts3_id TEXT NOT NULL,
  metadata_url TEXT NOT NULL,
  download_url TEXT NOT NULL,
  source_modified_at TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  source_bytes INTEGER NOT NULL CHECK (source_bytes >= 0),
  address_count INTEGER NOT NULL CHECK (address_count >= 0),
  PRIMARY KEY (release_id, nuts3_id),
  FOREIGN KEY (release_id) REFERENCES address_dataset_releases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS address_municipalities (
  release_id TEXT NOT NULL,
  lau2_id TEXT NOT NULL,
  name TEXT NOT NULL,
  lau1_id TEXT NOT NULL,
  lau1_name TEXT NOT NULL,
  nuts3_id TEXT NOT NULL,
  nuts3_name TEXT NOT NULL,
  normalized_search_name TEXT NOT NULL,
  match_method TEXT NOT NULL CHECK (match_method IN ('EXACT_DETERMINISTIC','EXPLICIT_REVIEWED_OVERRIDE')),
  PRIMARY KEY (release_id, lau2_id),
  FOREIGN KEY (release_id) REFERENCES address_dataset_releases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS address_municipality_parts (
  release_id TEXT NOT NULL,
  municipality_part_id TEXT NOT NULL,
  lau2_id TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (release_id, municipality_part_id),
  FOREIGN KEY (release_id, lau2_id) REFERENCES address_municipalities(release_id, lau2_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS address_streets (
  release_id TEXT NOT NULL,
  street_id TEXT NOT NULL,
  lau2_id TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_search_name TEXT NOT NULL,
  PRIMARY KEY (release_id, street_id),
  FOREIGN KEY (release_id, lau2_id) REFERENCES address_municipalities(release_id, lau2_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS address_points (
  release_id TEXT NOT NULL,
  source_address_id TEXT NOT NULL,
  source_address_uri TEXT NOT NULL,
  lau2_id TEXT NOT NULL,
  municipality_part_id TEXT,
  street_id TEXT,
  property_registration_number TEXT NOT NULL,
  orientation_number TEXT,
  postal_code TEXT NOT NULL,
  longitude REAL NOT NULL,
  latitude REAL NOT NULL,
  source_crs TEXT NOT NULL,
  valid_from TEXT NOT NULL,
  address_format TEXT NOT NULL CHECK (address_format IN ('STREET','MUNICIPALITY_NUMBER')),
  PRIMARY KEY (release_id, source_address_id),
  FOREIGN KEY (release_id, lau2_id) REFERENCES address_municipalities(release_id, lau2_id) ON DELETE CASCADE,
  FOREIGN KEY (release_id, municipality_part_id) REFERENCES address_municipality_parts(release_id, municipality_part_id),
  FOREIGN KEY (release_id, street_id) REFERENCES address_streets(release_id, street_id)
);

CREATE TABLE IF NOT EXISTS address_reference_runtime (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  active_release_id TEXT,
  previous_good_release_id TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (active_release_id) REFERENCES address_dataset_releases(id),
  FOREIGN KEY (previous_good_release_id) REFERENCES address_dataset_releases(id)
);

INSERT OR IGNORE INTO address_reference_runtime(singleton_id, active_release_id, previous_good_release_id, updated_at)
VALUES (1, NULL, NULL, '1970-01-01T00:00:00.000Z');

CREATE TABLE IF NOT EXISTS address_source_lifecycle (
  source_address_id TEXT PRIMARY KEY,
  current_state TEXT NOT NULL CHECK (current_state IN ('ACTIVE','RETIRED')),
  first_seen_release_id TEXT NOT NULL,
  last_seen_release_id TEXT NOT NULL,
  retired_at TEXT
);

CREATE TABLE IF NOT EXISTS address_street_lifecycle (
  street_id TEXT PRIMARY KEY,
  current_state TEXT NOT NULL CHECK (current_state IN ('ACTIVE','RETIRED')),
  first_seen_release_id TEXT NOT NULL,
  last_seen_release_id TEXT NOT NULL,
  retired_at TEXT
);

CREATE INDEX IF NOT EXISTS address_municipalities_release_search_idx
  ON address_municipalities(release_id, normalized_search_name, lau2_id);
CREATE INDEX IF NOT EXISTS address_municipalities_release_lau1_idx
  ON address_municipalities(release_id, lau1_id, name);
CREATE INDEX IF NOT EXISTS address_streets_release_lau2_search_idx
  ON address_streets(release_id, lau2_id, normalized_search_name, street_id);
CREATE INDEX IF NOT EXISTS address_points_release_lau2_house_idx
  ON address_points(release_id, lau2_id, property_registration_number, orientation_number);
CREATE INDEX IF NOT EXISTS address_points_release_street_house_idx
  ON address_points(release_id, street_id, property_registration_number, orientation_number);
CREATE INDEX IF NOT EXISTS address_points_release_postal_idx
  ON address_points(release_id, postal_code);
CREATE INDEX IF NOT EXISTS address_points_release_coordinates_idx
  ON address_points(release_id, longitude, latitude);

CREATE TRIGGER IF NOT EXISTS address_reference_activation_requires_pass
BEFORE UPDATE OF active_release_id ON address_reference_runtime
WHEN NEW.active_release_id IS NOT NULL
  AND COALESCE((SELECT integrity_status FROM address_dataset_releases WHERE id = NEW.active_release_id), '') <> 'PASS'
BEGIN
  SELECT RAISE(ABORT, 'candidate release integrity must be PASS before activation');
END;

CREATE TRIGGER IF NOT EXISTS address_reference_activation_statuses
AFTER UPDATE OF active_release_id ON address_reference_runtime
BEGIN
  UPDATE address_dataset_releases
     SET status = 'HISTORICAL'
   WHERE id = OLD.previous_good_release_id
     AND id IS NOT NULL
     AND id <> NEW.active_release_id
     AND id <> NEW.previous_good_release_id;
  UPDATE address_dataset_releases
     SET status = 'PREVIOUS_GOOD'
   WHERE id = NEW.previous_good_release_id
     AND id IS NOT NULL
     AND id <> NEW.active_release_id;
  UPDATE address_dataset_releases
     SET status = 'ACTIVE',
         activated_at = COALESCE(activated_at, NEW.updated_at)
   WHERE id = NEW.active_release_id
     AND id IS NOT NULL;
END;
