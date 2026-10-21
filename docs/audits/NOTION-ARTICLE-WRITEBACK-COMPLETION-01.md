# NOTION-ARTICLE-WRITEBACK-COMPLETION-01 — gated completion

Coordination: #917. Extends merged #929. Base main at start:
`c622c81ef21e5adb9dc03996ba6cc83b81da6676`.

## What this change does

- Keeps the existing canonical Admin article save, Notion → draft import and
  separate published-state writeback. It does not introduce a new sync engine.
- Prepares additive **0138** SQL in `drizzle/0138_article_editorial_outbox.sql`
  after migration 0137 landed on `main` in merged PR #908.
  **Schema is NOT applied in production**. The protected production migration
  runner does not permit 0138 dispatch yet; a separate approved release
  gate must be implemented to apply it. Existing feature flags remain OFF.
- Uses an immutable journal of planned preimages/targets, protected Notion
  identity/slug/category/approval metadata, all selected block fingerprints
  and the full page block identity order. An unknown snapshot fails closed.
- One D1 conditional claim per article/revision prevents overlapping Psipedia
  workers from both replaying a journal. The 15-minute lease is renewed before
  each mutation and expires after worker termination; ordinary errors release
  it immediately. A lost lease aborts processing.
- After validating the entire retry plan but before the **first content PATCH**,
  sets existing Notion `Sync stav = Chyba` and
  `Sync chyba = EDITORIAL_WRITEBACK_PENDING`, replacing any stale
  `Synchronizované` receipt. Partial operations are NOT reported as synced.
- Revalidates before each edited block PATCH and requires final full-page
  readback, block and immutable metadata checks, a guarded D1 mapping update,
  and the final Notion receipt. A remaining outbox means NOT COMPLETED.
- The Notion import sweep does not replace a pending editorial writeback
  receipt with a generic import error.

## Scenarios

| Scenario | Result |
| --- | --- |
| Notion human edits to a draft | Existing import path, subject to stale-Admin revision and pending-outbox guards; no auto-publishing |
| Admin draft edits to compatible existing text/SEO fields | Supported in the *gated* writeback, after full plan and preimage checks |
| Same-slot heading, paragraph, quote, callout, list-item edits | Supported when original structure, order, IDs and rich-text marks are representable |
| Existing external HTTPS image block/hero URL, alt and source metadata | Supported when provenance and shape checks succeed; no R2 replacement without evidence |
| Partial PATCH / retry after transient error or crash | Idempotent journal replay after lease release/expiry; successful operations skipped if matching target |
| Simultaneous Admin/Notion edits, stale Admin revision, altered slug/category | Conflict, no overwrite; manual reconciliation |
| Insert/delete/reorder/retype blocks, rich-text annotations outside adapter, unsupported children/tables | Conflict, no structural auto-edit; manual reconciliation |
| Missing/changed canonical Notion ID or approval, missing SEO schema | Conflict; no partial success receipt |
| Published/scheduled article | Never enters draft-content writeback; original publication lifecycle unchanged |
| Notion edit in the final GET→PATCH race | **Residual risk**: Notion API does not support per-block atomic CAS; no guarantee of lossless arbitrary concurrent writing |

The token-based D1 claim prevents parallel *application workers* but **cannot**
lock a human editing Notion. A lease cannot turn Notion's independent PATCHes
into an atomic multi-block transaction. For simultaneous human editing, the
safe operational policy is to stop, preserve the journal, review each side
manually, and rebase the draft rather than force the stale operation.

## Release gates — NOT approved

1. 0137 is present in the canonical `main` chain (PR #908 merged), but
   its **actual production application must be confirmed separately**. 0138
   is now a canonical prepared migration file; confirm ordered migration
   history, schema/foreign-key/index preflight and pinned SQL checksum.
   A separate owner-approved change to the protected production migration
   runner/workflow is required before 0138 can be dispatched. Neither this
   PR nor its merge is approval to apply 0138.
2. Deploy compatible code/schema **only under separate authorization** and
   ensure `NOTION_ARTICLE_CONTENT_WRITEBACK_ENABLED` stays false throughout
   rollout. Existing `NOTION_ARTICLE_SYNC_ENABLED` must also be considered.
3. Validate actual Notion property types, allowed `Sync stav` selections,
   page/block PATCH semantics, R2 image provenance, article manifest cases
   and import/writeback interactions on an approved synthetic draft.
4. Confirm full CI on the **exact** PR head and run controlled positive,
   negative, crash/retry and concurrency tests. No general production
   acceptance without separately approved live evidence.
5. Only after written approval may the feature flag be enabled, initially
   for controlled single-record use. No bulk backfill or publication.
6. Manual reconciliation: leave the pending journal untouched; inspect
   Notion and Admin revisions, reconcile in the canonical Admin draft,
   then explicitly authorize clearing/superseding the journal. Never delete
   unverified evidence automatically.

**Important:** A remote `Synchronizované` marker is not an independent
transactional proof across D1 and Notion. The journal and canonical D1
mapping are authoritative. Crash recovery can leave a successfully applied
Notion content PATCH with pending D1 acknowledgement; manual review may be
required where the remote preimage is neither the recorded before nor target.
