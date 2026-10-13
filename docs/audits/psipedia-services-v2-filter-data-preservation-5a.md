# PSIPEDIA-SERVICES-V2 / 5A — Generic import data preservation

Scope: `POST /api/admin/import/preview` → `buildGeneralImportPlan` → confirmed `POST /api/admin/import`. No production D1 migration/backfill, no Notion writes, no public facet activation.

## Protected now

- **New directory profile:** validated flat `_psipedia_filter_v1_*` keys from the existing `directory-filter-contract.ts` registry can be stored in `source_data_json` as canonical values, with no inference from descriptive text. New profiles still enter **Draft**.
- **Existing Draft/archived profile:** during read-only Preview the importer loads the existing `source_data_json` and `updated_at` and builds a merged source snapshot. Import fields absent, `null`, or an empty filter are **not deletions**. An explicit `unknown` remains different from a missing value.
- **Existing explicit filter (including `unknown`):** treated conservatively as protected, regardless of provenance. The importer may repeat an equivalent value but may not replace it with a different unreviewed assertion. Invalid values, foreign category keys, unknown `_psipedia_*` keys, inconsistent import-key identity and ambiguous duplicates reject Preview. No filter provenance field was invented.
- **Legacy source data:** every existing key, including quality/review metadata and arbitrary unknown nested values, is retained as-is unless a supported non-internal scalar import key explicitly supplies a non-null replacement. Import cannot forge internal metadata. The original import's safe scalar-only incoming contract remains (string, number, boolean).
- **Existing curated profile columns:** import no longer automatically changes existing status, removes empty service/qualification lists or text/contact values, or demotes previously true verified/featured flags. Existing publication state and image fallback are maintained.
- **Write-time guard:** one `INSERT ... ON CONFLICT DO UPDATE ... WHERE` statement per profile uses the snapshot of `source_data_json` and `updated_at`, matching category+slug, and refuses already-published rows. A zero-change result is an error requiring a new Preview. The merged JSON and other columns are applied together in one atomic SQL statement. No read-modify-write gap can overwrite an intervening source change.
- **Workflow:** preview → reject if any invalid record → explicit `confirmed: true` → SQL, with existing post-import resource anchoring/GEO reconciliation unchanged. Repeated imports are idempotent for protected facets.

## Not protected / next phase

- **Admin/partner edits** via `lib/directory-store.ts` (`safeImportData`, `normalizeManagedDirectoryProfileInput`, `buildManagedDirectoryProfileUpdateStatement`, `setManagedDirectoryProfileReviewed`): these rebuild `source_data_json` from the editor payload. The `safeImportData` projection keeps only string/number/null and can omit existing boolean or nested keys. These writers are **out of scope** and require a unified facet-aware patch strategy before 5B UI persists filters.
- **Other integrations/automation writes** (Notion synchronization and enrichment pipeline) are not routed through `buildGeneralImportPlan`; verify their exact D1 write paths and concurrency guards before turning on new field writes. Do not assume 5A protects them.
- **Generic import overall:** the existing 50-statement D1 batch boundary remains. A profile's upsert is atomic, but this phase does **not** provide an all-or-nothing transaction across separate batches/domains. A concurrent conflict discovered as a zero-change result can be reported after other non-conflicting statements in that import have committed; repeat Preview before retry.
- **Search text:** the generic import still computes `search_text` from incoming canonical profile fields; a separate follow-up should derive it from the effective merged columns when importing partial records. The current change protects missing existing source metadata and specified descriptive/contact columns, not every derived/auxiliary field.
- **Sources of authority:** human-reviewed filter provenance is not yet modeled. Therefore every existing explicit filter is protected, not merely fields with a review marker.

## Regressions

`tests/directory-import-preservation.test.mjs` validates tri-state/missing/null, new records, repeated updates, conflicts, protected metadata, SQLite atomic upsert, stale write rejection, published guard and identity guard. `tests/directory-import-sql.test.mjs` exercises placeholder/bind parity. These run in the full test suite alongside the existing preview/confirmation contracts.
