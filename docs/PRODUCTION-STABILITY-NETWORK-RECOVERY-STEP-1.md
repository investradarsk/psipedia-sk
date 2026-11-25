# Production Stability & Network Recovery — 1/7: read-path audit

Date: 2026-11-25. Audited main: `f95b2c26495f9d0a8fe39bee6e97411484fee635`.

Scope: public rendering, authenticated Admin/Partner reads, public read APIs, Worker edge and selected external fetch providers. Notion synchronization, SQL schema, writes, deployment and secrets are out of scope. This is a source-based initial risk inventory, not an exhaustive enumeration of every SQL statement or production trace.

## Incident evidence

Cloudflare Observability showed 119 error events in the displayed one-hour window (all error types, not 119 failed page requests). At least 11 visible `Network connection lost` events clustered around 20:55:22–20:55:35 CET; the supplied event was GET /adresar.rsc at 20:55:35.093, Ray a60336301fca9b53, Worker version 2d4b467a-0ab8-4f88-9eac-3a97d67dea42. No response status, stack or child spans were available for that event. The exact failing dependency and deployed commit are unconfirmed. Notion publication errors are explicitly excluded from this effort. No production changes were performed.

## Existing protections to retain

- `lib/public-read-retry.ts`: one retry after 120 ms for recognized transient transport/locking errors. Tests in `tests/public-read-retry.test.mjs` cover success, bounded failure, nonretryable errors and directory diagnostics. No retry of auth, writes, unknown schema errors.
- `app/adresar/page.tsx` and `app/adresar/[category]/page.tsx`: protected primary listing; `lib/public-directory-read-diagnostics.ts` identifies fixed read stages, then rethrows.
- `lib/navigation-store.ts`: cached successful navigation, retry, recent/default menu on transient failure. Preserve managed visibility/map gating.
- `lib/directory-popularity.ts`, `lib/article-discovery.ts`: existing popularity reads already catch failures and return empty optional collections. Do not blindly stack retries over swallowed failures.
- `app/admin/page.tsx`, `lib/admin-overview-read.ts`, `lib/admin-automation-reliability.ts`: independent optional dashboard reads, five-second wait budget, explicit UNAVAILABLE status. `components/admin-query-provider.tsx` disables automatic retries (queries and mutations). `app/admin/error.tsx` and `components/admin-navigation-recovery.tsx` offer recovery and guard unsaved edits.
- `worker/index.ts`: anonymous HTML cache, immutable asset/media cache, existing sitemap last-good recovery, protected canonical breed redirect. Preserve cache scope, version separation, private/no-store and authentication.
- `lib/geoapify-geocoder.ts`, `lib/google-places-provider.ts`: bounded fetch timeouts and classified provider errors; Google Places search uses billable POST. Preserve provider budget and rate limits.

## Verified risk register

