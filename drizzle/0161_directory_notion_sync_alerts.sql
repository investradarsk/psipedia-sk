-- Admin operations: central, bounded Notion synchronization warnings.
-- D1 and public profile saves must remain operational if the optional
-- notification table is not yet deployed.
CREATE TABLE IF NOT EXISTS directory_notion_sync_alerts (
  profile_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending','resolved')),
  direction TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES directory_profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_directory_notion_sync_alerts_status
  ON directory_notion_sync_alerts(status, updated_at DESC);
