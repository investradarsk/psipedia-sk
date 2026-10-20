-- NOTION-ARTICLE-SYNC-01: a small, durable retry journal, not an alternative article model.
-- Pending operations preserve original and desired remote values. A retry is
-- allowed only when each remote field matches one of those two snapshots.
CREATE TABLE IF NOT EXISTS article_notion_editorial_outbox (
  notion_page_id TEXT PRIMARY KEY,
  article_id INTEGER NOT NULL UNIQUE,
  article_updated_at TEXT NOT NULL,
  base_content_hash TEXT NOT NULL,
  operations_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (notion_page_id) REFERENCES article_notion_sync(notion_page_id) ON DELETE CASCADE,
  FOREIGN KEY (article_id) REFERENCES managed_articles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS article_notion_editorial_outbox_updated_idx
  ON article_notion_editorial_outbox(updated_at);
