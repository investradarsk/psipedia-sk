-- External Gemini worker queue. Additive; no paid work enabled by this migration.
CREATE TABLE IF NOT EXISTS gemini_external_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_id INTEGER NOT NULL REFERENCES gemini_automation_settings(id),
  stable_key TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK(trigger_type IN ('MANUAL','SCHEDULED')),
  status TEXT NOT NULL CHECK(status IN ('QUEUED','RUNNING','UNCERTAIN','SUCCESS','FAILED')),
  nonce_hash TEXT NOT NULL,
  concept_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  notion_page_ids_json TEXT NOT NULL DEFAULT '[]',
  error_code TEXT,
  created_at TEXT NOT NULL,
  dispatched_at TEXT,
  completed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS gemini_external_one_active
 ON gemini_external_jobs ((1))
 WHERE status IN ('QUEUED','RUNNING','UNCERTAIN');
CREATE INDEX IF NOT EXISTS gemini_external_recent ON gemini_external_jobs(id DESC);
