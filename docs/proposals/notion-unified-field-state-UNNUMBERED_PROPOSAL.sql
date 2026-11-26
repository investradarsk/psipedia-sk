-- Proposal only: allocate a migration number after explicit approval.
-- No canonical content changes. One observation state per mapped field.
CREATE TABLE IF NOT EXISTS notion_unified_field_state (
  agenda TEXT NOT NULL CHECK (agenda IN ('directory','breeds','events','organizations','adoptions','lost-found','help-cases','eshops')),
  entity_id TEXT NOT NULL,
  notion_page_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  baseline_version TEXT,
  baseline_json TEXT CHECK (baseline_json IS NULL OR json_valid(baseline_json)),
  notion_json TEXT CHECK (notion_json IS NULL OR json_valid(notion_json)),
  psipedia_json TEXT CHECK (psipedia_json IS NULL OR json_valid(psipedia_json)),
  notion_edit_json TEXT CHECK (notion_edit_json IS NULL OR json_valid(notion_edit_json)),
  psipedia_edit_json TEXT CHECK (psipedia_edit_json IS NULL OR json_valid(psipedia_edit_json)),
  status TEXT NOT NULL CHECK (status IN ('SYNCED','PENDING','REVIEW')),
  reason TEXT,
  updated_at TEXT NOT NULL,
  recovery_after TEXT,
  PRIMARY KEY (agenda, entity_id, notion_page_id, field_key)
);
CREATE INDEX IF NOT EXISTS notion_unified_field_state_work
  ON notion_unified_field_state (status, updated_at, agenda);

-- Per-agenda cursor and lease for bounded initialization. No new cron.
CREATE TABLE IF NOT EXISTS notion_unified_recovery_cursor (
  agenda TEXT PRIMARY KEY,
  entity_id INTEGER NOT NULL DEFAULT 0,
  field_offset INTEGER NOT NULL DEFAULT 0,
  last_run_at TEXT NOT NULL DEFAULT '',
  lease_until TEXT,
  version INTEGER NOT NULL DEFAULT 0
);
-- Invalidated scopes must not fall back to a historical whole-profile hash.
CREATE TABLE IF NOT EXISTS notion_unified_scope_invalidation (
  agenda TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  invalidated_at TEXT NOT NULL,
  PRIMARY KEY (agenda,entity_id)
);

-- An approved manual transfer fences ordinary V2 reservations for its scope.
-- No automatic expiry: an interrupted external write is ambiguous. Diagnose
-- and release only after the owner verifies the exact scope.
CREATE TABLE IF NOT EXISTS notion_unified_manual_fence (
  agenda TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  owner_token TEXT NOT NULL,
  started_at TEXT NOT NULL,
  PRIMARY KEY(agenda,entity_id)
);
CREATE INDEX IF NOT EXISTS notion_unified_field_recovery_due
  ON notion_unified_field_state(status,recovery_after,updated_at)
  WHERE status IN ('PENDING','REVIEW');
