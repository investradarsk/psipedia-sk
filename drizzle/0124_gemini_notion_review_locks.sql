-- Coordination only. Editorial state and rejection memory remain in Notion.
-- Deliberately no expiring lease: an uncertain remote write must not race a retry.
CREATE TABLE IF NOT EXISTS gemini_notion_review_locks (
  notion_page_id TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
