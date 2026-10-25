-- Last successfully acknowledged Notion / Psipedia field values.
-- No backfill, triggers, or external writes. The existing sync runners seed
-- rows only after a verified provider echo or identical current snapshots.
-- Apply once to production D1 before relying on simultaneous field edits.
CREATE TABLE IF NOT EXISTS notion_profile_field_baselines (
  agenda TEXT NOT NULL CHECK (agenda IN (
    'directory', 'events', 'organizations', 'adoptions', 'help-cases',
    'lost-found', 'eshops'
  )),
  entity_id INTEGER NOT NULL CHECK (entity_id > 0),
  notion_page_id TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (agenda, entity_id),
  UNIQUE (agenda, notion_page_id)
);
