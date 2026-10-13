# CI-COST-HARDENING-4 — CI run deduplication

Baseline `b352aac08c070ccf201d58c352a146aaf780d607`, 2026-10-13. One isolated PR; no auto-merge or change to production code.

## Measured baseline (actual job wall time, not billed minutes)

- [PR 38466927439](https://github.com/investradarsk/psipedia-sk/actions/runs/38466927439): scope 0.20 min; required validation 1.42 min; Directory PR E2E 5.97 min.
- [main push 38469149751](https://github.com/investradarsk/psipedia-sk/actions/runs/38469149751): scope 0.18 min; validation 1.75 min; redundant Directory E2E 4.08 min (failed); production smoke desktop 2.87 min and mobile 2.63 min (both passed).
- [Partner PR 38466927570](https://github.com/investradarsk/psipedia-sk/actions/runs/38466927570): security/build 3.65 min; browser 4.48 min, unchanged.
- [Map PR 38466927308](https://github.com/investradarsk/psipedia-sk/actions/runs/38466927308): map read E2E 4.90 min, unchanged (parallel map scoping task).

## Before/after workflow matrix

| Workflow / unit | Before trigger / jobs | After trigger / jobs | Expected saving | Risk / guard |
| --- | --- | --- | --- | --- |
| `playwright-e2e.yml` PR required CI | all PRs: scope + validate = 2 jobs | all PRs: validate computes scope, 1 job | 1 job/PR; sampled 0.20 job-min | Required check name, `check-ci-scope` and fail-closed full regression preserved |
| `playwright-e2e.yml` main required CI | push: scope + validate = 2 | push: validate = 1 | 1 job/push; sampled 0.18 job-min | multi-commit push range and production smoke still validated |
| `playwright-e2e.yml` Directory local E2E | directory PR + main push: 1 job each | only relevant PR: 1; push: 0 | 1 main job on relevant merge, sampled 4.08 min | desktop/mobile PR E2E, isolated D1 and artifact checksum remain; production smoke remains on main |
| `playwright-e2e.yml` SEARCH local E2E | relevant PR + push: 1 each | PR only 1 | 1 job on matching push; duration unmeasured | PR validation remains |
| `playwright-e2e.yml` Admin Events local E2E | relevant PR + push: 1 each | PR only 1 | 1 job on matching push; duration unmeasured | PR and manual/nightly broad suite retained |
| `playwright-e2e.yml` live production smoke | product main push: 2 (desktop/mobile); manual/nightly | unchanged: 2 + manual/nightly | 0 (intentional) | read-only production check and failure notification retained |
| SEO preview, sitemap diagnostics, LOST-FOUND PR jobs | conditioned on historical feature branch names | narrowed to actual changed SEO/sitemap/lost-found paths | no promised saving; some legitimate PRs gain coverage | no branch names; PR-only and validated, production diagnostic read-only |
| PUBLIC-UX foundation (full browser suite) | historical branch gate | always in manual/nightly full suite | 0 (more correct coverage) | existing full suite, no new nightly job |
| Partner, map, security, D1, Notion, Lighthouse, Gemini | independent path-scoped or manual contracts | unchanged | 0 claimed | no weakening of critical suites |

## Rationale and acceptance

Required PR status remains unconditional (docs-only skips `npm ci`/build). Existing validated-build upload/download with exact SHA and fingerprint remains; no mutable runner cache or unverified artifact sharing. Remove only duplicate scope job and local PR E2E repetition on main; do **not** remove post-merge live smoke. Explicit manual/nightly full E2E remains. No new global workflow or branch-name condition, no auto-merge.

`scripts/check-ci-scope.mjs` scenarios: maps, directory profiles, homepage, articles, Notion sync, admin, docs, production migration, SEO/sitemap/lost-found, full dependency/security checks, manual/nightly, failed validation, and disposable Git history (merge, squash, shallow/unknown revision). No changes to Lighthouse, Gemini, production D1, site runtime, admin or database.

**Expected**, not measured deployment outcome: one lightweight scope job removed from every PR/main push; and 0–3 duplicate local E2E jobs removed from applicable main pushes. A directory push similar to run 38469149751 would avoid roughly 4.26 historical job-wall-minutes (4.08 + 0.18) while retaining both production smoke jobs. This is a comparator, not evidence of realized cost savings.
