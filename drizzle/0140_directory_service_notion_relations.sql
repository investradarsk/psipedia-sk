-- Services V3 Notion relation: durable shared baseline, separate from editorial text.
-- Empty relation has meaning only after this handshake is established.
CREATE TABLE IF NOT EXISTS directory_service_notion_relation_sync (
  directory_profile_id INTEGER PRIMARY KEY REFERENCES directory_profiles(id) ON DELETE CASCADE,
  notion_page_id TEXT NOT NULL UNIQUE,
  confirmed_ids_json TEXT NOT NULL DEFAULT '[]',
  synced_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_directory_service_notion_relation_page
 ON directory_service_notion_relation_sync(notion_page_id);
