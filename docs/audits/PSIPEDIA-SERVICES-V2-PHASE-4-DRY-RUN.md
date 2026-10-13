# PSIPEDIA-SERVICES-V2 — fáza 4/10: FILTER REGISTRY & DATA DRY-RUN

**Baseline:** `main` `4b40d17a80446e805e359c1bcec1260f731d5450` (PR #764/#778/#786 merged). **Scope:** contract + offline audit utility + isolated tests only. No D1/Notion/admin/public writes, migrations, backfill or faceted UI.

## Source inventory / provenance (static code audit + live READ-ONLY Notion schema, NOT live D1/row audit)

| Source | Existing shape | Reliable structured? | Phase-4 disposition |
| --- | --- | --- | --- |
| D1 `directory_profiles.category/status`, `region/district/city` | typed columns, category validated by `lib/directory.ts`; location normalized in store | Yes for stored fields; completeness unknown | Reuse; no change |
| D1 `services_json`, `qualifications_json` | arrays of free-text strings; `safeList` trims at read | Array structure yes; categorical semantics no | Diagnostic legacy text, never infer yes/no |
| D1 `source_data_json` | import-origin flat object with keys `Plemeno/Plemená`, `FCI skupina/FCI`, `Organizácia/Zastrešujúca organizácia`, `Typ služby/Typ poskytovateľa/Typ klubu` used by `DIRECTORY_SOURCE_FACETS` | No controlled enum or provenance check | Legacy-only; not evidence for new facets |
| D1 address/service confirmation, contact and quality review metadata | explicit columns/metadata merged by store | Structured in their own domains | Out of scope; do not reuse as new facet truth |
| Notion directory `Služby`, `Kvalifikácie` | rich text split by newlines or semicolons; `Kategória` and `Psipedia stav` are explicit | Service descriptions unstructured | Retain existing mapping, no schema write |
| Notion planned `Filter · <category>.<name>` | NOT part of current `notionSnapshot`, `notionProfileProperties` or hash | NOT provisioned / NOT synchronized | Proposed `select` only; **not** a claim field exists |

Current public GET filters (`q/category/region/district/city/service/breed/fci/organization/type/sort/page`) remain in `lib/directory-query.ts`/`directory-store.ts`. Ten canonical categories are declared in `lib/directory.ts`; two legacy categories are not new service categories. Registry adds 21 proposed fields across all ten. All tri-state filters accept only explicit **yes / no / unknown** (or literal áno/nie); **missing, empty, implicit Notion checkbox false, unknown descriptive text never become no**. Invalid/conflicting data requires review, and unknown is excluded from future positive/negative public facets until explicit acceptance.

## Critical loss / conflict boundaries verified in source

1. `safeImportData` in `lib/directory-store.ts` passes through scalar strings/numbers/null (not nested objects or booleans); current `normalizeManagedDirectoryProfileInput` merges contact/quality metadata from existing `importData`, so an approved flat string key can survive **that specific editor update path**. This is **not** a verified end-to-end Notion/import guarantee.
2. General import in `app/api/admin/import/route.ts` reconstitutes `source_data_json` from submitted top-level primitive fields and **replaces** `source_data_json` on upsert of draft profiles. A future facet stored solely in source JSON may be erased if absent from another import payload. Published profiles are skipped by `buildGeneralImportPlan`, not proof of retention for all states.
3. `notion-directory-sync.ts` hashes the `EditableDirectorySnapshot` field whitelist; proposed facets are not in snapshot, property projection or the hash. D1-only facet edits cannot reliably trigger a Notion push; Notion cannot round-trip them. Both-direction concurrent edits may conflict and must not use last-writer-wins for new fields.
4. `safeImportData` is a filter and does not validate the proposed registry schema; it also excludes boolean primitives. Notion checkbox false is not a trustworthy explicit 'no'. Do not wire a checkbox without a separate explicit provenance mechanism.
5. A live read-only Notion schema fetch **was** performed (see below), but Notion row queries require a higher plan and no D1 production reader is attached. **Per-category counts, real value distributions, production backfill eligibility and existing D1 facet-key values remain UNKNOWN.** The prior phase-1 local audit recorded 248 published kynological-club profiles; that was a partial **local** dataset, not a production sample. The phase-4 report must not turn this into production coverage.

## Verified Notion schema (read-only, 13 October 2026)

- Database: [Adresár](https://app.notion.com/p/fbaad6872adf4784b22c4290c3580c93), data source `collection://84e0664c-ca47-405f-9d54-31b20287bc8c`.
- The fetched **live** schema contains **72 properties**. `Kategória`, `Služby`, `Kvalifikácie` are **text** properties; `Psipedia stav` is a **select**. `Online` remains a checkbox in the Notion schema, but is not a valid implicit NO or proposed category facet.
- **Zero** property names start with `Filter ·` or `Facet`; all 21 proposed Notion select properties are **not provisioned**. Do not enable writes or sync projection before an explicitly approved schema phase.
- This confirms **schema names/types**, **not populated row values**, validation of any 21 candidate values, profile counts, or cross-system conflicts. `query_data_sources` was unavailable on the connected plan, so no Notion row sampling took place.

## Registry contract

- `lib/directory-filter-contract.ts`: version 1, 10 category slugs, stable `<category>.<name>` IDs, label, type, allowed values, unknown policy, proposed flat D1 `source_data_json` key, proposed Notion **select** property, legacy aliases and version.
- Non-mutating `normalizeDirectoryFilterValue`, `readDirectoryFilterValue`, `reconcileDirectoryFilterValue`. Pure `mergeDirectoryFilterValues` rejects invalid/category-mismatched changes and preserves unrelated JSON keys; **not integrated with existing writers yet**.
- Flat proposed `_psipedia_filter_v1_...` values are scalars, so later adapters can preserve them through current import-data primitive handling; future adapters must also protect them from general import replacement and add complete Notion snapshot/hash/write/read logic.
- Existing legacy facet source inventory documented as `existingDirectoryFacetSources` with `structured:false`. No inference from descriptions, service lists, vague phrases, or provider status.

## Reproducible read-only dry-run

Run on an **authorized** local JSON export (the script never fetches live data and never prints names/IDs):

```bash
node --experimental-strip-types --test tests/directory-filter-contract.test.mjs
node --experimental-strip-types scripts/directory-filter-dry-run.mjs ./private/directory-export.json
```

Example export query against an explicitly authorized **read-only** D1 connection (not run in this PR):

```sql
SELECT category, source_data_json, services_json FROM directory_profiles;
```

Summary includes scanned rows, excluded legacy category records, per-category records, recognized explicit facet values, unknown, invalid, malformed JSON and legacy text indicators. All 21 new proposed keys will normally be absent unless a separately approved source has already populated identical keys; absence is **unknown**, not **no**. Report does not label free-text aliases as structured. To audit cross-system conflicts, future scoped Notion read-only export must compare explicit Notion select properties to D1 via `reconcileDirectoryFilterValue` keyed by a **verified one-to-one profile mapping**. Never compare by name alone.

## Phase 5/10 gates: admin/partner editor adapters

1. Confirm final field taxonomy and allowed enums with product owner; validate that each proposed Notion property can exist (permissions/schema/API size and Notion data source ID). Read-only live snapshot/schema inventory first.
2. Add explicit per-facet editor controls with **three states** and differentiated untouched/changed semantics. Do not default blank/unchecked to 'no'. Preserve unknown and collect editor provenance for manual changes.
3. Integrate pure merge with canonical D1 update *and* general import/export, including reviewed existing source keys, atomic updates and optimistic concurrency; test create, update, legacy import, stale payload, draft/published, absent field and rollback. No UI or live writes in phase 4.
4. Extend Notion fields, snapshot/hash, conflict handling and both-direction mirror **only after approved schema setup**, with partial-schema fail-closed, authoritative source rules and reconciliation queues. Exercise D1→Notion→D1 and Notion→D1→Notion test fixtures before enabling sync.
5. Public category query/filter and indexing remain deferred to subsequent phases; exclude unknown and unsynchronized data. Never claim production completeness without read-only D1/Notion measurements.

**Tests in this PR are authored for Node's targeted `--experimental-strip-types` runner. No local connected repository runtime / live D1 / live Notion was available to execute or measure them during preparation; CI outcomes must be checked on PR.**
