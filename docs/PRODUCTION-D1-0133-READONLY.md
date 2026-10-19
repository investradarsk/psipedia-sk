# Production D1 0133 independent read-only postflight

**Purpose:** Verify a previously applied 0133 after a migration workflow's later Playwright smoke failed. This audit **never** performs or retries APPLY, migrations, SQL DML/DDL, repair, production deployment, or backfill. Do not rerun `Production D1 Migrate` for 0133.

## Existing separation and safeguards
- The existing `.github/workflows/production-d1-migrate.yml` is the *write-capable* owner-controlled migration path and is **not called**.
- `.github/workflows/production-d1-0133-readonly.yml` is an independent **manual-only** GitHub Actions job using the protected `production` environment, `contents: read`, exact `main` checkout and current-HEAD guard, the existing `production-d1-migration` concurrency lock, canonical Cloudflare D1 identity and protected `CLOUDFLARE_D1_API_TOKEN`.
- The verifier pins the migration SHA256 (`656fcd963394076bfd5a7829e71b52a3bb83427e38a16f275e63af21b0f6eaef`) and compares actual D1 CREATE statements with those generated from the approved SQL migration. It also checks the full D1 ledger, indexes (including SQLite autoindexes supporting PRIMARY KEY/UNIQUE), JSON/check/default/identity constraints from the canonical DDL, and orphan counts for both profile foreign keys. It cannot infer that application smoke passed.
- **Only three exact, statically allowlisted SELECT statements** are sent using `wrangler d1 execute --remote --json --command`. The SQL transport rejects modified statements. Result output is an aggregate-only report; no row data, account users, secrets, or profile IDs are exported.
- A foreign key is defined for `profile_id` in the two profile-related tables (`directory_profiles.id`, `ON DELETE CASCADE`). `option_id`/`property_id` are **not** SQL foreign keys in migration 0133; this verifier does not invent those constraints.

## Objects inspected
- Tables: `service_catalog_admin_options`, `service_profile_option_choices`, `service_profile_property_values`.
- Explicit indexes: `service_catalog_admin_options_status_idx`, `service_catalog_admin_options_mirror_idx`, `service_profile_option_choices_option_idx`.
- Implicit primary/unique indexes: the two `sqlite_autoindex_service_catalog_admin_options_*` indexes and one `sqlite_autoindex_*_1` for each of the profile tables.
- Canonical history: migration ledger through `0133_services_canonical_admin_foundation.sql` inclusive; no missing, duplicated or later migrations.
- Aggregate counts: options, choices, properties and orphaned `profile_id` references in choices and properties. Nonzero valid row counts are informational; orphan counts must be zero.

## Owner-only manual verification (after this Draft PR is explicitly approved and merged)
1. Confirm this verifier PR and its CI are approved and merged. Verify the `main` branch includes `.github/workflows/production-d1-0133-readonly.yml`.
2. On GitHub open **Actions → Production D1 0133 Read-only Verifier → Run workflow**.
3. Select branch **main**. In `confirmation` enter **`AUDIT-0133-postflight-psipedia-sk-db`**, not an APPLY phrase.
4. Start **one** run, approve the protected `production` environment if prompted, and verify the job shows **SUCCESS**.
5. Review the `Verify production 0133` step and download `production-d1-0133-readonly-<run-id>` report. Require `result=APPLIED_AND_VERIFIED`, `applied=true`, `referentialIntegrity=PASS`, correct schema/index inventory and two zero orphan counts. Compare GitHub SHA and audit log to the current `main`.
6. If the verifier fails or reports drift, **stop** and investigate read-only. Do **not** rerun 0133, repair schema, toggle production flags, or deploy from this workflow. Treat the old Playwright/sitemap 500 as an independent smoke failure.

## Offline verification before manual dispatch

`node --test tests/production-d1-0133-readonly.test.mjs tests/production-d1-0133-rollout.test.mjs`

`npm run db:check-migrations`

The first test creates and mutates **only in-memory SQLite fixtures** to verify fail-closed logic. The production verifier runs exclusively from a manual Actions dispatch on the current `main` with the protected token. The PR itself does **not** verify the live D1 database.
