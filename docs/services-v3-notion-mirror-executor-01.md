# SERVICES-V3-NOTION-MIRROR-01 — isolated Draft, NOT deployed

Related issue #917, merged #897 and #913. Existing contract: docs/services-v3-notion-receipt-proof-contract-01.md.

## Verified architecture before this patch

- D1 schema 0133 stores canonical option IDs, semantics, statuses and CAS versions.
- D1 schema 0134 contains append-only audit and receipt tables and the exact-version approval trigger. Its source is ready; **production application is UNKNOWN**.
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

- **0134: SOURCE_READY / PRODUCTION_VERIFIED UNKNOWN / production activation BLOCKED.**
- Existing flags SERVICE_CATALOG_ADMIN_WRITES_ENABLED and SERVICE_CATALOG_NOTION_MIRROR_READY are untouched and not activated.
- New executor-only flag mirrorExecutor is required by the injected worker dependencies, and defaults off; no environment variable, cron, worker or deployment is added.
- Before future production rollout: owner-authorized 0134 deployment by separate task; direct read-only D1 schema verification; approved Notion data-source schema and static ID/page ownership mapping; durable lock provider; staging acceptance; restricted Notion token; observability for failures; security/CI review; separately approved worker, feature flags and deploy.

## Offline tests and CI

Path-scoped .github/workflows/services-v3-notion-mirror-offline.yml uses Node 22.16 and read-only GitHub permissions. Test command:

    node --experimental-strip-types --test tests/service-catalog-notion-receipt-proof.test.mjs tests/service-catalog-notion-mirror-executor.test.mjs

Tests use in-memory SQLite 0133+0134 and mocked Notion transport, with success, mismatch, wrong ID/source, missing link, replay, timeout after remote write, Notion failure, failed readback, stale revision, forced DB CAS rollback, off flags, missing migration, wrong target and unauthorized profile-field checks.

**No production D1/Notion writes, 0134 application, real synchronization, flags, merge or deployment performed.**
