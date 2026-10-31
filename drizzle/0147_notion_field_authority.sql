-- 0147: operator-managed, allowlisted Notion field authority.
-- Apply with the protected production D1 migration workflow before editing settings.
-- No existing mapping, receipt, publication or service values are changed.
CREATE TABLE notion_field_authority (
  scope TEXT NOT NULL,
  field_key TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('safe','notion','admin','latest')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT NOT NULL,
  PRIMARY KEY(scope,field_key)
);
