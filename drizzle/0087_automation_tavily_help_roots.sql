-- DISCOVERY-CAT-1A: Tavily SEARCH_PROVIDER roots for HELP categories.
-- Provisioning only: disabled/PENDING, no live request, no source approval, no canonical/publication writes.

INSERT OR IGNORE INTO automation_discovery_roots (
  root_key,label,discovery_type,source_url,entity_type,suggested_connector_type,config_json,
  enabled,review_status,cadence_minutes,next_check_at,created_at,updated_at,reviewed_at,reviewed_by,review_notes
) VALUES
(
  'tavily-sk-dog-adoptions',
  'Tavily — slovenské zdroje adopcií psov',
  'SEARCH_PROVIDER',
  NULL,
  'ADOPTION',
  'CONTROLLED_HTML',
  '{"provider":"tavily","queries":["slovenské útulky psy na adopciu","adopcia psov Slovensko útulok","psy hľadajú domov Slovensko útulok"],"country":"SK","locale":"sk-SK","maxResults":5,"maxCandidates":15,"searchBudget":{"queriesPerRun":3,"providerRequestsPerRun":3,"rootDailyRequests":3,"queryCooldownMinutes":1440}}',
  0,'PENDING',1440,NULL,
  '2026-09-27T00:00:00.000Z','2026-09-27T00:00:00.000Z',NULL,NULL,
  'HELP adoption source-discovery root. Provisioning does not imply governance approval; keep disabled until explicit operator review and controlled canary activation.'
),
(
  'tavily-sk-dog-foster',
  'Tavily — slovenské zdroje dočasnej opatery',
  'SEARCH_PROVIDER',
  NULL,
  'FOSTER',
  'CONTROLLED_HTML',
  '{"provider":"tavily","queries":["dočasná opatera pes Slovensko útulok","hľadáme dočasnú opateru pes útulok Slovensko","dočaska psy Slovensko útulok"],"country":"SK","locale":"sk-SK","maxResults":5,"maxCandidates":15,"searchBudget":{"queriesPerRun":3,"providerRequestsPerRun":3,"rootDailyRequests":3,"queryCooldownMinutes":1440}}',
  0,'PENDING',1440,NULL,
  '2026-09-27T00:00:00.000Z','2026-09-27T00:00:00.000Z',NULL,NULL,
  'HELP foster source-discovery root. Provisioning does not imply governance approval; keep disabled until explicit operator review and controlled canary activation.'
),
(
  'tavily-sk-dog-lost-found',
  'Tavily — slovenské zdroje stratených a nájdených psov',
  'SEARCH_PROVIDER',
  NULL,
  'LOST_FOUND',
  'CONTROLLED_HTML',
  '{"provider":"tavily","queries":["stratené nájdené psy Slovensko útulok","stratený pes Slovensko organizácia","nájdený pes Slovensko útulok"],"country":"SK","locale":"sk-SK","maxResults":5,"maxCandidates":15,"searchBudget":{"queriesPerRun":3,"providerRequestsPerRun":3,"rootDailyRequests":3,"queryCooldownMinutes":1440}}',
  0,'PENDING',1440,NULL,
  '2026-09-27T00:00:00.000Z','2026-09-27T00:00:00.000Z',NULL,NULL,
  'HELP lost/found source-discovery root. Provisioning does not imply governance approval; keep disabled until explicit operator review and controlled canary activation.'
);
