-- DISCOVERY-CAT-1C: weekly Tavily source discovery for canonical DIRECTORY service categories.
-- Provisioning only: disabled/PENDING. Search results become source candidates only.
-- No live Tavily request, source approval, canonical DIRECTORY write, publication or activation occurs here.

INSERT OR IGNORE INTO automation_discovery_roots (
  root_key,label,discovery_type,source_url,entity_type,suggested_connector_type,config_json,
  enabled,review_status,cadence_minutes,next_check_at,created_at,updated_at,reviewed_at,reviewed_by,review_notes
) VALUES
(
  'tavily-sk-dog-veterinarians',
  'Tavily — slovenské veterinárne pracoviská',
  'SEARCH_PROVIDER',
  NULL,
  'DIRECTORY',
  'CONTROLLED_HTML',
  '{"provider":"tavily","directoryCategory":"veterinari","queries":["veterinárna klinika pes Slovensko oficiálna stránka","veterinárna ambulancia psy Slovensko oficiálny web","veterinárna nemocnica Slovensko pes oficiálna stránka"],"country":"SK","locale":"sk-SK","maxResults":5,"maxCandidates":15,"searchBudget":{"queriesPerRun":3,"providerRequestsPerRun":3,"rootDailyRequests":3,"queryCooldownMinutes":10080}}',
  0,'PENDING',10080,NULL,
  '2026-09-27T00:00:00.000Z','2026-09-27T00:00:00.000Z',NULL,NULL,
  'Weekly Tavily DIRECTORY source discovery for canonical category veterinari. Keep disabled until governance review, technical approval, explicit enablement and controlled canary.'
),
(
  'tavily-sk-dog-grooming',
  'Tavily — slovenské psie salóny',
  'SEARCH_PROVIDER',
  NULL,
  'DIRECTORY',
  'CONTROLLED_HTML',
  '{"provider":"tavily","directoryCategory":"salony-a-sluzby","queries":["psí salón Slovensko oficiálna stránka","strihanie psov Slovensko salón oficiálny web","grooming psy Slovensko salón oficiálna stránka"],"country":"SK","locale":"sk-SK","maxResults":5,"maxCandidates":15,"searchBudget":{"queriesPerRun":3,"providerRequestsPerRun":3,"rootDailyRequests":3,"queryCooldownMinutes":10080}}',
  0,'PENDING',10080,NULL,
  '2026-09-27T00:00:00.000Z','2026-09-27T00:00:00.000Z',NULL,NULL,
  'Weekly Tavily DIRECTORY source discovery for canonical category salony-a-sluzby. Keep disabled until governance review, technical approval, explicit enablement and controlled canary.'
),
(
  'tavily-sk-dog-hotels-daycare',
  'Tavily — slovenské hotely a opatrovanie psov',
  'SEARCH_PROVIDER',
  NULL,
  'DIRECTORY',
  'CONTROLLED_HTML',
  '{"provider":"tavily","directoryCategory":"hotely-a-opatrovanie","queries":["hotel pre psov Slovensko oficiálna stránka","škôlka pre psov Slovensko oficiálny web","ubytovanie opatera psov Slovensko oficiálna stránka"],"country":"SK","locale":"sk-SK","maxResults":5,"maxCandidates":15,"searchBudget":{"queriesPerRun":3,"providerRequestsPerRun":3,"rootDailyRequests":3,"queryCooldownMinutes":10080}}',
  0,'PENDING',10080,NULL,
  '2026-09-27T00:00:00.000Z','2026-09-27T00:00:00.000Z',NULL,NULL,
  'Weekly Tavily DIRECTORY source discovery for canonical category hotely-a-opatrovanie. Keep disabled until governance review, technical approval, explicit enablement and controlled canary.'
),
(
  'tavily-sk-dog-trainers',
  'Tavily — slovenskí tréneri a psie školy',
  'SEARCH_PROVIDER',
  NULL,
  'DIRECTORY',
  'CONTROLLED_HTML',
  '{"provider":"tavily","directoryCategory":"treneri","queries":["psia škola Slovensko oficiálna stránka","výcvik psov Slovensko tréner oficiálny web","tréner psov Slovensko oficiálna stránka"],"country":"SK","locale":"sk-SK","maxResults":5,"maxCandidates":15,"searchBudget":{"queriesPerRun":3,"providerRequestsPerRun":3,"rootDailyRequests":3,"queryCooldownMinutes":10080}}',
  0,'PENDING',10080,NULL,
  '2026-09-27T00:00:00.000Z','2026-09-27T00:00:00.000Z',NULL,NULL,
  'Weekly Tavily DIRECTORY source discovery for canonical category treneri. Keep disabled until governance review, technical approval, explicit enablement and controlled canary.'
),
(
  'tavily-sk-dog-rehabilitation',
  'Tavily — slovenská fyzioterapia a rehabilitácia psov',
  'SEARCH_PROVIDER',
  NULL,
  'DIRECTORY',
  'CONTROLLED_HTML',
  '{"provider":"tavily","directoryCategory":"fyzioterapia","queries":["rehabilitácia psov Slovensko oficiálna stránka","fyzioterapia pre psov Slovensko oficiálny web","rehabilitačné centrum pre psy Slovensko oficiálna stránka"],"country":"SK","locale":"sk-SK","maxResults":5,"maxCandidates":15,"searchBudget":{"queriesPerRun":3,"providerRequestsPerRun":3,"rootDailyRequests":3,"queryCooldownMinutes":10080}}',
  0,'PENDING',10080,NULL,
  '2026-09-27T00:00:00.000Z','2026-09-27T00:00:00.000Z',NULL,NULL,
  'Weekly Tavily DIRECTORY source discovery for canonical category fyzioterapia. Keep disabled until governance review, technical approval, explicit enablement and controlled canary.'
);
