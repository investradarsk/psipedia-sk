# CI consolidation — 9/10 audit / merge policy

Verified repository ruleset 23739696 via GitHub API at step start: active, strict up-to-date required status checks, precisely "Build, lint and unit/integration tests" and "Breed CI bootstrap, all-breed regression and Playwright" (GitHub Actions integration 15368). Both names remain in central workflow. No repository settings mutation is needed or performed. No bypass/force-merge.

## Recurring supplementary audits (UTC)
- Existing Monday 03:17 link health and 04:17 Lighthouse: unchanged.
- Tuesday 03:37: Knip report (non-blocking findings); remove PR trigger, keep manual dispatch and report artifacts.
- Wednesday 03:37: Admin performance source metrics alongside existing regression checks; PR continues to run all asserted tests, scoped TypeScript and SQL-plan validation, but not extra source-baseline capture.
- Thursday 03:47: previous historical public-web-perf branch-prefix matrix; replace PR trigger and historical branch gate with weekly/manual coverage, preserve all original commands. It previously only ran for the retired perf/public-web-10-steps-* branch pattern, but generated skipped checks for other PRs. Standard central coverage and existing focused gates are unchanged.
- Admin stability: existing non-blocking production-style build diagnostic is manual-only; keep actual regression tests, benchmark and baseline type gate on relevant PRs.
- Existing daily Notion schema drift, production smoke and explicitly protected production D1 audits remain unchanged. Never schedule credential-bearing manual production operations without their confirmation guard.

All new schedules are read-only with respect to production, and take effect only after merge to the default branch. The cadence is chosen to spread out weekly load, not user-specified. No tests deleted, no production secrets or mutations added. Existing CI contract checks assert this partition. Latest step 8 runs were partially complete when inspected; full verification and timing in step 10.
