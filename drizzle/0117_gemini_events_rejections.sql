-- GEMINI-EVENTS-1: separate hashed Event rejection decisions; no canonical schema changes.
CREATE TABLE IF NOT EXISTS gemini_automation_event_rejections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stable_key TEXT NOT NULL CHECK (length(stable_key) BETWEEN 1 AND 120),
  identity_kind TEXT NOT NULL CHECK (identity_kind IN (
    'event_url_date','registration_url_date','title_date_organizer','title_date_location'
  )),
  identity_hash TEXT NOT NULL CHECK (length(identity_hash)=64 AND identity_hash NOT GLOB '*[^0-9a-f]*'),
  canonical_event_id INTEGER,
  concept_id INTEGER,
  reason_code TEXT NOT NULL DEFAULT 'ADMIN_REJECTED',
  rejected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(stable_key,identity_kind,identity_hash)
);
CREATE INDEX IF NOT EXISTS idx_gemini_event_rejection_scope_recent
  ON gemini_automation_event_rejections(stable_key,rejected_at DESC);
CREATE INDEX IF NOT EXISTS idx_gemini_event_rejection_event
  ON gemini_automation_event_rejections(canonical_event_id,stable_key);
