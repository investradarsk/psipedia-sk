ALTER TABLE event_notion_sync ADD COLUMN psipedia_updated_at TEXT;

CREATE INDEX IF NOT EXISTS event_notion_sync_psipedia_updated_idx
  ON event_notion_sync(psipedia_updated_at);

CREATE TABLE IF NOT EXISTS notion_agenda_sync (
  agenda TEXT NOT NULL,
  notion_page_id TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  content_hash TEXT NOT NULL DEFAULT '',
  notion_last_edited_time TEXT,
  psipedia_updated_at TEXT,
  last_synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (agenda, notion_page_id),
  UNIQUE (agenda, entity_id)
);

CREATE INDEX IF NOT EXISTS notion_agenda_sync_last_synced_idx
  ON notion_agenda_sync(agenda, last_synced_at);

CREATE INDEX IF NOT EXISTS notion_agenda_sync_psipedia_updated_idx
  ON notion_agenda_sync(agenda, psipedia_updated_at);

CREATE TABLE IF NOT EXISTS notion_agenda_targets (
  agenda TEXT PRIMARY KEY,
  database_id TEXT,
  data_source_id TEXT NOT NULL UNIQUE,
  target_title TEXT NOT NULL,
  title_property TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
