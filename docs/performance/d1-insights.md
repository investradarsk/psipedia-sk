# D1-INSIGHTS-REPORT-1 — read-only SQL costs

## Purpose

Produce a local, sanitized report from an **authorized Cloudflare D1 Insights JSON export**. No production SQL, API requests, credentials, migrations, jobs, cache changes, or DB writes are performed by the reporter. This does not change existing local SQL profiling (`docs/audits/services-v2-phase1-evidence/sql-profile.json`), the existing migration audit, or Lighthouse work.

Cloudflare source: https://developers.cloudflare.com/d1/observability/metrics-analytics/

The D1 dashboard offers database-wide 24-hour metrics and Cloudflare documents `d1QueriesAdaptiveGroups` and `wrangler d1 insights` for per-SQL insights. The latter is explicitly **experimental**: its flags and format may change. The documented JSON items contain `query`, `numberOfTimesRun`, `totalDurationMs`, `avgDurationMs`, `totalRowsRead` and `totalRowsWritten`. Cloudflare does not capture **bound parameter values**, but literal values written directly into SQL may be present and must still be treated as sensitive.

## Obtain real production exports (manual only)

1. In Cloudflare dashboard: **D1 SQL database → select the existing Psipedia production D1 → Metrics**. Use **last 24 hours**, then **last 7 days**. Check total rows read/written and query time there separately. Do not use any D1 SQL query endpoint or database export (a DB backup is not Insights).
2. In a trusted local terminal with existing Cloudflare authorization and correct production database binding/name, check `npx wrangler d1 insights --help` for your installed version. Use a read-capable credential with the minimum necessary privileges. Do not commit any token, real export, SQL, profile data, or result artifact.
3. Fetch a bounded ranking for **1 day** and **7 days** (example command; replace the placeholder DB name with the *existing* production database name):
   
   `npx wrangler d1 insights <EXISTING_PRODUCTION_DB_NAME> --timePeriod 1d --sort-type sum --sort-by time --sort-direction DESC --limit 500 --json > d1-insights-1d.private.json`

   `npx wrangler d1 insights <EXISTING_PRODUCTION_DB_NAME> --timePeriod 7d --sort-type sum --sort-by time --sort-direction DESC --limit 500 --json > d1-insights-7d.private.json`

   Optional: repeat with `--sort-by reads` and `--sort-by count` for better coverage, and compare separately. Do **not** concatenate overlapping ranked exports without deduplication: duplicate query aggregates would double count usage.
4. Run locally (Node 22+):

   `node scripts/d1-insights-report.mjs --input d1-insights-1d.private.json --period 1d --origin production --output d1-report-1d.json`

   `node scripts/d1-insights-report.mjs --input d1-insights-7d.private.json --period 7d --origin production --output d1-report-7d.json`

   Stdout is a human-readable Markdown table. The optional output file is a machine-readable, sanitized JSON report with no SQL text. If a query family has no count or metric, the value is `null` in JSON and **nezískané** in Markdown.
5. Compare the ranked-export results against the full D1 Metrics totals for the same window. Record window, timezone, database, command/version, ranking and limit separately in a **private** operational note. Inspect JSON first when Cloudflare changes format.

**Fixture/test only**:
`node scripts/d1-insights-report.mjs --input tests/fixtures/d1-insights-sample.json --period 1d --origin fixture --output /tmp/d1-fixture-report.json`

`node --test tests/d1-insights-report.test.mjs`

## Interpretation and limits

- SQL families are normalized (string literals/numeric constants/comments removed) and represented **only by a 16-hex SHA-256 fingerprint**, operation and broad category; neither raw SQL nor bind arguments are output.
- Categories: `directory_profiles` / related tables → **adresár**; `managed_events` / related tables → **podujatia**; all others → **ostatné**. Cross-category or unknown queries are conservatively **ostatné**. Classification is heuristic, not trace-level route attribution.
- Direct total values have JSON `basis: "reported"`. A total inferred from an average multiplied by execution count is `basis: "includes_derived_from_average"`, so approximation remains explicit. Missing values are **never zero-filled**. Reported zero stays zero.
- The output is **only a ranking sample**, not proof of complete production D1 consumption and not a billing invoice. Cloudflare D1 billable dimensions primarily include rows read/written, not SQL duration; query duration helps investigate latency.
- `rows_read` counts **scanned** rows, not HTTP response rows. Per-SQL duration is not end-to-end TTFB. Compare account-wide aggregates in Metrics for actual total consumption.
- `--origin production` is an operator-declared label; the tool cannot independently verify the data source or timestamp. Never label the synthetic fixture production. The tool does not retain row-level SQL or identifiers.
- JSON input bounded to 12 MiB / 5000 query records. If the experimental export format changes, fail or show missing metrics rather than silently invent figures. No automatic hourly or per-PR production polling.
- **No GitHub Actions workflow added:** using a trusted local authorized export avoids secrets stored in CI and avoids production API traffic. Store exports privately; do not upload raw exports or derived reports with operationally sensitive patterns to public issues.

## Quality gates

`node --check scripts/d1-insights-report.mjs` and `node --test tests/d1-insights-report.test.mjs`. No project installation, web requests, DB writes or production configuration necessary.
