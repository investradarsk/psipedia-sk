-- SZPZ official sled-dog race calendar source. Read-only automation source; production activation remains governance-gated.

INSERT OR IGNORE INTO automation_sources (
  source_key,label,entity_type,connector_type,source_url,config_json,enabled,
  cadence_minutes,throttle_ms,timeout_ms,retry_max_attempts,retry_backoff_ms,max_records_per_run,
  next_check_at,created_at,updated_at,review_status,reviewed_at,reviewed_by,review_notes
) VALUES (
  'szpz-mushing-events',
  'SZPZ – kalendár pretekov psích záprahov',
  'EVENT',
  'CONTROLLED_HTML',
  'https://mushing.sk/preteky/',
  '{"htmlAdapterKey":"szpz-mushing-events","expectedMinRecords":1}',
  0,360,1500,10000,2,1500,40,NULL,
  '2026-09-26T14:45:00.000Z','2026-09-26T14:45:00.000Z',
  'PENDING',NULL,NULL,
  'Verejný oficiálny kalendár Slovenského zväzu psích záprahov. Authority je evidence weight, nie automatic canonical truth; recurring automation requires separate governance approval. Source zostáva disabled/PENDING.'
);

INSERT OR IGNORE INTO automation_source_authority (
  source_id,source_role,authority_score,notes,created_at,updated_at
)
SELECT
  id,'OFFICIAL_CLUB_CALENDAR',90,
  'Official Slovak sled-dog federation calendar; authority je evidence weight, nie automatic canonical truth; recurring automation requires separate governance approval.',
  '2026-09-26T14:45:00.000Z','2026-09-26T14:45:00.000Z'
FROM automation_sources
WHERE source_key='szpz-mushing-events';
