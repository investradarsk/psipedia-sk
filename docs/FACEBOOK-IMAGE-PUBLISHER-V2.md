# FACEBOOK-IMAGE-PUBLISHER-V2 — automatické obrázky Facebook Page

Scope: next phase of Facebook Images admin. D1 remains authoritative; Notion sync and AI content generation are explicitly out of scope.

## Behavior

- Admin switch **Povolené**: all due scheduled entries are eligible. Switch **Nepovolené**: only individually approved scheduled entries are eligible. Every modification of a scheduled post resets the individual approval.
- The calendar permits arbitrary local Europe/Bratislava times, overlaps and past timestamps. No day/hour windows or user-configured intervals.
- New isolated Cloudflare cron `* * * * *` invokes **only** the Facebook publisher. Existing `*/5 * * * *` and all legacy background work retain their prior dispatch. Execution is due-based UTC and may occur after the selected minute due to platform/Meta latency; never claim second-perfect timing.
- Uses POST `https://graph.facebook.com/v26.0/<Page-ID>/photos` with photo URL rooted in `https://psipedia.sk/media/facebook-images/` and post caption. An ID from Meta is stored in D1.
- API integration remains **off by default** even if admin switch is enabled: the deployment requires the Cloudflare secrets `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN` plus explicit `FACEBOOK_IMAGE_PUBLISH_ENABLED=true`. Never paste tokens into admin, Notion, logs or PRs. Obtain Page token after separately completing Meta Graph API Explorer consent.
- Meta app may remain in development mode for app-role users and their managed Page during initial pilot; external publication permissions and app review depend on Meta policy/role. No live calls are performed in this PR.

## Failure/duplicate semantics

- `facebook_image_publish_attempts.post_id` PRIMARY KEY is an atomic one-time claim. Claim is conditional on due timestamp, image key, unchanged post version and latest toggle/approval. The editor cannot modify a claimed post.
- Any interrupted transport, timeout, Meta HTTP error or missing result ID marks **UNCERTAIN**; no automated retry, because remote posting may have succeeded. A crashed Worker can leave **SENDING**. Operators must inspect Page activity before any manual repair.
- Publishing success first stores the remote ID in the attempt ledger, then updates the post's published status and remote ID. If the second DB write fails, the protected attempt ledger still prevents duplication. A follow-up repair/reconciliation UI is intentionally excluded from this release; do not manually delete attempts without verifying external state.
- The first run will consider all *overdue* scheduled posts if globally enabled or individually approved. Review existing schedules before activating credentials/feature flag or enabling the global switch.
- 50 candidates are scanned per scheduled tick for bounded workload, **not** a daily, per-user, or scheduling quantity limit. More due work remains eligible for the next minute.

## Database and rollout

- Migration `0130_facebook_image_publisher.sql` is **PREPARED ONLY**. It adds a global settings singleton (default off) and an immutable per-post attempt ledger with FK/index; it changes no existing Facebook images or other user data.
- Stage 1 image editor remains available when 0130 is absent, but publisher settings are unavailable and no publishing can occur.
- No merge, production migration, secret change, deployment, paid request or Meta POST in this PR. Approval of this PR does not authorize any of those operations.
- After green CI and separately authorized rollout of 0130, configure Page ID and Page access token in Cloudflare secrets, then a specific pilot activation. Test with one intentionally approved throwaway scheduled post; verify Facebook Page, D1 remote ID and admin status. Only then enable broad publishing.

## Offline verification

`npm run test:facebook-publisher`

`npm run test:facebook-images`

`npm run test:migration-safety`

`npm run db:check-migrations`

`npm run build`

No real Meta Graph API call is part of tests.
