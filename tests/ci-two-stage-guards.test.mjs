import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const heavyWorkflows = [
  "admin-ia-2.yml",
  "admin-editor-workspace-v3.yml",
  "admin-event-editor-v3-pilot.yml",
  "breeds-admin-ci.yml",
  "article-admin-ci.yml",
  "admin-operations-ci.yml",
  "admin-pwa-ci.yml",
  "pr-visual-evidence.yml",
  // Longer independently bootstrapped D1/Playwright/SEO suites.
  "profile-reviews-public-ci.yml",
  "partner-auth-ci.yml",
  "map-read-api-ci.yml",
  "map-production-launch-ci.yml",
  "admin-article-bulk-e2e.yml",
  "content-relations-1.yml",
  "ai-internal-discovery-click-value-ci.yml",
  "sitewide-ai-entity-surface-ci.yml",
  "organization-profile-e2e.yml",
  "gemini-automation-foundation-ci.yml",
];

test("heavy optional checks run on ready-for-review and are deferred only for drafts", () => {
  for (const name of heavyWorkflows) {
    const workflow = read(".github/workflows/" + name);
    assert.match(workflow, /ready_for_review/, name + " must run when a draft becomes review-ready");
    assert.match(workflow, /github\.event\.pull_request\.draft == false/, name + " must remain active for review-ready PRs");
  }
});

test("mandatory CI remains active for drafts and runs focused editor contracts", () => {
  const workflow = read(".github/workflows/playwright-e2e.yml");
  assert.match(workflow, /name: Build, lint and unit\/integration tests/);
  assert.match(workflow, /name: Breed CI bootstrap, all-breed regression and Playwright/);
  assert.match(workflow, /Fast admin editor contracts/);
  assert.match(workflow, /Fast article editor contracts/);
  assert.match(workflow, /Fast breed editor contracts/);
  assert.doesNotMatch(workflow, /github\.event\.pull_request\.draft == false/);
});

test("irrelevant public screenshot and Gemini checks are excluded from admin-only edits", () => {
  const visual = read(".github/workflows/pr-visual-evidence.yml");
  const gemini = read(".github/workflows/gemini-automation-foundation-ci.yml");
  assert.match(visual, /"!app\/admin\/\*\*"/);
  assert.match(visual, /"!components\/admin-\*\*"/);
  assert.doesNotMatch(gemini, /^\s+- "components\/admin-event-editor\.tsx"\s*$/m);
  assert.doesNotMatch(gemini, /^\s+- "components\/admin-help-editor\.tsx"\s*$/m);
});


test("deferred workflows include a ready-for-review trigger, but manual dispatch remains intact", () => {
  for (const name of heavyWorkflows) {
    const source = read(".github/workflows/" + name);
    assert.match(source, /ready_for_review/, name);
    // These workflow files are responsible for heavyweight optional jobs only.
    assert.match(source, /github\.event\.pull_request\.draft == false/, name);
  }
  const launch = read(".github/workflows/map-production-launch-ci.yml");
  const reviews = read(".github/workflows/profile-reviews-public-ci.yml");
  assert.match(launch, /workflow_dispatch:/);
  assert.match(reviews, /workflow_dispatch:/);
});

test("event fallback preserves cheap scope discovery while deferring browser regressions", () => {
  const event = read(".github/workflows/events-fallback-images.yml");
  assert.match(event, /ready_for_review/);
  assert.match(event, /  scope:\n    name: Detect events regression ownership/);
  assert.match(event, /  artwork:\n    [^\n]*\n    if: \$\{\{ github.event_name != 'pull_request' \|\| github.event.pull_request.draft == false \}\}/);
  assert.match(event, /  public-events:[\s\S]*?github.event.pull_request.draft == false/);
  assert.match(event, /workflow_dispatch:/);
});

test("mandatory migration and central safety jobs are never deferred", () => {
  for (const name of ["playwright-e2e.yml", "clean-d1-migration-validation.yml"]) {
    const source = read(".github/workflows/" + name);
    assert.doesNotMatch(source, /github\.event\.pull_request\.draft == false/, name + " must run on draft PRs");
  }
});
