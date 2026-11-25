# Production Stability & Network Recovery — 2/7

Implemented on the existing PR #1603. Code checkpoint: `0cbf028a455f37de9e4d3c6dd78612a2d7b28321`.

## Policy

Reuse `lib/public-read-retry.ts`. One retry per explicit read boundary after 120 ms, no delay on successful reads. Inspect a bounded Error.cause chain for known transport/locking failures; aborts, framework control flow, HTTP 4xx and recognized permanent schema/authorization/constraint errors veto retry. Cyclic or unresolved deep chains are not retried. The second error is propagated unchanged. An optional request AbortSignal stops a retry before replay; it does not cancel an already executing D1 query. Authenticated read-only consumers use an alias of the same implementation, not a second policy.

## Integration

- Article detail query inside the uncached reader (React memoization of metadata/page reads stays in place), article archive, editorial sections, breed atlas editorial teasers.
- Directory previews and hero read; existing primary listing retry remains. Optional failure isolation belongs to step 3.
- Help-category card listings, event category/calendar routes and public event calendar GET API (request signal passed).
- Partner activity, notification preferences and contact display after existing authentication; no retry on authentication/security methods or writes.
- Admin quality summary SELECTs, independently retried. Existing Admin query/navigation recovery preserved.

No global handler/fetch proxy, schema changes, Notion changes, external provider retries, or production deployment. Limits are per explicit operation, not a shared cross-page retry budget; whole listing retries can replay successful constituent queries. Further per-query optimization and request-level accounting remain for step 4/6. Full repository inventory/production trace correlation remain open.

## Verification

- Five new regression tests in tests/public-read-retry.test.mjs (wrapped cause, permanent/abort/control-flow veto, abort before/during attempt, abort during backoff, second error).
- Isolated local Node 22 test harness: 9/9 passed against the exact helper blob `5eadb5e826306adb37d7a3d44f6505424bf86ba8` (verified via git hash-object).
- Standalone helper TypeScript check passed: `tsc --noEmit --strict --target ES2022 --lib ES2022,DOM`.
- No full local checkout/dependency installation available; repository test suite, formatting command and build/CI still require verification. No claim of deployed behavior. No intended visual change.
