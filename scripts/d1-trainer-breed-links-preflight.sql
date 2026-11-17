-- READ-ONLY D1 PRE/POSTFLIGHT. Each output is a count, not private data.
-- FIRST run before backfill: invalid_json, invalid_array, bad_ids, orphan_ids
-- must all be ZERO. legacy_pairs_missing must become ZERO after backfill.
WITH trainers AS (
  SELECT id AS profile_id,
    source_data_json,
    CASE WHEN json_valid(source_data_json)
      THEN json_extract(source_data_json, '$."_psipedia_trainer_breed_ids"')
      ELSE NULL END AS raw
  FROM directory_profiles WHERE category = 'treneri'
), arrays AS (
  SELECT profile_id, source_data_json, raw,
    CASE WHEN json_valid(raw)
      THEN CASE WHEN json_type(raw) = 'array' THEN raw ELSE '[]' END
      ELSE '[]' END AS values_json
  FROM trainers
), legacy AS (
  SELECT DISTINCT t.profile_id, j.value AS breed_id, j.type AS value_type
  FROM arrays t JOIN json_each(t.values_json) AS j
)
SELECT
  (SELECT COUNT(*) FROM trainers) AS trainer_profiles,
  (SELECT COUNT(*) FROM trainers WHERE NOT json_valid(source_data_json)) AS invalid_json,
  (SELECT COUNT(*) FROM arrays
   WHERE raw IS NOT NULL AND NOT
     (CASE WHEN json_valid(raw) THEN json_type(raw) = 'array' ELSE 0 END)) AS invalid_array,
  (SELECT COUNT(*) FROM legacy
   WHERE value_type <> 'integer' OR breed_id <= 0) AS bad_ids,
  (SELECT COUNT(*) FROM legacy l
   LEFT JOIN managed_breeds b ON b.id = l.breed_id
   WHERE l.value_type = 'integer' AND l.breed_id > 0 AND b.id IS NULL) AS orphan_ids,
  (SELECT COUNT(*) FROM legacy l WHERE l.value_type = 'integer' AND l.breed_id > 0
   AND NOT EXISTS (
     SELECT 1 FROM breed_directory_relations r
     WHERE r.profile_id = l.profile_id AND r.breed_id = l.breed_id
   )) AS legacy_pairs_missing,
  (SELECT COUNT(*) FROM breed_directory_relations r
   JOIN directory_profiles p ON p.id = r.profile_id
   WHERE p.category = 'treneri') AS trainer_relation_rows;