| ID | Source boundary | Observed gap | Priority / phase |
| --- | --- | --- | --- |
| R01 | lib/public-read-retry.ts | Classification only checks top-level message; no nested cause inspection or retry outcome event. Review wrapped errors; retain strict allowlist. | P1 / 2,6 |
| R02 | components/directory-page.tsx | Category previews, hero and discovery joined by Promise.all; diagnostics rethrow. Preview or hero outage can fail otherwise valid directory. | P1 / 2,3 |
| R03 | lib/section-visual-store.ts | getStoredSectionVisual throws non-missing-table errors before default visual resolution. Public hero fallback must not weaken Admin editor reads. | P1 / 3 |
| R04 | app/page.tsx | Multiple protected content blocks still share rejecting Promise.all; banner colours and optional featured content must not block all content. Hero is separate but awaited. | P1 / 3 |
| R05 | app/clanky/page.tsx; app/clanky/[slug]/page.tsx; app/[section]/[slug]/page.tsx | Primary article reads and several optional detail reads lack explicit route retry; detail waits for magazine, discovery, author, related breeds and counts. | P1 / 2,3 |
| R06 | app/plemena/page.tsx | Atlas and optional editorial/visual reads share Promise.all; several have existing retry or catch, others lack explicit isolation. | P1 / 2,3 |
| R07 | app/[section]/page.tsx; app/[section]/[slug]/page.tsx | Main events listing/calendar protected at root but typed subsection reads are not uniformly protected. Calendar must not suppress valid list; distinguish unavailable from no events. | P1 / 2,3 |
| R08 | app/pomoc-psom/[category]/page.tsx; lib/help-store.ts | Public help cards depend on direct SQL reads; review bounded retry at proven read-only boundary. Preserve organization routing and correct totals. | P1 / 2 |
| R09 | lib/directory-store.ts | Listing performs table checks, canonical breed IDs, facet batch, parallel count/options and page/link hydration. Overview then separately reads category previews. Measure D1 round trips and rows before changing; whole-list retry may replay all completed queries. | P1 / 4 |
| R10 | app/api/public/events/calendar/route.ts | Calendar and listing can reject together; no explicit bounded retry in route. Preserve API contract, genuine empty results and distinguish transient 503. | P1 / 2,3 |
| R11 | worker/index.ts | Awaited cache matches and main handler.fetch can reject; cache lookup should be best-effort where appropriate. Never replay whole handler indiscriminately (streaming, auth, side effects). | P1 / 3,6 |
| R12 | app/layout.tsx; lib/public-partner-session.ts | Optional header identity lookup shares Promise.all with navigation; ensure transient error cannot grant authorization or create false signed-out state. Do not cache identities across requests. | P1 / 3 |
| R13 | app/partner/upozornenia/page.tsx; app/partner/nastavenia/page.tsx | Independent account reads share Promise.all after auth; preferences and security failures must be explicitly unavailable, not invented defaults. | P2 / 2,3 |
| R14 | lib/admin-dashboard-store.ts | Legacy getAdminModuleCounts returns zero counts on error; verify live consumers before change. getAdminDataQualitySummary has unprotected parallel reads. Existing main Admin dashboard already uses explicit unavailable policy. | P2 / 2,3 |
| R15 | components/native-history-navigation.tsx; app/layout.tsx; app/admin/error.tsx | Existing public history helper is Chrome iOS-specific, not general RSC recovery. No root or directory error.tsx at baseline. Admin recovery must be reused/preserved, not auto-reload dirty forms. Verify Vinext semantics in tests. | P1 / 5 |
| R16 | lib/article-store.ts | Public and Admin readers have image-column projection and metadata/detail reads; ensureArticleStore is no-op. Measure repeated read/projection work; never infer missing article from transport error. | P2 / 4 |
| R17 | lib/google-places-provider.ts; lib/geoapify-geocoder.ts | Existing timeout/error classification; no unconditional retries for provider POST or billable calls. Broader fetch inventory required before changing other providers. | P2 / 2 |
| R18 | lib/sitemap-runtime.ts; worker/index.ts | Existing staged sitemap + last-good protection. Verify no false success/empty sitemap or private caching during recovery; no replacement architecture. | P1 / 7 |

P1 = public availability, correctness/security or primary recovery; P2 = secondary/targeted improvement. Route mapping note: /podujatia is implemented by app/[section]/page.tsx, not a dedicated app/podujatia/page.tsx.

## Implementation contract for 2–7

2. Extend the existing retry helper rather than introducing a second generic wrapper; only explicit idempotent reads, finite request-level retry budget, no retry for caller abort, auth, redirects, 4xx validation, unknown schema errors, mutations or external side effects. Avoid nested retries and broad DB/handler proxies. Check readers for hidden writes before wrapping. Preserve original error on exhaustion and log outcome using safe fixed labels.
3. Separate essential content from optional enrichment. Reuse existing defaults, hide optional sections or show unavailable; no fabricated empty listing, zero totals, preferences, permissions or successful writes. Essential transient failures should use appropriate 503/no-store where runtime permits before headers commit; never claim a streamed 200 is a verified 503. Keep security fail-closed.
4. Measure round trips, query duration and rows read; use isolated fixture data and existing profiling scripts. Optimize only proven redundant work without changing filtering, page counts, SQL authority or schema. No production queries/migrations from this PR.
5. Verify Vinext RSC error handling; recover navigation with a bounded, user-safe retry or document navigation only where safe. No global fetch monkey patch, infinite reload, auto-replay mutations or loss of dirty Admin/Partner forms.
6. Structured fixed operation/stage/dependency, transient flag, attempt/outcome, duration and correlation identifier where available; no SQL, tokens, raw user inputs, private URLs or account data. Differentiate expected abort, cache failure, dependency failure, rendering failure and exhausted retry. Preserve existing diagnostics.
7. Regression tests for transient then success, persistent failure, schema/auth nonretry, optional vs essential failures, genuine empty results, cache fault, public/partner/admin RSC navigation, unsaved form guard, sitemap validity, no mutation replay. Run focused tests and applicable CI, exact PR visual evidence if UI changes. Compare before/after production metrics only after owner-approved deploy.

## Coverage and limitations

GitHub source search and direct reads at pinned main covered the shared Worker, retry/cache/session layers and representative public, Admin, Partner and API call paths. GitHub search is ranked/limited; it does not establish a complete repository-wide statement inventory. Remaining work: enumerate every reachable read/fetch from a full checkout or route inventory, inspect all callers of legacy zero-return functions and map/other public API branches, distinguish hidden write paths, and correlate production trace/invocation status and deployment revision. No runtime tests were executed in this audit-only step. Do not mark exhaustive audit/production root cause proven. Open PRs #1599 (public UI) and #1600 (SQL cleanup) may change affected paths: rebase/reinspect latest main before implementation. Do not merge or deploy without explicit approval.
