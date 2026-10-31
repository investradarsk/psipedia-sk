-- 0148: aggregated verified transfer receipts (no content, PII or provider payload).
-- Old mapping timestamps have no reliable direction; never backfill invented directions.
CREATE TABLE notion_transfer_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('NOTION_TO_ADMIN','ADMIN_TO_NOTION')),
  record_count INTEGER NOT NULL CHECK (record_count > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notion_transfer_audit_scope_time ON notion_transfer_audit(scope,id DESC);
