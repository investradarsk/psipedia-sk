# CI consolidation — 1/10 baseline inventory

Baseline: 2026-11-28, main `f1878ce5cd942f7f6db86ac58857bdf4151f6268`. Comparison: PR [#1622](https://github.com/investradarsk/psipedia-sk/pull/1622), head `32000d58b8a8fa07761faec52680a525fd7ea95e`.

## Measured baseline

- 156 tracked workflow YAML files (not all are active PR checks).
- 1139 repository-wide files containing `.test.` or `.spec.` in their path; 1,020 conventional Node test files and 117 conventional spec files under `tests/`; 1,225 tracked files under `tests/` including fixtures/helpers.
- 148 package scripts; 114 test entrypoints.
- PR #1622: 156 workflow YAML files, 1,143 test/spec-named files, 28 PR workflow runs and 54 check runs including external checks and skipped jobs. Snapshot status counts: {"success":35,"in_progress":1,"skipped":17,"failure":1}. Counts are checks, not assertions or unique test coverage.
- Existing `scripts/ci-v2-inventory.mjs` supplies lexical workflow-to-test and script references; `ci-test-groups.mjs` is explicitly transitional developer entrypoints, not a replacement for CI gates. `ci-scope.mjs` and `ci-result-gate.mjs` already implement selection and fail-closed result checks.

## Required merge checks — preserve during migration

Active [main-protection ruleset](https://github.com/investradarsk/psipedia-sk/rules/23739696): strict required status checks, integration ID 15368, PR required, no bypass actors. Required contexts:

- `Build, lint and unit/integration tests`
- `Breed CI bootstrap, all-breed regression and Playwright`

Branch protection status-check REST endpoint returned 403; repository ruleset detail was readable and explicitly contains both contexts. Do not rename/remove these contexts before replacement is proven and a ruleset migration is authorized. Preserve fail-closed selected-job results. No settings mutation in step 1.

## Confirmed overlap on #1622

- Central Playwright E2E, Admin IA, visual evidence, Event editor pilot and bidirectional Notion checks independently build application code; review submission also has shared build matrix entries. Inspect exact executed steps vs skipped steps before estimating savings.
- Visual evidence, Admin IA, event pilot, review submission and photo gallery have separate browser setup. Review auth and review submission have separate local D1 setup. Keep distinct fixtures where isolation requires them; share install/build only when compatible.
- `NOTION-BIDIRECTIONAL events help validation` includes lint and build; review validation and central CI also include lint. Migration safety recurs in Image Editor, Notion and Reviews. Consolidate after comparing commands and inputs.
- `ADMIN-IA-2` currently failed on #1622; that failure is not a reason to delete it. Repair or preserve the meaningful assertion.

## Workflow inventory

All tracked workflow paths below. `Review first` is a filename-based candidate flag, not authorization to remove. `Production safety` means inspect triggers, credentials, writes, operational owner, and migration evidence before any change. `Consolidation review` means examine trigger, jobs, exact commands, fixture and coverage ownership. No deletion solely by filename.

| File | Initial review route |
| --- | --- |
| `.github/workflows/address-enrichment-ci.yml` | Consolidation review |
| `.github/workflows/admin-article-bulk-e2e.yml` | Consolidation review |
| `.github/workflows/admin-duplication-inventory.yml` | Review first |
| `.github/workflows/admin-editor-workspace-v3.yml` | Consolidation review |
| `.github/workflows/admin-event-editor-v3-pilot.yml` | Review first |
| `.github/workflows/admin-ia-2.yml` | Consolidation review |
| `.github/workflows/admin-image-review-v2.yml` | Consolidation review |
| `.github/workflows/admin-legacy-mutation-csrf.yml` | Review first |
| `.github/workflows/admin-operations-ci.yml` | Consolidation review |
| `.github/workflows/admin-perf-comparator-v2.yml` | Consolidation review |
| `.github/workflows/admin-perf-url-guard.yml` | Consolidation review |
| `.github/workflows/admin-performance-v2.yml` | Consolidation review |
| `.github/workflows/admin-photo-gallery.yml` | Consolidation review |
| `.github/workflows/admin-puppy-coverage-ci.yml` | Consolidation review |
| `.github/workflows/admin-pwa-ci.yml` | Consolidation review |
| `.github/workflows/admin-runtime-1.yml` | Consolidation review |
| `.github/workflows/admin-stability-regressions.yml` | Consolidation review |
| `.github/workflows/admin-typography-contracts.yml` | Consolidation review |
| `.github/workflows/admin-v5-mutation-origin.yml` | Consolidation review |
| `.github/workflows/ai-internal-discovery-click-value-ci.yml` | Consolidation review |
| `.github/workflows/article-admin-ci.yml` | Consolidation review |
| `.github/workflows/article-ux-ci.yml` | Consolidation review |
| `.github/workflows/auto-update-automerge-prs.yml` | Consolidation review |
| `.github/workflows/automation-cleanup-legacy.yml` | Review first |
| `.github/workflows/automation-detach-drafts.yml` | Consolidation review |
| `.github/workflows/automation-finalize-v1.yml` | Consolidation review |
| `.github/workflows/automation-source-ux-reset.yml` | Consolidation review |
| `.github/workflows/breed-controlled-mirror-341-offline.yml` | Review first |
| `.github/workflows/breed-sql-0174-offline.yml` | Review first |
| `.github/workflows/breeds-admin-ci.yml` | Consolidation review |
| `.github/workflows/category-visual-ci.yml` | Consolidation review |
| `.github/workflows/ci-smoke-history-analyzer.yml` | Consolidation review |
| `.github/workflows/clean-d1-migration-validation.yml` | Consolidation review |
| `.github/workflows/code-quality-policy.yml` | Consolidation review |
| `.github/workflows/content-relations-1.yml` | Consolidation review |
| `.github/workflows/d1-directory-canonical-reads.yml` | Consolidation review |
| `.github/workflows/d1-insights-report-ci.yml` | Consolidation review |
| `.github/workflows/data-automation-ci.yml` | Consolidation review |
| `.github/workflows/data-automation-v2-ci.yml` | Consolidation review |
| `.github/workflows/data-quality-contact-sql-parity.yml` | Consolidation review |
| `.github/workflows/directory-0170-backfill-readonly.yml` | Review first |
| `.github/workflows/directory-0173-review-lock-bridge.yml` | Consolidation review |
| `.github/workflows/directory-0173-review-lock-sql-read.yml` | Consolidation review |
| `.github/workflows/directory-0173-sql-detail-read.yml` | Consolidation review |
| `.github/workflows/directory-0176-sql-fields.yml` | Consolidation review |
| `.github/workflows/directory-notion-0173-atomic-fields.yml` | Consolidation review |
| `.github/workflows/directory-sql-0173-offline.yml` | Review first |
| `.github/workflows/events-fallback-images.yml` | Consolidation review |
| `.github/workflows/facebook-admin-notion-authority.yml` | Consolidation review |
| `.github/workflows/facebook-gmail-notion-bridge-ci.yml` | Consolidation review |
| `.github/workflows/gemini-automation-foundation-ci.yml` | Consolidation review |
| `.github/workflows/gemini-dashboard-v3-visual.yml` | Consolidation review |
| `.github/workflows/gemini-global-stop-ci.yml` | Consolidation review |
| `.github/workflows/gemini-notion-agent.yml` | Consolidation review |
| `.github/workflows/gemini22-dedupe-gate-tests.yml` | Consolidation review |
| `.github/workflows/google-places-budget-guard-ci.yml` | Consolidation review |
| `.github/workflows/help-legacy-sql-cleanup-once.yml` | Review first |
| `.github/workflows/homepage-name-days-ci.yml` | Consolidation review |
| `.github/workflows/image-editor-2-ci.yml` | Consolidation review |
| `.github/workflows/knip-audit.yml` | Review first |
| `.github/workflows/link-health-audit.yml` | Review first |
| `.github/workflows/map-data-row-level-export.yml` | Consolidation review |
| `.github/workflows/map-geo-foundation-ci.yml` | Consolidation review |
| `.github/workflows/map-production-launch-ci.yml` | Consolidation review |
| `.github/workflows/map-production-live-audit.yml` | Review first |
| `.github/workflows/map-production-readiness.yml` | Consolidation review |
| `.github/workflows/map-public-ui-ci.yml` | Consolidation review |
| `.github/workflows/map-read-api-ci.yml` | Consolidation review |
| `.github/workflows/mobile-firstpaint-lcp-20261112.yml` | Consolidation review |
| `.github/workflows/notion-article-sync-ci.yml` | Consolidation review |
| `.github/workflows/notion-conflict-quality-ci.yml` | Consolidation review |
| `.github/workflows/notion-cross-batch-ci.yml` | Consolidation review |
| `.github/workflows/notion-events-help-sync-ci.yml` | Consolidation review |
| `.github/workflows/notion-manual-transfer-ci.yml` | Consolidation review |
| `.github/workflows/notion-profile-lossless-sync.yml` | Consolidation review |
| `.github/workflows/notion-schema-drift-guard.yml` | Consolidation review |
| `.github/workflows/open-source-production-ui.yml` | Consolidation review |
| `.github/workflows/open-source-seo-suite.yml` | Consolidation review |
| `.github/workflows/organization-profile-e2e.yml` | Consolidation review |
| `.github/workflows/outreach-ci.yml` | Consolidation review |
| `.github/workflows/pagespeed-css-hero-1322.yml` | Consolidation review |
| `.github/workflows/pagespeed-mobile-5.yml` | Consolidation review |
| `.github/workflows/partner-auth-ci.yml` | Consolidation review |
| `.github/workflows/playwright-e2e.yml` | Consolidation review |
| `.github/workflows/pr-visual-evidence.yml` | Consolidation review |
| `.github/workflows/production-breed-controlled-mirrors.yml` | Production safety |
| `.github/workflows/production-breed-json-audit.yml` | Production safety / review first |
| `.github/workflows/production-breed-sql-v2-backfill.yml` | Production safety / review first |
| `.github/workflows/production-breed-sql-v2-shadow-audit.yml` | Production safety / review first |
| `.github/workflows/production-breed-workcopy-postflight.yml` | Production safety / review first |
| `.github/workflows/production-breed-workcopy-stage.yml` | Production safety |
| `.github/workflows/production-d1-0123-0124-preflight.yml` | Production safety / review first |
| `.github/workflows/production-d1-0127-readonly.yml` | Production safety / review first |
| `.github/workflows/production-d1-0128-readonly.yml` | Production safety / review first |
| `.github/workflows/production-d1-0133-readonly.yml` | Production safety / review first |
| `.github/workflows/production-d1-0134-offline-ci.yml` | Production safety / review first |
| `.github/workflows/production-d1-0134-readonly.yml` | Production safety / review first |
| `.github/workflows/production-d1-0158-0162-contract.yml` | Production safety |
| `.github/workflows/production-d1-0158-0162-ledger-contract.yml` | Production safety / review first |
| `.github/workflows/production-d1-0158-0162-ledger.yml` | Production safety / review first |
| `.github/workflows/production-d1-0158-0162.yml` | Production safety |
| `.github/workflows/production-d1-0159-shadow.yml` | Production safety / review first |
| `.github/workflows/production-d1-0160-events.yml` | Production safety |
| `.github/workflows/production-d1-0161-event-metadata.yml` | Production safety |
| `.github/workflows/production-d1-0163-breed-controlled.yml` | Production safety |
| `.github/workflows/production-d1-0164-lifecycle.yml` | Production safety |
| `.github/workflows/production-d1-0165-contacts.yml` | Production safety |
| `.github/workflows/production-d1-analytics-0167-0168.yml` | Production safety |
| `.github/workflows/production-d1-backlog-verify.yml` | Production safety |
| `.github/workflows/production-d1-backlog.yml` | Production safety |
| `.github/workflows/production-d1-breed-0174.yml` | Production safety |
| `.github/workflows/production-d1-breed-0175.yml` | Production safety |
| `.github/workflows/production-d1-breeder-0169.yml` | Production safety |
| `.github/workflows/production-d1-breeder-cutover.yml` | Production safety / review first |
| `.github/workflows/production-d1-breeder-link-reset.yml` | Production safety |
| `.github/workflows/production-d1-directory-0170.yml` | Production safety |
| `.github/workflows/production-d1-directory-0173.yml` | Production safety |
| `.github/workflows/production-d1-facebook-weekly-0166.yml` | Production safety |
| `.github/workflows/production-d1-history-audit.yml` | Production safety / review first |
| `.github/workflows/production-d1-migrate.yml` | Production safety |
| `.github/workflows/production-d1-partner-0171-0172.yml` | Production safety |
| `.github/workflows/production-directory-contact-legacy-cleanup.yml` | Production safety / review first |
| `.github/workflows/production-directory-contact-null-backfill.yml` | Production safety / review first |
| `.github/workflows/production-directory-legacy-readonly.yml` | Production safety / review first |
| `.github/workflows/production-directory-onetime-notion-import.yml` | Production safety |
| `.github/workflows/production-directory-sql-step2.yml` | Production safety / review first |
| `.github/workflows/production-directory-sql-step3.yml` | Production safety / review first |
| `.github/workflows/production-editorial-storage-readonly.yml` | Production safety / review first |
| `.github/workflows/production-help-org-contact-json-cleanup.yml` | Production safety |
| `.github/workflows/production-help-sql-cutover.yml` | Production safety / review first |
| `.github/workflows/profile-review-admin-ci.yml` | Consolidation review |
| `.github/workflows/profile-review-submission-ci.yml` | Consolidation review |
| `.github/workflows/profile-reviews-public-ci.yml` | Consolidation review |
| `.github/workflows/public-ds5-cards.yml` | Consolidation review |
| `.github/workflows/public-html-cache-safety-guard.yml` | Consolidation review |
| `.github/workflows/public-listings-qa.yml` | Consolidation review |
| `.github/workflows/public-visual-screenshots.yml` | Consolidation review |
| `.github/workflows/public-web-perf-10-final.yml` | Consolidation review |
| `.github/workflows/review-author-auth-ci.yml` | Consolidation review |
| `.github/workflows/section-hero-v2-ci.yml` | Consolidation review |
| `.github/workflows/service-catalog-contract-ci.yml` | Consolidation review |
| `.github/workflows/services-v2-directory-ci.yml` | Consolidation review |
| `.github/workflows/services-v2-filter-contract-ci.yml` | Consolidation review |
| `.github/workflows/services-v3-admin-mobile-polish-ci.yml` | Consolidation review |
| `.github/workflows/services-v3-hourly-auto-sync.yml` | Consolidation review |
| `.github/workflows/services-v3-map-canonical-filter.yml` | Consolidation review |
| `.github/workflows/services-v3-notion-mirror-offline.yml` | Review first |
| `.github/workflows/services-v3-notion-receipt-proof-ci.yml` | Consolidation review |
| `.github/workflows/services-v3-production-readonly.yml` | Review first |
| `.github/workflows/services-v3-public-canonical-filter.yml` | Consolidation review |
| `.github/workflows/sitemap-edge-resilience.yml` | Consolidation review |
| `.github/workflows/sitewide-ai-entity-surface-ci.yml` | Consolidation review |
| `.github/workflows/submission-foundation-ci.yml` | Consolidation review |
| `.github/workflows/unified-section-hero-ci.yml` | Consolidation review |
| `.github/workflows/web-perf-compare-ci.yml` | Consolidation review |
| `.github/workflows/web-perf-observability.yml` | Consolidation review |

## Package script inventory

All entrypoint names at baseline. An unused-looking script may be called dynamically or externally; verify callers before removal.

- `audit:admin-performance-v2`
- `audit:breed-profiles`
- `audit:breeds`
- `audit:knip`
- `audit:knip:report`
- `audit:production`
- `audit:public-integrity`
- `benchmark:admin-search-v2`
- `benchmark:admin-step9`
- `build`
- `components:generate`
- `config:check`
- `db:check-migrations`
- `db:generate`
- `db:validate-clean`
- `deploy:cloudflare`
- `deploy:staging`
- `dev`
- `e2e`
- `e2e:admin-stability-step9`
- `e2e:install`
- `e2e:production`
- `graph:dependencies`
- `graph:react`
- `install:ci`
- `lint`
- `perf:html-cache:probe`
- `prebuild`
- `predev`
- `preflight:adoptions`
- `prelint`
- `start`
- `test`
- `test:admin-buttons`
- `test:admin-d1-step5`
- `test:admin-editor-source-step9`
- `test:admin-error-step8`
- `test:admin-events`
- `test:admin-merge-step10`
- `test:admin-mobile-step7`
- `test:admin-performance-v2`
- `test:admin-performance-v2-step1`
- `test:admin-performance-v2-steps2-9`
- `test:admin-performance-v2-tail`
- `test:admin-pwa`
- `test:admin-react-step6`
- `test:admin-stability-step10`
- `test:admin-stability-step9`
- `test:ai-referral`
- `test:analytics`
- `test:article-admin-editor`
- `test:article-hardening`
- `test:article-popularity`
- `test:article-promo`
- `test:article-ux`
- `test:automation-operations`
- `test:automation-schedule`
- `test:breed-concurrency`
- `test:breed-crawl-hierarchy`
- `test:breeding-station-ai-landings`
- `test:canonical-draft-delete`
- `test:ci`
- `test:ci:contract`
- `test:component-registry`
- `test:config`
- `test:content-discovery-v3`
- `test:deploy-safety`
- `test:directory-ai-landings-scale`
- `test:directory-read`
- `test:editorial-foundation`
- `test:events-public-ux`
- `test:facebook-admin-v2`
- `test:facebook-images`
- `test:facebook-images-ui`
- `test:facebook-publisher`
- `test:foundation`
- `test:functional-audit`
- `test:geo-foundation`
- `test:help-source`
- `test:help-sql-backfill`
- `test:help-sql-cutover-step5`
- `test:help-sql-production-step6`
- `test:help-sql-schema`
- `test:help-sql-sync-step4`
- `test:homepage-media`
- `test:image-editor-2`
- `test:internal-discovery`
- `test:lost-found`
- `test:map-production-launch`
- `test:map-public-ui`
- `test:map-read-api`
- `test:migration-safety`
- `test:monetization`
- `test:name-days`
- `test:notion-bulk-backfill`
- `test:notion-data-quality-audit`
- `test:notion-events-help-sync`
- `test:notion-facebook-images`
- `test:org-adoption-hardening`
- `test:org-fundraising`
- `test:org-fundraising-admin`
- `test:org-fundraising-foundation`
- `test:org-fundraising-public`
- `test:org-locations-admin`
- `test:outreach-foundation`
- `test:partner-auth`
- `test:partner-claims-step3`
- `test:partner-commercial-v1`
- `test:partner-dashboard`
- `test:partner-events`
- `test:partner-h2`
- `test:partner-h3`
- `test:partner-h4`
- `test:partner-help-step3`
- `test:partner-help-step4`
- `test:partner-help-step5`
- `test:partner-media`
- `test:partner-new-profile`
- `test:partner-platform`
- `test:partner-profile-changes`
- `test:partner-single-manager`
- `test:partner-step6`
- `test:partner-step7`
- `test:partner-step8`
- `test:perf-fastpaths`
- `test:public-css-scope`
- `test:public-integrity`
- `test:public-landing-alignment`
- `test:public-search-simplify`
- `test:record-lifecycle`
- `test:record-lifecycle-core`
- `test:review-author-auth`
- `test:reviews-admin`
- `test:reviews-foundation`
- `test:reviews-public-read`
- `test:reviews-submission`
- `test:search`
- `test:section-hero-v2`
- `test:section-visuals`
- `test:seo-metadata`
- `test:seo-structured-data`
- `test:sitewide-ai-entity-surface`
- `test:social-metadata`
- `test:social-metadata-rendered`
- `test:unified-section-hero`
- `test:visual-library`
- `validate:artifact`
- `validate:deploy-artifact`

## Test inventory

Exact tracked test names can be reproduced from baseline via `git ls-tree -r --name-only f1878ce5cd942f7f6db86ac58857bdf4151f6268` or the [baseline tests tree](https://github.com/investradarsk/psipedia-sk/tree/f1878ce5cd942f7f6db86ac58857bdf4151f6268/tests). Conventional test-to-workflow references: `node scripts/ci-v2-inventory.mjs > /tmp/ci-inventory.json` from a clean checkout of baseline. This is a lexical report, not evaluated YAML, glob or runtime coverage; manual reference analysis required. The connector did not execute this script, so no claim of full semantic classification.

| Location | test/spec-named files |
| --- | ---: |
| `outside tests` | 2 |
| `tests (root)` | 1020 |
| `tests/e2e` | 117 |

## Check-run inventory for #1622

| Context | Status at snapshot |
| --- | --- |
| Breed CI bootstrap, all-breed regression and Playwright | success |
| Reviewer authentication / Reviewer auth — desktop/mobile accessibility and security | in_progress |
| Review submission — desktop/mobile accessibility and security | success |
| Reviewer authentication / Reviewer auth — security, D1, lint and build | success |
| Review submission — security, D1, regressions, lint and build | success |
| Read-only production sitemap diagnostic collection | skipped |
| Close production smoke incident after verified green | skipped |
| SEO-RECOVERY-1 local indexability matrix | skipped |
| LOST-FOUND-1 public submission — desktop/mobile | skipped |
| SEARCH-1 local desktop/mobile E2E | skipped |
| Directory PR E2E — desktop and mobile | skipped |
| Admin Events — desktop and mobile | skipped |
| Notify owner about failed production smoke | skipped |
| Full breed CI bootstrap, all-breed regression and Playwright (manual/scheduled) | skipped |
| Playwright production smoke (${{ matrix.label }}) | skipped |
| PUBLIC DS-0B permanent Node and scoped directory Playwright | success |
| Admin dialog keyboard — desktop and mobile | success |
| Shared review build (standard) | success |
| Shared review build (local-e2e) | success |
| Shared review migration safety, clean D1 and lint | success |
| Build, lint and unit/integration tests | success |
| regression | success |
| Events final acceptance — real routes desktop and mobile | success |
| Select review regression scope | success |
| Article reading UX — desktop and mobile | success |
| ADMIN-IA-2 — contracts, build, lint and Playwright | failure |
| foundation | success |
| Admin Articles bulk — desktop and mobile | success |
| GitGuardian Security Checks | success |
| List, editor, relations, bulk and responsive E2E | success |
| source-audit | success |
| source-contracts | skipped |
| Read-only Knip report | success |
| Detect events regression ownership | success |
| Event artwork SSR, desktop and mobile | success |
| Public listing, categories, banners and mobile menu contracts | success |
| events-pilot-only | success |
| gallery | success |
| preview-visual | skipped |
| Bidirectional sync — typecheck, tests, lint, build | success |
| capture | success |
| Word-like editor — unit, lint, build and E2E | success |
| Operations — desktop and mobile, Axe and overflow | success |
| production-integration | success |
| Isolated Gemini foundation contract and migration safety | success |
| Map read contract, D1 integration and API E2E | success |
| preview-visual | skipped |
| preview-visual | skipped |
| source-contracts | skipped |
| source-contracts | skipped |
| Public route performance, privacy, CSS and image regressions | skipped |
| Image display and D1 migration contracts | success |
| inventory | success |
| contracts | success |

## Steps 2–10 acceptance

2. Remove only proven obsolete tests: identify retired behavior, check surviving code/callers, update all references and preserve equivalent current invariants.
3. Compare actual assertions, fixtures and failure modes; remove only equivalent or valueless duplicates.
4. Retire historical workflow triggers after moving unique live coverage. Production/one-time workflows require verified completion or explicit operational decision.
5. Consolidate install/lint/type checks and cache keyed to lockfile and toolchain.
6. Reuse one verified production build for compatible jobs; an incompatible local E2E build must not be mislabeled as the production artifact.
7. Consolidate browser jobs while preserving isolation/security and selected scenarios.
8. Implement conservative changed-file selection and cancellation of superseded PR runs; fail closed for unknown shared-core changes.
9. Separate scheduled/manual audits; preserve required contexts or migrate ruleset explicitly after validated parallel run.
10. Validate representative small/large changes, compare runtime and runner minutes, coverage and required checks; remove obsolete CI wiring after successful proof. No fixed duration or check count guarantee before measurement.

Step 1 changes documentation only. No production files, workflow triggers, tests, rulesets or deployment modified.
