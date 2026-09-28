-- AUTOMATION-SCHEDULE-2
-- Additive calendar scheduling fields. Existing NULL rows remain legacy INTERVAL
-- schedules backed by cadence_minutes.

ALTER TABLE automation_discovery_roots ADD COLUMN schedule_mode text
  CHECK (schedule_mode IS NULL OR schedule_mode IN ('INTERVAL','CALENDAR'));
ALTER TABLE automation_discovery_roots ADD COLUMN schedule_days_json text;
ALTER TABLE automation_discovery_roots ADD COLUMN schedule_local_time text;
ALTER TABLE automation_discovery_roots ADD COLUMN schedule_timezone text;

ALTER TABLE automation_sources ADD COLUMN schedule_mode text
  CHECK (schedule_mode IS NULL OR schedule_mode IN ('INTERVAL','CALENDAR'));
ALTER TABLE automation_sources ADD COLUMN schedule_days_json text;
ALTER TABLE automation_sources ADD COLUMN schedule_local_time text;
ALTER TABLE automation_sources ADD COLUMN schedule_timezone text;

ALTER TABLE automation_direct_refresh_settings ADD COLUMN schedule_mode text
  CHECK (schedule_mode IS NULL OR schedule_mode IN ('INTERVAL','CALENDAR'));
ALTER TABLE automation_direct_refresh_settings ADD COLUMN schedule_days_json text;
ALTER TABLE automation_direct_refresh_settings ADD COLUMN schedule_local_time text;
ALTER TABLE automation_direct_refresh_settings ADD COLUMN schedule_timezone text;
