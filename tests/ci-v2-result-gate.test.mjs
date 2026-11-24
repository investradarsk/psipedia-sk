import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluateGate, renderSummary } from "../scripts/ci-result-gate.mjs";
import { evaluateCondition, workflowConditions } from "../scripts/ci-scope-conditions.mjs";

const central = {
  "ds-0b-focused-regression": "public_ds0b",
  "admin-interaction-e2e": "admin_interaction",
  "admin-events-e2e": "admin_events",
  "search-e2e": "search",
  "directory-e2e": "directory",
  "seo-recovery-e2e": "seo_recovery",
  "lost-found-public-e2e": "lost_found",
};

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
function centralNeeds(selected = [], full = false) {
  const outputs = Object.fromEntries(Object.values(central).map((flag) => [flag, String(selected.includes(flag))]));
  outputs.full_core = String(full);
  return {
    validate: { result: "success", outputs },
    ...Object.fromEntries(Object.entries(central).map(([job, flag]) => [
      job, { result: selected.includes(flag) && (job !== "directory-e2e" || !full) ? "success" : "skipped" },
    ])),
  };
}

test("central gate requires success for every selected local job and exact skip for unselected jobs", () => {
  assert.equal(evaluateGate("central", centralNeeds()).pass, true);
  for (const [job, flag] of Object.entries(central)) {
    const selected = centralNeeds([flag]);
    assert.equal(evaluateGate("central", selected).pass, true, job);
    for (const status of ["failure", "cancelled", "skipped", "unexpected"]) {
      const bad = structuredClone(selected);
      bad[job].result = status;
      assert.equal(evaluateGate("central", bad).pass, false, job + " " + status);
    }
    const missing = structuredClone(selected);
    delete missing[job];
    assert.equal(evaluateGate("central", missing).pass, false, job);
    const unexpected = centralNeeds();
    unexpected[job].result = "success";
    assert.equal(evaluateGate("central", unexpected).pass, false, job);
  }
});

test("missing scope, invalid booleans and failed validation fail closed", () => {
  for (const status of ["failure", "cancelled", "skipped"]) {
    const n = centralNeeds();
    n.validate.result = status;
    assert.equal(evaluateGate("central", n).pass, false);
  }
  for (const flag of ["full_core", ...Object.values(central)]) {
    for (const invalid of [undefined, "", "TRUE", true]) {
      const n = centralNeeds();
      n.validate.outputs[flag] = invalid;
      assert.equal(evaluateGate("central", n).pass, false);
    }
  }
  assert.equal(evaluateGate("central", {}).pass, false);
  assert.throws(() => evaluateGate("unknown", {}));
});

test("central expected selection matches actual local YAML conditions", () => {
  const source = read(".github/workflows/playwright-e2e.yml");
  const jobs = workflowConditions(source);
  const gate = jobs.find((job) => job.id === "required-breed-check");
  assert.match(gate.block, /name: Breed CI bootstrap, all-breed regression and Playwright/);
  assert.ok(gate.block.includes("needs: [validate, " + Object.keys(central).join(", ") + "]"));
  assert.match(gate.condition, /always\(\)/);
  assert.ok(gate.block.includes("toJSON(needs)"));
  for (const flags of [[], ...Object.values(central).map((flag) => [flag]), Object.values(central)]) {
    for (const full of [false, true]) {
      const needs = centralNeeds(flags, full);
      assert.equal(evaluateGate("central", needs).pass, true);
      for (const job of Object.keys(central)) {
        const condition = jobs.find((candidate) => candidate.id === job).condition;
        assert.equal(evaluateCondition(condition, { github: { event_name: "pull_request", ref: "refs/pull/1/merge" }, needs }), needs[job].result === "success", job);
      }
    }
  }
});

function reviewNeeds(auth, submission) {
  return {
    scope: { result: "success", outputs: { review_auth: String(auth), review_submission: String(submission) } },
    "shared-build": { result: auth || submission ? "success" : "skipped" },
    "common-validation": { result: auth || submission ? "success" : "skipped" },
    "reviewer-auth": { result: auth ? "success" : "skipped" },
    validation: { result: submission ? "success" : "skipped" },
    e2e: { result: submission ? "success" : "skipped" },
  };
}

test("review aggregate validates auth-only, submission-only and both", () => {
  for (const [auth, submission] of [[true, false], [false, true], [true, true]]) {
    const needs = reviewNeeds(auth, submission);
    assert.equal(evaluateGate("reviews", needs).pass, true);
    for (const job of Object.keys(needs)) {
      if (needs[job].result !== "success") continue;
      for (const status of ["skipped", "failure", "cancelled"]) {
        const bad = structuredClone(needs);
        bad[job].result = status;
        assert.equal(evaluateGate("reviews", bad).pass, false, job);
      }
    }
  }
  assert.equal(evaluateGate("reviews", reviewNeeds(false, false)).pass, false);
  const missing = reviewNeeds(true, true);
  delete missing.scope.outputs.review_auth;
  assert.equal(evaluateGate("reviews", missing).pass, false);
  const workflow = read(".github/workflows/profile-review-submission-ci.yml");
  assert.match(workflow, /review-result:\n    name: Review CI selected suites\n    needs: \[scope, shared-build, common-validation, reviewer-auth, validation, e2e\]/);
});

test("CI summary reports actual coverage without claiming full browser regression", () => {
  const report = evaluateGate("central", centralNeeds());
  const summary = renderSummary("central", report);
  assert.match(summary, /PASS/);
  assert.match(summary, /\| directory-e2e \| skipped \| skipped \|/);
  assert.match(summary, /Full breed manual\/scheduled/);
});
