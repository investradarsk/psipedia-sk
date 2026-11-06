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
];

test("heavy admin checks run on ready-for-review and are deferred only for drafts", () => {
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
