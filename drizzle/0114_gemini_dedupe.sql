-- GEMINI-DEDUPE-1: isolated explicit rejection identity memory. Additive; no canonical/legacy edits.
CREATE TABLE IF NOT EXISTS gemini_automation_rejections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stable_key TEXT NOT NULL CHECK (length(stable_key) BETWEEN 1 AND 120),
  identity_kind TEXT NOT NULL CHECK (identity_kind IN ('phone','email','url_name_city','domain_name_city','name_city')),
  identity_hash TEXT NOT NULL CHECK (length(identity_hash) = 64 AND identity_hash NOT GLOB '*[^0-9a-f]*'),
  candidate_name TEXT NOT NULL CHECK (length(candidate_name) BETWEEN 1 AND 160),
  reason_code TEXT CHECK (reason_code IS NULL OR (length(reason_code) BETWEEN 1 AND 64)),
  rejected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(stable_key, identity_kind, identity_hash)
);
CREATE INDEX IF NOT EXISTS idx_gemini_rejections_scope_recent
  ON gemini_automation_rejections(stable_key, rejected_at DESC);
