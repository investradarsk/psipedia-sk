-- Dedicated singleton setting. No change to historical reviews or identities.
-- Apply only through the separately approved production D1 migration process.
CREATE TABLE profile_review_verification_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  email_required INTEGER NOT NULL CHECK (email_required IN (0, 1)),
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

INSERT INTO profile_review_verification_settings (id, email_required, updated_at)
VALUES (1, 0, CURRENT_TIMESTAMP);
