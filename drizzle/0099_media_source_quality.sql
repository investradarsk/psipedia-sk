CREATE TABLE IF NOT EXISTS media_source_monitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('DIRECTORY_PROFILE','MANAGED_EVENT')),
  entity_id INTEGER NOT NULL,
  source_page_url TEXT,
  source_image_url TEXT,
  source_content_hash TEXT,
  active_image_key TEXT,
  status TEXT NOT NULL DEFAULT 'UNTRACKED'
    CHECK (status IN ('UNTRACKED','OK','CANDIDATE','CHANGED','MISSING','ERROR')),
  candidate_image_url TEXT,
  candidate_image_key TEXT,
  candidate_content_hash TEXT,
  last_http_status INTEGER,
  last_checked_at TEXT,
  issue_started_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS media_source_monitors_due_idx
  ON media_source_monitors(last_checked_at, status);

CREATE INDEX IF NOT EXISTS media_source_monitors_status_idx
  ON media_source_monitors(status, entity_type);

CREATE INDEX IF NOT EXISTS media_source_monitors_entity_idx
  ON media_source_monitors(entity_type, entity_id);
