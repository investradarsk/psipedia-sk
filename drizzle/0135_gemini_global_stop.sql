-- GEMINI GLOBAL STOP 01. Additive, intentionally NOT applied by this PR.
-- Deployed state keeps existing explicit category choices; production paid/scheduled
-- environment gates remain authoritative and are NEVER enabled by this migration.
CREATE TABLE gemini_global_control (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  state TEXT NOT NULL CHECK (state IN ('RUNNING','STOPPED','RESUMING')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at TEXT NOT NULL
);
INSERT INTO gemini_global_control (id,state,revision,updated_at)
VALUES (1,'RUNNING',0,strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- SQLite D1 statements are serialized. The trigger checks the control row
-- in the same atomic write that reserves work: no enqueue or claim can race
-- past an already committed STOP (including legacy/manual/background paths).
CREATE TRIGGER gemini_global_stop_job_insert
BEFORE INSERT ON gemini_manual_background_jobs
WHEN NEW.status IN ('QUEUED','RUNNING')
BEGIN
  SELECT RAISE(ABORT,'GEMINI_GLOBAL_STOP')
  WHERE NOT EXISTS (SELECT 1 FROM gemini_global_control WHERE id=1 AND state='RUNNING');
END;
CREATE TRIGGER gemini_global_stop_job_claim
BEFORE UPDATE OF status ON gemini_manual_background_jobs
WHEN NEW.status IN ('QUEUED','RUNNING') AND OLD.status <> NEW.status
BEGIN
  SELECT RAISE(ABORT,'GEMINI_GLOBAL_STOP')
  WHERE NOT EXISTS (SELECT 1 FROM gemini_global_control WHERE id=1 AND state='RUNNING');
END;
-- The legacy synchronous manual runner reserves a run directly without a job.
CREATE TRIGGER gemini_global_stop_direct_run
BEFORE INSERT ON gemini_automation_runs
WHEN NEW.status='RUNNING'
BEGIN
  SELECT RAISE(ABORT,'GEMINI_GLOBAL_STOP')
  WHERE NOT EXISTS (SELECT 1 FROM gemini_global_control WHERE id=1 AND state='RUNNING');
END;
