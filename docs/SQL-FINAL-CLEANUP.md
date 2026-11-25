# SQL Final Cleanup — work in progress

Base inspected: `f95b2c26495f9d0a8fe39bee6e97411484fee635`. PR #1597 is open and also modifies directory-location-landings.ts; reconcile the canonical SQL projection after either branch lands. Do not merge/deploy this draft or execute production mutations.

## Inventory (verified candidates, not exhaustive)

| Directory column | Canonical SQL owner | State |
| --- | --- | --- |
| services_json | directory_profile_service_texts (ordered by item_order); service_profile_option_choices is independently authoritative for catalog Services V3 | location/breeder landings, portal search, Admin query, Notion bulk and directory search SQL projection changed; other writers/readers open |
| qualifications_json | directory_profile_qualifications | Notion bulk and directory search projection changed; other writers/readers open |
| seo_json | directory_profile_seo | directory sitemap and Notion bulk changed; field-event writes only relational owner; other writers open |
| source_data_json | contacts on directory_profiles, additional categories, directory_profile_review_state, media, facts and existing relation owners | already retired in production per owner; remaining direct partner/automation paths require review |
| thumbnail_display_json / detail_display_json | directory_profile_image_display_settings with display_context | existing detail/homepage projections are relational; create/update writes remain |

Projection aliases such as AS services_json are transport shapes, not reads of the retired physical column. Keep JSON API, technical payloads, JSON-LD, ordered SQL projections, and independently authoritative documents. Identically named SEO and image columns on events, articles, help/adoption/lost-found and organizations are NOT automatically retired: identify their actual SQL owner before touching them. Breed legacy readers, entity sitemap and SEO quality audit require additional verification.

## Remaining blockers

- Directory create/update builders and partner-new-profile approval: partner path calls the shared create builder without an observed services/qualifications relational write; implement and test the atomic companion writes before removing legacy bindings.
- Direct writes/mappings in app/api/admin/import/route.ts, lib/canonical-draft-service.ts, lib/partner-profile-changes.ts, lib/partner-canonical-workflow.ts, lib/data-automation-apply.ts, lib/data-automation-store.ts, lib/data-automation-update-review.ts. Audit exact live call sites, guards, Notion locks, and search_text refresh.
- Review all references in lib/directory-filter-contract.ts, lib/directory-sql-cutover-contract.ts, lib/admin-seo-quality-entities.ts, lib/breed-audit.ts, lib/entity-sitemap.ts, lib/breed-canonical.ts, lib/content-relations.ts and other scripts/schema. Historical migration/fixture references are not automatically runtime dependencies.
- Map query inspected: services SQL owner already used. Full runtime route coverage, search derived text parity, synchronization integration, remaining entity agendas and tests are not yet verified. Code search is indexed and bounded; no complete checkout was available.
- No full lint/build/CI/local repository tests executed in this session; fixtures modified for conflicting historical data. Check all fixture schemas, including search and Notion integration, and run required CI. No claim of merge readiness.

## Production read-only preflight (owner runs; no mutation)

First inventory the live schema. Execute the following separately:

```sql
SELECT name, sql FROM sqlite_schema
WHERE type IN ('table','view','trigger','index')
AND (name LIKE 'directory_%' OR name LIKE 'service_profile_%')
ORDER BY type,name;
```

```sql
SELECT m.name AS table_name,p.name AS column_name,p.type,p."notnull",p.dflt_value
FROM sqlite_schema m JOIN pragma_table_info(m.name) p
WHERE m.type='table' AND p.name LIKE '%json%'
ORDER BY m.name,p.cid;
```

```sql
SELECT id,name,applied_at FROM d1_migrations ORDER BY id DESC LIMIT 30;
```

Only if the inventory confirms services_json and qualifications_json still exist:
```sql
SELECT d.id,d.slug,
  json_array_length(CASE WHEN json_valid(d.services_json) THEN d.services_json ELSE '[]' END) AS old_services,
  (SELECT count(*) FROM directory_profile_service_texts s WHERE s.profile_id=d.id) AS sql_services,
  json_array_length(CASE WHEN json_valid(d.qualifications_json) THEN d.qualifications_json ELSE '[]' END) AS old_qualifications,
  (SELECT count(*) FROM directory_profile_qualifications q WHERE q.profile_id=d.id) AS sql_qualifications
FROM directory_profiles d
WHERE old_services <> sql_services OR old_qualifications <> sql_qualifications
ORDER BY d.id;
```

Count differences are candidates only. Equal counts are not value parity; inspect ordered values, invalid JSON, timestamps and explicit clears using the existing field parity/readiness tooling. A historical nonempty value and empty SQL is not permission to restore history. No blanket backfill.

```sql
SELECT d.id,d.slug
FROM directory_profiles d
LEFT JOIN directory_profile_seo s ON s.profile_id=d.id
WHERE s.profile_id IS NULL
ORDER BY d.id;
```

Missing SEO rows may mean defaults rather than missing migration. Check per-field canonical values, approved migration provenance and current writes before deciding. Also validate orphan children, image context values, uniqueness, integrity and foreign keys.

## Deployment / physical removal (not authorized)

1. Resolve blockers, reconcile #1597, run all relevant regressions and compare with latest main.
2. Owner verifies production schema and per-field parity, records intentional empty values, confirms backup and recovery point, and approves code deploy separately. Code must support both pre-drop and post-drop schemas.
3. Prove SQL-only reads/writes and permissions in isolated D1 after dropping candidate columns. No old application revision that reads dropped fields is eligible for rollback.
4. Observe production with the compatible code and verify canonical writes, all routes and sync before proposing a separately reviewed migration. Do not add automatic destructive migrations to this draft. Never regenerate Drizzle journal/snapshots or edit historical migrations.
5. Owner explicitly approves physical drop only after validation and a tested backup/restore plan. Before drop rollback is a compatible prior revision; after drop rollback requires a compatible revision or a separately reviewed schema/data restore with intervening writes reconciled. Never overwrite canonical SQL from stale legacy JSON.

Status: partial implementation, not merge-ready.
