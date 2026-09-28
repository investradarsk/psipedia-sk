-- ZŠK SR official event calendar source. Read-only automation source; production activation remains review-gated.

INSERT OR IGNORE INTO automation_sources (
  source_key,label,entity_type,connector_type,source_url,config_json,enabled,
  cadence_minutes,throttle_ms,timeout_ms,retry_max_attempts,retry_backoff_ms,max_records_per_run,
  next_check_at,created_at,updated_at,review_status,reviewed_at,reviewed_by,review_notes
) VALUES (
  'zsk-sr-events',
  'ZŠK SR – kalendár kynologických akcií',
  'EVENT',
  'CONTROLLED_HTML',
  'https://zsksr.sk/kalendar/',
  '{"htmlAdapterKey":"zsk-sr-events","expectedMinRecords":1}',
  0,360,1500,10000,2,1500,200,NULL,
  '2026-09-25T20:30:00.000Z','2026-09-25T20:30:00.000Z',
  'PENDING',NULL,NULL,
  'Oficiálny verejný kalendár ZŠK SR. Opakovaný automatizovaný prístup nie je explicitne potvrdený podmienkami používania; zdroj zostáva disabled/PENDING do samostatného governance approval.'
);

INSERT OR IGNORE INTO automation_source_authority (
  source_id,source_role,authority_score,notes,created_at,updated_at
)
SELECT
  id,'OFFICIAL_CLUB_CALENDAR',90,
  'Oficiálny kalendár Zväzu športovej kynológie Slovenskej republiky; authority je evidence signal, nie automatická canonical pravda.',
  '2026-09-25T20:30:00.000Z','2026-09-25T20:30:00.000Z'
FROM automation_sources
WHERE source_key='zsk-sr-events';
