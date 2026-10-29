-- Daily, read-only source inspection for time-sensitive Help profiles.
-- Source checks never modify public adoption/lost-found lifecycle statuses.
CREATE TABLE IF NOT EXISTS help_source_checks (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('ADOPTION','LOST_FOUND')),
  entity_id INTEGER NOT NULL CHECK (entity_id > 0),
  source_url TEXT NOT NULL DEFAULT '',
  source_state TEXT NOT NULL DEFAULT 'UNCHECKED'
    CHECK (source_state IN ('UNCHECKED','ACTIVE_SIGNAL','POSSIBLE_CHANGE','UNCERTAIN','UNAVAILABLE','NO_SOURCE')),
  last_checked_at TEXT,
  state_changed_at TEXT,
  last_success_at TEXT,
  last_http_status INTEGER,
  evidence TEXT NOT NULL DEFAULT '',
  error_code TEXT,
  last_reviewed_at TEXT,
  last_reviewed_state TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_help_source_checks_due
  ON help_source_checks(last_checked_at, entity_type);
CREATE INDEX IF NOT EXISTS idx_help_source_checks_review
  ON help_source_checks(source_state, last_reviewed_at);

-- Per-source action state is separate from domain lifecycle.
-- Reading a notification must never mark an adoption or report resolved.
CREATE TABLE IF NOT EXISTS admin_attention_ack (
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  relevant_at TEXT NOT NULL,
  read_at TEXT,
  snoozed_until TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source_type, source_id)
);
CREATE INDEX IF NOT EXISTS idx_admin_attention_ack_snooze ON admin_attention_ack(snoozed_until);
