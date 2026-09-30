CREATE TABLE IF NOT EXISTS eshop_notion_sync (
  notion_page_id TEXT PRIMARY KEY,
  eshop_id INTEGER NOT NULL UNIQUE,
  content_hash TEXT NOT NULL DEFAULT '',
  notion_last_edited_time TEXT,
  psipedia_updated_at TEXT,
  last_synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (eshop_id) REFERENCES managed_eshops(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS eshop_notion_sync_last_synced_idx
  ON eshop_notion_sync(last_synced_at);

CREATE INDEX IF NOT EXISTS eshop_notion_sync_psipedia_updated_idx
  ON eshop_notion_sync(psipedia_updated_at);
