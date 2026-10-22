# SERVICES V3 — production D1 0138/0139 read-only gate

**Purpose:** Establish real production evidence, not infer D1 history from merged PRs. This procedure only performs allowlisted `SELECT` queries against canonical production Cloudflare D1 and returns sanitized counts. No Notion calls, `APPLY`, DML, PRAGMA commands, Cloudflare flag change, deployment, or public data mutation.

## Execute after this PR is merged and reviewed

1. GitHub → **Actions** → **Services V3 Production Read-only Gate** → **Run workflow**.
2. Choose **main** and enter the exact confirmation `AUDIT-SERVICES-V3-0139-psipedia-sk-db`. This action is **READ ONLY**; do **not** run **Production D1 Migrate** yet.
3. Read the job logs or download `services-v3-d1-0138-0139-readonly-<run-id>` artifact. It contains only a decision, source SHA, 0138/0139 status and aggregate counts.
4. A `READY_TO_REQUEST_0139` (green) verdict requires a complete, unmodified production migration ledger through 0138, exact immutable 0138 table, indexes, FK and column constraints, no unrecorded 0139 objects, and valid D1 coverage counts.
5. A `NO_GO` verdict means stop and reconcile the reported code. Examples: 0138 missing, 0138 schema drift, 0139 physical objects without ledger, unexpected later migration, insufficient credentials/identity, or an unavailable D1 read. The protected **Production D1 Migrate** workflow must not be run until safe.
6. `ALREADY_APPLIED` means 0139 exists in the live ledger with verified DDL; do **not** repeat the migration.
7. Send the run link or paste the structured report into the main Psipedia technical management chat to decide next steps.

## Next action after successful read-only verification

If `READY_TO_REQUEST_0139`, **separately authorize** the production 0139 mutation. Then execute the already-merged protected **Production D1 Migrate** workflow with:
- target: `0139_services_catalog_notion_auto_attempts.sql`
- confirmation: `APPLY-0139-psipedia-sk-db`

Its own protected runtime preflight independently rechecks the DB ledger, exact 0138 schema, D1 identity and Time Travel bookmark before writing; postflight verifies immutable 0139 DDL and initialized empty attempt journal. Do not bypass any red checks.

Even after 0139 migration, hourly Notion automation and public Services V3 filters remain **OFF by default**. Next steps need actual Admin Notion mirror inventory, a single authenticated manual service mirror and separate approval of runtime flags. No historical profile backfills or content repair are required for this gate.

## How we prevent accidental production changes

The dedicated verifier workflow is `workflow_dispatch`-only, checks current main SHA and a protected `production` environment, pins the canonical D1 account/database identity and supplies a short hardcoded SQL query allowlist. Every query is a `SELECT`, with schema introspection via read-only table-valued SQLite `pragma_table_info()` / `pragma_foreign_key_list()` rather than direct `PRAGMA` commands. Reports omit profile IDs, addresses, tokens and raw data. The verifier cannot invoke migration or Notion mutation operations.

Offline tests: `node --test tests/services-v3-production-readonly.test.mjs`. CI reruns them on the Draft PR.
