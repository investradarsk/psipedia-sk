# Current integration audit — 2026-09-14

- Verified repository: investradarsk/psipedia-sk; clean initial working tree; GitHub API pull/push permissions confirmed.
- Main: ac6c95715dbe2d3865e811073422a98d90a38a78.
- Actual remote PR #48 HEAD: 2ceb2dd959c2440aba8b3e6d614aa0903da99fbb (advanced from requested 3e6a919; includes the three E2E fixes).
- Merge-base: 70b736870cf6417dafdf9539640ff6944b32792a.
- Files changed on both sides: package.json; .github/workflows/playwright-e2e.yml.
- Actual text conflicts from git merge-tree: package.json only. globals.css was unchanged on main since this merge-base.
- Transfer: clean branch directly from current main; apply existing PR diff. package.json starts from main and only adds test:admin-events and its invocation. Workflow starts from main and only adds the unchanged isolated Admin Events job.
- Mechanical verification: all main script values retained (test only extended); removing the added job reproduces main workflow byte-for-byte; all other 18 transferred files match actual PR HEAD before this audit-document update. No newer main file outside the event diff is changed.

## Bulk architecture

Events POST /api/admin/events/bulk has a distinct route and owns managed_events updates. It uses admin authentication, same-origin JSON checks, confirmed count and captured status/updatedAt guards in its atomic SQL. It does not access foundation snapshot tables or Directory records.
Foundation currently accepts only directory in its parser and registry, with publish/move-to-draft actions and explicit/all-matching selection. Its endpoints create/revalidate actor-bound snapshots; no generic execute endpoint exists. Directory IDs are numeric; event IDs are also numeric, but membership filters and eligibility contracts differ.
No sharing is necessary for compatibility. Migrating Events requires a module adapter, registry/parser extension and a designed execute lifecycle. Existing SQL snapshot columns are generic (text module/record ID), so no schema change is proven necessary, but the snapshot contract needs review. This is a separate follow-up, not a PR #48 gate. Foundation, Directory contracts, schema and endpoints are untouched.

## Existing E2E fixes retained

Six selects use explicit id/htmlFor. Dashboard controls are disabled until useSyncExternalStore reports hydration; aria-pressed is asserted after current-filter click. Previous trace timestamps showed the mobile click during client module loading with aria-pressed still false and 50 rows. Editor trace showed Program in DOM then hydration restoring fixture before toolbar click, so stale closure alone was insufficient. Textarea and toolbar are hydration-gated; formatting reads field.value and live selection, preserving controlled state, preview, focus and selection. Browser regression includes immediate Program to **Program**, DOM/React mismatch and a held module readiness test without fixed sleeps.

## Shared dependencies and safety

AdminShell, admin auth, image upload and existing API routes are unchanged on main between the merge-base and integration base. All newer Directory/Services/Help/LostFound components, tests, fixtures, migration setup and production smoke jobs remain from main. Events browser writes use only disposable localhost D1 or mocked bulk success responses. No production DB operation, merge or deployment is part of this integration.

---
Historical audit follows (its SHA and test results describe earlier work, not this integration):

# Admin Events 2.0 integration audit

Base: `70b736870cf6417dafdf9539640ff6944b32792a`
Original PR #48 head: `00732fc3a8d257e29561d0d5499b4bde75984a6e`
Merge-base: `76c5879c7dae6d29d7e456ce576fd92fc8255c33`

## Conflict audit before changes

Overlap: `.github/workflows/playwright-e2e.yml`, `app/globals.css`, `package.json`.
Actual text conflicts: `app/globals.css`, `package.json`. Workflow merged cleanly.

- package.json: retained every main script and appended test:admin-events to main test command. No dependencies changed.
- globals.css: retained entire main file verbatim, appended existing scoped event/Markdown styles. Help styles remain intact.
- workflow: main workflow unchanged except insertion of existing admin-events-e2e job; all other jobs retained verbatim.

## Preservation and integration

All 16 non-overlap implementation/test files match PR #48 byte-for-byte.
The only changed source paths versus main are the original 19 PR paths.
AdminShell, admin auth, image upload, Help, Lost/Found, moderation, worker and database schema remain main versions.
Event editor still calls uploadAdminImage(file, "events"); current upload API accepts events.
Event bulk API uses current getAdminApiUser and preserves origin/content-type guards and optimistic concurrency.
No functional integration rewrite was necessary. This audit document is the only extra path.

## Local validation

- npm test: PASS (includes production build, foundation security/moderation, current main suite including Lost/Found, event regressions, and Admin Events).
- npm run lint: 0 errors, 48 warnings.
- Admin Events: 8/8.
- Additional Help query/preview/write safety: 23/23.
- Browser: pending CI; no local Chromium download attempted.

