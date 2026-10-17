# PRODUCTION-D1-0130-ROLLOUT-1 — Facebook Publisher settings/attempt ledger

## Dependency and scope
- **Dependent on PR #854**: Facebook Publisher V2 app code must be merged and validated before this rollout PR is merged. PR #854 contains the byte-identical `drizzle/0130_facebook_image_publisher.sql` as a *prepared* target; this PR promotes the same bytes into the protected production migration workflow. Reconcile any overlapping tests and migration runner with latest `main` after #854 merges; do not overwrite application code or Gemini FIFO.
- **0129_gemini_external_manual_queue.sql** must already be the latest applied production ledger row before 0130 is attempted. Do not assume a green PR #855 or #852 means 0129 was applied; the protected same-run preflight verifies the live production ledger.
- This rollout includes only the additive `facebook_image_publisher_settings`, `facebook_image_publish_attempts` tables and `facebook_image_publish_attempts_state_idx` index. There is **no content backfill or Page token stored in D1**. The global switch defaults to off.

## When specifically approved by the owner — one protected workflow, no separate read-only run
1. Merge #854 with green CI, integrate this rollout PR on current `main`, require green CI, merge the rollout PR only after user approval.
2. Open `Actions → Production D1 Migrate → Run workflow` on branch `main`.
3. Choose `target_migration=0130_facebook_image_publisher.sql`; enter `confirmation=APPLY-0130-psipedia-sk-db`.
4. The existing protected production job checks: current main commit, exact confirmation, canonical D1/account/Worker identity, exact SQL SHA256, migration 0129 predecessor, no partial 0130 objects, existing Facebook posts schema, 0129 Gemini index shape and presence of D1 recovery bookmark.
5. The same run revalidates schema/ledger before the only D1 write, then verifies newly created schema, exactly one appended migration ledger entry, newly created tables initially empty, and the count of prior Facebook posts unchanged. Failure blocks further steps; never bypass production gates.
6. After green run, the D1 schema is prepared for **a later separately approved Meta pilot**. Running 0130 does not configure Cloudflare `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN` or enable `FACEBOOK_IMAGE_PUBLISH_ENABLED`; nothing publishes automatically until explicit activation.

## Offline verification
- `npm run test:migration-safety` including `tests/production-d1-0130-rollout.test.mjs`
- `npm run db:check-migrations`
- Standard repository build/CI

No merge, live production execution, Meta Graph request, credentials change, or deployment is authorized by this PR's preparation.
