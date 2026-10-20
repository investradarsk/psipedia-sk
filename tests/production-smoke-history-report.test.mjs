import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { analyze, normalizeRuns, renderMarkdown, demoPayload } from "../scripts/production-smoke-history-report.mjs";

const REPO = "investradarsk/psipedia-sk";
const A = "a".repeat(40), B = "b".repeat(40), C = "c".repeat(40);
const URL = "https://github.com/" + REPO + "/actions/runs/";
const rec = (testName, sha, time, conclusion, id, extra = {}) => ({
  test: testName, sha, timestamp: time, conclusion, run_number: id,
  run_id: id, url: URL + id, ...extra
});
const date = n => "2026-10-" + String(n).padStart(2, "0") + "T10:00:00Z";

test("only precise HEAD failure is CURRENT_FAIL", () => {
  const x = analyze({ records: [rec("desktop", A, date(10), "failure", 1)] }, { head: A });
  assert.equal(x.tests[0].state, "CURRENT_FAIL");
  const changed = analyze({ records: [rec("desktop", A, date(10), "failure", 1)] }, { head: B });
  assert.equal(changed.tests[0].state, "UNKNOWN");
  const withoutHead = analyze({ records: [rec("desktop", A, date(10), "failure", 1)] });
  assert.equal(withoutHead.tests[0].state, "UNKNOWN");
});

test("same SHA fail-to-pass marked flaky, later pass does not clear all issues", () => {
  const fixture = { records: [
    rec("desktop", A, date(10), "failure", 10),
    rec("desktop", A, date(11), "success", 11),
    rec("mobile", A, date(11), "failure", 12)
  ], issues: [{ number: 883, run_number: 10, html_url: "https://github.com/" + REPO + "/issues/883" }] };
  const x = analyze(fixture, { head: A });
  assert.equal(x.tests.find(t => t.test === "desktop").state, "PASS_ON_HEAD");
  assert.equal(x.tests.find(t => t.test === "mobile").state, "CURRENT_FAIL");
  assert.equal(x.tests.find(t => t.test === "desktop").flaky, true);
  assert.equal(x.issue_notices[0].assessment, "UNRESOLVED_EVIDENCE");
  assert.match(renderMarkdown(x), /not proof of original fix|potentially flaky/i);
});

test("different SHA later pass is bounded to its own test", () => {
  const x = analyze({ records: [
    rec("desktop", A, date(10), "failure", 20),
    rec("desktop", B, date(11), "success", 21),
    rec("mobile", A, date(10), "failure", 22)
  ] }, { head: B });
  assert.equal(x.tests.find(t => t.test === "desktop").state, "PASS_ON_HEAD");
  assert.equal(x.tests.find(t => t.test === "desktop").later_passes[0].same_sha, false);
  assert.equal(x.tests.find(t => t.test === "mobile").state, "UNKNOWN");
});

test("repeated failures, pass-to-fail regression, and grouped date/SHA", () => {
  const x = analyze({ records: [
    rec("desktop", A, "2026-10-10T09:00:00Z", "failure", 1),
    rec("desktop", A, "2026-10-10T10:00:00Z", "failure", 2),
    rec("desktop", A, date(11), "success", 3),
    rec("desktop", B, date(12), "failure", 4)
  ] }, { head: B });
  assert.equal(x.tests[0].state, "CURRENT_FAIL");
  assert.equal(x.tests[0].repeated_failures, 1);
  assert.equal(x.tests[0].regression, true);
  assert.equal(x.groups.length, 3);
  assert.equal(x.groups[0].runs.length, 2);
});

test("cancelled, skipped and unknown are never reported as passes", () => {
  const x = analyze({ records: [
    rec("desktop", A, date(10), "cancelled", 1),
    rec("mobile", A, date(10), "skipped", 2),
    rec("tablet", A, date(10), null, 3, { status: "in_progress" }),
    rec("phone", A, date(10), "neutral", 4)
  ] }, { head: A });
  assert.equal(x.tests.find(t => t.test === "desktop").state, "CANCELLED");
  assert.equal(x.tests.find(t => t.test === "mobile").state, "SKIPPED");
  assert.equal(x.tests.find(t => t.test === "tablet").state, "UNKNOWN");
  assert.equal(x.tests.find(t => t.test === "phone").state, "UNKNOWN");
});

