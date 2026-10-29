-- 0145: Durable inbox for signed Notion page webhook receipts.
-- Schema-only. Apply through the protected owner-dispatched D1 migration workflow.
-- No public data is stored; only event/page identifiers and changed property IDs.
CREATE TABLE notion_webhook_inbox (
  event_key TEXT PRIMARY KEY NOT NULL,
  page_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('page.created','page.properties_updated','page.content_updated')),
  changed_properties_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PROCESSING','DONE','REVIEW')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at INTEGER NOT NULL DEFAULT (unixepoch()),
  lease_until INTEGER,
  received_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  outcome TEXT,
  last_error_code TEXT
);

CREATE INDEX notion_webhook_inbox_pending
  ON notion_webhook_inbox(status, next_attempt_at, received_at);
CREATE INDEX notion_webhook_inbox_page
  ON notion_webhook_inbox(page_id, status);
