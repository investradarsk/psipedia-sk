-- ADMIN-AUTOMATION-PUSH-1: strictly additive; run against D1 before deploying code.
ALTER TABLE admin_push_subscriptions
  ADD COLUMN categories_json TEXT NOT NULL DEFAULT '["RUN_STARTED","RUN_RESULTS","ERRORS","PUBLISH","IMPORT_SYNC"]';

CREATE TABLE admin_notification_read_receipts (
  event_id INTEGER NOT NULL REFERENCES admin_notification_events(id) ON DELETE CASCADE,
  admin_email TEXT NOT NULL,
  read_at TEXT NOT NULL,
  PRIMARY KEY (event_id, admin_email)
);
CREATE INDEX admin_notification_read_receipts_admin_idx
  ON admin_notification_read_receipts (admin_email, read_at);
