# Partner 0171/0172 — guarded schema rollout BEFORE #1437

This is an infrastructure-only PR. It does not deploy the Partner application, alter production D1, or change Notion/Admin/public writers.

## Why separate from #1437
The manual production GitHub Action must exist on main **before** #1437 (application and canonical drizzle migrations) is merged. The SQL here is staged under pending-migrations and pinned byte-for-byte to #1437. It is NOT part of the generic drizzle migration directory.

## Order
1. Merge only this infrastructure PR, after green CI.
2. On main, use Actions > Production D1 Partner 0171/0172 > Run workflow, choose audit; confirmation AUDIT-psipedia-sk-db. Check 10 Partner and 3 Directory 0170 tables, 4 SQL contact columns, no active manager duplicates, no active legacy roles, no inactive managers, zero foreign-key violations, and no partial 0171/0172 objects.
3. After separately approving the production mutation, dispatch apply-0171 using APPLY-0171-psipedia-sk-db. The runner captures a pre-apply Time Travel bookmark into an artifact, runs exactly 0171, then checks postflight.
4. After reviewing a successful 0171 run, separately dispatch apply-0172 using APPLY-0172-psipedia-sk-db. The runner captures a new bookmark and verifies the empty 0172 table.
5. Run audit again. Only after physical schema is verified and #1437 CI + Notion conflict policy are settled may the app PR #1437 be merged.
6. PR #1451 / 0173 follows later. Remove the staged SQL copy only after canonical drizzle migrations from #1437 have landed.

No generic migrations apply, no ledger edits, no automatic restore, no production apply on PR merge. If an audit fails, STOP. A Time Travel restore can roll back unrelated writes and must never happen automatically.
