-- READ-ONLY inventory before removing expensive public canonical winner logic
-- and historical breed-name fallbacks. Run on psipedia-sk-db; no writes.
WITH published AS (
  SELECT id, fci_number, slug, TRIM(COALESCE(import_key,'')) AS import_key,
         fci_group, seo_json
  FROM managed_breeds WHERE status='published'
), duplicate_fci AS (
  SELECT fci_number FROM published WHERE fci_number>0
  GROUP BY fci_number HAVING COUNT(*)>1
), duplicate_slug AS (
  SELECT slug FROM published WHERE TRIM(slug)<>''
  GROUP BY slug HAVING COUNT(*)>1
), duplicate_import AS (
  SELECT import_key FROM published WHERE import_key<>''
  GROUP BY import_key HAVING COUNT(*)>1
)
SELECT
  (SELECT COUNT(*) FROM published) AS published_breeds,
  (SELECT COUNT(*) FROM duplicate_fci) AS duplicate_fci_numbers,
  (SELECT COUNT(*) FROM duplicate_slug) AS duplicate_slugs,
  (SELECT COUNT(*) FROM duplicate_import) AS duplicate_import_keys,
  (SELECT COUNT(*) FROM published WHERE fci_number IS NULL OR fci_number<=0) AS invalid_fci_numbers,
  (SELECT COUNT(*) FROM published
   WHERE TRIM(COALESCE(slug,''))='' OR slug GLOB '*[^a-z0-9-]*') AS invalid_slugs,
  (SELECT COUNT(*) FROM published WHERE import_key='') AS missing_import_keys,
  (SELECT COUNT(*) FROM published WHERE NOT json_valid(seo_json)) AS invalid_seo_json,
  (SELECT COUNT(*) FROM published WHERE json_valid(seo_json)
     AND COALESCE(json_extract(seo_json,'$.noindex'),0)<>0) AS noindex_published,
  (SELECT COUNT(*) FROM directory_profiles p
   WHERE p.status='published' AND p.category='chovatelske-stanice'
     AND (
       COALESCE(TRIM(CAST(json_extract(CASE WHEN json_valid(p.source_data_json)
         THEN p.source_data_json ELSE '{}' END,'$."Plemeno"') AS TEXT)),'')<>''
       OR COALESCE(TRIM(CAST(json_extract(CASE WHEN json_valid(p.source_data_json)
         THEN p.source_data_json ELSE '{}' END,'$."Plemená"') AS TEXT)),'')<>''
     )
     AND NOT EXISTS (
       SELECT 1 FROM breed_directory_relations r WHERE r.profile_id=p.id
     )) AS breeders_legacy_text_without_relations;
