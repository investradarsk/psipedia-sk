# Production Stability & Network Recovery — step 7/7

Reviewed checkpoint: 3ec90759d9d8b63165ca3f77780c2823d4a75026. Main at review: f95b2c26495f9d0a8fe39bee6e97411484fee635. Branch was mergeable and based on current main, with no behind commits at initial comparison.

## Integration findings and fixes

On checkpoint 69ec2af808ee9b82a19fefa13d5d3c2707f34e8d, three CI workflows failed:
- Admin Stability Read-Only Regression (run 45702290289): one new TS2345 in event-calendar.tsx (optional boolean passed to setState). Fixed by testing calendarUnavailable === true.
- Public HTML Cache Safety Guard (run 45702291043): six assertions failed because the source guard looked for the old cache.put call. Updated the assertion to track the new best-effort helper and use the actual helper in the cache behavior fixture, preserving the ordering and privacy rules.
- Playwright E2E and production smoke (run 45702290999): CI V2 npm script parity rejected additions to test:perf-fastpaths. Recorded intentional additions in the baseline package-script contract without removing old tests; explicitly registered combined article SQL test too.

Re-ran nine isolated tests for navigation recovery and stability diagnostics on the exact unchanged helper/test Git blobs; 9 passed, 0 failed. Earlier local SQL equivalence evidence remains in step 4. These are not full project or browser checks.

## Merge gates

- Recheck all required workflows against latest HEAD, including CI V2 parity, type regression, HTML cache safety, full build/integration and relevant Playwright.
- Exact revision visual evidence and owner review still required; visual workflow was skipped on the reviewed draft revision.
- Recompare current main and inspect overlapping PRs #1599/#1600 before merge if main advances.
- Production trace attribution, actual D1 savings and event visibility are unverified; production observation only after owner-approved deployment.
- No deploy, merge, schema migration, production D1 mutation, or Notion change performed.

Step 7 review and fixes are recorded, but verification gate remains open until required CI and visual evidence pass. Existing baseline TypeScript errors (331 on main in the inspected run) are not claimed fixed. No clean-project typecheck or complete full-checkout formatting claim.
