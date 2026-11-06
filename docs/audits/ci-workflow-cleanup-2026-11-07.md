# CI workflow audit — 2026-11-07

## Motivation and evidence

- Repo contained 101 files under `.github/workflows` on `main` before cleanup.
- PR #1222 (107 changed paths / 217 commits at audit time) launched 28 GitHub Actions workflow runs for one commit, including 10 skipped results.
- GitHub ruleset `main-protection` requires **Build, lint and unit/integration tests** and **Breed CI bootstrap, all-breed regression and Playwright**. Both checks are owned by the existing mandatory workflow and remain unchanged.
- A large PR matches paths against its entire PR diff, not only the latest commit, so additional commits repeatedly trigger otherwise specialized suites.

## Changes made

1. Remove `ai-referral-measurement-ci.yml`: its sole job had `if: github.head_ref == 'codex/ai-referral-measurement-1'`, and that branch no longer exists. The `test:ai-referral` script and active AI-discovery regression still exist.
2. Limit `map-read-api-ci.yml` to map API / geo contracts instead of general public profile UI, event storage and every D1 migration. Geo/map/location-specific migrations retain coverage.
3. Stop `map-production-launch-ci.yml`, `gemini-global-stop-ci.yml` and `services-v3-hourly-auto-sync.yml` from firing solely because the generic production migration runner changed. Generic migration safety remains in required CI and `clean-d1-migration-validation.yml`.
4. Limit `ai-internal-discovery-click-value-ci.yml` to internal linking, discoverability code, specific landing routes and its own regression tests rather than every shared profile view or generic test fixture.
5. Keep fast public entity SEO/contract tests in `sitewide-ai-entity-surface-ci.yml` automatic. Gate its full desktop/mobile browser matrix, and the internal-discovery browser matrix, behind the `full-e2e` PR label or a manual workflow dispatch.
6. Gate expensive `pr-visual-evidence.yml` screenshot generation behind the `visual-evidence` PR label. Adding the label will trigger a run, and subsequent commits rerun it while the label remains.

## Preserved safety

- Both required branch-protection checks.
- General `Playwright E2E and production smoke` central scoped CI workflow.
- `Clean D1 migration validation`, production migration safety, service-specific sync contracts, map-specific API tests and targeted Gemini safety tests.
- Read-only production audit / verification workflows: they are manual-only and do not contribute to PR queueing; deleting them would reduce recoverability without improving routine CI performance.
- No runtime, D1, Notion, deployment or production data changes.

## How to request deeper optional checks

Add label `full-e2e` to a PR to run the focused sitewide entity and internal-discovery Playwright matrices when their path filters match. Add label `visual-evidence` for PR screenshots (visual path changes only). Where available, launch `workflow_dispatch` manually instead.

## Validation and limitations

All changes are deliberately limited to workflow YAML files plus this documentation. Verify the workflow YAML parsing, Actions trigger behavior and branch-protection required checks on the new PR before merge. A PR that touches many product domains will still legitimately trigger several targeted suites; this cleanup is not intended to suppress genuine regressions. The GitHub integration cannot read the classic branch-protection endpoint, but the active repository ruleset explicitly lists the two mandatory statuses.
