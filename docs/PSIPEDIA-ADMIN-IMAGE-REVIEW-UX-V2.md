# Image Review UX V2 — implementation checkpoint (21 October 2026)

Scope: only `/admin/kvalita?section=media` and its existing media decision API, local stylesheet, and D1 schema. Preserve Admin Visual System V3, public site, Facebook Images, canonical profiles, editor state and existing media discovery.

## Completed in PR #908 (Draft, final CI pending)

- Desktop/mobile confirmation and comparison UI, bulk selection 50 maximum, 44px controls, accessible names and partial-error feedback.
- Optional rejection reason, validated server-side to **500 Unicode code points**, stored in the new immutable history table only after successful D1 decision finalization.
- Authenticated, uncached history API: `GET /api/admin/data-quality/media/[id]/history`, bounded to 50 records. History is loaded explicitly from the existing comparison dialog.
- D1 migration `drizzle/0137_media_source_review_decisions.sql`: exclusive candidate claim token, claim timestamp, durable decisions, SQL finalization trigger that **aborts the complete batch** if canonical/monitor state is inconsistent, and immutable audit UPDATE/DELETE guards.
- Candidate acquisition uses a conditional D1 UPDATE on status, monitor identity, candidate URL/key/content hash, active image identity and empty claim token.
- Accept checks the canonical entity's previous image key, stages a new immutable R2 object, and uses one D1 batch for canonical image, monitor resolution and history. Reject uses one D1 batch for monitor and history. R2 candidate deletion is delayed until after D1 commit. Former active image blobs are retained rather than deleted prematurely.
- Monitor sweeps avoid mutating claimed candidates using a conditional D1 UPDATE; pre-commit deletes of candidate blobs were removed.
- Isolated SQLite tests exercise reason validation, CAS exclusivity, reject history, accepted update, stale candidates, immutable audit and human-edit collision rollback. Chromium suite has 10 scenarios per desktop 1440/mobile 390/mobile 320, with synthetic API fixtures.

## Release and migration gates

- **D1 0137 is merged and applied.** Migration-only PR #956 was merged; owner-dispatched [Production D1 Migrate #39643595439](https://github.com/investradarsk/psipedia-sk/actions/runs/39643595439) succeeded on 21 October 2026, including preflight, D1 migration, postflight schema/integrity verification and desktop/mobile smoke.
- **Schema-first order completed.** PR #908 is now synced with `main`, preserving the canonical supported-0137 runner and its regression tests. No runtime image-review deployment preceded 0137.
- PR #908 itself made no production writes and remains unmerged; production 0137 was applied separately by the owner through the protected workflow.
- CI evidence must be interpreted by exact HEAD. Green historic 27/27 Chromium cases predate this backend implementation; the new suite must pass independently.
- Before approving merge, review production schema and release ordering, independent background sweeps, race/timeout recovery, and authenticated admin preview.

## Remaining limitations (do not label PR MERGE READY)

1. **R2/Notion are not one D1 transaction.** The D1 CAS protects finalization; R2 staging and cleanup are separately awaited. Stranded R2 staging objects may remain after abrupt worker termination and require a safe GC plan.
2. **Notion writeback is still best-effort legacy behavior.** A Notion outage or a conflicting human edit is not yet handled by a durable idempotent outbox/field-CAS. Do not claim lossless bidirectional synchronization from this PR.
3. **Abandoned candidate claims:** a fresh decision can reclaim a claim older than 24 hours using D1's conditional candidate identity and token fence; old worker tokens cannot finalize the decision. Regression tests cover expiration, stale release and finalization rollback. A candidate that never receives another decision remains claimed; operational cleanup and R2 orphan inspection still require separate procedures.
4. **Review acceptance evidence:** confirm current-HEAD isolated SQLite/Chromium suites, full relevant CI, desktop/mobile screenshots and final admin visual approval. The D1 0137 production gate has already passed.

This checkpoint does not change the prior **63% completed / 37% remaining** estimate until a validated and merged milestone is delivered.

## 21 October targeted hardening checkpoint

- The D1 runtime gate now verifies 0137 columns, decision log, claim index and all required triggers; a partially applied schema fails closed even if the log table exists.
- A 24-hour abandoned claim is conditionally reclaimed and the previous token is fenced out. This does not imply R2 garbage-collection completeness.
- A rejection already committed to D1 remains a successful decision if a later optional source re-scan errors; refresh diagnostics do not change the immutable decision.
- Check current-HEAD Node/Chromium CI and final visual acceptance. Main synchronization and production schema-first rollout are complete.
- **0137 production schema is complete:** protected migration #39643595439 succeeded. The canonical migration runner now supports 0137, and `PREPARED_PRODUCTION_TARGETS` is empty.
- Legacy Notion writeback and possible R2 orphan objects are still non-atomic follow-ups; do not describe them as fully reconciled or claim production acceptance.
