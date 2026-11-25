-- Proposal only: allocate a migration number after explicit approval.
-- No canonical content changes. One observation state per mapped field.
CREATE TABLE IF NOT EXISTS notion_unified_field_state (
  agenda TEXT NOT NULL CHECK (agenda IN ('directory','breeds','events','organizations','adoptions','lost-found','help-cases','eshops')),
  entity_id TEXT NOT NULL,
  notion_page_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  baseline_json TEXT CHECK (baseline_json IS NULL OR json_valid(baseline_json)),
  notion_json TEXT CHECK (notion_json IS NULL OR json_valid(notion_json)),
  psipedia_json TEXT CHECK (psipedia_json IS NULL OR json_valid(psipedia_json)),
  notion_edit_json TEXT CHECK (notion_edit_json IS NULL OR json_valid(notion_edit_json)),
  psipedia_edit_json TEXT CHECK (psipedia_edit_json IS NULL OR json_valid(psipedia_edit_json)),
  status TEXT NOT NULL CHECK (status IN ('SYNCED','PENDING','REVIEW')),
  reason TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (agenda, entity_id, notion_page_id, field_key)
);
CREATE INDEX IF NOT EXISTS notion_unified_field_state_work
  ON notion_unified_field_state (status, updated_at, agenda);
