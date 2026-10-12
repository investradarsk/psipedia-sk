# CI scope policy

CI-SCOPE-HARDENING-2 keeps the two ruleset-required job names stable while reducing unrelated feature work.

## Required checks

The ruleset requires these exact GitHub Actions job names:

- `Build, lint and unit/integration tests`
- `Breed CI bootstrap, all-breed regression and Playwright`

The workflow that owns them must continue to trigger on every pull request. It must not use top-level `pull_request.paths`.

## Scope model

`scripts/ci-scope.mjs` classifies changed files into CORE, ADMIN, MAPS/GEO, ORGANIZATION PROFILES, DIRECTORY/SERVICES, EVENTS, HELP, ARTICLES, BREEDS, SEARCH, REVIEWS, PARTNER, NOTION, AUTOMATION, PWA, SUBMISSIONS, DATABASE/MIGRATIONS and VISUAL.

`package.json` is not a blanket feature trigger. A script-only change is handled by the required core check. `package-lock.json` remains a broad dependency signal for dependency-sensitive workflows.

Shared runtime files are not automatically treated as every feature. The required core suite is the safety net for cross-cutting code; expensive feature E2E remains tied to concrete feature paths.

## Workflow rules

Pull-request workflows with expensive steps must either use explicit `paths` scope or the internal changed-file scope. They must use PR-safe concurrency with stale runs cancelled. Production, deployment, scheduled and migration write workflows keep their original non-PR triggers and safety gates.

Run the static regression guard with:

```bash
node scripts/check-ci-scope.mjs
```

The guard also simulates the requested article, Maps admin, Notion, visual CSS, migration, dependency, docs-only and workflow-YAML scenarios plus the changed-file shapes of PR #579 and #580.

## HARDENING-3: event ranges and post-merge ownership

The same scope engine now handles PR base/head and PUSH before/after with full history and commit/ancestor validation. Invalid, missing, zero or non-ancestor PUSH revisions fail closed to full validation. Manual dispatch and schedule explicitly retain full regression and production smoke. Docs-only main pushes follow the fast required-status path and do not update auto-merge branches.

The required validation owns the build artifact for its exact checkout and workflow run. Full, directory and search E2E verify the downloaded revision, dist fingerprint and deploy-artifact contract instead of rebuilding. The full E2E suite owns the identical directory and public-event specs on broad changes; artwork and non-overlapping admin tests remain independent.

Security-critical auth/PII/resource-access modules retain full checks. Main production smoke runs for product/dependency/migration changes or unknown ranges, and always on dispatch/schedule; docs, CI-control-only and test-only changes do not trigger it. No cross-head success reuse is inferred from an incremental docs commit in a mixed PR.

[Confirmed incidents, all-workflow matrix, measured costs and estimated savings](ci-scope-hardening-3.md).
