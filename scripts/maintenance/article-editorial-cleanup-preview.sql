-- PSIPEDIA production data repair: one-time cleanup of already imported
-- internal Notion tail sections from managed_articles.blocks_json.
--
-- REVIEW first; execute only after PR #1521 is merged and deployed.
-- No schema changes. No change to article identity, publication or updated_at.
-- Photo attribution ('Fotografia a licencia') is deliberately RETAINED:
-- the original copyright notice must remain until image_credit and
-- image_credit_url have been safely populated by the corrected sync.
--
-- 1. Preview which records would change:
WITH cuts AS (
  SELECT a.id, a.slug, MIN(CAST(b.key AS INTEGER)) AS first_private_index
  FROM managed_articles a,
       json_each(CASE WHEN json_valid(a.blocks_json) THEN a.blocks_json ELSE '[]' END) b
  WHERE json_extract(b.value, '$.type') = 'h2'
    AND json_extract(b.value, '$.text') IN (
      'Sociálne siete – interný návrh',
      'Sociálne siete — interný návrh',
      'Sociálne siete - interný návrh',
      'Redakčné poznámky',
      'Redakčné prvky pre administráciu',
      'Redakčné prvky pre Psipedia Admin',
      'Psipedia bloky',
      'Pred publikovaním',
      'Technické poznámky pre administráciu',
      'Synchronizačný manifest'
    )
  GROUP BY a.id, a.slug
)
SELECT id, slug, first_private_index FROM cuts ORDER BY id;

-- Read-only preview only. No changes are applied by this file.
