CREATE TABLE partner_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  email_verified_at TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DEACTIVATED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE UNIQUE INDEX partner_accounts_email_unique
  ON partner_accounts(email);
CREATE INDEX partner_accounts_status_created_idx
  ON partner_accounts(status, created_at);

CREATE TABLE partner_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES partner_accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE UNIQUE INDEX partner_sessions_token_hash_unique
  ON partner_sessions(token_hash);
CREATE INDEX partner_sessions_account_expiry_idx
  ON partner_sessions(account_id, expires_at);

CREATE TABLE partner_email_tokens (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES partner_accounts(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET')),
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX partner_email_tokens_hash_unique
  ON partner_email_tokens(token_hash);
CREATE INDEX partner_email_tokens_account_purpose_idx
  ON partner_email_tokens(account_id, purpose, expires_at);

CREATE TABLE partner_memberships (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES partner_accounts(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('directory_profile', 'help_organization', 'event')),
  entity_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'MANAGER', 'EDITOR')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by TEXT
);

CREATE UNIQUE INDEX partner_memberships_account_entity_unique
  ON partner_memberships(account_id, entity_type, entity_id);
CREATE INDEX partner_memberships_entity_idx
  ON partner_memberships(entity_type, entity_id, status);
CREATE INDEX partner_memberships_account_idx
  ON partner_memberships(account_id, status);

CREATE TABLE partner_entity_verifications (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('directory_profile', 'help_organization', 'event')),
  entity_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (status IN ('UNVERIFIED', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED')),
  verified_at TEXT,
  verified_by TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE UNIQUE INDEX partner_entity_verifications_entity_unique
  ON partner_entity_verifications(entity_type, entity_id);
CREATE INDEX partner_entity_verifications_status_idx
  ON partner_entity_verifications(status, updated_at);

CREATE TABLE partner_commercial_interests (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES partner_accounts(id) ON DELETE CASCADE,
  entity_type TEXT CHECK (entity_type IS NULL OR entity_type IN ('directory_profile', 'help_organization', 'event')),
  entity_id TEXT,
  interest_type TEXT NOT NULL CHECK (interest_type IN ('PREMIUM_PROFILE', 'PROMOTED_PROFILE', 'ADVERTISING', 'OTHER')),
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'CONTACTED', 'INTERESTED', 'NOT_NOW', 'CLOSED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE INDEX partner_commercial_interests_status_created_idx
  ON partner_commercial_interests(status, created_at);
CREATE INDEX partner_commercial_interests_account_created_idx
  ON partner_commercial_interests(account_id, created_at);

CREATE TABLE partner_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('PARTNER', 'ADMIN', 'SYSTEM')),
  actor_ref TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX partner_audit_log_target_created_idx
  ON partner_audit_log(target_type, target_id, created_at);
CREATE INDEX partner_audit_log_actor_created_idx
  ON partner_audit_log(actor_type, actor_ref, created_at);
