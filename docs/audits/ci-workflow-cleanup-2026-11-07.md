# CI audit and consolidation — 2026-11-07

## Evidence

- Previous main had 101 GitHub workflow YAML files.
- A single broad editor PR such as #1222 could trigger about 28-29 workflow runs (some only to report skipped).
- Only two branch-protection status checks are required: `Build, lint and unit/integration tests` and `Breed CI bootstrap, all-breed regression and Playwright`.
- Previously merged #1224 introduced the Draft / Ready for review CI split.

## Unified result (supersedes the broken #1227 and incorporates #1228)

1. 11 further heavy independent suites are deferred for Draft PRs, then run automatically at `ready_for_review` and subsequent commits to ready PRs.
2. An inactive, old-branch-specific `ai-referral-measurement-ci.yml` is deleted. Its stale reference in `scripts/check-ci-scope.mjs` is removed, preserving the scope-policy check. Active AI referral tests are kept in the discovery workflow and central regression.
3. AI discovery triggers exclude unrelated generic profile presentation, fixture and broad test changes. The specialized linking/SEO, dedicated regression and own-workflow paths remain.
4. MAP-1E launch, Gemini global STOP and Services V3 notion sync no longer run merely from a generic production migration runner edit, while their own changed feature files still trigger them.
5. The MAP-1C map/API scope remains fail-closed for mapped public routes, shared worker and generic D1 migrations; narrowing those paths in the original #1227 had broken an intentional safety contract.
6. No `full-e2e` or `visual-evidence` label is required for final acceptance: a review-ready PR triggers full applicable checks automatically, even if no special label is set.

## Retained safeguards

- Mandatory statuses unchanged and active for Draft; required CI still enforces `scripts/check-ci-scope.mjs`.
- Clean D1 and database migration regressions remain active on relevant changes.
- Existing workflow manual dispatch preserved.
- Regressions expanded in `tests/ci-two-stage-guards.test.mjs`.
- No app runtime, persistent databases, Notion, Google Maps billing or production data modified.

## Validation

The former #1227 failed because the scope policy still referenced a deleted workflow and because the MAP-1C trigger matrix no longer covered expected map routes. Both are addressed by this consolidation. GitHub Actions and required status checks must finish green before merge.