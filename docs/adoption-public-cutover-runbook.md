# Canonical adoption public cutover

Migration `0039_activate_canonical_adoptions.sql` activates only rows whose
`created_by` is `adoption-staging-import:v1`. Its preflight and postflight guards
must both succeed; otherwise D1 rolls back the migration transaction.

## Read-only production verification

```sql
SELECT COUNT(*) AS total,
  SUM(status = 'ACTIVE') AS active,
  SUM(status = 'DRAFT') AS draft,
  SUM(status = 'RESERVED') AS reserved,
  SUM(published_at IS NOT NULL) AS published,
  COUNT(DISTINCT slug) AS unique_slugs,
  SUM(organization_id IS NOT NULL) AS linked,
  COUNT(DISTINCT organization_id) AS organization_count
FROM adoption_dogs
WHERE created_by = 'adoption-staging-import:v1';

SELECT organization.import_key, COUNT(*) AS adoption_count
FROM adoption_dogs dog
JOIN help_organizations organization ON organization.id = dog.organization_id
WHERE dog.created_by = 'adoption-staging-import:v1'
GROUP BY organization.import_key
ORDER BY adoption_count DESC;

SELECT COUNT(*) AS invalid_snapshots
FROM adoption_dogs dog
LEFT JOIN help_organizations organization ON organization.id = dog.organization_id
WHERE dog.created_by = 'adoption-staging-import:v1'
  AND (organization.id IS NULL OR dog.organization_name <> organization.name OR dog.organization_slug <> organization.slug);

SELECT COUNT(*) AS hold_count
FROM adoption_dogs
WHERE slug IN ('charlie-hlada-novy-domov', 'kira-hlada-novy-domov', 'aisha-hlada-novy-domov', 'max-hlada-novy-domov');

SELECT category, COUNT(*) AS row_count
FROM help_cases
WHERE category IN ('adopcia', 'utulky')
GROUP BY category
ORDER BY category;

SELECT COUNT(*) AS total,
  SUM(status = 'DRAFT') AS draft,
  SUM(published_at IS NOT NULL) AS published,
  SUM(archived_at IS NOT NULL) AS archived
FROM help_organizations;
```

Expected results are `36 / 36 ACTIVE / 0 DRAFT / 0 RESERVED / 36 published /
36 unique / 36 linked / 4 organizations`, distribution `16 / 9 / 7 / 4`, zero
invalid snapshots, zero HOLD rows, legacy counts `36 adopcia / 104 utulky`, and
canonical organizations unchanged at `106 DRAFT / 0 published / 0 archived`.

## Rollback

Use a separately reviewed emergency migration. Do not edit or delete legacy rows.
The rollback must first assert the cohort is exactly 36 ACTIVE rows, all 36 have
the cutover publication timestamp and `updated_by = 'adoption-public-cutover:v1'`,
and none is RESERVED. Then execute one transaction-scoped update:

```sql
UPDATE adoption_dogs
SET status = 'DRAFT',
    published_at = NULL,
    updated_at = '<one deterministic rollback timestamp>',
    updated_by = 'adoption-public-cutover-rollback:v1'
WHERE created_by = 'adoption-staging-import:v1'
  AND status = 'ACTIVE'
  AND updated_by = 'adoption-public-cutover:v1';
```

Postflight must assert 36 DRAFT, zero ACTIVE/RESERVED, zero published, 36 linked,
four organizations, zero HOLD rows, and unchanged legacy counts. The canonical
catalogue then becomes empty while the retained hardened legacy detail fallback
continues serving published legacy adoption details.
