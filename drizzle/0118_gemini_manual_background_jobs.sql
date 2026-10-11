-- GEMINI manual background queue: additive, no automatic paid search scheduling.
-- Only an authenticated admin POST enqueues; cron may consume an existing job.
CREATE TABLE IF NOT EXISTS gemini_manual_background_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_id INTEGER NOT NULL REFERENCES gemini_automation_settings(id),
  stable_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED')),
  run_id INTEGER REFERENCES gemini_automation_runs(id),
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  claimed_at TEXT,
  completed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gemini_manual_active_category
  ON gemini_manual_background_jobs(stable_key)
  WHERE status IN ('QUEUED', 'RUNNING');
CREATE INDEX IF NOT EXISTS idx_gemini_manual_queue
  ON gemini_manual_background_jobs(status, id);