test("workflow overall failure never substitutes for skipped smoke job", () => {
  const run = {
    id: 501, name: "Playwright E2E and production smoke",
    head_sha: A, created_at: date(10), event: "push",
    conclusion: "failure", status: "completed", run_number: 501,
    html_url: URL + 501,
    jobs: [
      { name: "Build, lint and unit/integration tests", conclusion: "failure", status: "completed" },
      { name: "Playwright production smoke (desktop)", conclusion: "skipped", status: "completed" }
    ]
  };
  const x = analyze({ workflow_runs: [run] }, { head: A });
  assert.equal(x.tests.length, 1);
  assert.equal(x.tests[0].state, "SKIPPED");
  const y = normalizeRuns({ workflow_runs: [{ ...run, jobs: undefined }] });
  assert.equal(y.records.length, 0);
  assert.match(y.warnings[0], /No job evidence/);
});

test("PR workflows excluded from production evidence", () => {
  const run = { id: 2, event: "pull_request", head_sha: A, jobs: [
    { name: "Production smoke", status: "completed", conclusion: "failure" }
  ] };
  const x = analyze({ workflow_runs: [run] }, { head: A });
  assert.equal(x.summary.tests, 0);
  assert.ok(x.warnings.some(w => w.includes("Excluded PR")));
});

test("duplicate records and SHA/head changes cannot spoof health", () => {
  const old = rec("desktop", A, date(10), "failure", 10);
  const x = analyze({ records: [old, old, rec("desktop", B, date(11), "success", 11)] }, { head: C });
  assert.equal(x.groups[0].runs.length, 1);
  assert.equal(x.tests[0].state, "UNKNOWN");
  assert.equal(x.tests[0].later_passes.length, 1);
});

test("unsafe evidence links removed and Markdown escaped", () => {
  const x = analyze({ records: [
    rec("bad|test", A, date(10), "failure", 1, { url: "https://evil.invalid/anything" }),
    rec("other", A, date(11), "success", 2, { url: "https://github.com/elsewhere/repo/actions/runs/2" })
  ] }, { head: A });
  assert.ok(x.tests.every(t => t.latest.url === null));
  assert.doesNotMatch(renderMarkdown(x), /evil.invalid|\|test/);
});

test("synthetic demo CLI writes reproducible Markdown and JSON to explicit local files", () => {
  const dir = mkdtempSync(join(tmpdir(), "psipedia-ci-smoke-"));
  try {
    const md = join(dir, "smoke.md"), json = join(dir, "smoke.json");
    const run = spawnSync(process.execPath, [
      "scripts/production-smoke-history-report.mjs", "--demo", "--head", B,
      "--markdown", md, "--json", json
    ], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const report = JSON.parse(readFileSync(json, "utf8"));
    assert.equal(report.schema_version, 1);
    assert.equal(report.summary.current_fail, 1);
    assert.equal(report.summary.cancelled, 1);
    assert.equal(report.summary.skipped, 1);
    assert.match(readFileSync(md, "utf8"), /History by test, SHA, UTC day/);
    assert.equal(report.issue_notices[0].assessment, "UNRESOLVED_EVIDENCE");
    const repeat = spawnSync(process.execPath, [
      "scripts/production-smoke-history-report.mjs", "--demo", "--head", B,
      "--markdown", md
    ], { encoding: "utf8" });
    assert.notEqual(repeat.status, 0, "refuse overwriting report without approval");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("invalid fixture, incomplete SHA and malformed head fail closed", () => {
  assert.throws(() => analyze({}, { head: A }), /Expected records/);
  assert.throws(() => analyze({ records: [] }, { head: "short" }), /40-digit/);
  const x = normalizeRuns({ records: [{ test: "bad", sha: "aaa", timestamp: date(10) }] });
  assert.equal(x.records.length, 0);
  assert.ok(x.warnings.length);
});

test("demo fixtures stable and contain no live credentials", () => {
  const x = demoPayload();
  assert.equal(x.records.length, 5);
  assert.ok(x.records.every(r => r.url.startsWith(URL)));
});
