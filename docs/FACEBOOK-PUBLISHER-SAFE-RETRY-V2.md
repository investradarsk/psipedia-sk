# FACEBOOK IMAGE PUBLISHER SAFE RETRY V2

Status: isolated Draft PR — **no production migration, deployment, Meta POST or flag activation**.

## Default behavior
The existing single-shot publisher is unchanged unless `FACEBOOK_IMAGE_SAFE_RETRY_V2_ENABLED=true` is independently approved and activated. The default `wrangler.jsonc` deliberately does not contain this flag. Existing STOP=OFF or an unapproved item always blocks publishing.

## One-shot safety and retry classification
The existing `facebook_image_publish_attempts.post_id` unique claim remains atomic. The additive **prepared-only** migration `0135_facebook_image_safe_retry.sql` adds `outcome_kind`, `retry_count`, and `retry_not_before`, preserving the published ledger, older records and original state constraint. The migration is **NOT APPLIED** by this PR. It follows 0134 in the numbered migration chain and must not be run until all earlier migrations are independently confirmed.

- **Preflight media unavailable**: verify R2 object and content type before any claim/Meta request. Leave scheduled; the next due sweep checks again, with no blind Meta POST.
- **Explicit, structured Meta Graph throttling rejection**: only HTTP 400/429 with a parsed Graph error code 4, 17, 32 or 613 is eligible for capped automatic retry. The API has expressly rejected the operation; HTTP status alone is not enough. A bounded exponential delay is stored durably in D1, and a retry atomically re-claims the *same post_id* only if STOP, due time, immutable content version, owner approval and cancellation checks still pass. A maximum of three subsequent retries can occur.
- **Timeout, connection interruption, 5xx, malformed, non-whitelisted error, or missing successful remote ID**: always remain uncertain, never retried blindly. Require trustworthy external read-only reconciliation or owner handling.
- **Success**: the existing ledger-first remote ID update and D1 reconciliation remain in place. Already published records are never re-sent.
- **STOP changes**: after a claim but before Meta POST, a new attempt is removed; an unsubmitted *retry* is restored to its previously confirmed rejection state with the same durable identity. No Meta request is started after a detected STOP.
- **Backlog**: when opt-in retry mode is active, a single tick handles at most 20 fresh items + 10 eligible retry items; existing off-mode limit remains unchanged.
- **Logs**: provider response bodies, tokens and signed media URLs must not be logged; only sanitized counts and error codes are stored.

## Cancellation and rescheduling lifecycle

With BOTH the existing scheduling V2 and safe-retry V2 gates enabled, the D1 post update is guarded against any outstanding `SENDING` or `AMBIGUOUS` attempt. Only a Meta response explicitly classified as `PROVEN_REJECTED` can be cancelled or replanned.

1. Admin or Notion edits the existing canonical D1 record using its version/CAS guard.
2. The additive 0135 D1 trigger archives the proven rejection into an append-only history table **inside the same SQLite statement** as the post edit. It marks the durable active attempt `SUPERSEDED`, clears its pending retry timestamp and retains the canonical post and Notion identity.
3. Cancelling clears the datetime, returns the record to `draft`, revokes approval and blocks all publisher claims.
4. A later new datetime + valid R2 photo makes the *same canonical post ID* eligible. The publisher atomically reclaims only the `SUPERSEDED` attempt with the current content version and with the usual STOP/approval checks; the preceding supersession is independently archived again before recycle.
5. Old `AMBIGUOUS`, `SENDING`, and `PUBLISHED` attempts are never editable, deleted or recycled. The new `RETRY_PENDING` operator state shows the next safe retry time; `RETRY_EXHAUSTED` requires a human reschedule or cancellation. Normal uncertain results still show `Na preverenie`.

The Notion mirror writes the scheduled retry status and safe next retry timestamp and clears stale error text when an authorized cancellation/change is saved. Published Facebook content is never edited or deleted. No Notion page permission locking is introduced. The independent visual PR #904 is left untouched.

## Remaining acceptance / deployment gates

Offline tests and CI do not establish live Meta availability or a trusted search for ambiguous externally created posts. Such results remain blocked, never automatically retried. Before a live pilot verify the deployed Worker, live D1 schema/history, global STOP and backlog in read-only mode. The additive migration 0135 is **prepared only** and follows 0134; it is not an authorized production migration target. A separate owner-approved migration workflow, rollout, feature activation and production acceptance remain required.

## Offline verification
`npm run test:facebook-publisher`, `npm run test:notion-facebook-images`, `npm run db:check-migrations`, `npm run test:migration-safety`, `npm run build` plus GitHub Actions. All tests mock Meta and R2; no real POST is permitted. Merge, 0135 D1 APPLY, deployment, and enabling the flag require distinct owner permissions.
