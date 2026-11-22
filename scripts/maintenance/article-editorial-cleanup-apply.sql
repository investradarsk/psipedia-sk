-- PRODUCTION D1: MUTATING STEP. Execute ONLY after inspecting
-- article-editorial-cleanup-preview.sql and after PR #1521 is deployed.
-- Keeps original photo license blocks and does not change published_at/updated_at.

-- Apply after preview validation:
WITH cuts AS (
  SELECT a.id, MIN(CAST(b.key AS INTEGER)) AS first_private_index
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
  GROUP BY a.id
)
UPDATE managed_articles
SET blocks_json = (
  SELECT COALESCE(json_group_array(json(b.value)), '[]')
  FROM json_each(managed_articles.blocks_json) b
  WHERE CAST(b.key AS INTEGER) < (
    SELECT first_private_index FROM cuts WHERE cuts.id = managed_articles.id
  )
)
WHERE id IN (SELECT id FROM cuts);
