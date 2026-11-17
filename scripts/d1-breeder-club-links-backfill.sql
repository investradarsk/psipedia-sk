-- MANUAL POST-SCHEMA, PRE-DEPLOY. NO AUTOMATIC EXECUTION.
-- First require invalid_json=invalid_club_array=bad_ids=invalid_club_targets=0
-- from d1-breeder-club-links-preflight.sql. Avoid concurrent station edits.
WITH stations AS (
  SELECT id AS station_id,
    CASE WHEN json_valid(source_data_json)
      THEN json_extract(source_data_json, '$."_psipedia_breeder_club_profile_ids"')
      ELSE NULL END AS raw
  FROM directory_profiles WHERE category='chovatelske-stanice'
), safe_arrays AS (
  SELECT station_id,
    CASE WHEN json_valid(raw) AND json_type(raw)='array' THEN raw ELSE '[]' END AS items
  FROM stations
)
INSERT OR IGNORE INTO directory_breeder_club_relations
 (station_profile_id,club_profile_id,created_at,created_by)
SELECT DISTINCT s.station_id, club.id, CURRENT_TIMESTAMP,'manual:club-links-cutover'
FROM safe_arrays s
JOIN json_each(s.items) j
JOIN directory_profiles club ON club.id=j.value AND club.category='chovatelske-kluby'
WHERE j.type='integer' AND j.value>0;
