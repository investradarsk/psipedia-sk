-- 0154: Owner-maintained ledger for which published content was already shared to Facebook.
-- Read-only content pickers remain functional if this protected D1 migration is pending.
-- Marking is manual; never changes FB publishing consent, post status or Notion.
CREATE TABLE IF NOT EXISTS facebook_content_share_markers (
  content_type TEXT NOT NULL CHECK(content_type IN (
    'article','directory','events','breeds','organization','adoption','lost_found','help_case'
  )),
  entity_id INTEGER NOT NULL CHECK(entity_id > 0),
  marked_at TEXT NOT NULL,
  marked_by TEXT NOT NULL,
  PRIMARY KEY(content_type, entity_id)
);
