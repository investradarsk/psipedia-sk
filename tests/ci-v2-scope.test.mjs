import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyChangedFiles, plannedTestGroups, resolveChangedFiles, reviewPrSelection, REVIEW_PR_PATHS } from "../scripts/ci-scope.mjs";
import { GROUPS } from "../scripts/ci-test-groups.mjs";
import { evaluateCondition, workflowConditions } from "../scripts/ci-scope-conditions.mjs";

test("unknown ownership is evaluated per file, not per commit", () => {
  const known = classifyChangedFiles(["components/admin-article-editor.tsx"]);
  assert.equal(known.fullCore, false);
  assert.equal(known.boundedCore, true);
  assert.ok(plannedTestGroups(known).includes("admin"));
  const unknown = classifyChangedFiles(["components/admin-article-editor.tsx", "lib/new-shared-engine.ts"]);
  assert.equal(unknown.fullCore, true);
  assert.deepEqual(unknown.unknownFiles, ["lib/new-shared-engine.ts"]);
  assert.deepEqual(plannedTestGroups(unknown), Object.keys(GROUPS));
  for (const file of ["lib/admin-mutation-origin.ts", "package-lock.json", "drizzle/new.sql", "build/sites-vite-plugin.ts", "public/robots.txt", "app/content.mdx"]) {
    assert.equal(classifyChangedFiles([file]).fullCore, true, file);
  }
});

test("known content and shared visual changes stay scoped", () => {
  for (const file of ["app/page.tsx", "lib/dog-name-day-calendar.ts", "app/premium-foundation.css", "app/design-system.css", "components/directory-card.tsx"]) {
    const result = classifyChangedFiles([file]);
    assert.equal(result.boundedCore, true, file);
    assert.ok(plannedTestGroups(result).includes("public"), file);
  }
  assert.equal(classifyChangedFiles(["app/premium-foundation.css"]).publicDs0b, true);
  assert.deepEqual(plannedTestGroups(classifyChangedFiles(["docs/ci.md"])), ["code-quality"]);
  assert.equal(classifyChangedFiles(["scripts/ci-scope.mjs", "tests/ci-v2-scope.test.mjs"]).ciControlOnly, true);
  assert.equal(classifyChangedFiles(["package.json"], { packageTestScriptsOnly: true }).fullCore, false);
});

test("rename detection is disabled so both old and new paths are classified", () => {
  const sha = "a".repeat(40);
  const result = resolveChangedFiles({
    eventName: "pull_request", baseSha: sha, headSha: "b".repeat(40),
    git(args) {
      if (args[0] !== "diff") return "";
      assert.ok(args.includes("--no-renames"));
      return "lib/admin-auth.ts\0docs/renamed.md\0";
    },
  });
  assert.equal(result.trusted, true);
  assert.equal(classifyChangedFiles(result.files).fullCore, true);
});

test("review pilot preserves old path ownership and fails closed on ambiguity", () => {
  assert.deepEqual(reviewPrSelection(["components/review-author-form.tsx"]), { auth: true, submission: false });
  assert.deepEqual(reviewPrSelection(["components/profile-review-submission-form.tsx"]), { auth: false, submission: true });
  assert.deepEqual(reviewPrSelection(["app/api/review-author/reviews/route.ts"]), { auth: true, submission: true });
  assert.deepEqual(reviewPrSelection(["lib/review-author-auth.ts"]), { auth: true, submission: true });
  assert.deepEqual(reviewPrSelection(["components/review-author-form.tsx", "components/profile-review-submission-form.tsx"]), { auth: true, submission: true });
  for (const files of [[], ["package-lock.json"], ["scripts/ci-scope.mjs"], ["unrecognized.ts"]]) {
    assert.deepEqual(reviewPrSelection(files), { auth: true, submission: true });
  }
  assert.deepEqual(reviewPrSelection(["components/review-author-form.tsx"], { trusted: false }), { auth: true, submission: true });
  assert.deepEqual(reviewPrSelection([], { eventName: "workflow_dispatch", trusted: false }), { auth: false, submission: true });
});

test("review workflow path filter equals canonical scope union and predicates match selection", () => {
  const source = readFileSync(new URL("../.github/workflows/profile-review-submission-ci.yml", import.meta.url), "utf8");
  const paths = [...source.matchAll(/^ {6}- "([^"]+)"$/gm)].map((match) => match[1]);
  assert.deepEqual([...new Set(paths)].sort(), [...REVIEW_PR_PATHS].sort());
  const jobs = workflowConditions(source);
  for (const files of [["components/review-author-form.tsx"], ["components/profile-review-submission-form.tsx"], ["package-lock.json"]]) {
    const result = reviewPrSelection(files);
    const context = { needs: { scope: { outputs: { review_auth: String(result.auth), review_submission: String(result.submission) } } } };
    const condition = (id) => jobs.find((job) => job.id === id).condition;
    assert.equal(evaluateCondition(condition("reviewer-auth"), context), result.auth);
    assert.equal(evaluateCondition(condition("validation"), context), result.submission);
    assert.equal(evaluateCondition(condition("shared-build"), context), true);
  }
});
