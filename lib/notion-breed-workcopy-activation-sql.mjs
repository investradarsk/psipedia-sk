/**
 * A single atomic SQLite UPDATE. MATERIALIZED freezes the complete cohort
 * eligibility before any status is changed. Never evaluate a running count of
 * SHADOW rows during the mutation itself.
 *
 * Bind order: old Notion data source ID, new Notion data source ID.
 */
export const breedWorkcopyAtomicActivationSql = `
WITH eligible AS MATERIALIZED (
  SELECT w.breed_id
  FROM breed_notion_workcopy_links AS w
  JOIN breed_notion_sync AS s ON s.breed_id=w.breed_id
  JOIN managed_breeds AS b ON b.id=w.breed_id
  WHERE w.status='SHADOW'
    AND w.original_notion_page_id=s.notion_page_id
    AND w.original_sync_receipt=s.content_hash
    AND w.canonical_slug=b.slug
    AND w.fci_number=b.fci_number
    AND w.original_data_source_id=?
    AND w.work_data_source_id=?
    AND w.work_sync_receipt=w.original_sync_receipt
    AND w.work_sync_receipt LIKE 'breed-field-v1:%'
), guard AS MATERIALIZED (
  SELECT
    (SELECT COUNT(*) FROM breed_notion_workcopy_links) AS total,
    (SELECT COUNT(*) FROM eligible) AS eligible_count
)
UPDATE breed_notion_workcopy_links
SET status='ACTIVE',
    verified_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    activated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE status='SHADOW'
  AND breed_id IN (SELECT breed_id FROM eligible)
  AND EXISTS (
    SELECT 1 FROM guard
    WHERE total=344 AND eligible_count=344
  )
`;
