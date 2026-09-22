CREATE TABLE geo_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL CHECK (target_type IN ('DIRECTORY_PROFILE', 'ORGANIZATION_LOCATION', 'MANAGED_EVENT')),
  directory_profile_id INTEGER REFERENCES directory_profiles(id) ON DELETE CASCADE,
  organization_location_id INTEGER REFERENCES organization_locations(id) ON DELETE CASCADE,
  managed_event_id INTEGER REFERENCES managed_events(id) ON DELETE CASCADE,

  public_visibility TEXT CHECK (public_visibility IS NULL OR public_visibility IN ('EXACT_PUBLIC', 'APPROXIMATE_PUBLIC', 'HIDDEN')),
  public_precision TEXT CHECK (public_precision IS NULL OR public_precision IN ('EXACT', 'NEIGHBORHOOD', 'MUNICIPALITY', 'SERVICE_AREA', 'APPROXIMATE')),

  latitude REAL,
  longitude REAL,

  resolution_method TEXT CHECK (resolution_method IS NULL OR resolution_method IN ('GEOCODER', 'LOCALITY', 'MANUAL', 'SOURCE_COORDINATES')),
  provider TEXT,
  provenance TEXT,
  source_license TEXT,

  normalized_query TEXT,
  query_fingerprint TEXT,

  source_fingerprint TEXT NOT NULL,
  resolved_source_fingerprint TEXT,

  geocode_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (geocode_status IN ('PENDING', 'RESOLVED', 'NEEDS_REVIEW', 'FAILED', 'STALE', 'SKIPPED')),

  last_error_code TEXT,
  last_error_at TEXT,
  retry_after_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),

  manual_override INTEGER NOT NULL DEFAULT 0 CHECK (manual_override IN (0, 1)),
  manual_updated_at TEXT,
  manual_updated_by TEXT,

  last_geocoded_at TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  CHECK (
    (target_type = 'DIRECTORY_PROFILE' AND directory_profile_id IS NOT NULL AND organization_location_id IS NULL AND managed_event_id IS NULL)
    OR
    (target_type = 'ORGANIZATION_LOCATION' AND directory_profile_id IS NULL AND organization_location_id IS NOT NULL AND managed_event_id IS NULL)
    OR
    (target_type = 'MANAGED_EVENT' AND directory_profile_id IS NULL AND organization_location_id IS NULL AND managed_event_id IS NOT NULL)
  ),
  CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL)),
  CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  CHECK (public_visibility IS NOT NULL OR (latitude IS NULL AND longitude IS NULL)),
  CHECK (public_visibility <> 'HIDDEN' OR (latitude IS NULL AND longitude IS NULL)),
  CHECK (
    geocode_status <> 'RESOLVED'
    OR (
      public_visibility IN ('EXACT_PUBLIC', 'APPROXIMATE_PUBLIC')
      AND public_precision IS NOT NULL
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
    )
  ),
  CHECK (
    manual_override = 0
    OR (
      resolution_method IS NOT NULL
      AND resolution_method = 'MANUAL'
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX geo_points_directory_unique
  ON geo_points(directory_profile_id)
  WHERE directory_profile_id IS NOT NULL;

CREATE UNIQUE INDEX geo_points_organization_location_unique
  ON geo_points(organization_location_id)
  WHERE organization_location_id IS NOT NULL;

CREATE UNIQUE INDEX geo_points_event_unique
  ON geo_points(managed_event_id)
  WHERE managed_event_id IS NOT NULL;

CREATE INDEX geo_points_status_updated_idx
  ON geo_points(geocode_status, updated_at);

CREATE INDEX geo_points_public_spatial_idx
  ON geo_points(public_visibility, geocode_status, latitude, longitude);

CREATE INDEX geo_points_provider_query_idx
  ON geo_points(provider, query_fingerprint, geocode_status);
