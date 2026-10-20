-- NOTION-PROFILE-SYNC-01. STAGED proposal, outside canonical migration chain. Do NOT apply in production.
-- Last verified common state, NOT an assertion of per-field edit timestamps.
CREATE TABLE IF NOT EXISTS notion_profile_field_baselines (
  agenda TEXT NOT NULL CHECK (agenda IN (
    'directory', 'events', 'organizations', 'adoptions', 'help-cases', 'lost-found'
  )),
  entity_id INTEGER NOT NULL CHECK (entity_id > 0),
  notion_page_id TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (agenda, entity_id),
  UNIQUE (agenda, notion_page_id)
);
