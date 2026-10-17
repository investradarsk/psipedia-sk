-- GEMINI-QUEUE-1: allow multiple explicitly approved pending manual jobs.
-- Do not change status constraints, existing jobs or paid-provider dispatches.
-- The per-category active index from 0119 stays in place: no duplicate requests
-- for one category while QUEUED or RUNNING.
DROP INDEX IF EXISTS idx_gemini_manual_only_one_active;

-- Hard D1 invariant: even racing Cron/admin requests cannot claim two paid jobs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_gemini_manual_only_one_running
  ON gemini_manual_background_jobs ((1))
  WHERE status = 'RUNNING';

-- Pure read index for oldest approved waiting external request.
CREATE INDEX IF NOT EXISTS idx_gemini_manual_external_pending
  ON gemini_manual_background_jobs(status, error_code, id);
