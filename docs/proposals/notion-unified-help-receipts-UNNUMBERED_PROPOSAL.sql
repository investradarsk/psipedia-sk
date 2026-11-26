-- Proposal only: apply after the unified state and Admin receipt schema.
-- The row exists only inside one authenticated canonical Admin D1 batch.
CREATE TABLE IF NOT EXISTS notion_help_admin_edit_intent (
  edit_id TEXT PRIMARY KEY,
  agenda TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  notion_page_id TEXT NOT NULL,
  before_json TEXT NOT NULL CHECK (json_valid(before_json)),
  UNIQUE(agenda, entity_id)
);
