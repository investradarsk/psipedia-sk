-- Manual searches must never change the independent hourly cursors or claims.
-- Each paid API attempt gets its own durable history record; the canonical queue stays review-gated.
CREATE TABLE quality_missing_manual_attempts (
  id TEXT PRIMARY KEY,
  area TEXT NOT NULL CHECK(area IN ('services','events','help')),
  search_group TEXT NOT NULL CHECK(search_group IN ('image','web','phone','email','social','all')),
  mode TEXT NOT NULL CHECK(mode IN ('profiles','free','alternative')),
  entity_type TEXT,
  entity_id INTEGER,
  profile_label TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK(status IN ('RUNNING','SUCCESS','FAILED')),
  found INTEGER NOT NULL DEFAULT 0 CHECK(found >= 0),
  error_code TEXT,
  actor TEXT NOT NULL
);
CREATE INDEX quality_missing_manual_attempts_recent ON quality_missing_manual_attempts(created_at DESC);
