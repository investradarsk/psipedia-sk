# SERVICES V3 — 0139 production migration RELEASE PREPARATION (owner-only)

**Related merged PR:** #983 introduced hourly guarded D1 → Notion auto-mirror, OFF by default, and proposed migration 0139. **This PR only prepares manual migration tooling; it does not apply 0139 or turn on any Services V3 flags.**

## Why 0139

The once-per-option-version Notion attempt journal must exist **before** the new hourly synchronizer can perform any Notion write. A durable D1 claim prevents a restart, timeout or race from blindly repeating a possibly successful Notion PATCH/POST. The journal never creates canonical Service IDs or changes profiles.

## Explicit deployment order

1. Merge this PR **only after** CI is green and confirms no production changes occurred.
2. Confirm **the actual** D1 production migration history read-only. 0138 must already be applied, in order, with exact outbox schema. 0133/0134 are already production applied and should **not be rerun**. If 0138 is NOT applied, stop: obtain separate authorization and complete 0138 first using its own pinned protected workflow. Never assume #983 merge applied any migrations.
3. **With separate explicit owner permission**, manually dispatch GitHub Actions **Production D1 Migrate** on current `main`. Choose exactly `0139_services_catalog_notion_auto_attempts.sql`; type exact confirmation `APPLY-0139-psipedia-sk-db`.
4. Protected GitHub environment, canonical D1 account+DB checks, immutable file hash, exact 0138 prerequisite, empty/partial-schema preflight, GitHub SHA pin and Time Travel recovery bookmark must all pass before SQL apply.
5. Confirm workflow's postflight validates the exact journal table, PK, index, no-repeat-update and no-delete triggers and checks its initialization is empty.
6. Services V3 write flags remain OFF. Authenticated Admin read-only inventory of dynamic D1 options, Notion catalog mappings, and receipts still needs live verification; do not infer that Notion is empty or D1 has any number of pending options.
7. In a separate, explicit owner-approved release, validate **one manually initiated** mapped option. Then consider enabling `SERVICE_CATALOG_NOTION_AUTO_ENABLED` and the existing Admin/Notion flags. Keep automatic page creation OFF unless independently approved.
8. Public filter gate `SERVICE_CATALOG_PUBLIC_FILTERS_ENABLED` remains independently OFF; enable only after production data quality and verified YES-option coverage.

## What this PR changes

- Lists 0139 as a manually selectable migration in the existing **protected, workflow_dispatch-only** production workflow; cannot run on PR merge, push, schedule or deployment.
- Pins exact SHA256 of `drizzle/0139_services_catalog_notion_auto_attempts.sql` and refuses altered SQL.
- Adds fail-closed D1 prerequisites (0138 exact schema and 0134 receipt infrastructure), partial/unrecorded schema rejection, exact postflight DDL/PK and immutable-trigger validation.
- Preserves historic 0128/0138 audit behavior, migration chain tests, and all existing migration semantics.
- No edits to `wrangler.jsonc`, runtime feature flags, Notion token, D1 data, admin permissions or automatic activation.

## CI

`node --test tests/production-d1-0139-rollout.test.mjs`

`npm run test:migration-safety`

`npm run db:check-migrations`

Existing full build, E2E map/public, Notion and Services V3 cron tests must remain green.
