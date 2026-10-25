-- Add a truthful status and a safe provider error code to existing hourly claims.
-- Existing attempts remain UNKNOWN; do not retroactively label them successful.
-- Apply before enabling the quality search changes in production.
ALTER TABLE quality_missing_scans
  ADD COLUMN status TEXT NOT NULL DEFAULT 'UNKNOWN'
  CHECK(status IN ('UNKNOWN','RUNNING','SUCCESS','FAILED','SKIPPED'));
ALTER TABLE quality_missing_scans
  ADD COLUMN error_code TEXT;
CREATE INDEX IF NOT EXISTS quality_missing_scans_status
  ON quality_missing_scans(area,status,scanned_at);
