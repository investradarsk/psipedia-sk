# CI consolidation — step 2: obsolete coverage retirement

Source baseline: f54e4125e071ffdb920ed8aab458b62c5890c3b4. Owner policy in [SQL-FINAL-CLEANUP.md](SQL-FINAL-CLEANUP.md): current SQL wins, including intentional blanks; do not compare, recover, copy or backfill retired JSON. That document confirms directory_profiles.source_data_json was already absent from production. Current schema does not declare it; Admin GET explicitly returns HTTP 410 for sqlParity=1.

## Removed
- Three test suites covering the retired Directory JSON candidate queue, aggregate readiness report and production runner (9 top-level test cases).
- Their three read-only scripts and dedicated manual-only workflow. Both SELECTs require the removed column and the runner cannot operate against current canonical schema. Removing the workflow with its tests prevents broken manual execution.
- Retired shadow parity reader library: its only indexed callers were the old test suite. The active Admin API already returns 410, rather than calling the reader.
- Eight obsolete shadow parity test cases; retain the ninth, which verifies authentication, retirement (410), SQL-enriched response and failure handling. Remove obsolete library path from the editorial audit workflow's triggers.

Net: 3 fewer test files, 17 fewer test cases, 1 fewer workflow, 4 fewer helpers. Historical docs/inventory snapshots deliberately retained. No production data, migrations or runtime handler changed.

## Retained
- SQL-only storage guard and live API 410 contract.
- Actual clean D1 migration integrity, CAS/atomic writes, active synchronization, authentication, privacy and schema checks. Do not delete tests merely because a fixture contains JSON or because a file name has step/phase/legacy.
- Other historical backfill and cleanup suites need coordinated review of their workflow, callers and production operational status; defer unresolved candidates to steps 3–4. The editorial storage audit remains intact except for the obsolete trigger reference.

## Evidence and limitations
Read current schema, API, tests, scripts, workflow definitions, owner policy and bounded GitHub code search for direct callers. No live D1 operation performed. Indexed search is not an exhaustive reference scan; full checkout, dependency scan, test execution and required CI are pending. Re-check concurrent PRs and test references before merge.
