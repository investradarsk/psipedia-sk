# PR #1367 — Psipedia analytics: deployment and verification

This PR contains two distinct kinds of counts:
1. **Sitewide pageview counts (new request, D1 migration 0168):** only anonymous opening counts by hour and public pathname. No visitor tracking, identifier, cookies, local/session storage, IP hashes, source/referrer, device or session data.
2. **Existing qualified article/profile content counters (steps 1–7, D1 migration 0167 for profiles):** a separate feature with its own 10-second / 6-hour eligibility and consent behavior. Do not confuse these counts with ordinary pageviews. Article history stays intact.

## Sitewide pageview-only behavior

- `SiteAnalyticsTracker` is mounted once in `app/layout.tsx`. For each client-side navigation to an eligible visible public page it sends only `{"path":"/public-route"}` to `/api/analytics/pageview`.
- It does not read or set analytics cookies, visitor IDs, localStorage, sessionStorage, referrers, devices or IP addresses; it does not require clicking a cookie banner. The fetch uses `credentials: "omit"`.
- The endpoint accepts *exactly one* field, `path`. It rejects unknown payload fields and disallows admin/partner/API routes, query strings and encoded pathname data.
- The endpoint checks same-origin requests and rejects obvious crawlers, but neither stores nor hashes any request identity. Be aware that automated requests can still skew counts.
- D1 0168 creates exactly **two** tables:
  - `site_analytics_hourly(bucket_hour, pageviews)`
  - `site_analytics_pages_hourly(bucket_hour, path, pageviews)`
- Each valid view triggers one atomic D1 batch containing **two aggregate UPSERTs**. No individual visit/event rows are stored.
- Admin `/admin/nastavenia/statistiky` shows overall pageviews for 24h / 7d / 30d / all, time-series and top 10 pages. **No unique visitors, visits/sessions, devices, sources or online figures.**
- Google Analytics remains an existing separate feature; these sitewide counts do not depend on it.

## Protected migration / activation

- `0167_content_analytics_profile_views.sql` and `0168_sitewide_first_party_analytics.sql` remain **UNACTIVATED** in `scripts/production-d1-migrate.mjs`. Merging code does not apply migrations.
- New sitewide analytics is additionally gated by `SITE_ANALYTICS_ENABLED`. It is **off by default**, both in the root layout and in the POST route. This is an operator rollout switch, not a visitor consent.
- Apply the reviewed 0168 migration using the repository's existing protected, owner-authorized migration workflow (staging first). No automatic PR/build migration is permitted.
- After staging tests and verifying D1 write budget (two writes per pageview plus admin reads), set `SITE_ANALYTICS_ENABLED=true` in the approved environment. Do not touch existing article historical counts.
- Collection begins only after activation. Earlier sitewide pageviews are not available for backfill.

## Verification before merge

- `npm run test:analytics`: targeted SQLite, API, schema, report, consent and legacy content counter tests.
- `npm run test:article-ux`, relevant migration-safety tests, TypeScript build, lint, and PR-specific desktop/mobile visual checks per `AGENTS.md`.
- Confirm with a staging D1 that the API increments only two aggregate counters; no per-visitor rows, identity tokens or source/device data are created.
- Check pageview count once for a normal visible route load, once for a client-side navigation; refresh counts again as a new view.
- Confirm identical counts whether the visitor accepts or declines analytics cookies and no new cookie banner is added.
- Confirm disabled state performs zero analytics requests and the API returns 204 without touching D1.
- Verify hourly / daily chart values, period boundaries, all-time totals and top-page ordering. Check graceful unavailable states before 0168.
- Avoid claiming full QA until the actual test and screenshot evidence is available. The PR remains **Draft**, without merge or production changes.

## Data interpretation

Pageviews are **not unique visitors**. Multiple opens by one person count multiple times, and blocked requests may be missing. No attempt is made to link anonymous pageviews to individuals.

The existing qualified content-view system is separate. If the owner later chooses to remove that separate behavior, treat it as a distinct migration/compatibility task rather than silently changing historical article counts.
