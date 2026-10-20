# PSIPEDIA — Production D1 0134 strictly read-only verification

**Status:** isolated Draft PR. Source preparation only. No owner authorization to run production verifier, migrate D1, sync Notion, deploy or enable Services V3.

## Scope

A separate owner-dispatched verifier classifies migration 0134_services_admin_change_audit.sql on the canonical psipedia-sk-db D1:

- NOT_APPLIED_VERIFIED: approved ledger is present through 0133; 0134 is absent from ledger and physical schema.
- APPLIED_AND_VERIFIED: exact 0134 ledger and physical objects match immutable approved DDL and 0133 remains valid.
- SCHEMA_DRIFT_BLOCKED: physical DDL, constraints, index or trigger definitions differ from approved SQL, or integrity fails.
- PARTIAL_OR_INCONSISTENT: history disagrees with actual objects, is duplicated, missing or noncontiguous.
- UNKNOWN: remote read is invalid or incomplete, or the schema/integrity result cannot be trusted.

A blocked or unknown result produces a nonzero exit code. **NOT_APPLIED_VERIFIED is not an apply authorization. APPLIED_AND_VERIFIED is not Services V3 activation approval.**

## What is verified

- Canonical source SHA-256 f6520f39af34739ccd72d424f7944923b6d0c5813ca3cc5d966a61821ebccda5 for 0134, and existing immutable 0133 SHA.
- Contiguous, duplicate-free migration ledger consistent with repository SQL filenames, permitting later migrations when their history is consistent.
- Exact CREATE DDL of two 0134 tables, one explicit index, ten triggers and the implicit receipt UNIQUE index; constraints and trigger bodies including append-only and DRAFT-to-ACTIVE receipt checks.
- Unchanged approved 0133 table/index definitions, its four implicit indexes, and aggregate orphan counts for profile references.
- Sanitized report with status, recognized/missing/drifted object names, approved source hash, audited main SHA and technical reason code; never raw rows.

Trigger definitions are parsed by recognizing statement starts, not splitting their bodies on semicolons.

## Transport and guard rails

Only three **literal** allowlisted read queries may reach wrangler d1 execute --remote --json --command:

1. SELECT id,name FROM d1_migrations ORDER BY id.
2. A fixed SELECT type,name,tbl_name,sql FROM sqlite_master WHERE ... ORDER BY type,name scoped to the approved Services V3 tables.
3. The existing read-only SQL_METRICS_0133 aggregate-only SELECT, executed only when 0133 history and schema are eligible for integrity checking.

The adapter refuses arbitrary SQL, PRAGMA, DML, DDL, ATTACH, stacked statements and other databases. The exact GitHub Actions context, current main SHA, protected production environment, fixed Cloudflare account and D1 identity, presence of protected token and both immutable SQL hashes must pass **before** remote queries. The workflow shares the existing production-d1-migration concurrency lock and restricts GitHub permission to contents: read. It never imports the production migration runner.

The workflow confirmation text is **AUDIT-0134-state-psipedia-sk-db**; this is not an APPLY phrase. The source is .github/workflows/production-d1-0134-readonly.yml. It can be manually dispatched only after future explicit owner approval and merge to main; **do not run from Draft PR**.

A separate production-d1-0134-offline-ci.yml executes syntax validation, in-memory tests and repository migration safety, without secrets, Cloudflare connection, migration apply or deployment.

## Deliberate limits

- This audit does not verify the trustworthiness of a live Notion reconciliation receipt or complete a Notion worker.
- It cannot reveal effective deployed Services V3 flag values from repository configuration. Both flags are reported UNKNOWN, never guessed. API read availability does not prove flag state.
- It cannot verify production Services V3 browser UI, live HTTP routes or authorize activation.
- It does not create Time Travel bookmarks, a protected APPLY target or a rollback operation.
- Trigger-based append-only protection is not cryptographic immutability against schema administrators.
- It does not modify migration 0133 or 0134, profile values, schemas, logs, configurations or Notion.

## Offline testing and later owner decisions

Offline test command: node --test tests/production-d1-0134-readonly.test.mjs
Static migration safety: npm run db:check-migrations

Fixtures use temporary in-memory SQLite and synthetic data only; no production credentials, real D1 or writer.

**Current authorization:** source and offline CI preparation only. Owner must **separately approve** the Draft PR merge and **separately authorize** a single read-only production verifier run. NOT_APPLIED_VERIFIED still requires an entirely different, protected, owner-approved migration rollout. Feature-flag activation and deployment each need separate approvals.
