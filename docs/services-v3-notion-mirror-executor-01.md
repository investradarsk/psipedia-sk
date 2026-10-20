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
- No in-process fallback for the lease. A durable cross-instance lock, expiry and failure handling must be supplied by a separately approved future worker.
- Registry completeness, initial mappings, unique page ownership and actual Notion catalog schema require independent verification. 0134 has no global UNIQUE for Notion page ID. Existing receipts are checked in the transaction, but no new mapping migration is performed.
- HTTP transport requires server-owned Notion token, approved catalog-specific data-source and distinct typed property map. Its writes default to disabled and require explicit allowWrites=true in a future approved internal worker. No Notion -> D1 catalog changes.
- No new catalog, categorization, editors, public endpoints, Gemini or Facebook changes, profile migrations, bulk operations, deletion, or automatic approval.

## Migration and disabled gates

- **0134: APPLIED & VERIFIED on production (2026-10-20, run #39474059819).** Catalog/Notion feature activation remains BLOCKED for independent reasons.
- Existing flags SERVICE_CATALOG_ADMIN_WRITES_ENABLED and SERVICE_CATALOG_NOTION_MIRROR_READY are untouched and not activated.
- New executor-only flag mirrorExecutor is required by the injected worker dependencies, and defaults off; no environment variable, cron, worker or deployment is added.
- Before any future Notion writer rollout: approve catalog-only Notion data-source schema and exact property mapping; verify static option ID/page ownership; provide durable cross-worker lease; complete staging acceptance, restricted token, observability, security/CI review, and separate owner approval for internal worker, feature flags and deployment. Never reapply 0134.

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
- Remaining before live sync: complete option-to-page ownership registry, authenticated internal runner, durable per-option cross-worker lease and staging acceptance. Feature flags and all Notion/D1 writes remain OFF pending separate approval.

## Read-only Notion workspace check — 2026-10-20

The connected Psipedia Editorial Hub lists a Notion **Adresár** database for directory/profile records, not a positively identified dedicated Services V3 catalog. A restricted workspace keyword search also did not verify a suitable catalog with the required nine distinct option properties. This is **not** evidence of global absence; the catalog may exist outside the searched scope.

**Fail-closed:** Do not point the adapter at Adresár, derive options from its free-text `Služby` field, create catalog pages, or enable `allowWrites` until a purpose-built catalog source, property mapping, and option-to-page registry have been positively verified and approved.
