# Navigation loading UX

Scope: UI feedback only. No changes to cache, Worker, D1, image processing,
content, metadata or root-layout data loading.

- `instrumentation-client.ts` uses the supported `onRouterTransitionStart`
  hook in the pinned Vinext 0.0.50 runtime. It observes accepted Link/router
  transitions and history traversal, without replacing Link, history or fetch.
- Click classification excludes modifiers, downloads, non-self targets,
  non-HTTP/external URLs and same pathname/query (including hash-only changes).
  It also guards Vinext's transition hook for download links.
- The external UI store notifies synchronously. The header contains an
  absolutely positioned 3px indeterminate bar, with no percent values, overlay,
  focus target or live-region announcements. Existing header stacking keeps it
  below dialogs and cookie consent. Reduced motion uses a static solid line.
- The pathname/query commit ends the indicator. A 180ms minimum visible time
  avoids single-frame flashes; new transitions invalidate old completion timers.
  Page hide/show and uncaught errors reset it. A 12-second watchdog clears
  cancellations/failures that do not produce a route commit; it is a UI safety
  cutoff, not a request timeout or assertion that the page has finished loading.

## Route loading boundaries

No `loading.tsx` is shipped in this change. Candidate article, breed, directory
and help fallbacks were tested and removed: the breed boundary changed streamed
HTML chunk placement and failed the existing complete-FCI-content integration
test. Altering those rendering/SEO expectations or weakening that test is
outside this UI-only task. Events and reviews also share `[section]` routes
with unrelated content, where one generic skeleton would be inappropriate.

## Validation

- `npm test` includes classification, synchronous activation, minimum visible
  time, stale completion, cancellation and watchdog tests.
- `tests/e2e/navigation-loading.spec.ts` runs on both existing desktop/mobile
  projects against a localhost PR app. It covers delayed navigation, feedback
  latency, unchanged header geometry, completion, ignored links, modifiers,
  history traversal, rapid clicks, reduced motion and watchdog cleanup.
- The existing PR E2E workflow runs these tests alongside the unchanged event
  filter regression. Production smoke remains separate and cannot validate an
  unmerged loading implementation.
