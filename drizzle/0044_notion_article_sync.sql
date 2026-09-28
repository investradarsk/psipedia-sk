CREATE TABLE IF NOT EXISTS article_notion_sync (
  notion_page_id TEXT PRIMARY KEY,
  article_id INTEGER NOT NULL UNIQUE,
  notion_last_edited_time TEXT,
  content_hash TEXT NOT NULL DEFAULT '',
  last_synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (article_id) REFERENCES managed_articles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS article_notion_sync_last_synced_idx
  ON article_notion_sync(last_synced_at);
