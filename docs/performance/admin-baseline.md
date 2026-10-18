# ADMIN PERFORMANCE BASELINE — isolated local measurement V1

## Goal and boundaries

This tool is **not** the live production-admin baseline. It is a repeatable, local
synthetic measurement harness for the current Psipedia administration, built on
the existing Playwright Chromium dependency. No changes to production app code,
admin header, Events, Partners, D1 schema, CI workflows, deployment or login flow.

**Hard safety gates:** HTTP loopback `localhost:PORT` or `127.0.0.1:PORT` only;
`PSIPEDIA_ADMIN_PERF_LOCAL=1` required; rejects `NODE_ENV=production`.
The browser blocks all off-origin traffic and any non-read method, including
POST, PATCH, PUT and DELETE. The script never bootstraps data or signs in.
It must be pointed at an **already running isolated local D1 test fixture** with
preview-only admin identity; a redirect/login or an HTTP failure is unavailable,
not a timing. Production URLs, Cloudflare Access tokens, real accounts and
live login are prohibited. No GitHub Actions schedule is introduced.

## Run locally (developer/CI workstation, not production)

1. Prepare the project's existing isolated local D1 fixture and `npm run dev`
   at port 5173. Existing specialized E2E suites explain their bootstrap
   requirements; do not run the fixture bootstrap against real D1.
2. Install Playwright Chromium using the existing `npm run e2e:install`.
3. Record fixed inputs and at least three repetitions; keep the same
   fixture row counts, machine, browser version, local server mode and cache
   state across before/after runs.

```bash
PSIPEDIA_ADMIN_PERF_LOCAL=1 node scripts/admin-perf-run.mjs \
  --base-url http://127.0.0.1:5173 \
  --out reports/admin-perf/before.json --label before --repeats 3 --device both

# After changes on the SAME fixture and comparable setup:
PSIPEDIA_ADMIN_PERF_LOCAL=1 node scripts/admin-perf-run.mjs \
  --base-url http://127.0.0.1:5173 \
  --out reports/admin-perf/after.json --label after --repeats 3 --device both

node scripts/admin-perf-compare.mjs reports/admin-perf/before.json reports/admin-perf/after.json
node --test tests/admin-perf-tooling.test.mjs
```

Reports are stored locally under `reports/admin-perf/` and must not be
committed or uploaded as public CI artifacts. They include no payloads, raw
URLs, headers, email addresses, session data, selectors based on records or SQL.
Keep them private as operational diagnostics.

## What is measured

- Screens: dashboard, notifications, Articles, Events, Directory, Partners,
  Data Quality, Maps, Gemini; 1440x900 desktop and 390x844 mobile.
- Navigation: Chromium elapsed time from navigation start to visible admin
  `main#obsah`, DOMContentLoaded and load event; HTTP response must be 200,
  URL must stay on the requested admin screen (authentication guard).
- Requests: completed response count and response header+encoded body sizes
  from Playwright `response.sizes()`; API counts, API response p50/p95
  measured using Playwright request timing; HTTP error count. An incomplete
  network-idle window or unavailable size produces `null`, not zero.
- Interactions, where the existing UI and fixture offer them: pagination,
  searches/filters and opening a real local editor. Duration includes the
  uniform 500ms Chromium network-idle condition; use for controlled
  *comparisons*, not field INP or user-observed interaction latency.
- Repeats: median per screen/device/metric; unavailable or missing steps
  remain `unavailable` / `not_applicable` and are excluded from medians.
  Any navigation failure/non-read attempt yields a nonzero exit code.

D1 **query counts and server-side durations are not derivable from browser
requests**. V1 explicitly reports `d1: null` per sample and
`d1_attribution: unavailable_without_server_instrumentation`.
The existing `scripts/d1-insights-report.mjs` can separately summarize D1
Insights (aggregate SQL signatures) without raw SQL or personal data, but
it cannot attribute production operations to individual authenticated screens.
Do not merge that aggregate with browser route metrics as if correlated.

## Provenance and later production acceptance

Every report uses `provenance: local_synthetic`. An offline mock/unit-test
example is **fixture data, not a measured timing**: ready_ms before
100/101/102 -> median 101; after 80/81/82 -> median 81; delta -20ms.
Actual local baseline is still pending a bootstrapped fixture and Chromium.

After the three other optimization PRs are merged/deployed and with operator
approval, manually measure actual logged-in administration using a separately
authorized read-only workflow, segmented by account role, route and dataset size.
Verify Cloudflare deployment SHA, browser/network environment, cold/warm cache,
D1 Insights, API p50/p95 and request sizes. Do not export cookies, tokens,
raw URLs, user information, traces or production HTML to public artifacts.
Production measurements must use a separate explicit `production_authenticated`
provenance and cannot be compared automatically with local synthetic reports.
