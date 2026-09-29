-- AUTOMATION-OPERATIONS-2
-- Persist run-time metrics that cannot be reconstructed safely from current canonical state.
-- New metric columns are nullable on purpose: NULL means an older run did not record the metric.

ALTER TABLE automation_discovery_runs ADD COLUMN search_request_count integer;
ALTER TABLE automation_discovery_runs ADD COLUMN search_result_count integer;
ALTER TABLE automation_discovery_runs ADD COLUMN provider_result_count integer;
ALTER TABLE automation_discovery_runs ADD COLUMN local_prefilter_count integer;
ALTER TABLE automation_discovery_runs ADD COLUMN exclusion_count integer;
ALTER TABLE automation_discovery_runs ADD COLUMN canonical_duplicate_count integer;
ALTER TABLE automation_discovery_runs ADD COLUMN new_entity_count integer;
ALTER TABLE automation_discovery_runs ADD COLUMN update_suggestion_count integer;
ALTER TABLE automation_discovery_runs ADD COLUMN possible_duplicate_count integer;
ALTER TABLE automation_discovery_runs ADD COLUMN address_verified_exact_count integer;
ALTER TABLE automation_discovery_runs ADD COLUMN address_no_exact_count integer;

ALTER TABLE automation_direct_refresh_settings ADD COLUMN last_batch_checked_count integer;
ALTER TABLE automation_direct_refresh_settings ADD COLUMN last_batch_update_suggestion_count integer;
ALTER TABLE automation_direct_refresh_settings ADD COLUMN last_batch_error_count integer;

CREATE INDEX automation_discovery_runs_started_idx
  ON automation_discovery_runs(started_at,root_id);

CREATE TABLE automation_discovery_outcomes (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  run_id integer NOT NULL REFERENCES automation_discovery_runs(id) ON DELETE CASCADE,
  root_id integer NOT NULL REFERENCES automation_discovery_roots(id) ON DELETE CASCADE,
  category_slug text,
  entity_type text NOT NULL CHECK (entity_type IN ('EVENT','ORGANIZATION','HELP_ITEM','ADOPTION','FOSTER','LOST_FOUND','DIRECTORY')),
  outcome_type text NOT NULL CHECK (outcome_type IN ('NEW_DRAFT','EXISTING_CANONICAL','POSSIBLE_DUPLICATE','UPDATE_SUGGESTION')),
  canonical_entity_id integer,
  label text NOT NULL,
  source_url text,
  match_reason_code text NOT NULL,
  created_at text NOT NULL
);

CREATE INDEX automation_discovery_outcomes_root_created_idx
  ON automation_discovery_outcomes(root_id,created_at DESC,id DESC);
CREATE INDEX automation_discovery_outcomes_run_idx
  ON automation_discovery_outcomes(run_id,id);
