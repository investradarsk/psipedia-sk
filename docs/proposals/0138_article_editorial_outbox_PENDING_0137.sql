-- STAGED ONLY (NOT in drizzle). Requires the owner of 0137 (#908) to merge first.
-- DO NOT APPLY. No production D1 mutation is approved by this Draft PR.
-- Move this unchanged into drizzle/0138_article_editorial_outbox.sql only after
-- migration 0137 is finalized, migration-safety passes and deployment is gated.
-- The canonical editorial article and Notion mapping already exist; this table
-- records immutable preimage/target operations, never a second article record.
CREATE TABLE article_notion_editorial_outbox (
  notion_page_id TEXT PRIMARY KEY,
  article_id INTEGER NOT NULL UNIQUE,
  article_updated_at TEXT NOT NULL,
  base_content_hash TEXT NOT NULL,
  operations_json TEXT NOT NULL,
  lease_owner TEXT,
  lease_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((lease_owner IS NULL AND lease_until IS NULL)
      OR (lease_owner IS NOT NULL AND lease_until IS NOT NULL)),
  FOREIGN KEY (notion_page_id) REFERENCES article_notion_sync(notion_page_id) ON DELETE CASCADE,
  FOREIGN KEY (article_id) REFERENCES managed_articles(id) ON DELETE CASCADE
);
CREATE INDEX article_notion_editorial_outbox_updated_idx
  ON article_notion_editorial_outbox(updated_at);
CREATE INDEX article_notion_editorial_outbox_lease_idx
  ON article_notion_editorial_outbox(lease_until);
