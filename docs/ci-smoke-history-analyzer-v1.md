# CI Smoke History Analyzer V1 (offline, read-only)

Standalone diagnostic for production smoke run history. The instrument **does not conclude that an open notification issue implies a live outage**. Nor can a later passing run prove that all historical failures were fixed.

## Scope and safety

- New files only: script, regression test and this guide; no workflow, package, deployment or GitHub settings changes.
- No issue writes or closure, no reruns, no comments, no API mutations, no production requests.
- Default: read a locally stored **sanitized** JSON fixture, or use built-in synthetic `--demo`.
- Optional GitHub API mode must be explicitly requested with `--github`. It uses only bounded GitHub GET calls to main branch metadata, workflow runs and individual jobs. No workflow conclusion is substituted for a production smoke job conclusion.
- JSON and Markdown reports are written **only** when `--json` and/or `--markdown` paths are specified, with exclusive-create semantics (existing files cannot be overwritten).
- Published links are constrained to GitHub Actions run/job URLs in the requested repository. Report notes never claim incident closure.

## Commands

```bash
node --test tests/production-smoke-history-report.test.mjs

# Synthetic reproducible sample, no API or production access:
node scripts/production-smoke-history-report.mjs --demo \
  --head bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
  --markdown /tmp/psipedia-smoke-demo.md --json /tmp/psipedia-smoke-demo.json

# Locally saved sanitized Actions fixture:
node scripts/production-smoke-history-report.mjs --input /path/to/sanitized-actions.json \
  --head YOUR_EXACT_40_CHARACTER_MAIN_SHA \
  --markdown /tmp/smoke.md --json /tmp/smoke.json

# Explicit GitHub GET-only mode (bounded to 20 runs by default, max 50):
GITHUB_TOKEN=... node scripts/production-smoke-history-report.mjs --github \
  --repo investradarsk/psipedia-sk --limit 20 \
  --markdown /tmp/smoke-live.md --json /tmp/smoke-live.json
```

## Fixture schema

Two accepted forms:

1. `{"records":[{"test":"Playwright production smoke (desktop)","sha":"<40 hex>","timestamp":"2026-10-19T10:00:00Z","status":"completed","conclusion":"failure","run_id":123,"run_number":123,"run_attempt":1,"url":"https://github.com/investradarsk/psipedia-sk/actions/runs/123"}]}`
2. `{"workflow_runs":[{"id":123,"event":"push","head_sha":"<40 hex>","created_at":"...","run_number":123,"jobs":[{"name":"Playwright production smoke (desktop)","status":"completed","conclusion":"success","html_url":"https://github.com/investradarsk/psipedia-sk/actions/runs/123"}]}]}`

An optional `issues` list (number, run_number, html_url) cross-references notification issue numbers without modifying or resolving them. Remove tokens, request headers, actor email, secrets, and private payloads before saving fixtures. There is no need to include job logs or test artifacts.

## Semantics

- Compare smoke **job** (not entire workflow) name, UTC date and full SHA. Run attempt is preserved. Repeated failures and pass→fail regressions remain visible.
- `CURRENT_FAIL`: latest observed run **for that test** failed at the explicitly supplied (or GET-confirmed) HEAD.
- `PASS_ON_HEAD`: latest observed smoke job passed at HEAD. **Only that specific test** has affirmative evidence, not the whole suite or all historical incidents.
- `CANCELLED`, `SKIPPED`: non-success results at HEAD. `UNKNOWN`: missing HEAD, mismatch, missing job data, unfinished or inconclusive run. Absence of recent data is never treated as success.
- `later_passes` records both evidence links and whether it was the *same SHA*. Same-SHA fail→pass indicates possible flakiness; cross-SHA pass is not proof that the original error was repaired. Historic issue notices stay `UNRESOLVED_EVIDENCE`.
- Date ordering derives from job completion time (falling back to run timestamps), not GitHub issue creation. The latest recorded run is **not** proof that production deployed that SHA; a successful run only establishes a test result.
- API mode is deliberately bounded to 50 workflow runs and jobs' first page, and warns about incomplete responses. It does not scan all ~historic runs and does not claim comprehensive coverage.

## Expected synthetic sample

For `--demo --head bbbbb...`: desktop = `CURRENT_FAIL` (previous same-SHA fail→pass is flagged as flaky and a newer SHA failed again); mobile = `SKIPPED`; tablet = `CANCELLED`. The historic issue remains `UNRESOLVED_EVIDENCE`. The emitted JSON includes raw groups, evidence URLs, flags and counts; Markdown presents the same facts to the technical control center.

## Acceptance

Run the isolated Node test above and review the generated synthetic Markdown/JSON. Any CI status for this Draft PR must be tied to its exact PR HEAD; green CI does **not** authorize merging, deploying, or closing smoke issues.
