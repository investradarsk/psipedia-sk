import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyChangedFiles, plannedTestGroups, resolveChangedFiles, focusedPrE2eFlags, reviewPrSelection, REVIEW_PR_PATHS } from "../scripts/ci-scope.mjs";
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

test("consolidated CI configuration is not application code, but mixed changes remain fail-closed", () => {
  for (const file of [".github/ci/offline-suites.json", ".github/ci/notion-quality-suites.json", "scripts/ci-offline-scope.mjs", "tests/ci-two-stage-guards.test.mjs"]) {
    const result = classifyChangedFiles([file]);
    assert.equal(result.ciControlOnly,true,file);
    assert.equal(result.fullCore,false,file);
    assert.equal(result.boundedCore,false,file);
    assert.equal(classifyChangedFiles([file,"lib/admin-auth.ts"]).fullCore,true,file);
    assert.equal(classifyChangedFiles([file,"drizzle/9999_new.sql"]).fullCore,true,file);
    assert.equal(classifyChangedFiles([file,"lib/unclassified-new-engine.ts"]).fullCore,true,file);
  }
  assert.equal(classifyChangedFiles([".github/ci/new-unrecognized-config.json"]).fullCore,true);
});

test("editing public browser specs schedules their own selected browser suite", () => {
  assert.equal(focusedPrE2eFlags(classifyChangedFiles(["tests/e2e/events-public-v2.spec.ts"])).seoRecovery,true);
  assert.equal(classifyChangedFiles(["tests/public-details-v2-ui.test.mjs"]).publicDs0b,true);
  assert.equal(focusedPrE2eFlags(classifyChangedFiles(["tests/e2e/events-public-v2.spec.ts"])).sitemapDiagnostic,false);
  assert.equal(focusedPrE2eFlags(classifyChangedFiles(["docs/ci.md"])).seoRecovery,false);
});

test("stale PR cancellation is separated from scheduled and manual runs", () => {
  const read = name => readFileSync(new URL("../.github/workflows/" + name + ".yml",import.meta.url),"utf8");
  const central=read("playwright-e2e");
  assert.match(central,/group: playwright-e2e-\$\{\{ github\.event_name \}\}-/);
  assert.match(central,/github\.event\.pull_request\.number \|\| \(github\.event_name == 'push' && github\.ref\) \|\| github\.run_id/);
  for(const name of ["admin-stability-regressions","public-html-cache-safety-guard","code-quality-policy","sitemap-edge-resilience","breed-sql-0174-offline","notion-quality-ci"]) {
    const source=read(name);
    assert.match(source,/group: [^\n]+github\.event_name[^\n]+github\.event\.pull_request\.number \|\| github\.run_id/);
    assert.match(source,/cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  }
  const admin=read("admin-stability-regressions");
  assert.match(admin,/      - "tests\/\*\*"/);
  for (const match of admin.matchAll(/      - "!tests\/([^"]+\.test\.mjs)"/g)) {
    assert.ok(central.includes("tests/"+match[1]),match[1]+" must still run in required CI");
  }
  assert.equal([...admin.matchAll(/      - "!tests\/([^"]+\.test\.mjs)"/g)].length,9);
  assert.match(admin,/npm run test:admin-stability-step10/);
});


test("periodic diagnostics do not add ordinary PR checks or weaken functional regressions", () => {
  const read = name => readFileSync(new URL("../.github/workflows/" + name + ".yml",import.meta.url),"utf8");
  for (const name of ["knip-audit","public-web-perf-10-final"]) {
    const source=read(name);
    const trigger=source.slice(source.indexOf("\non:"),source.indexOf("\npermissions:"));
    assert.match(trigger,/\n  workflow_dispatch:/);
    assert.match(trigger,/\n  schedule:/);
    assert.doesNotMatch(trigger,/\n  pull_request(?:_target)?:|\n  push:/);
    assert.match(source,/cancel-in-progress: false/);
    assert.doesNotMatch(source,/secrets\.|wrangler deploy|--remote\b/);
  }
  assert.match(read("knip-audit"),/npm run audit:knip:report/);
  const knip=JSON.parse(readFileSync(new URL("../knip.json",import.meta.url),"utf8"));
  assert.ok(Array.isArray(knip.entry)&&knip.entry.length>0);
  assert.ok(Array.isArray(knip.project)&&knip.project.length>0);
  const perf=read("public-web-perf-10-final");
  assert.doesNotMatch(perf,/github\.head_ref/);
  for (const script of ["test:perf-fastpaths","test:homepage-media","test:public-css-scope","test:events-public-ux","test:map-public-ui","test:breed-crawl-hierarchy","test:monetization","test:ai-referral"]) {
    assert.ok(perf.includes("npm run "+script),script);
  }
  const admin=read("admin-performance-v2");
  assert.match(admin,/\n  pull_request:/);
  assert.match(admin,/\n  schedule:/);
  assert.match(admin,/Capture reproducible source baseline \(periodic\/manual only\)\n        if: github.event_name != 'pull_request'/);
  assert.match(admin,/npm run test:admin-performance-v2/);
  assert.match(admin,/scripts\/check-admin-v2-types\.mjs/);
  assert.match(admin,/Validate captured SQL-plan JSON/);
  const stability=read("admin-stability-regressions");
  assert.match(stability,/Production-style build diagnostic \(never deploy\)\n        if: \$\{\{ always\(\) && github\.event_name == 'workflow_dispatch' \}\}\n        continue-on-error: true/);
  assert.match(stability,/npm run test:admin-stability-step10/);
  assert.match(stability,/admin-type-regression-gate-step10\.mjs/);
  const central=read("playwright-e2e");
  for (const name of ["Build, lint and unit/integration tests","Breed CI bootstrap, all-breed regression and Playwright"]) assert.ok(central.includes("name: "+name));
  assert.match(central,/\n  pull_request:\n    branches: \[main\]/);
});
