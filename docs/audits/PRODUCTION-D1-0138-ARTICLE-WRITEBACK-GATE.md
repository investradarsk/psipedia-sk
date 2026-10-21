# Production D1 0138 — manual release gate (PREPARED, NOT APPLIED)

Coordination: #917. Depends on merged PR #950 (writeback implementation) and
merged PR #908 (migration 0137). This PR does **not** execute a production
migration and does not enable Notion content writeback.

## What this PR changes

- Allow `0138_article_editorial_outbox.sql` in the existing owner-dispatched
  `production-d1-migrate.yml` with exact typed confirmation
  `APPLY-0138-psipedia-sk-db`, on current `main`, in protected `production`
  environment, with existing secret and concurrency lock. No push/PR/schedule.
- Pin the exact hash of the already-merged 0138 SQL; no SQL edits or new article
  model. Only the existing D1 `psipedia-sk-db` is eligible.
- Preflight requires the exact recorded migration ledger through 0137 and
  refuses skipped/renamed/reordered steps, partial/manual schema objects,
  existing 0138 application, or missing canonical article/Notion mapping tables.
- Apply uses existing scoped Wrangler D1, preflight checkpoint/Time Travel and
  one-shot refusal if state changed after preflight.
- Postflight validates each outbox column, required UNIQUE and PK clauses,
  foreign keys with ON DELETE CASCADE, lease/updated indexes, exact pinned SQL,
  and a **new, initially empty** journal table. Existing global D1 data
  preservation and production smoke remain in force.

## Release procedure — separate owner approval required

1. Merge this PR only after **exact-head** migration safety, D1 SQLite contract,
   TypeScript/build and security checks pass. Merging does **not** run the
   production migration.
2. Independently inspect the actual production D1 migration ledger using the
   protected preflight: 0137 must be the latest applied migration; no 0138
   already applied, changed schema, unknown newer migrations or wrong database.
   A merged PR is **not proof** that 0137 was applied remotely.
3. Request explicit owner approval for **one** production run of 0138.
4. Owner manually dispatches **Production D1 Migrate** on current `main`;
   select `0138_article_editorial_outbox.sql`, type
   `APPLY-0138-psipedia-sk-db` verbatim, and satisfy protected environment
   approval. A failed preflight must stop before any mutation. Never force.
5. Verify production migration ledger, exact outbox schema, zero initial journal
   rows, Time Travel recovery evidence and all smoke checks. Keep the report.
6. Leave `NOTION_ARTICLE_CONTENT_WRITEBACK_ENABLED=false`. Any enabling,
   controlled article test, real Notion PATCH, deployment, backfill or publishing
   is a **separate** owner-reviewed change after successful 0138 verification.
   Notion block PATCH operations are not an atomic transaction.

No automatic rollback: if a D1 migration partially fails, preserve evidence,
inspect the recovery bookmark and agree a remediation plan before more writes.
