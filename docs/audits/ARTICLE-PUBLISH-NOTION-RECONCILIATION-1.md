# ARTICLE-PUBLISH-NOTION-RECONCILIATION-1

**Scope:** server-only publication state reconciliation, existing D1 `managed_articles` + `article_notion_sync`, existing Notion publisher and hourly Cloudflare Cron. No migration, public GET mutation, CMS replacement, editor/calendar change, or production action in this PR.

## Root cause and preserved contracts

- Public read queries already consider `status='published' OR (status='scheduled' AND published_at <= now)`. They deliberately do **not** update a row when the schedule elapses.
- PR #826 calls `writeBackPublishedArticleToNotion` only after a successful explicit Admin `non-published → published` change, so time-based publication never causes the Notion writeback. A failed manual writeback also has no automatic replay.
- PRs #806/#807 protect Notion draft imports, article editor blocks and optimistic `updated_at` writes; none of those content paths are changed here.

## Mechanism

The existing *hourly* Notion article task runs two sequential phases, never inside a public request:
1. A bounded D1 read (max **50** mapping rows) enumerates mapped articles matching the existing public visibility gate. Order uses `article_notion_sync.updated_at` as a rotation/attempt cursor; both manual and due-scheduled articles are candidates.
2. The existing publication writeback reads the Notion page first. If `Stav = Publikované`, date, canonical public URL and clean sync status already match, it makes **no Notion PATCH**. If `Stav = Ready` and `Odoslať na Psipedia = true`, it may publish. All other states and published URL/date conflicts are rejected without patching. D1 title/slug/location/schedule/status/version are re-read after the Notion GET and before the PATCH; stale snapshots are rejected.
3. After a successful PATCH (or remote no-op), mapping `last_synced_at` and `updated_at` advance. On an exception the successful sync timestamp is never advanced; only the attempt cursor is advanced with a guarded compare-and-swap to avoid starving other rows. The next Cron retries. Logs include only static event names and internal numeric article IDs.
4. The ordinary Ready-article import runs after reconciliation. If the reconciliation phase fails, import continues independently.

The two systems cannot be updated atomically. Notion's page PATCH offers no D1/Notion cross-system transaction nor conditional `last_edited_time` write. The fresh D1 re-read narrows, but cannot entirely eliminate, a last-millisecond editor/Notion race. A remote change to a conflicting publish state requires manual resolution, not a forced overwrite. The batch limit can also mean a large backlog needs several hourly cycles.

## Offline acceptance matrix

- Explicit manual publish: existing `draft|scheduled → published` Admin route and post-commit Notion writeback remain intact.
- Due scheduled: `scheduled` and `published_at <= now` becomes Notion `Publikované` with canonical URL and original publish timestamp, while D1 remains `scheduled`.
- Future scheduled, draft, disabled sync and unmapped article: no remote publication.
- Retry/replay: PATCH failure never acknowledges success; next Cron retries. Already reconciled remote page: no second PATCH.
- Concurrent changes: changing the D1 version between remote GET and PATCH aborts; manual unapproved Notion status or conflicting public URL/date aborts.
- Existing content: no D1 article/editor/calendar/media/topics writes in the reconciliation path; it updates only the existing mapping timestamps.

Focused tests: `tests/article-publish-notion-reconciliation.test.mjs`, `tests/article-notion-publish-writeback.test.mjs`, `tests/notion-article-sync.test.mjs`. The existing Notion sync focused CI and editorial foundation suite include the new regressions.

## Safe production verification — separate approval only

1. **Before deployment (read-only):** record exact merged SHA; verify the worker's `*/5 * * * *` trigger and hourly scheduling policy. Run a read-only D1 SELECT of `managed_articles` joined to `article_notion_sync` for `published` or due `scheduled` rows; record IDs, `status`, `published_at`, `updated_at`, `notion_page_id`, mapping timestamps, not article content. Confirm that candidate Notion pages still have `Stav=Ready`, explicit send opt-in, and mapped identity; identify pages manually changed to another status.
2. **After separately approved merge and deploy:** verify deployed Worker SHA. In the *first scheduled hourly run*, inspect aggregate `publicationChecked/Updated/Unchanged/Failed` logs and sanitized failure events. No manual PATCH, production migration or browser-triggered write is required.
3. **Read-only verification:** for one approved mapped scheduled article whose publish time has passed, check that the public page is reachable, D1 remains `scheduled` with original `published_at`, and Notion has `Stav=Publikované`, matching `Dátum publikácie`, `URL Psipedia` and `Sync stav=Synchronizované`. Compare its mapping timestamps.
4. **Retry and idempotence:** at the next hourly task, confirm no duplicate Notion publication PATCH for an already correct article. For a *naturally occurring* provider error, verify the log is sanitized and a subsequent Cron succeeds; do not induce production provider failures or modify live content for the test.
5. **Failure criteria / rollback:** any unexpected revision change, wrong public URL/date, overwritten Notion editorial status, repeated failures, or abnormal volume stops rollout acceptance. Disable only the existing Notion article sync flag if necessary (affects import too), investigate read-only, and use a separately authorized deployment rollback; do not delete mapping rows or rewrite article bodies.

**Not verified by this PR:** live D1 data, Notion API credentials/permissions, remote failure handling in production, deployed SHA, or end-to-end user-browser behavior. No production writes, deploy, merge, or migrations were performed.
