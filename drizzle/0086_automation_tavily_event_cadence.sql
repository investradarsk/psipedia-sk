-- DISCOVERY-2C-E: Tavily EVENT discovery cadence hardening.
-- Data-only and activation-neutral: preserve enabled/review_status/next_check_at and all search config except cooldown.

UPDATE automation_discovery_roots
SET
  cadence_minutes = 2880,
  config_json = json_set(config_json, '$.searchBudget.queryCooldownMinutes', 2880)
WHERE root_key = 'tavily-sk-dog-events';
