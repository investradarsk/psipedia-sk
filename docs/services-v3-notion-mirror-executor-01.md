# SERVICES-V3-NOTION-MIRROR-01 — isolated Draft, NOT deployed

Related issue #917, merged #897 and #913. Existing contract: docs/services-v3-notion-receipt-proof-contract-01.md.

## Verified architecture before this patch

- D1 schema 0133 stores canonical option IDs, semantics, statuses and CAS versions.
- D1 schema 0134 contains append-only audit and receipt tables and the exact-version approval trigger. Its source is pinned; **production 0134 APPLIED & VERIFIED** (owner-approved GitHub Actions [#39474059819](https://github.com/investradarsk/psipedia-sk/actions/runs/39474059819), 2026-10-20). Migration apply, postflight, HTTP and desktop/mobile smoke all passed.
- Phase 3C's internal recordCatalogMirrorOutcome is not a trusted atomic receipt writer.
- Receipt-proof PR #913 validates independently read Notion data but does not write or commit.

## Implementation: private D1 -> Notion -> readback -> verified receipt

1. The new executor requires all three internal flags explicitly true, full 0134 schema preflight, an injected cross-worker exclusive per-option lease and a complete trusted option-to-page registry. No HTTP route, scheduler or background runner invokes it.
2. Read exactly one DRAFT/PENDING D1 option at version v and its canonical fields. Validate the existing registered Notion page ID, catalog-only data-source parent and canonical source identity through a pre-write GET. Missing, ambiguous or conflicting mappings fail closed. No automatic page creation.
3. PATCH only the nine mapped catalog properties (stable ID, source version, kind, display name, group, meaning, primary category, categories, tri-state kind). The historical free-text Notion profile field Služby must never be mapped or inferred. No unrelated profile mutations.
4. Independently GET the page after PATCH. Hash parsed remote semantics with SHA-256, validate source identity/version, parent, page, archive state, last-edit/fetch clock, payload and strict canonical projection using the existing contract. A successful HTTP PATCH response is not evidence.
5. Re-read D1 identity/version/semantics and mappings/receipts before a guarded atomic D1 batch.
6. Batch conditionally INSERTs the append-only receipt for v+1 and CAS-updates option DRAFT/PENDING v to DRAFT/SYNCED v+1. On invalid CAS, the scalar SELECT for receipt option_id returns NULL and the non-null receipt constraint aborts and rolls back the batch. Cross-option receipt page ownership is additionally checked in SQL. No unpaired recordCatalogMirrorOutcome.
7. A result is VERIFIED only after a successful D1 batch and post-commit state read. Otherwise report RETRY, REVIEW or BLOCKED. D1 remains PENDING absent other authorized concurrent edits.

## Replay, uncertainty and authority boundaries

- Remote timeout after PATCH: state unknown. Never insert receipt. Reacquire the cross-worker exclusive lease, pre-read existing page, repeat the same semantic PATCH, then require a fresh GET and D1 CAS.
- Duplicate version/receipt and stale D1 edit: reject; no blind overwrite.
- Remote 403/429/timeout, missing readback, wrong page/parent, content divergence: no verified receipt; explicit retry/review result.
- No in-process mutex fallback. A separately scoped, no-expiry cross-worker D1 lease is now implemented over the existing 0124 coordination table; uncertain outcomes retain the lock for operator review. It remains disconnected from production entrypoints.
- Registry completeness, initial mappings, unique page ownership and actual Notion catalog schema require independent verification. 0134 has no global UNIQUE for Notion page ID. Existing receipts are checked in the transaction, but no new mapping migration is performed.
- HTTP transport requires server-owned Notion token, approved catalog-specific data-source and distinct typed property map. Its writes default to disabled and require explicit allowWrites=true in a future approved internal worker. No Notion -> D1 catalog changes.
- No new catalog, categorization, editors, public endpoints, Gemini or Facebook changes, profile migrations, bulk operations, deletion, or automatic approval.

## Migration and disabled gates

- **0134: APPLIED & VERIFIED on production (2026-10-20, run #39474059819).** Catalog/Notion feature activation remains BLOCKED for independent reasons.
- Existing flags SERVICE_CATALOG_ADMIN_WRITES_ENABLED and SERVICE_CATALOG_NOTION_MIRROR_READY are untouched and not activated.
- Internal runner now reads `SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED` and optional `SERVICE_CATALOG_NOTION_PAGE_CREATES_ENABLED` gates; both default OFF and are absent from Wrangler. No route, cron, job or deployment is added.
- Before any future Notion writer rollout: catalog schema is now verified, and a D1 lock adapter plus internal library coordinator exist. Still independently verify production 0124 lock availability, dynamic D1 options and page ownership; complete staging acceptance, restricted token, observability, security/CI review, operator-authenticated invocation and separate owner approval for flags and deployment. Never reapply 0134.

## Offline tests and CI

Path-scoped .github/workflows/services-v3-notion-mirror-offline.yml uses Node 22.16 and read-only GitHub permissions. Test command:

    node --experimental-strip-types --test tests/service-catalog-notion-receipt-proof.test.mjs tests/service-catalog-notion-mirror-executor.test.mjs

Tests use in-memory SQLite 0133+0134 and mocked Notion transport, with success, mismatch, wrong ID/source, missing link, replay, timeout after remote write, Notion failure, failed readback, stale revision, forced DB CAS rollback, off flags, missing migration, wrong target and unauthorized profile-field checks.

**This isolated Draft PR performed no production D1/Notion writes, real synchronization, flags, merge or deployment.** The separate owner-approved 0134 deployment has since succeeded (see run #39474059819).

## Dedicated Notion catalog created — 2026-10-20

- Notion database: [Katalóg služieb V3](https://app.notion.com/p/0e111896e6a747439adac19cf76fde30), in Psipedia Editorial Hub.
- Catalog data source (not Adresár): `8785fd64-36c3-4acf-aade-ad99c30ad45d`; `collection://8785fd64-36c3-4acf-aade-ad99c30ad45d`.
- Confirmed Notion field names (nine typed fields): `optionId` = `Option ID` (text), `optionVersion` = `Verzia` (number), `kind` = `Typ` (select), `label` = `Názov` (title), `group` = `Skupina` (text), `meaning` = `Význam` (text), `primaryCategory` = `Hlavná kategória` (select), `categories` = `Kategórie` (multi_select), `valueKind` = `Druh hodnoty` (select).
- Both category fields use the approved ten category slugs; type values `service`, `attribute`, value-kind `tri_state`.
- Read-only query verified 0 catalog pages immediately after creation. Nothing migrated from Adresár, generated, published or synchronized.
- The pinned `createPsipediaServiceCatalogNotionHttpPort` maps exactly this source; default write capability remains disabled, and no production runner calls it.
- **Profile links are canonical D1 records**: option definitions from `service_catalog_admin_options` are associated with profile IDs through `service_profile_option_choices(profile_id, option_id)` and attribute values through `service_profile_property_values(profile_id, property_id)`. A Notion catalog entry is NOT a copy of a directory profile and there is no live Notion-to-Notion profile relation.
- A new disabled-by-default, **read-only registry adapter** now discovers existing catalog pages through the pinned Notion `POST /v1/data_sources/{id}/query` endpoint (a read operation), exhausts pagination and refuses wrong parents, malformed fields, duplicate owners and incomplete results. It never creates pages or reads profile pages. Offline pagination/identity tests cover its contract.
- Remaining before live sync: initial creation and approval of canonical option pages (currently zero) plus their complete page ownership; authenticated internal runner, durable cross-worker lease and staging acceptance. Feature flags and all Notion/D1 writes remain OFF pending separate approval.

## Durable cross-worker lease and internal coordinator — implementation prepared, OFF

- Reuses the existing D1 table `gemini_notion_review_locks` from migration **0124**, but exclusively under the separate key prefix `psipedia:services-v3:catalog:` followed by an immutable dynamic option ID. The Gemini Notion reviewer uses UUID-based page keys, so these namespaces do not overlap. **No new D1 migration or table** is added.
- `createServicesV3CatalogD1Lease()` acquires its cross-worker exclusive lease by one atomic `INSERT OR IGNORE` with a random owner and releases only by owner-matched `DELETE` after `VERIFIED`, `CREATED_NEEDS_MIRROR`, `EXISTS` or read-only `BLOCKED` outcomes.
- `REVIEW`, `RETRY` and exceptions retain the D1 lock indefinitely. **No expiry, automatic cleanup, or blind retry.** This deliberately prefers manual investigation to duplicate Notion POST/PATCH or an uncertain receipt. Any emergency recovery would require an independent owner-approved read-only assessment; the PR adds no unlock endpoint or mutation tool.
- `inspectServicesV3CatalogLease()` exposes an explicit **read-only** per-option lock status. No lock token/owner is returned to untrusted callers.
- `runServicesV3CatalogInternal()` is a **library-only** composition for precisely three actions: `INVENTORY`, `PROVISION_ONE`, `MIRROR_ONE`. It requires a trusted server-owned `authorize()` callback and a server-side `NOTION_API_TOKEN`; no HTTP route, Cron, queue or public UI calls it.
- `INVENTORY` is read-only and may run with writes disabled. `PROVISION_ONE` and `MIRROR_ONE` require **all three** exact `true` gates: `SERVICE_CATALOG_ADMIN_WRITES_ENABLED`, `SERVICE_CATALOG_NOTION_MIRROR_READY`, `SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED`. Creation additionally requires `SERVICE_CATALOG_NOTION_PAGE_CREATES_ENABLED=true`. These two latter variables are **not present** in production `wrangler.jsonc`. The Notion port itself also separately requires `allowWrites/allowCreates` for creation.
- The transport is hard-pinned to the newly created catalog-only Notion data source. It never maps or writes the existing Notion Adresár `Služby` field, copies profiles, changes the static V0.3 catalog or automatically creates an unknown option.
- Offline integration tests now exercise **the complete controlled lifecycle**: D1 0133/0134 DRAFT/PENDING → read-only Notion inventory → single catalog page create → verified Notion GET and mapping → exact-version Notion PATCH/readback → atomic D1 receipt and SYNCED/version increment. Tests confirm no directory/profile mutation and owner-lock release after VERIFIED.
- Additional cross-worker regression simulates a Notion create timeout after POST: the D1 lease is retained, a fresh second invocation cannot issue another POST and no D1 receipt is fabricated.
- All scenarios use local SQLite schemas 0124/0133/0134 and fake Notion HTTP. Passing these tests demonstrates **isolated implementation behavior**, not live production authentication, D1 connectivity, staging validation or active synchronization.
- **Still to close:** a read-only production D1 count of `service_catalog_admin_options`, operator-authenticated invocation integration and review, staging sandbox Notion + D1 proof including cross-isolate interruption, independently approved live bootstrap/flag activation and real monitoring. Do not auto-apply 0133/0134 or provision any actual Notion option pages without separate owner authorization.

## Catalog page creation — manual-only code path, still NOT activated

- New **read-only** `buildServicesV3NotionBootstrapInventory()` compares dynamic D1 canonical options, full Notion catalog registry and 0134 immutable receipts. It does not include static V0.3 definitions, does not read directory profile free text, does not mutate D1, and never creates pages.
- `createPsipediaServiceCatalogNotionHttpPort().createPage()` is **double-gated**: both `allowWrites:true` and `allowCreates:true` are required. It creates exactly one Notion catalog page containing only nine approved properties under the pinned catalog data source; nothing is published.
- `provisionServiceCatalogNotionPage()` is an **uninvoked, opt-in internal function** requiring four explicit server flags, complete D1 0134 schema, a trusted cross-worker durable lease, full inventory without orphan/conflict and a canonical DRAFT/PENDING dynamic option missing a Notion page. It never runs from a route, cron or deployed worker.
- After a manual page create it independently reads the new Notion page, validates exact source/ID/version/typed fields, checks canonical D1 again for concurrent edits, and confirms one-to-one page ownership from a full fresh registry scan. It NEVER marks an option SYNCED: existing mirror executor and receipt-proof engine must do that separately.
- **Any unknown POST outcome is REVIEW, never automatic retry**. When Notion query indexing lags, report REVIEW and inspect read-only instead of issuing a second POST. The code does not claim global exactly-once guarantee without a provided durable lease.
- The real production D1 count of dynamic options is **not yet verified**. The Notion data source was empty when created; this is not evidence that production D1 already has any dynamic options.
- Tests use fake Notion responses and in-memory SQLite. No real token, Notion POST, production D1 write, profile mutation or rollout was executed.
- **Remaining operational work:** approved production read-only inventory, provision only actual D1 DRAFT/PENDING options where needed, wire genuine server-owned serialization and authenticated runner under separate approval, staging readback/receipt acceptance, then separately approve flags and deploy. Do not replay migrations 0133/0134.

