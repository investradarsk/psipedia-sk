-- DISCOVERY-CAT-1B: weekly Tavily source discovery for Slovak dog-help organizations.
-- Provisioning only: disabled/PENDING, no live Tavily request, no automation source or canonical writes.
-- Search results become source candidates only; human review remains mandatory before source activation.

INSERT OR IGNORE INTO automation_discovery_roots (
  root_key,label,discovery_type,source_url,entity_type,suggested_connector_type,config_json,
  enabled,review_status,cadence_minutes,next_check_at,created_at,updated_at,reviewed_at,reviewed_by,review_notes
) VALUES (
  'tavily-sk-dog-organizations',
  'Tavily — slovenské útulky a organizácie',
  'SEARCH_PROVIDER',
  NULL,
  'ORGANIZATION',
  'CONTROLLED_HTML',
  '{"provider":"tavily","queries":["útulok pre psov Slovensko oficiálna stránka","občianske združenie pomoc psom Slovensko oficiálna stránka","záchrana psov Slovensko občianske združenie web"],"country":"SK","locale":"sk-SK","maxResults":5,"maxCandidates":15,"searchBudget":{"queriesPerRun":3,"providerRequestsPerRun":3,"rootDailyRequests":3,"queryCooldownMinutes":10080}}',
  0,
  'PENDING',
  10080,
  NULL,
  '2026-09-26T23:20:00.000Z',
  '2026-09-26T23:20:00.000Z',
  NULL,
  NULL,
  'Weekly Tavily ORGANIZATION source discovery. Search results are source candidates only. Keep disabled until governance review, technical approval, explicit enablement and controlled canary.'
);
