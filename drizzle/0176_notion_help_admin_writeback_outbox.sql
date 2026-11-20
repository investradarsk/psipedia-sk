-- 0176: Durable per-field Admin -> Notion writeback for four Help SQL agendas.
-- Additive only. No old JSON imports, no canonical table rebuild, no Notion page changes.
-- Apply once through an owner-controlled Cloudflare D1 migration after this PR is merged.
CREATE TABLE IF NOT EXISTS notion_help_admin_writeback_outbox (
  agenda TEXT NOT NULL CHECK (agenda IN ('organizations','adoptions','help-cases','lost-found')),
  entity_id INTEGER NOT NULL CHECK (entity_id > 0),
  notion_page_id TEXT NOT NULL,
  fields_json TEXT NOT NULL CHECK (json_valid(fields_json)),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','REVIEW')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  error_code TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (agenda,entity_id)
);
CREATE INDEX IF NOT EXISTS notion_help_admin_writeback_due
  ON notion_help_admin_writeback_outbox(status,next_attempt_at,updated_at);
