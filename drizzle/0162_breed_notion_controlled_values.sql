-- 0162: independently versioned structured values for the 60+2 breed work copy.
-- Never overwrite historical expert prose or existing per-field receipts.
-- No data backfill: first verified access seeds only the already-existing
-- controlled Notion properties, without inferring missing content.
CREATE TABLE IF NOT EXISTS breed_notion_controlled_values (
  breed_id INTEGER PRIMARY KEY NOT NULL
    REFERENCES managed_breeds(id) ON DELETE CASCADE,
  values_json TEXT NOT NULL,
  notion_values_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
