UPDATE automation_runs
SET status='FAILED',
    completed_at=COALESCE(completed_at, started_at),
    error_count=CASE WHEN error_count < 1 THEN 1 ELSE error_count END,
    error_summary=COALESCE(error_summary, 'stale_run_recovered_before_background_lock')
WHERE status='RUNNING';

CREATE UNIQUE INDEX IF NOT EXISTS automation_runs_one_running_per_source
  ON automation_runs(source_id)
  WHERE status='RUNNING';
