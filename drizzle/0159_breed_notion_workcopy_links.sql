-- 0159: Non-destructive shadow identity links for the 109 -> 60 Notion breed cutover.
--
-- Does NOT modify breed_notion_sync, managed_breeds, or Notion records.
-- Records the verified old and work-copy page IDs with the ORIGINAL receipt
-- so that a future cutover can be evaluated and rolled back exactly.
-- Records may be staged only after owner-only live D1 + Notion checks.
CREATE TABLE IF NOT EXISTS breed_notion_workcopy_links (
  breed_id INTEGER PRIMARY KEY NOT NULL
    REFERENCES managed_breeds(id) ON DELETE CASCADE,
  original_notion_page_id TEXT NOT NULL UNIQUE,
  work_notion_page_id TEXT NOT NULL UNIQUE,
  original_data_source_id TEXT NOT NULL,
  work_data_source_id TEXT NOT NULL,
  canonical_slug TEXT NOT NULL,
  fci_number INTEGER NOT NULL CHECK (fci_number > 0),
  original_sync_receipt TEXT NOT NULL,
  work_sync_receipt TEXT,
  work_last_synced_at TEXT,
  work_last_error_code TEXT,
  original_sync_last_synced_at TEXT,
  original_notion_last_edited_time TEXT,
  work_notion_last_edited_time TEXT,
  status TEXT NOT NULL DEFAULT 'SHADOW'
    CHECK (status IN ('SHADOW', 'VERIFIED', 'ACTIVE', 'ROLLED_BACK')),
  verified_at TEXT,
  activated_at TEXT,
  rolled_back_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (original_notion_page_id <> work_notion_page_id),
  CHECK (original_data_source_id <> work_data_source_id),
  CHECK (status <> 'ACTIVE' OR activated_at IS NOT NULL),
  CHECK (status <> 'VERIFIED' OR verified_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_breed_notion_workcopy_status
  ON breed_notion_workcopy_links(status, updated_at);