## Files changed on main since merge-base (77)

- `.env.example`
- `.github/workflows/playwright-e2e.yml`
- `.github/workflows/submission-foundation-ci.yml`
- `app/admin/dopyty/page.tsx`
- `app/admin/pomoc/page.tsx`
- `app/admin/stratene-najdene/[id]/page.tsx`
- `app/admin/stratene-najdene/novy/page.tsx`
- `app/admin/stratene-najdene/page.tsx`
- `app/api/admin/help/preview/route.ts`
- `app/api/admin/import/route.ts`
- `app/api/admin/lost-found/[id]/route.ts`
- `app/api/admin/lost-found/route.ts`
- `app/api/admin/moderation/submissions/[id]/route.ts`
- `app/api/admin/moderation/submissions/route.ts`
- `app/api/admin/uploads/route.ts`
- `app/api/directory/inquiries/route.ts`
- `app/globals.css`
- `app/pomoc-psom/najdene-psy/[slug]/page.tsx`
- `app/pomoc-psom/najdene-psy/page.tsx`
- `app/pomoc-psom/stratene-psy/[slug]/page.tsx`
- `app/pomoc-psom/stratene-psy/page.tsx`
- `app/sitemap.ts`
- `components/admin-data-import.tsx`
- `components/admin-help-dashboard.tsx`
- `components/admin-help-import-preview.tsx`
- `components/admin-inquiry-dashboard.tsx`
- `components/admin-lost-found-dashboard.tsx`
- `components/admin-lost-found-editor.tsx`
- `components/admin-lost-found.module.css`
- `components/admin-shell.tsx`
- `components/directory-contact-form.tsx`
- `components/lost-found-dog-detail.tsx`
- `components/lost-found-dogs-page.tsx`
- `components/lost-found-dogs.module.css`
- `components/site-header.tsx`
- `db/foundation-schema.ts`
- `db/lost-found-dogs-schema.ts`
- `docs/CLOUDFLARE-NASADENIE-SK.md`
- `docs/submission-foundation-contract.md`
- `drizzle.config.ts`
- `drizzle/0029_submission_moderation_security_foundation.sql`
- `drizzle/0030_lost_found_dogs.sql`
- `drizzle/0031_directory_inquiry_notifications.sql`
- `drizzle/0032_publish_verified_help_organizations.sql`
- `lib/admin-image-upload.ts`
- `lib/audit-identity.ts`
- `lib/directory-inquiry-notifications.ts`
- `lib/directory-inquiry-store.ts`
- `lib/editorial-email.ts`
- `lib/help-admin-query.ts`
- `lib/help-import-preview.ts`
- `lib/help-store.ts`
- `lib/lost-found-dog-store.ts`
- `lib/lost-found-dogs.ts`
- `lib/lost-found-lifecycle.d.ts`
- `lib/lost-found-lifecycle.js`
- `lib/moderation-store.ts`
- `lib/pii-crypto.ts`
- `lib/private-media.ts`
- `lib/rate-limit.ts`
- `lib/resource-access-store.ts`
- `lib/resource-access.ts`
- `lib/submission-feature-flags.ts`
- `lib/submission-security.ts`
- `lib/turnstile.ts`
- `package.json`
- `tests/directory-change-requests.test.mjs`
- `tests/directory-inquiry-notifications.test.mjs`
- `tests/e2e/lost-found-dogs.spec.ts`
- `tests/fixtures/lost-found-e2e.sql`
- `tests/help-admin-query.test.mjs`
- `tests/help-import-preview.test.mjs`
- `tests/help-import-write-safety.test.mjs`
- `tests/lost-found-lifecycle.test.mjs`
- `tests/submission-foundation.test.mjs`
- `worker/index.ts`
- `wrangler.jsonc`

## Files changed on PR since merge-base (19)

- `.github/workflows/playwright-e2e.yml`
- `.gitignore`
- `app/api/admin/events/bulk/route.ts`
- `app/globals.css`
- `components/admin-event-dashboard.tsx`
- `components/admin-event-editor.tsx`
- `components/admin-event-markdown-editor.tsx`
- `components/event-detail.tsx`
- `components/event-markdown.tsx`
- `docs/testing/admin-events-2.md`
- `lib/admin-events.ts`
- `lib/event-markdown.ts`
- `lib/event-store.ts`
- `package.json`
- `scripts/bootstrap-admin-events-e2e.mjs`
- `scripts/check-admin-events-local.mjs`
- `tests/admin-events-loader.mjs`
- `tests/admin-events.test.mjs`
- `tests/e2e/admin-events.spec.ts`
