import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertArtifactIdentity, assertBuildProfile } from "../scripts/ci-build-artifact.mjs";

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
  assert.match(parent, /reviewer-auth:[\s\S]*?needs: shared-build/);
  assert.match(parent, /validation:\n    needs: shared-build/);
  assert.match(auth, /on:\n  workflow_call:\n  workflow_dispatch:/);
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
