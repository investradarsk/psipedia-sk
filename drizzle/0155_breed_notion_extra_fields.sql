-- Extra Notion editorial/workflow metadata without a canonical managed_breeds column.
-- These five fields are still visible and editable from Psipedia Admin.
CREATE TABLE IF NOT EXISTS breed_notion_extra_fields (
  breed_id INTEGER NOT NULL,
  field_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (breed_id, field_key),
  FOREIGN KEY (breed_id) REFERENCES managed_breeds(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_breed_notion_extra_breed
  ON breed_notion_extra_fields(breed_id);
