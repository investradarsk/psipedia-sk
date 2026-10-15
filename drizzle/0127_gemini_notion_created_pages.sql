-- GEMINI-NOTION-CREATED-PAGES-1. Additive provenance only; no activation/backfill.
-- The signed callback is the sole writer of provenance. Notion text is not trusted.
CREATE TABLE gemini_notion_created_pages (
  notion_page_id TEXT PRIMARY KEY NOT NULL
    CHECK (length(notion_page_id) = 36),
  job_id INTEGER NOT NULL REFERENCES gemini_manual_background_jobs(id),
  stable_key TEXT NOT NULL,
  notion_data_source_id TEXT NOT NULL,
  import_agenda TEXT NOT NULL CHECK (import_agenda IN
    ('directory','events','organizations','adoptions','help-cases','lost-found')),
  canonical_entity_id INTEGER,
  registered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  imported_at TEXT,
  CHECK ((canonical_entity_id IS NULL AND imported_at IS NULL)
      OR (canonical_entity_id > 0 AND imported_at IS NOT NULL)),
  UNIQUE (import_agenda, canonical_entity_id)
);
CREATE INDEX idx_gemini_notion_created_pages_job
  ON gemini_notion_created_pages(job_id, stable_key);
CREATE INDEX idx_gemini_notion_created_pages_pending
  ON gemini_notion_created_pages(import_agenda, stable_key, registered_at)
  WHERE imported_at IS NULL;
