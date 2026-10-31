-- Gemini editorial field issues belong to the owner, not the publication gate.
-- One canonical draft and one read-only review note per immutable origin.
CREATE TABLE IF NOT EXISTS gemini_import_review_notes (
  import_agenda TEXT NOT NULL CHECK(import_agenda IN ('directory','events','organizations','adoptions','help-cases','lost-found')),
  canonical_entity_id INTEGER NOT NULL CHECK(canonical_entity_id > 0),
  notion_page_id TEXT NOT NULL,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(import_agenda,canonical_entity_id),
  UNIQUE(notion_page_id)
);
