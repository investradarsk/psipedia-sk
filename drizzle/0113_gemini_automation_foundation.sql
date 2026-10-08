-- GEMINI-AUTOMATION-FOUNDATION-1: additive, isolated schema. No legacy automation dependencies.
CREATE TABLE IF NOT EXISTS gemini_automation_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stable_key TEXT NOT NULL UNIQUE,
  section TEXT NOT NULL,
  subcategory TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  cadence_minutes INTEGER NOT NULL DEFAULT 1440 CHECK (cadence_minutes BETWEEN 5 AND 43200),
  max_new_concepts INTEGER NOT NULL DEFAULT 5 CHECK (max_new_concepts BETWEEN 0 AND 100),
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_gemini_settings_due ON gemini_automation_settings(enabled, next_run_at);

CREATE TABLE IF NOT EXISTS gemini_automation_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_id INTEGER NOT NULL REFERENCES gemini_automation_settings(id),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('MANUAL','SCHEDULED','TEST')),
  status TEXT NOT NULL CHECK (status IN ('RUNNING','SUCCESS','FAILED')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  model TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  grounded_search_query_count INTEGER NOT NULL DEFAULT 0 CHECK (grounded_search_query_count >= 0),
  candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  concept_count INTEGER NOT NULL DEFAULT 0 CHECK (concept_count >= 0),
  error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  error_code TEXT CHECK (error_code IS NULL OR error_code IN ('CONFIG_MISSING','AUTH_FAILED','RATE_LIMITED','TIMEOUT','PROVIDER_ERROR','INVALID_RESPONSE')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((status = 'RUNNING' AND completed_at IS NULL) OR (status != 'RUNNING' AND completed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_gemini_runs_setting_started ON gemini_automation_runs(setting_id, started_at DESC);
