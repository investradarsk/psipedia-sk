-- GEMINI-SCHEDULER-ADMIN-V2-1: additive only; no activation or backfill of existing choices.
-- ISO weekday (1=Monday .. 7=Sunday), meaningful only for weekly cadence.
ALTER TABLE gemini_automation_settings ADD COLUMN weekly_day INTEGER
  CHECK (weekly_day IS NULL OR weekly_day BETWEEN 1 AND 7);
-- Preserve all pre-existing enabled flags, cadence values and queued due dates.
