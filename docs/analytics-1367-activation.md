# Psipedia analytics — PR #1367 / step 8 release checklist

This PR is a **draft-only, code-ready proposal**. It must **not** be merged or deployed before the checks below have been completed and the separate production migration has been approved.


## First-party sitewide statistics (new extension)

This PR also adds **genuine sitewide first-party analytics**, NOT a GA4 report.
- The single global `SiteAnalyticsTracker` records consented route views on all eligible public pages, including the homepage, article listing/details, dog breeds, events and help pages.
- D1 migration `0168_sitewide_first_party_analytics.sql` adds hourly total pageviews/sessions, hourly page breakdowns, hourly source/device breakdowns, and short-lived HMAC identity tables.
- Visit = new random session after 30 minutes of inactivity; unique visitors = distinct pseudonymous consenting browsers over 24 h / 7 d / 30 d, not identified people. Live counter = sessions with a pageview in the past five minutes, not a heartbeat/true active-tab count.
- Only the pathname is sent. Search parameters, full incoming referrer, raw IP, and browser User-Agent are **not stored**. Search/social categories and device class are finite labels. Origin, bot, internal cookie and HMAC IP-rate guards apply.
- Visitor local UUID rotates after 30 days, server HMAC identities expire ~35 days and are deleted by sampled bounded SQL cleanup. `all` leaves the unique visitor count unavailable rather than storing a perpetual visitor identifier.
- Pageviews are aggregated in D1 and retained for historical totals. **Historical sitewide visits cannot be reconstructed**: collection starts only after approved migration and deployment.
- This first-party feature uses the existing consent choices, but does not query or need Google Analytics.
- Run `npm run test:analytics` including sitewide SQL/route/session/report/consent tests, then isolated staging D1 and responsive screenshots.

**Protected rollout order**: keep 0167 and 0168 unactivated in normal CI/deploy. With owner approval, stage and verify 0167/0168 using the protected migration workflow, then deploy the Worker code with `PII_HASH_KEY` already configured. Confirm D1 write/read quotas and estimated cost before production rollout. Merging the code alone cannot create the tables, and deploying before the migrations will show an explicit unavailable state rather than fabricated zeros.

## Scope

- Reuses historical `article_read_hourly` counts and the existing article-read writer.
- Adds `directory_profile_view_hourly` for the **10 canonical Adresár categories** only (including breeders, veterinarians, trainers, salons and other directory profiles). Organizations, help/adoption records, events, and breed atlas entries are **not** counted as directory profiles in this version.
- First-party qualified view counting is **consent-gated** using the site's existing `psipedia-cookie-consent` choice. A view requires 10 seconds of visible reading, an internal-traffic exclusion, and a six-hour local cooldown. The profile endpoint also has HMAC-based server dedupe and IP throttling; these mitigate but cannot eliminate forged requests.
- Public article details show the total qualified read count. Public directory profile details **do not show** visit counts.
- Admin `Nastavenia → Štatistiky` and individual article/directory editors show genuine D1 counts, with an explicit unavailable state instead of false zeros.

## Database preflight — owner-dispatched only

1. Confirm actual production and staging migration journal states with the existing read-only migration tooling.
2. Verify `managed_articles`, `directory_profiles`, `article_read_hourly` (0105), and `security_rate_limits` exist. Verify no unreviewed pending partial migration.
3. Review `drizzle/0167_content_analytics_profile_views.sql` and `drizzle/0168_sitewide_first_party_analytics.sql`. Both are **UNACTIVATED** in `scripts/production-d1-migrate.mjs`; merge/deploy must not run it automatically.
4. After backup/recovery plan approval, apply only with the repository's protected, owner-authorized migration process, first to staging, then to production after a successful preflight. Do not replace or truncate `article_read_hourly`.
5. Verify `PII_HASH_KEY` is configured (32 random bytes, base64url). Never add the actual secret to a PR or logs.
6. No backfill of profile history: profile counts start at zero when tracking is first enabled. Articles retain their existing historical totals.

## Verification before marking ready

- Run `npm run test:analytics` (focused: SQL migration, views, server dedupe, consent, rankings, query plans).
- Run `npm run test:article-ux` and `npm run test:migration-safety`; check all existing editorial/profile regression tests.
- Run a validated TypeScript/build check, then Playwright desktop and **320/390px mobile** on article details, directory profile details, Admin Settings Statistics, and both admin editors. Check no horizontal overflow, focus visibility and screen-reader headings.
- On isolated staging D1, check a qualified consented view at 10s; a 5s or background page must not count; repeated refresh with the same browser inside 6h must not count twice; a draft/archived profile, bot, internal admin device, or cross-origin POST must not count.
- Verify opt-out prevents network calls and localStorage tokens; opt-in after page has been visible for 10s can count. Withdrawn consent must clear only popularity cooldown keys, not favorites or login settings.
- In the public popularity sidebar, compare D1 24h/7d sums for an article and a directory profile; confirm a single mixed TOP 5, correct canonical links and original compact visual.
- In admin, verify 24h/7d/30d/all values, chart sums, ranked links, read-only editor panels, and the missing-profile-migration fallback.
- Measure actual D1 read counts/latency and confirm the single-query 24h+7d profile ranking meets the site's operational budget. Avoid unbounded full-table visitor-event storage.

## Explicit limitations

- This is **not** a unique-visitor, live-users or whole-site page-view counter.
- Reports are consent-based qualified reads/views and must not be labelled as all website traffic.
- The site cannot reliably detect every bot; the HMAC-based limits reduce but do not eliminate manufactured numbers.
- The owner must review the scope of non-directory profile types before claiming they are covered.
- The PR has **not** been merged or deployed; no live production counts or live mobile layout have been verified by these code changes alone.
