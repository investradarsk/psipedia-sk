-- PSIPEDIA NOTION-ARTICLE-WRITEBACK-COMPLETION-01
-- PREPARED SCHEMA ONLY. No production D1 migration or activation is authorized
-- by this commit or by merging its Draft PR. Requires separate owner approval.
-- Must be applied AFTER 0137_media_source_review_decisions.sql, never before.
-- Immutable one-record-per-article recovery journal; canonical articles remain
-- in managed_articles and their Notion mapping remains in article_notion_sync.
-- Do not use IF NOT EXISTS: a partial/manual table must fail migration preflight.
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
