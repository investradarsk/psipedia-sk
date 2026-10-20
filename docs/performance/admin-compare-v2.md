# ADMIN PERFORMANCE COMPARATOR V2

## Scope and safety

A standalone **offline** analyzer of schema-v1 JSON files produced by the
existing scripts/admin-perf-run.mjs from merged PR #890. It does not change the
runner, runtime, editors, database, production website or tracking. It makes no
network calls, launches no browser, installs no dependencies, and accesses no
visitors or user accounts. It rejects production and non-local provenance.

Inputs/outputs must remain private under the ignored reports/admin-perf/
directory (never commit the measured files). Synthetic examples below are
illustrative, **not measured Psipedia performance**.

## Why two environment manifests are mandatory

The existing V1 runner records a fixture label, Chromium version, Node version,
device selection and repetition count, but **does not record hardware identity,
fixture contents, cache policy or local server mode**. Merely matching its
fixture_id is insufficient to establish comparability. Without changing that
shared runtime, V2 requires independently supplied, per-run JSON manifests.

Each environment manifest must have this exact set of required fields (additional
fields are ignored):

~~~json
{
  "schema": 1,
  "fixture_id": "admin-e2e-20261019",
  "fixture_digest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "environment_id": "local-test-machine-a",
  "os": "linux-x64",
  "hardware_profile": "machine-a-cpu-ram-unchanged",
  "server_mode": "local-dev",
  "network_profile": "loopback",
  "cache_profile": "new-browser-context"
}
~~~

The fixture_digest is a **SHA-256 of the deterministic synthetic fixture
definition/snapshot** (not an arbitrary invented ID). Generate it with a local
SHA-256 tool from a non-sensitive fixture specification, then record it for each
run. Never hash or publish a production D1 dump, personal data or secrets.
The other fields are explicitly verified declarations by the person running
the benchmark, not automatically measured evidence. They must be identical
before and after. Reusing a manifest after changing the machine or data is
invalid even if the comparator cannot detect a dishonest declaration.

## Collect the existing V1 reports

Use the existing documented safe local fixture procedure in
docs/performance/admin-baseline.md. For each GitHub checkout, the same host,
seeded fixture, local run mode and browser build must be used. In the commands
below, set GITHUB_SHA to the **40-character commit of that checkout**, since
the V1 runner otherwise sets checkout_sha to null; V2 refuses unidentified SHA.

~~~bash
# Checkout A, with the isolated local fixture already running:
GITHUB_SHA="$(git rev-parse HEAD)" PSIPEDIA_ADMIN_PERF_LOCAL=1 \
  node scripts/admin-perf-run.mjs --base-url http://127.0.0.1:5173 \
  --out reports/admin-perf/before.json --label before --repeats 3 \
  --device both --fixture-id admin-e2e-20261019

# Checkout B, same setup. Save its own manifest separately:
GITHUB_SHA="$(git rev-parse HEAD)" PSIPEDIA_ADMIN_PERF_LOCAL=1 \
  node scripts/admin-perf-run.mjs --base-url http://127.0.0.1:5173 \
  --out reports/admin-perf/after.json --label after --repeats 3 \
  --device both --fixture-id admin-e2e-20261019

# Save the environment manifest for each run as before-env.json/after-env.json.
node scripts/admin-perf-analyze.mjs \
  --before reports/admin-perf/before.json \
  --after reports/admin-perf/after.json \
  --before-env reports/admin-perf/before-env.json \
  --after-env reports/admin-perf/after-env.json \
  --json reports/admin-perf/comparison.json \
  --markdown reports/admin-perf/comparison.md
~~~

All six flags are mandatory, can be supplied in any order, and all six paths
must be distinct to protect input files from accidental overwrites.
The tool does not use GitHub APIs or assume branch ancestry; verify the
commit-to-repository mapping with the normal GitHub review process.

## Strict compatibility gate

Both inputs must use schema 1, local_synthetic provenance,
isolated_local_fixture_only scope, Chromium, distinct valid 40-hex checkout
SHAs and populated per-run raw samples. The following must match:

- fixture_id and the fixture_digest recorded in the independent sidecars;
- Chromium version, Node version and browser engine;
- selected devices (desktop/mobile/both) and configured repetitions;
- sidecar environment_id, OS, hardware profile, local server mode, network
  profile and cache profile.

Invalid scope/provenance, conflicting metadata, malformed sample data,
duplicate repeat keys or any recorded attempted writes **reject the entire
comparison**. A missing/failed navigation, absent response-size measurement,
missing API p95 or missing repeat produces **insufficient_data**, never a
fabricated zero or successful timing. The tool always covers all 9 known
screens for each selected device and reports screen/device completeness.

For each supported interaction (pagination/filter/editor) it compares the
duration and API p95 separately. A step that is unavailable in only some
runs is insufficient; if all runs on both sides mark it not_applicable,
its status is not_applicable.

## Output contract

The machine JSON is schema 2 and contains both Git SHAs, compatible
metadata, per-screen/device rows, per-metric and per-step before/after
values, absolute delta, relative percentage and count of valid raw samples.
The Markdown contains an overview, comparable navigation metrics and
interaction deltas. Metrics cover ready, DOM/load, total/API request counts
and transfer, API p50 and API p95. Negative delta means less latency/traffic.

Each metric has one of: improvement, regression, unchanged, insufficient_data.
A row prioritizes regression, then insufficient_data, improvement and
unchanged. An overall regression can therefore coexist with gaps.
Classification is based on the **direction of the observed medians only**;
there is no confidence interval, practical-significance threshold or
production performance claim. API p95 is a median of individual run-level
p95 values (the only aggregation recoverable from V1), not pooled p95.

Exit codes:

- 0: comparison completed; no regressions or missing data.
- 1: invalid inputs, incompatible benchmark, unsafe metadata or I/O failure.
- 2: completed, at least one regression.
- 3: completed, insufficient_data without regressions.

Outputs can be generated even if the verdict is regression or insufficient.
Errors are redacted to stable codes; paths and JSON payloads are not printed.

## Offline synthetic example (illustrative only)

Three identical synthetic runs, one screen/device, ready time 100 ms before
and 80 ms after, API p95 40 ms before and 32 ms after, requests 10 before
and 8 after, transfer 1,000 bytes before and 800 bytes after:

| Metric | Before | After | Absolute | Relative | Status |
|---|---:|---:|---:|---:|---|
| Ready | 100 ms | 80 ms | -20 ms | -20% | improvement |
| API p95 | 40 ms | 32 ms | -8 ms | -20% | improvement |
| Requests | 10 | 8 | -2 | -20% | improvement |
| Transfer | 1,000 B | 800 B | -200 B | -20% | improvement |

This is synthetic fixture arithmetic, **not an actual local or production
benchmark**. The test suite generates all 18 screen/device combinations,
including positive, negative and incomplete cases without running Chromium.

Run offline tests:

~~~bash
node --test tests/admin-perf-analyze.test.mjs
node --test tests/admin-perf-tooling.test.mjs
~~~

A path-scoped GitHub Actions workflow runs the offline tests on PR changes.
Actual measured before/after snapshots require a separately prepared local
fixture and cannot be fabricated by CI.
