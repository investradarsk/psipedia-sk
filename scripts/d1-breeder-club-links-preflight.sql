-- READ-ONLY inventory of historical station/club links. No transfer will be done.
-- Existing relations are only counted; the target system starts from zero.
WITH stations AS (
  SELECT id AS station_id, source_data_json,
    CASE WHEN json_valid(source_data_json)
      THEN json_extract(source_data_json, '$."_psipedia_breeder_club_profile_ids"')
      ELSE NULL END AS raw
  FROM directory_profiles WHERE category='chovatelske-stanice'
), arrays AS (
  SELECT station_id, raw,
    CASE WHEN json_valid(raw) AND json_type(raw)='array' THEN raw ELSE '[]' END AS items
  FROM stations
), legacy AS (
  SELECT DISTINCT s.station_id, j.value AS club_id, j.type AS value_type
  FROM arrays s JOIN json_each(s.items) j
)
SELECT
 (SELECT COUNT(*) FROM stations) AS station_profiles,
 (SELECT COUNT(*) FROM directory_profiles WHERE category='chovatelske-kluby') AS club_profiles,
 (SELECT COUNT(*) FROM stations WHERE NOT json_valid(source_data_json)) AS invalid_json,
 (SELECT COUNT(*) FROM arrays WHERE raw IS NOT NULL AND NOT
     (CASE WHEN json_valid(raw) THEN json_type(raw)='array' ELSE 0 END)) AS invalid_club_array,
 (SELECT COUNT(*) FROM legacy WHERE value_type<>'integer' OR club_id<=0) AS bad_ids,
 (SELECT COUNT(*) FROM legacy l LEFT JOIN directory_profiles club ON club.id=l.club_id
   WHERE l.value_type='integer' AND l.club_id>0
     AND (club.id IS NULL OR club.category<>'chovatelske-kluby')) AS invalid_club_targets,
 (SELECT COUNT(*) FROM legacy WHERE value_type='integer' AND club_id>0) AS legacy_pairs,
 (SELECT COUNT(*) FROM sqlite_schema WHERE type='table' AND name='directory_breeder_club_relations') AS relation_table_exists,
 (SELECT COUNT(*) FROM breed_directory_relations b JOIN directory_profiles p ON p.id=b.profile_id
   WHERE p.category='chovatelske-kluby') AS club_breed_links,
 (SELECT COUNT(*) FROM breed_directory_relations b JOIN directory_profiles p ON p.id=b.profile_id
   WHERE p.category='treneri') AS stale_trainer_breed_links;
