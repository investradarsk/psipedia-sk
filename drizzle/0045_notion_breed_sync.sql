CREATE TABLE IF NOT EXISTS breed_notion_sync (
  notion_page_id TEXT PRIMARY KEY,
  breed_id INTEGER NOT NULL UNIQUE,
  notion_last_edited_time TEXT,
  content_hash TEXT NOT NULL DEFAULT '',
  last_synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (breed_id) REFERENCES managed_breeds(id) ON DELETE CASCADE
);
