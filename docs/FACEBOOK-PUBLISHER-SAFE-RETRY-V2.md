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

## Known limitations / future acceptance
This adds **safe retries of explicit provider throttling rejections**, not a speculative API post search. An ambiguous Meta result cannot prove that a post does not exist; automatic retry is intentionally blocked. A proof-oriented production reconciliation mechanism may later be implemented if Meta offers a trustworthy enough read API / stable ID. The pending-retry ledger currently retains the existing `UNCERTAIN` DB state with `outcome_kind=PROVEN_REJECTED` until success/exhaustion, so downstream admin/Notion status surfaces need acceptance review before rollout. Cancellation/rescheduling of a retry-pending post also requires a separate lifecycle review: do not activate against the live backlog before that is resolved. Do not manually delete a production attempt row to force republishing.

## Offline verification
`npm run test:facebook-publisher`, `npm run test:notion-facebook-images`, `npm run db:check-migrations`, `npm run test:migration-safety`, `npm run build` plus GitHub Actions. All tests mock Meta and R2; no real POST is permitted. Merge, 0135 D1 APPLY, deployment, and enabling the flag require distinct owner permissions.
