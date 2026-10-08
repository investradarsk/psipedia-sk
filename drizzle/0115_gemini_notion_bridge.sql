-- GEMINI-NOTION-BRIDGE-1: origin/linkage only; canonical content stays in directory_profiles.
CREATE TABLE IF NOT EXISTS gemini_automation_concepts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stable_key TEXT NOT NULL,
  discovery_key TEXT NOT NULL,
  canonical_entity_type TEXT NOT NULL CHECK (canonical_entity_type IN ('DIRECTORY','EVENT','HELP_ITEM')),
  canonical_entity_id INTEGER,
  notion_page_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('RESERVED','CREATING','DRAFT_CREATED','NOTION_CREATING','NOTION_LINKED','NOTION_UNCERTAIN')),
  primary_source_url TEXT,
  source_urls_json TEXT NOT NULL DEFAULT '[]',
  discovered_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(stable_key, discovery_key),
  UNIQUE(canonical_entity_type, canonical_entity_id),
  UNIQUE(notion_page_id)
);
CREATE INDEX IF NOT EXISTS idx_gemini_concepts_status ON gemini_automation_concepts(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gemini_concepts_directory ON gemini_automation_concepts(canonical_entity_id) WHERE canonical_entity_type = 'DIRECTORY' AND canonical_entity_id IS NOT NULL;
