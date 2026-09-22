# Production D1 migrations

This document defines the production schema-migration path for Psipedia.sk.

## Separation of responsibilities

Production code deploys and production D1 schema migrations are separate operations.

- Cloudflare Workers Builds deploys the prepared Worker artifact.
- `npm run deploy:cloudflare` may perform read-only remote audits, but it does not mutate D1.
- Production D1 schema changes run only from the manually-triggered **Production D1 Migrate** GitHub Actions workflow.
- The workflow never deploys application code.

The Cloudflare Workers Builds credential must not be used for D1 writes.

## Canonical production target

The source of truth is `config/cloudflare-resources.json`.

Current production identity:

- Worker: `psipedia-sk`
- GitHub environment: `production`
- D1 binding: `DB`
- D1 database name: `psipedia-sk-db`
- D1 database ID: `8f7a0c3e-4d77-4a35-8192-a7bd57147950`
- Cloudflare account ID: `5ff902d3d80376478b9213b2b8ae8d6e`
- Repository migration directory: `./drizzle`

The migration runner refuses to continue when the generated Worker config does not resolve to this exact database identity.

## Credential

Create a dedicated Cloudflare API token for production D1 migrations.

GitHub Environment:

`production`

Environment secret expected by the workflow:

`CLOUDFLARE_D1_API_TOKEN`

The workflow maps that secret to Wrangler's `CLOUDFLARE_API_TOKEN` environment variable. Never store the token value in this repository, workflow YAML, documentation, issue, PR, or logs.

Minimum intended Cloudflare scope:

- D1: **Edit / Editor**
- Resource scope: the production D1 database `psipedia-sk-db` when resource-level scoping is available.
- If the account UI only offers product-level D1 scope, restrict it to the Psipedia Cloudflare account and do not add unrelated Workers, R2, DNS, billing, or account-administration permissions.

The production migration workflow does not require Workers Scripts Edit because it does not deploy a Worker.

## Environment protection

Use the GitHub `production` environment for the migration job.

Recommended repository settings:

- required reviewer/approval for the `production` environment, when available;
- keep `CLOUDFLARE_D1_API_TOKEN` as an environment secret rather than a repository-wide secret;
- do not allow untrusted branches to run the environment.

The workflow itself also fails unless the dispatched ref is `refs/heads/main`.

## REVIEWS-1A-MIG target

The controlled target for this workstream is:

`0062_profile_reviews_foundation.sql`

The repository currently also contains:

`0063_partner_claims_verification.sql`

Wrangler does not provide a "migrate only to version N" option. To prevent an accidental 0063 rollout, the migration runner creates a temporary Wrangler migration directory containing the canonical chain only through 0062.

The production migration command therefore sees no migration newer than 0062.

## Preflight

Before any schema mutation, the workflow:

1. checks out the exact dispatched `main` SHA;
2. runs repository migration-safety checks;
3. builds the exact production artifact so the generated Wrangler D1 binding can be audited;
4. verifies the Cloudflare account ID;
5. verifies Worker name, database name and database ID;
6. reads `d1_migrations`;
7. inspects `directory_profiles` and SQLite schema objects;
8. refuses partial/manual 0062 schema drift;
9. records aggregate counts only;
10. verifies duplicate/orphan canonical-resource counts;
11. retrieves a D1 Time Travel recovery bookmark;
12. lists pending migrations from the scoped migration directory.

If 0062 is pending, the runner requires the latest applied migration to be exactly 0061. It will not silently apply an older backlog.

If 0062 is already applied and the physical schema is complete, apply becomes a no-op and verification still runs.

## Recovery point

D1 Time Travel is the recovery mechanism.

The preflight stores the current bookmark in the safe migration report. The bookmark is not a credential.

In an incident, use the bookmark recorded by the workflow run with the Cloudflare account's authorized recovery procedure. A Time Travel restore is destructive and must not be performed merely to test recovery.

The migration itself is also executed through Wrangler's D1 migration mechanism, which records migration state in `d1_migrations`.

## Apply

The workflow requires the exact confirmation phrase:

`APPLY-0062-psipedia-sk-db`

Only after all preflight gates pass does it run the canonical D1 migration tooling against the scoped migration set ending at 0062.

Do not copy/paste the SQL migration manually into the Cloudflare console unless an explicitly documented incident-recovery procedure requires it.

## Post-migration verification

The runner verifies:

- 0062 is recorded in `d1_migrations`;
- no unexpected migration was applied alongside 0062;
- `directory_profiles.archived_at` exists;
- all seven review foundation tables exist;
- expected indexes exist;
- reviewable-resource and immutable-resource triggers exist;
- moderation events remain append-only;
- rating/body bounds exist in the table definitions;
- missing directory resource anchors = 0;
- missing help-organization resource anchors = 0;
- duplicate canonical resource anchors = 0;
- orphaned canonical resources = 0;
- existing canonical resource IDs are preserved;
- partner memberships are unchanged;
- directory-profile and help-organization counts are unchanged;
- `profile_reviews` remains empty for REVIEWS-1A-MIG.

The workflow then runs key HTTP checks and the existing desktop and mobile production Playwright smoke.

## Safe evidence

The workflow uploads only:

- `.production-d1/manifest.json`
- `.production-d1/preflight-report.json`
- `.production-d1/postflight-report.json`

It intentionally does not upload the internal preflight snapshot used to compare resource identities and memberships.

Safe reports may contain database identifiers, migration names, aggregate counts, hashes, PASS/FAIL state, and the Time Travel recovery bookmark.

They must not contain API tokens, review-author emails, encrypted PII, or application secrets.

## Failure behavior

The workflow fails before apply or before success when any of the following is true:

- it is dispatched from a ref other than `main`;
- the confirmation phrase is wrong;
- the migration credential is missing;
- the Cloudflare account does not match the canonical account;
- the generated Worker binding points to another D1 database;
- 0062 is pending but production is not exactly at 0061;
- 0062 is unrecorded while 0062 schema objects already exist;
- migration history and physical schema disagree;
- Time Travel does not provide a recovery bookmark;
- duplicate/orphan resource conditions are present;
- migration apply fails;
- post-migration schema verification fails;
- resource-backfill or data-integrity postconditions fail;
- a migration other than the requested target is newly applied;
- production smoke fails.

There is no false-green path that converts these failures into success.

## PR #266 compatibility shim

PR #266 intentionally made the directory runtime compatible with production before 0062 by projecting `NULL AS archived_at` and not writing `archived_at` during archive/restore.

REVIEWS-1A-MIG does not remove that compatibility shim.

After 0062 is proven applied and production smoke is green, a separate small runtime-cutover PR can restore physical `archived_at` timestamp writes. That PR should have focused tests and should not be auto-merged.

## Running the workflow

After this migration-process PR is merged to `main` and the `production` environment secret is configured:

1. Open **Actions**.
2. Select **Production D1 Migrate**.
3. Choose `main`.
4. Keep target `0062_profile_reviews_foundation.sql`.
5. Enter `APPLY-0062-psipedia-sk-db`.
6. Run the workflow.
7. Review preflight, migration, verification, desktop smoke and mobile smoke.
8. Retain the workflow run and safe report artifact as the rollout record.

Do not proceed to REVIEWS-1B until the workflow proves 0062 applied and all postconditions pass.
