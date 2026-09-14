# Admin podujatí 2.0

Branch: `codex/admin-events-2`, base main `f5a17978cf9a42280413bdb2a22dcb35426bd864`.

Admin reads all event summaries (no SQL LIMIT), searches the entire set and paginates the visible list at 50 rows. The six headline counts always refer to the complete set. Cancelled events have their own filter and count and are excluded from the three time buckets. Publication status is independent. Month/year mean the start date. Date sorting groups current, upcoming, past (latest end first), then cancelled. Dates reuse `eventDateStatus` and `bratislavaDateKey` without changes to public listing logic.

The subset Markdown renderer is shared by both editor previews and public details. It emits React elements only: paragraphs, line breaks, h3, strong, em, lists and links with a protocol allowlist. Raw HTML stays escaped text. No DB migration or content rewrite is required. Import and individual event save semantics are unchanged.

Bulk status changes require an explicit count confirmation. The endpoint rechecks authentication, origin, unique IDs and the reviewed status/updatedAt. One guarded SQL statement updates all selected events or none when a row is missing/stale. It only changes status, updated_at/by and, on first publication, published_at. Content, SEO, images, slug and creation audit stay intact. Maximum selection per operation is 500. Tests mock successful browser bulk requests; no live bulk publication is part of verification.

## Verification in this workspace

- Production build and its mandatory validation suites: PASS.
- Admin unit/SQL/render tests: 8/8 PASS (including 650-row SQL retrieval, 175/4/171 counts, every search field, filters, Markdown, XSS and atomic status changes).
- Existing date/phase 3/phase 4 tests: 21/21 PASS.
- Lint: 0 errors, 43 warnings elsewhere/unchanged image patterns.
- Actual isolated local D1 HTTP checks: PASS (175/4/171, origin/stale/count rejection without changes, list and editor SSR return 200).
- Desktop/mobile Playwright: BLOCKED, all 8 attempts could not launch Chromium. Browser download timed out. The separate cloud browser also rejected localhost with ERR_BLOCKED_BY_CLIENT.
- Screenshots: NOT produced. Visual layout and browser interactions are not claimed as verified.
- Standalone tsc: blocked by missing Cloudflare generated declarations and .ts extension configuration in this checkout; production build passed. No new diagnostic points to the new admin modules.

Do not treat this report as visual approval or deployment approval.

## Reproduce the browser checks on a machine with Chromium

Use an isolated checkout with no pre-existing local D1 data. The fixture helper refuses to replace any non-fixture events. All of the commands below are LOCAL ONLY.

1. `npm ci` and `npx playwright install chromium`.
2. Start `PSIPEDIA_E2E_LOCAL_BOOTSTRAP=1 npm run dev -- --host localhost --port 5173`.
3. Request `http://localhost:5173/api/admin/events` once to materialize the local D1 file (an initial missing-table response is expected).
4. `PSIPEDIA_E2E_LOCAL_BOOTSTRAP=1 node scripts/bootstrap-admin-events-e2e.mjs`.
5. `npm run test:admin-events`.
6. `PSIPEDIA_E2E_LOCAL_BOOTSTRAP=1 E2E_BASE_URL=http://localhost:5173 node scripts/check-admin-events-local.mjs`.
7. `PSIPEDIA_E2E_LOCAL_BOOTSTRAP=1 PSIPEDIA_ADMIN_EVENTS_E2E=1 E2E_BASE_URL=http://localhost:5173 npx playwright test tests/e2e/admin-events.spec.ts --workers=1`.

The last command runs desktop and mobile scenarios and writes list/editor screenshots to `.e2e-artifacts/admin-events/`. Other E2E workflows skip this dedicated fixture suite unless `PSIPEDIA_ADMIN_EVENTS_E2E=1` is supplied. These tests must never target production. The local helper creates the existing schema for the shared layout but never executes migration data repairs.
