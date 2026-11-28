-- UNNUMBERED PROPOSAL. Apply only after owner approval, D1 recovery bookmark,
-- exact schema/dependency inventory and offline verification in one atomic transaction.
-- Conservatively reject any other table definition mentioning this table.
-- No table-valued PRAGMA: production D1 rejects that query with SQLITE_AUTH.
SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM sqlite_master
  WHERE type='table' AND lower(name)<>'notion_webhook_inbox'
    AND instr(lower(coalesce(sql,'')),'notion_webhook_inbox')>0
) THEN 1 ELSE json_extract('WEBHOOK_INBOX_DEPENDENCY','$') END;
CREATE TABLE notion_webhook_inbox_v3 (
  event_key TEXT PRIMARY KEY NOT NULL,
  page_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('page.created','page.properties_updated','page.content_updated','page.deleted')),
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

INSERT INTO notion_webhook_inbox_v3 (event_key,page_id,event_type,changed_properties_json,status,attempts,next_attempt_at,lease_until,received_at,updated_at,outcome,last_error_code)
SELECT event_key,page_id,event_type,changed_properties_json,status,attempts,next_attempt_at,lease_until,received_at,updated_at,outcome,last_error_code FROM notion_webhook_inbox;
-- Preserve all receipts and their state before dropping the old table.
SELECT CASE WHEN (SELECT COUNT(*) FROM notion_webhook_inbox_v3)=(SELECT COUNT(*) FROM notion_webhook_inbox)
 AND NOT EXISTS(SELECT event_key,page_id,event_type,changed_properties_json,status,attempts,next_attempt_at,lease_until,received_at,updated_at,outcome,last_error_code FROM notion_webhook_inbox EXCEPT SELECT event_key,page_id,event_type,changed_properties_json,status,attempts,next_attempt_at,lease_until,received_at,updated_at,outcome,last_error_code FROM notion_webhook_inbox_v3)
 THEN 1 ELSE json_extract('WEBHOOK_INBOX_COPY_MISMATCH','$') END;
DROP TABLE notion_webhook_inbox;
ALTER TABLE notion_webhook_inbox_v3 RENAME TO notion_webhook_inbox;
CREATE INDEX notion_webhook_inbox_pending ON notion_webhook_inbox(status,next_attempt_at,received_at);
CREATE INDEX notion_webhook_inbox_page ON notion_webhook_inbox(page_id,status);
