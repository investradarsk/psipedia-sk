-- MANUAL, REVIEW-GATED DATA TRANSFER — DO NOT EXECUTE DURING BUILD OR DEPLOY.
-- Run READ-ONLY preflight and record counts first. This statement only ADDS
-- missing breed_directory_relations for trainer profile IDs. It does not remove
-- or overwrite legacy JSON, and is idempotent thanks to the unique index.
-- IMPORTANT: old code writes trainer breed JSON. Keep this PR unmerged until a
-- migration and read-back gate verifies every trainer's expected links.
WITH trainer_source AS (
  SELECT p.id AS profile_id,
    CASE WHEN json_valid(p.source_data_json)
      THEN json_extract(p.source_data_json, '$."_psipedia_trainer_breed_ids"')
      ELSE NULL END AS raw
  FROM directory_profiles p
  WHERE p.category = 'treneri'
), safe_arrays AS (
  SELECT profile_id,
    CASE WHEN json_valid(raw)
      THEN CASE WHEN json_type(raw) = 'array' THEN raw ELSE '[]' END
      ELSE '[]' END AS values_json
  FROM trainer_source
)
INSERT OR IGNORE INTO breed_directory_relations
    (breed_id, profile_id, relation_type, source, created_at, created_by)
SELECT DISTINCT j.value, t.profile_id, 'trainer', 'trainer-json-backfill',
       CURRENT_TIMESTAMP, 'manual:trainer-breed-cutover'
FROM safe_arrays t
JOIN json_each(t.values_json) AS j
JOIN managed_breeds b ON b.id = j.value
WHERE j.type = 'integer' AND j.value > 0;
