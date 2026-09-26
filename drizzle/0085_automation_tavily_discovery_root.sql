-- DISCOVERY-2C-C: first Tavily SEARCH_PROVIDER discovery root.
-- Provisioning only: disabled/PENDING, no secret, no live request, no source/canonical writes.
-- Governance gate: provisioning does not authorize activation or live Tavily traffic.

INSERT OR IGNORE INTO automation_discovery_roots (
  root_key,label,discovery_type,source_url,entity_type,suggested_connector_type,config_json,
  enabled,review_status,cadence_minutes,next_check_at,created_at,updated_at,reviewed_at,reviewed_by,review_notes
) VALUES (
  'tavily-sk-dog-events',
  'Tavily — slovenské kynologické event zdroje',
  'SEARCH_PROVIDER',
  NULL,
  'EVENT',
  'CONTROLLED_HTML',
  '{"provider":"tavily","queries":["kynologický kalendár podujatí Slovensko","agility preteky kalendár Slovensko","mushing preteky kalendár Slovensko"],"country":"SK","locale":"sk-SK","maxResults":5,"maxCandidates":15,"searchBudget":{"queriesPerRun":3,"providerRequestsPerRun":3,"rootDailyRequests":3,"queryCooldownMinutes":1440}}',
  0,
  'PENDING',
  1440,
  NULL,
  '2026-09-26T19:34:00.000Z',
  '2026-09-26T19:34:00.000Z',
  NULL,
  NULL,
  'First Tavily EVENT source-discovery root. Provisioning does not imply governance approval. Keep disabled until Tavily evidence-retention/storage review is complete and an operator explicitly approves controlled canary activation.'
);
