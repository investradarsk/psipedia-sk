-- Prepared only: Facebook Page image publication settings and no-retry attempt ledger.
-- No credential, external call, publication or existing data rewrite.
CREATE TABLE facebook_image_publisher_settings (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id=1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE TABLE facebook_image_publish_attempts (
  post_id TEXT PRIMARY KEY NOT NULL REFERENCES facebook_image_posts(id) ON DELETE RESTRICT,
  snapshot_version INTEGER NOT NULL CHECK (snapshot_version>=1),
  state TEXT NOT NULL DEFAULT 'SENDING' CHECK (state IN ('SENDING','PUBLISHED','UNCERTAIN')),
  remote_id TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error_code TEXT,
  CHECK ((state='PUBLISHED' AND remote_id IS NOT NULL AND completed_at IS NOT NULL)
     OR (state<>'PUBLISHED' AND remote_id IS NULL))
);
CREATE INDEX facebook_image_publish_attempts_state_idx ON facebook_image_publish_attempts(state,started_at);
