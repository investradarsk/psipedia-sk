# GEMINI-LOST-FOUND-NOTION-1 — canonical target unresolved

**Status: BLOCKED.** Read-only audit and inert offline draft contract. No worker routing, Notion write, Gemini paid call, schedule or production configuration change.

## Evidence — 14 October 2026

- Starting main: e2d592a0126254d37c8c9306374540325c49cfbd, which includes merged PR #833.
- lib/notion-events-help-sync.ts defines lost-found with title Stratené a nájdené, title field Názov, and loadNotionBulkLostFound.
- lib/notion-bulk-sources.ts maps D1 lost_found_dog_reports to Notion, including Psipedia ID, URL Psipedia, Typ, Dátum udalosti, Zdroj URL.
- lib/notion-canonical-target.ts persists canonical data source ID in production D1 notion_agenda_targets. Without a persisted match, it scores identity-row counts; this is not sufficient evidence for high-risk Lost/Found writes.
- Database 811d0659-7217-4914-a27c-1cd67bda3e0e has canonical-shaped data source 3ed793fc-1d18-8122-95b9-000b05c3c6bd.
- Database b7c978b6-bbfd-460b-b489-30e0814b0ddd has canonical-shaped data source 3ed793fc-1d18-8141-bc25-000bc25ab39b.
- Both databases have a synchronized page with Psipedia ID=1 and the same slug and URL. Their record page IDs are 3ed793fc-1d18-818a-938c-f6630c6762b3 and 3ed793fc-1d18-8110-8809-f0edf9f3222e.
- This Notion connection supports reading schema and individual pages but not querying complete Notion data sources. Production D1 mapping could not be read in this audit.

## Required unblock — read-only in production D1

```sql
SELECT agenda, database_id, data_source_id, target_title, title_property, updated_at
FROM notion_agenda_targets WHERE agenda = 'lost-found';
```

```sql
SELECT agenda, notion_page_id, entity_id FROM notion_agenda_sync
WHERE agenda = 'lost-found' ORDER BY entity_id ASC;
```

Verify the returned data_source_id against a fresh Notion data source schema and mapped page-parent identifiers. Missing, conflicting or uncertain mapping means BLOCKED. Never select by title, record count or recency. Never rewrite the mapping just to enable this category.

## Inert code prepared

- Pure scripts/gemini-notion-lost-found-fields.mjs (no network): exact schema, STRATENÝ/NÁJDENÝ -> LOST/FOUND, OPEN only, recent dated case, same-day verification, grounded HTTPS sources, field-level evidence, municipality-only location, exclusion of contacts/precise location, completed Notion scan and conservative identity/source duplicate checks.
- Draft-only payload with Psipedia stav=DRAFT. Never emits Slug, Psipedia ID, precise coordinates, contacts, publication or resolution fields.
- 32 isolated tests pass locally using node --test tests/gemini-lost-found-contract.test.mjs.
- Offline worker suite imports the tests. Its existing check that help.stratene-a-najdene remains unsupported is preserved intentionally.

## Outstanding (DO NOT MARK PASS)

After confirmed D1 mapping: wire the existing worker with separately configured NOTION_LOST_FOUND_DATA_SOURCE_ID, assert it equals independently confirmed canonical target, perform a fresh exhaustive scan before every POST, and add fully mocked category-specific E2E including Notion timeout/5xx, uncertain POST with zero retries, HMAC callback, 21-category regression and build.

**BLOCKED. No merge, activation, paid Gemini call or production Notion write.**
