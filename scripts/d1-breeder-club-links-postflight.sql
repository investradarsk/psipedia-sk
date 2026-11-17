-- READ ONLY; run AFTER additive backfill before any application deploy.
WITH stations AS (
 SELECT id AS station_id,
   CASE WHEN json_valid(source_data_json)
    THEN json_extract(source_data_json, '$."_psipedia_breeder_club_profile_ids"')
    ELSE NULL END AS raw
 FROM directory_profiles WHERE category='chovatelske-stanice'
), pairs AS (
 SELECT DISTINCT station_id, j.value AS club_id
 FROM stations s JOIN json_each(
   CASE WHEN json_valid(raw) AND json_type(raw)='array' THEN raw ELSE '[]' END
 ) j WHERE j.type='integer' AND j.value>0
)
SELECT
 (SELECT COUNT(*) FROM pairs WHERE NOT EXISTS (
   SELECT 1 FROM directory_breeder_club_relations r
   WHERE r.station_profile_id=pairs.station_id AND r.club_profile_id=pairs.club_id
 )) AS legacy_pairs_missing,
 (SELECT COUNT(*) FROM directory_breeder_club_relations) AS canonical_station_club_links,
 (SELECT COUNT(*) FROM directory_breeder_club_relations r
  LEFT JOIN directory_profiles station ON station.id=r.station_profile_id
  LEFT JOIN directory_profiles club ON club.id=r.club_profile_id
  WHERE station.id IS NULL OR station.category<>'chovatelske-stanice'
     OR club.id IS NULL OR club.category<>'chovatelske-kluby') AS invalid_new_links;
