# Production D1 0132 — isolated rollout preparation

Status: **Draft PR / no production mutation**. This change prepares only the additive SQL migration and the protected manual rollout path. The Facebook Images V4 runtime remains isolated in PR #875.

## Scope
- Canonical SQL: `drizzle/0132_facebook_image_direct_consent.sql`, identical to the prepared migration in PR #875; no new runtime handlers, publishing or cron changes.
- Add nullable `direct_consent_at` and `direct_consent_by`; add `direct_publish_consent INTEGER NOT NULL DEFAULT 0 CHECK (direct_publish_consent IN (0,1))`.
- Existing posts, canonical Notion IDs, Meta attempts and permissions are preserved; every existing record starts with direct consent **OFF**.
- Manual `Production D1 Migrate` GitHub Actions option, exact `APPLY-0132-psipedia-sk-db` confirmation, `main`-only, protected `production` environment and Cloudflare migration credential.
- Pin SHA256 of the exact SQL bytes to `62bd60ae8214e348b70bf3281bc22fa6a4195de9d0368de9de7bb1a93225ad20`. Reject alternate database identity, changed SQL bytes, duplicate execution, ledger gaps, partial columns, incorrect schema and unexpected row changes.
- Run local migration regression tests and full clean local D1 chain on PR.

## Safe rollout order

1. Review this isolated Draft PR and all required CI results. Compare the SQL to PR #875 and verify it contains *only* the three ALTER statements.
2. **Owner explicitly approves merge of the isolated migration PR** into `main`. This publishes the SQL and manual migration action to GitHub, but does **not** itself execute D1 APPLY.
3. Verify production D1 ledger and schema read-only: `0131` must be the latest recorded migration; no `0132` columns may be present yet. The protected workflow will fail closed if this is not true. Ensure the Facebook scheduled publisher main STOP remains OFF.
4. **Owner separately approves the production D1 mutation**, then in GitHub Actions → `Production D1 Migrate` → `Run workflow`, select `main`, target `0132_facebook_image_direct_consent.sql`, confirmation `APPLY-0132-psipedia-sk-db`. The workflow performs protected same-run preflight, obtains D1 Time Travel bookmark, applies only the scoped target once, verifies schema, history and unchanged data, then runs smoke tests. Never infer success solely from starting the run.
5. After a verified successful 0132 postflight, provision the Notion checkbox **`Súhlas majiteľa – priame publikovanie`**, and configure a verified `FACEBOOK_IMAGES_OWNER_EMAIL` through approved environment configuration. Keep any direct publish transport disabled.
6. Reconcile PR #875 with the newer `main`, ensuring its earlier `PREPARED_PRODUCTION_TARGETS = ["0132..."]` does **not** revert this approved migration support or erase the validated schema checks. Rerun all CI and review the final diff.
7. Only then approve merge/deploy of PR #875. Verify production read-only without posting test content to Meta and with main STOP OFF until explicitly enabled.

## Explicit exclusions
No production D1 writes, GitHub merge, deployment, Meta publication, Notion database modifications, new credential configuration, direct ChatGPT publication API or paid calls are performed by creating this Draft PR.

If existing migration `0131` is not applied in production, **do not attempt 0132**. If the GitHub workflow fails a preflight condition, investigate before any further APPLY; do not bypass the guard.
