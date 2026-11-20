-- Partneri V2 / 7-8: one private conversation per partner account.
-- Reserve 0190; confirm no parallel migration with this prefix before applying in step 8.
-- Additive only: existing Partner auth, canonical content and Notion locks unchanged.
CREATE TABLE IF NOT EXISTS partner_conversations (
  partner_account_id TEXT PRIMARY KEY NOT NULL REFERENCES partner_accounts(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_message_at TEXT,
  partner_last_read_at TEXT,
  admin_last_read_at TEXT
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS partner_chat_messages (
  id TEXT PRIMARY KEY NOT NULL,
  partner_account_id TEXT NOT NULL REFERENCES partner_conversations(partner_account_id) ON DELETE RESTRICT,
  sender_role TEXT NOT NULL CHECK(sender_role IN ('PARTNER','ADMIN')),
  sender_ref TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  attachment_count INTEGER NOT NULL DEFAULT 0 CHECK(attachment_count BETWEEN 0 AND 3),
  created_at TEXT NOT NULL,
  CHECK(length(body)<=4000 AND (length(trim(body))>0 OR attachment_count>0))
);
CREATE INDEX IF NOT EXISTS partner_chat_messages_account_created_idx
  ON partner_chat_messages(partner_account_id,created_at DESC,id DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS partner_chat_attachments (
  id TEXT PRIMARY KEY NOT NULL,
  message_id TEXT NOT NULL REFERENCES partner_chat_messages(id) ON DELETE RESTRICT,
  private_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp','application/pdf')),
  size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS partner_chat_attachments_message_idx ON partner_chat_attachments(message_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS partner_notification_preferences (
  partner_account_id TEXT PRIMARY KEY NOT NULL REFERENCES partner_accounts(id) ON DELETE RESTRICT,
  email_enabled INTEGER NOT NULL DEFAULT 1 CHECK(email_enabled IN (0,1)),
  in_app_enabled INTEGER NOT NULL DEFAULT 1 CHECK(in_app_enabled IN (0,1)),
  updated_at TEXT NOT NULL
);
--> statement-breakpoint

-- Chat notice email cannot be stored in partner_notification_outbox:
-- its existing notification_type CHECK does not allow CHAT_MESSAGE.
-- A tiny purpose-scoped queue avoids rebuilding any existing production table.
CREATE TABLE IF NOT EXISTS partner_chat_email_queue (
  message_id TEXT PRIMARY KEY NOT NULL REFERENCES partner_chat_messages(id) ON DELETE RESTRICT,
  partner_account_id TEXT NOT NULL REFERENCES partner_accounts(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENDING','SENT','FAILED','EXPIRED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  provider_message_id TEXT,
  last_error TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS partner_chat_email_queue_pending_idx
  ON partner_chat_email_queue(status,created_at);
