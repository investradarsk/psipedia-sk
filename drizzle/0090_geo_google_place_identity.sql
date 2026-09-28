-- GOOGLE-PLACE-1A — durable Google Maps place identity bound to current GEO source.
-- Canonical address, Geoapify coordinates and the GEO lifecycle remain authoritative.

ALTER TABLE geo_points ADD COLUMN google_place_id TEXT;
ALTER TABLE geo_points ADD COLUMN google_place_source_fingerprint TEXT;
ALTER TABLE geo_points ADD COLUMN google_place_matched_at TEXT;
