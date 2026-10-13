# WEB-PERF-OBSERVABILITY-2 — real production performance baseline

Read-only Lighthouse **lab** measurements of seven fixed anonymous public `https://psipedia.sk` URLs. No production settings, cookies, authentication, D1 writes, Next.js build, or deployment changes.

## Run on GitHub

After this PR is merged into `main`, open **Actions → WEB-PERF Observability (read-only Lighthouse) → Run workflow → `main`** and choose:

| Mode | Pages | Form factors | Repeats per page/device | Lighthouse runs | Trigger |
| --- | ---: | ---: | ---: | ---: | --- |
| `weekly` | 2 | 2 | 1 | **4** | Monday 04:17 UTC; also manual |
| `quick` | 7 | 2 | 1 | **14** | Manual default |
| `baseline` | 7 | 2 | 3 | **42** | Manual explicit opt-in |

Only one workflow execution runs at a time. `schedule` is weekly, never on push or PR. The schedule runs from the default branch after merge, so it cannot run from an unmerged PR. The runner performs all measurements sequentially, no concurrency against the public site. Timeout is 55 minutes. A failing URL is recorded as unavailable, not quietly replaced by Lighthouse error-page scores. The job returns nonzero on any invalid URL or measurement failure, but uploads completed artifacts.

Full routes: `/`, `/adresar`, `/adresar/veterinari`, `/adresar/treneri`, `/adresar/veterinari/ab-vet-piestany`, `/podujatia`, `/clanky/nasli-ste-tulaveho-psa-co-robit`.

The small weekly subset is `/` and `/adresar/veterinari`; choose `baseline` manually immediately before and after substantial optimizations. The local runtime measures the **live deployed production website**, even when the job checks out a more recent Git commit: the recorded HEAD proves which measurement configuration was executed, **not** which code is currently deployed. To make a valid before/after comparison, separately record the production deployment SHA (Cloudflare) at each measurement time.

Artifacts (`web-perf-<run id>-<attempt>`; retention 14 days):

- `manifest.json`: source checkout SHA, UTC timestamp, versions of Node/Chrome/Lighthouse, planned/actual counts, elapsed seconds, failures.
- `summary.json`: per-URL HTTP 200/HTML and cache header verification, individual lab results, medians, errors, CrUX availability, mobile-minus-desktop deltas.
- `summary.csv`: one row per page/device with median lab metrics and optional field INP.
- `<page>-<device>-<attempt>.report.html`: full Lighthouse report for each successful attempt.
- `<page>-<device>-<attempt>.report.json`: **reduced** per-run metrics only, not the sensitive full raw Lighthouse JSON/network log.

Headers are allowlisted (`cache-control`, `cdn-cache-control`, `cf-cache-status`, `age`, `x-cache`, `content-type`); `Set-Cookie`, credentials, and response bodies are never written to the structured reports. HTML is produced by Lighthouse from anonymous public pages and should still be treated as operational diagnostic data, not published openly.

## Metric interpretation

- Lighthouse Performance Score (0–100), LCP (ms), CLS, and Total Blocking Time (ms) are **laboratory** values. Lighthouse uses simulated throttling, default mobile emulation and its desktop preset. TBT **is not INP**.
- TTFB is the observed navigation TTFB from the Lighthouse metrics audit. `server-response-time` (server latency alone) is deliberately **not** substituted. If the observed TTFB is absent, the cell is blank/null.
- JS/CSS/image sizes are **network transfer bytes**, not uncompressed bundle bytes. Taken from Lighthouse `resource-summary`, falling back to `network-requests`; missing data is `null`.
- `lcp_element` is the selector or snippet Lighthouse identified in its LCP element/insight details. If the active Lighthouse version does not identify it, the field remains null; inspect the per-run HTML report.
- **INP is user field data only:** optional Chrome UX Report API URL-level 75th percentile, and never inferred from Lighthouse. A missing/insufficient CrUX record returns `null` with a `field_status`, not a fabricated zero.
- Field INP is not compared directly with the lab TBT. CrUX windows, real-user device mixes and sample sizes differ from one-off runner tests. URL-level CrUX can be unavailable for smaller pages.

To enable optional field INP, create a GitHub Actions repository secret called `CRUX_API_KEY` with a Google CrUX API key. The workflow works without this secret, collecting the full Lighthouse alternative. The key is sent only to Google's CrUX API and is never included in console logs or stored reports. No PSI or CrUX API calls are necessary for the default baseline. See Google documentation for CrUX API quota and key restrictions.

## Costs and repeatability

No `npm ci`, application build, Playwright browser installation, Cloudflare changes, or production writes. The workflow installs only **pinned Lighthouse `12.8.2`** into runner temporary storage, reuses preinstalled Chrome, and runs single-threaded. Chrome is version-logged because GitHub runner images may update. `ubuntu-24.04`, Node `22.19.0`, Lighthouse `12.8.2`, default Lighthouse mobile and `--preset=desktop`, simulated throttling, and 7 fixed URLs are the recorded setup. The default cache state is Lighthouse's clean profile per run (not warm-user browsing). For comparable baselines, use the same Chrome and Lighthouse versions, runner class, production deployment, time window, and repeat count. Changes to Chrome, live site, CDN cache or network conditions can shift results.

**Exact nominal requests:** 4/14/42 Lighthouse navigations respectively, plus 2/7/7 lightweight GET probes and up to 4/14/14 optional CrUX API calls (one per URL and device). Lighthouse itself makes the page's normal asset requests and may navigate/reload internally; those cannot be claimed as a fixed count. **Exact monetary cost and billed GitHub Actions minutes cannot be known before a real run.** `manifest.json` records actual Lighthouse and end-to-end wall time; use the GitHub Actions run's billed runtime and your plan's current per-minute rate/allowance to price the run. Baseline is manually opt-in because it can take substantial time and 42 runs.

## Reproducing on a machine with Chrome + Node 22.19+

```bash
npm install --prefix /tmp/psipedia-lh --no-save --no-audit --no-fund --ignore-scripts --package-lock=false lighthouse@12.8.2
node --test tests/web-perf-observability.test.mjs
CHROME_PATH="$(command -v google-chrome || command -v google-chrome-stable)" node scripts/web-perf-observability.mjs \
  --mode baseline --out reports/web-perf --bin /tmp/psipedia-lh/node_modules/.bin/lighthouse
```

The command requires outbound HTTPS to the public website and working Chrome. If GitHub's runner cannot access the website or Chrome, `manifest.json`/`summary.json` (when the script ran) and the Actions log state the issue; run the same command locally instead. If a failure occurs before the script starts, Actions logs are the authoritative blocker.

## Comparison and acceptance

1. Choose manual `baseline` both before and after optimization, preferably in similar production/load conditions. Archive both artifacts before the 14-day expiry.
2. Compare `summary.csv` median by **same path and form factor**, and check `successful_runs == 3` in both. `summary.json` includes each attempt, so check spread/outliers before treating small deltas as reliable. The `mobile_desktop_comparison` records mobile minus desktop, not before/after delta.
3. Compare Lighthouse LCP/CLS/TBT/score and TTFB, cache header differences, and transfer sizes; inspect the LCP selector/HTML to connect regressions to a concrete element. Do not call a lab score or TBT a Core Web Vitals field pass/fail.
4. If CrUX is enabled and populated, inspect it **separately**; short-term Lighthouse changes may not appear in the rolling field window.
5. Flag any invalid URL, non-200 response, Lighthouse runtime error, missing TTFB/LCP selector, or changed runner/Chrome version as a comparability caveat rather than silently papering over it.
