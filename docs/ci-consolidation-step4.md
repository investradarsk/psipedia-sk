# CI consolidation — 4/10 historical offline workflows

Base 11af44b38ee1f3ac05c30f3f7ea300421afd5dcf. Replace 11 offline-only PR/manual workflows by one offline-contracts job. Original shell commands preserved (including scanner output and security checks), no npm dependency installation or production access in these selected workflows. Original scoped path lists retained in `.github/ci/offline-suites.json` plus explicit command file references. Original main-only restrictions retained for ordinary PR selection. Manual run and CI control changes execute all; unknown/empty range fails closed. Top-level PR event deliberately unfiltered to avoid GitHub path-diff truncation; unrelated PRs run only selector checks. Node 24 major references pinned to existing central 24.18.0; Node 22 major and exact 22.16.0 retained via conditional setups. Net 10 fewer workflow files and up to 10 fewer offline jobs; actual reduction depends on paths. No historical operational/production workflows or E2E pipelines removed here. Browser and install/build-heavy historical workflows remain for steps 5–7. Existing required merge contexts untouched.

## Replaced files

- `admin-typography-contracts.yml` — 2 original command steps
- `admin-duplication-inventory.yml` — 5 original command steps
- `public-listings-qa.yml` — 1 original command steps
- `directory-0176-sql-fields.yml` — 1 original command steps
- `services-v3-public-canonical-filter.yml` — 1 original command steps
- `admin-v5-mutation-origin.yml` — 2 original command steps
- `admin-legacy-mutation-csrf.yml` — 2 original command steps
- `admin-perf-url-guard.yml` — 2 original command steps
- `admin-perf-comparator-v2.yml` — 2 original command steps
- `gemini22-dedupe-gate-tests.yml` — 4 original command steps
- `service-catalog-contract-ci.yml` — 1 original command steps

Selection regression tests included. Bounded source search found no live hardcoded workflow references for these eleven names beyond their own files; historical documentation is retained. Full GitHub execution, YAML/runtime verification and later consolidation pending.
