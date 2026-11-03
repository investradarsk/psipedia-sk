-- 0156: owner-dispatched durable one-shot Notion ↔ Admin transfer journal.
-- Only the protected owner-dispatched D1 workflow may apply this; PR merge never applies it.
-- The payload stores identity references, field keys and reason codes, NOT field values.
CREATE TABLE notion_manual_transfer_runs (
  id TEXT PRIMARY KEY NOT NULL,
  area TEXT NOT NULL CHECK (area IN ('breeds','directory','events','help','eshops')),
  scope TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('NOTION_TO_ADMIN','ADMIN_TO_NOTION')),
  selection TEXT NOT NULL CHECK (selection IN ('ONE','ALL')),
  requested_profile_id INTEGER CHECK (requested_profile_id IS NULL OR requested_profile_id > 0),
  status TEXT NOT NULL DEFAULT 'PREVIEW'
    CHECK (status IN ('PREVIEW','PREVIEW_READY','QUEUED','RUNNING','COMPLETED','PARTIAL','FAILED','CANCELLED')),
  requested_by TEXT NOT NULL,
  total_profiles INTEGER NOT NULL DEFAULT 0 CHECK (total_profiles >= 0),
  processed_profiles INTEGER NOT NULL DEFAULT 0 CHECK (processed_profiles >= 0),
  changed_fields INTEGER NOT NULL DEFAULT 0 CHECK (changed_fields >= 0),
  failed_fields INTEGER NOT NULL DEFAULT 0 CHECK (failed_fields >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at TEXT,
  CHECK ((selection='ONE' AND requested_profile_id IS NOT NULL)
    OR (selection='ALL' AND requested_profile_id IS NULL))
);
CREATE INDEX idx_notion_manual_transfer_runs_created
  ON notion_manual_transfer_runs(created_at DESC);
CREATE INDEX idx_notion_manual_transfer_runs_status
  ON notion_manual_transfer_runs(status,updated_at);

CREATE TABLE notion_manual_transfer_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES notion_manual_transfer_runs(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  profile_id INTEGER NOT NULL CHECK (profile_id > 0),
  notion_page_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PREVIEWING','PREVIEWED','RUNNING','DONE','PARTIAL','FAILED','SKIPPED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  changed_fields INTEGER NOT NULL DEFAULT 0 CHECK (changed_fields >= 0),
  failed_fields INTEGER NOT NULL DEFAULT 0 CHECK (failed_fields >= 0),
  last_error_code TEXT,
  preview_hash TEXT,
  previewed_at TEXT,
  next_attempt_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(run_id,scope,profile_id)
);
CREATE INDEX idx_notion_manual_transfer_items_run
  ON notion_manual_transfer_items(run_id,status,next_attempt_at,id);

CREATE TABLE notion_manual_transfer_field_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES notion_manual_transfer_items(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('CHANGE','SAME','UPDATED','SKIPPED','FAILED')),
  reason_code TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(item_id,field_key)
);
CREATE INDEX idx_notion_manual_transfer_field_results_item
  ON notion_manual_transfer_field_results(item_id,status,id);
