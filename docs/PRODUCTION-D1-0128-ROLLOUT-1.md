# PRODUCTION-D1-0128-ROLLOUT-1 — Facebook image admin schema

## Scope (development PR, never a production authorization)

- Adds **manual** production migration target `0128_facebook_image_posts.sql` to the existing protected workflow.
- Introduces an **independent read-only audit** of the migration ledger and the exact table/index schema.
- Does not change the immutable SQL bytes of `drizzle/0128_facebook_image_posts.sql`, publish to Facebook, deploy a Worker, run a remote migration or perform any production writes.
- Database: `psipedia-sk-db`. The preceding `0127_gemini_notion_created_pages.sql` must be the exact latest ledger entry.
- Pinned SHA256 of the original 0128 SQL: `9f8b23e2420f354089f38490d9105707346527e5ab8fc544f55234d8283a098a`.

## Intended operator procedure (only after PR review and merge)

1. Separately authorize a **read-only audit**, then from **main** use GitHub Actions → **Production D1 0128 Read-only Audit** → Run workflow. Choose `audit_mode = preflight`; confirmation must be `AUDIT-0128-preflight-psipedia-sk-db`.
2. Record the run link, exact main SHA and report classification. Continue **only** if the result is `READY_FOR_SEPARATE_APPLY_APPROVAL`. Any error, partial schema, mismatched ledger/SQL/account, or missing 0127 is a blocker.
3. Obtain a **separate explicit approval for production APPLY**, including the run evidence. Do not assume preflight alone authorizes a mutation.
4. Only with that separate approval, on **main** run existing **Production D1 Migrate** workflow with:
   - `target_migration = 0128_facebook_image_posts.sql`
   - `confirmation = APPLY-0128-psipedia-sk-db`.
   - Existing production environment approval, exact-main lease, protected D1 credential, additive preservation snapshot and Time Travel recovery bookmark remain mandatory.
5. Observe the same-run automatic preflight, one-target apply and postflight verification. The runner rejects repeats and refuses history gaps or schema drift. It checks that `facebook_image_posts` initially has **zero rows**, the three indexes exist with exact definitions, and existing canonical resource counts/digests remain unchanged.
6. Run an **independent read-only postflight** using `audit_mode = postflight` with confirmation `AUDIT-0128-postflight-psipedia-sk-db`. Require `APPLIED_AND_VERIFIED`; attach the evidence links.
7. Independently confirm the production Worker build/deployment and authenticated admin page `/admin/facebook-obrazky`, then test **one draft save** only with **separate authorization**. Do not confuse merged source code, migrations, deployment and a successful live edit. The Facebook publisher is not part of this rollout.

## Safety boundaries

- Audit workflow runs no `migrations apply`, no `INSERT/UPDATE/DELETE`, no deploy, no paid external calls. Its two query strings are hardcoded and whitelisted.
- Only a manual dispatch from current `main` with exact confirmation may execute the protected production workflow. No PR/push/schedule trigger is added.
- The SQL creates one new table and three indexes; no existing user/partner/article rows are migrated.
- The approval and Facebook publishing fields are **inert metadata** until a later explicitly approved feature PR.
- A previously applied 0128, partial 0128 table/indexes without the ledger entry, an unexpectedly different 0127 predecessor or SQL checksum, and a drifting account/target must fail closed.
- If a check fails, stop and diagnose. Do not silently retry `APPLY` or use a manual SQL workaround.

## Offline verification

- `npm run test:migration-safety`
- `npm run db:check-migrations`
- `node --experimental-strip-types --test tests/production-d1-0128-readonly.test.mjs`
- `node --test tests/production-d1-0128-rollout.test.mjs`
- Relevant GitHub Actions CI jobs and build after PR creation.
