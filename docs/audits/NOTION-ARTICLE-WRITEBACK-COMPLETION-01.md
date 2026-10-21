# NOTION-ARTICLE-WRITEBACK-COMPLETION-01 — gated completion

Coordination: #917. Extends merged #929. Base main at start:
`c622c81ef21e5adb9dc03996ba6cc83b81da6676`.

## What this change does

- Keeps the existing canonical Admin article save, Notion → draft import and
  separate published-state writeback. It does not introduce a new sync engine.
- The additive **0138** SQL in `drizzle/0138_article_editorial_outbox.sql`
  was applied and verified after 0137 in the protected production migration
  [run #39659734528](https://github.com/investradarsk/psipedia-sk/actions/runs/39659734528)
  on 2026-10-21. PR #957 prepared the manual release gate.
- Owner requested immediate global activation for all eligible Admin draft
  saves, without a canary. PR #958 sets
  `NOTION_ARTICLE_CONTENT_WRITEBACK_ENABLED=true` in production source
  configuration; **actual live activation still depends on a successful
  production deployment of #958**. This is not a bulk backfill.
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

## Release status and operational conditions

1. **Database ready:** production workflow #39659734528 verified exact
   predecessor 0137, applied 0138 and passed schema, D1 integrity and desktop/
   mobile smoke. Do not run either migration again.
2. **Global owner choice:** enable writeback for **every eligible mapped draft**
   on Admin save, not a canary. PR #958 changes the single global flag.
   `NOTION_ARTICLE_SYNC_ENABLED` remains true. No mass historical rewrite,
   auto-publication or extension to published/scheduled articles.
3. **Deploy gate:** PR #958 must pass exact-head CI and be merged by the owner;
   Cloudflare Workers Builds must deploy the resulting `main` revision
   successfully before the feature can be called live. A green GitHub PR check
   alone does not prove the production runtime picked up the config.
4. **Live operation:** the owner will test on real eligible content.
   Unsupported changes or a mismatched Notion revision fail closed rather
   than forcing replacement. Notion has no multi-block atomic PATCH; users
   should avoid simultaneous Admin/Notion editing of the same article.
5. **Recovery:** if a writeback fails or leaves
   `EDITORIAL_WRITEBACK_PENDING`, preserve the D1 outbox and Notion revision
   evidence. Reconcile content before clearing a journal. A remote
   `Synchronizované` marker is not sole proof of success. To stop future
   writebacks, revert `NOTION_ARTICLE_CONTENT_WRITEBACK_ENABLED` to false
   and deploy, without deleting pending journal entries.

**Important:** A remote `Synchronizované` marker is not an independent
transactional proof across D1 and Notion. The journal and canonical D1
mapping are authoritative. Crash recovery can leave a successfully applied
Notion content PATCH with pending D1 acknowledgement; manual review may be
required where the remote preimage is neither the recorded before nor target.
