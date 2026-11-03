-- 0153: Persist only independently verified common Notion/Admin field snapshots.
-- Do not backfill diverged profiles or infer ownership from record timestamps.
-- New records are written only after a verified writeback or equal-side check.
-- Deployment requires the normal protected D1 migration workflow.
CREATE TABLE IF NOT EXISTS notion_profile_field_baselines (
  agenda TEXT NOT NULL CHECK (agenda IN (
    'directory', 'events', 'organizations', 'adoptions',
    'help-cases', 'lost-found', 'eshops'
  )),
  entity_id INTEGER NOT NULL CHECK (entity_id > 0),
  notion_page_id TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (agenda, entity_id),
  UNIQUE (agenda, notion_page_id)
);
