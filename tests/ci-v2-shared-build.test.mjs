import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertArtifactIdentity, assertBuildProfile, expectedBuildRevision } from "../scripts/ci-build-artifact.mjs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const parent = read(".github/workflows/profile-review-submission-ci.yml");
const auth = read(".github/workflows/review-author-auth-ci.yml");

test("standard and isolated E2E build identities cannot be interchanged", () => {
  const local = { PSIPEDIA_E2E_LOCAL_BOOTSTRAP: "1", E2E_BASE_URL: "http://localhost:5173" };
  assert.doesNotThrow(() => assertBuildProfile("standard", {}));
  assert.doesNotThrow(() => assertBuildProfile("local-e2e", local));
  assert.throws(() => assertBuildProfile("standard", local));
  assert.throws(() => assertBuildProfile("local-e2e", {}));
  assert.throws(() => assertBuildProfile("local-e2e", { ...local, E2E_BASE_URL: "https://example.com" }));
  assert.throws(() => assertBuildProfile("standard", { MAP_UI_TEST_RENDERER: "test" }));
  assert.throws(() => assertBuildProfile("unknown", {}));
});

test("every artifact identity field is required and checked", () => {
  const identity = {
    version: 1, profile: "standard", revision: "a", node: "v24",
    lockSha256: "b", registrySha256: "c", distSha256: "d", fileCount: 10,
  };
  assert.doesNotThrow(() => assertArtifactIdentity(identity, { ...identity }));
  for (const key of Object.keys(identity)) {
    assert.throws(() => assertArtifactIdentity(identity, { ...identity, [key]: "wrong" }), new RegExp(key));
    const missing = { ...identity };
    delete missing[key];
    assert.throws(() => assertArtifactIdentity(missing, identity), new RegExp(key));
  }
});

test("PR review jobs share two profiles in the same workflow run", () => {
  assert.match(parent, /profile: \[standard, local-e2e\]/);
  assert.match(parent, /name: ci-v2-review-\$\{\{ matrix\.profile \}\}-\$\{\{ github\.sha \}\}/);
  assert.match(parent, /uses: \.\/\.github\/workflows\/review-author-auth-ci\.yml/);
  assert.match(parent, /reviewer-auth:[\s\S]*?needs: \[scope, shared-build, common-validation\]/);
  assert.match(parent, /validation:\n    needs: \[scope, shared-build, common-validation\]/);
  assert.match(auth, /on:\n  workflow_call:\n    inputs:[\s\S]*?  workflow_dispatch:/);
  for (const workflow of [parent, auth]) {
    for (const profile of ["standard", "local-e2e"]) {
      assert.ok(workflow.includes("name: ci-v2-review-" + profile + "-${{ github.sha }}"));
      assert.ok(workflow.includes("run: node scripts/ci-build-artifact.mjs verify " + profile));
    }
    assert.doesNotMatch(workflow, /run-id:|github-token:|--remote/);
    assert.match(workflow, /--local --config dist\/server\/wrangler\.json --persist-to \.wrangler\/state/);
    assert.match(workflow, /--project=desktop-chromium/);
    assert.match(workflow, /--project=mobile-chromium/);
  }
  assert.match(auth, /name: Build \(standalone manual run\)\n        if: github.event_name != 'pull_request'\n        run: npm run build/);
  assert.match(auth, /name: Local build \(standalone manual run\)\n        if: github.event_name != 'pull_request'\n        run: npm run build/);
  assert.match(parent, /tests\/fixtures\/review-author-auth-e2e\.sql/);
  assert.match(parent, /tests\/fixtures\/profile-review-submission-e2e\.sql/);
});

test("common review validation runs once and standalone auth retains all safety checks", () => {
  const shared = parent.slice(parent.indexOf("  common-validation:\n"), parent.indexOf("  shared-build:\n"));
  const submission = parent.slice(parent.indexOf("  validation:\n"), parent.indexOf("  e2e:\n"));
  assert.match(shared, /needs: scope/);
  assert.match(shared, /review_auth == 'true' \|\| needs.scope.outputs.review_submission == 'true'/);
  assert.match(parent, /needs: \[scope, shared-build, common-validation\]\n    uses: \.\/\.github\/workflows\/review-author-auth-ci\.yml\n    with:\n      shared_validation: true/);
  assert.match(auth, /shared_validation:\n[\s\S]*?type: boolean\n        default: false/);
  for (const command of ["db:check-migrations", "db:validate-clean", "lint"]) {
    const line = "run: npm run " + command;
    assert.equal(parent.split(line).length, 2, command);
    assert.ok(shared.includes(line));
    assert.ok(!submission.includes(line));
    assert.ok(auth.includes("if: inputs.shared_validation != true\n        " + line));
  }
  assert.match(submission, /npm run test:reviews-submission/);
  assert.match(submission, /npm run test:review-author-auth/);
  assert.match(submission, /npm run test:reviews-public-read/);
  assert.match(auth, /npm run test:review-author-auth/);
});

test("explicit head revision is allowed only for the isolated local profile", () => {
  const merge = "a".repeat(40), head = "b".repeat(40);
  assert.equal(expectedBuildRevision("standard", {GITHUB_SHA:merge}), merge);
  assert.equal(expectedBuildRevision("local-e2e", {GITHUB_SHA:merge,CI_BUILD_SOURCE_REVISION:head}), head);
  assert.throws(() => expectedBuildRevision("standard", {GITHUB_SHA:merge,CI_BUILD_SOURCE_REVISION:head}), /local-E2E only/);
  assert.throws(() => expectedBuildRevision("local-e2e", {CI_BUILD_SOURCE_REVISION:"invalid"}), /invalid/);
});
test("central public local profile is built once and shared with SEO", () => {
  const source=read(".github/workflows/playwright-e2e.yml");
  const ds=source.slice(source.indexOf("  ds-0b-focused-regression:"),source.indexOf("  required-breed-check:"));
  const seo=source.slice(source.indexOf("  seo-recovery-e2e:"),source.indexOf("  sitemap-production-diagnostic:"));
  const lost=source.slice(source.indexOf("  lost-found-public-e2e:"));
  assert.match(ds,/--build-only/);
  assert.match(ds,/--reuse-build/);
  assert.match(ds,/actions\/upload-artifact@v4/);
  assert.match(seo,/needs: \[validate, ds-0b-focused-regression\]/);
  assert.match(seo,/actions\/download-artifact@v4/);
  assert.match(seo,/--reuse-build/);
  assert.doesNotMatch(seo,/--build-only|run: npm run build/);
  for(const block of [ds,seo]) {
    assert.ok(block.includes("ci-public-local-e2e-\${{ github.event.pull_request.head.sha }}".replace("\\$","$")));
    assert.ok(block.includes("CI_BUILD_SOURCE_REVISION: \${{ github.event.pull_request.head.sha }}".replace("\\$","$")));
  }
  assert.match(lost,/actions\/download-artifact@v4/);
  assert.match(lost,/Validated build fingerprint mismatch/);
  assert.match(lost,/if: needs\.validate\.outputs\.full_core != 'true' && needs\.validate\.outputs\.bounded_core != 'true'\n        run: npm run build/);
  const script=read("scripts/start-public-regression-ci.sh");
  assert.match(script,/--build-only\)[\s\S]*?record local-e2e[\s\S]*?exit 0/);
  assert.match(script,/--reuse-build\)[\s\S]*?verify local-e2e/);
});
