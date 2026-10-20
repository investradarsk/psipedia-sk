import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { SCREENS, DEVICES, METRICS, summarizeSamples } from "../scripts/admin-perf-core.mjs";
import { BenchmarkError, analyzeReports, parseArgs, renderMarkdown } from "../scripts/admin-perf-analyze.mjs";

const OLD = "1".repeat(40);
const NEW = "2".repeat(40);
const source = { ready_ms: 100, dom_content_loaded_ms: 80, load_event_ms: 130,
  requests: 10, transfer_bytes: 1000, api_requests: 5, api_transfer_bytes: 400,
  api_p50_ms: 20, api_p95_ms: 40 };
const ENV = Object.freeze({ schema: 1, fixture_id: "synthetic-fixture-v2",
  fixture_digest: "a".repeat(64), environment_id: "offline-runner-1",
  os: "linux-x64", hardware_profile: "same-physical-host",
  server_mode: "local-dev", network_profile: "loopback",
  cache_profile: "fresh-context" });
const clone = (value) => structuredClone(value);

function report(sha, factor = 1, opts = {}) {
  const repeats = opts.repeats ?? 3;
  const device = opts.device ?? "both";
  const devices = device === "both" ? Object.keys(DEVICES) : [device];
  const samples = [];
  for (const screen of SCREENS) for (const d of devices) for (let repeat = 1; repeat <= repeats; repeat++) {
    const navigation = Object.fromEntries(METRICS.map((key) => [key, source[key] * factor]));
    const steps = {};
    for (const name of ["pagination", "filter", "editor"]) {
      if (screen[name]) steps[name] = { status: "ok",
        duration_ms: 100 * factor, api_p95_ms: 30 * factor, api_requests: 2 };
    }
    samples.push({ screen: screen.id, device: d, repeat, status: "ok",
      blocked_writes: 0, d1: null, navigation, steps });
  }
  return { schema: 1, scope: "isolated_local_fixture_only", provenance: "local_synthetic",
    checkout_sha: sha, fixture_id: ENV.fixture_id, playwright_browser: "chromium",
    browser_version: "125.0.0.0", node_version: "v22.15.0", repeats, device,
    samples, summary: summarizeSamples(samples) };
}
function row(result, screen = "articles", device = "desktop") {
  return result.rows.find((r) => r.screen === screen && r.device === device);
}
function checkThrows(fn, code) {
  assert.throws(fn, (e) => e instanceof BenchmarkError && e.code === code);
}

test("18 device/screen rows; absolute and relative latency, API p95, requests and transfer", () => {
  const result = analyzeReports(report(OLD), report(NEW, 0.8), ENV, ENV);
  assert.equal(result.rows.length, SCREENS.length * Object.keys(DEVICES).length);
  assert.equal(result.overall, "improvement");
  assert.equal(result.counts.improvement, 18);
  const r = row(result);
  for (const key of METRICS) {
    assert.equal(r.metrics[key].status, "improvement", key);
    assert.equal(r.metrics[key].percent_change, -20, key);
    assert.equal(r.metrics[key].before_samples, 3);
    assert.equal(r.metrics[key].after_samples, 3);
  }
  assert.equal(r.metrics.ready_ms.before, 100);
  assert.equal(r.metrics.ready_ms.after, 80);
  assert.equal(r.metrics.ready_ms.delta, -20);
  assert.equal(r.metrics.api_p95_ms.delta, -8);
  assert.equal(r.metrics.requests.delta, -2);
  assert.equal(r.metrics.transfer_bytes.delta, -200);
  assert.equal(r.steps.filter.duration_ms.delta, -20);
  assert.equal(r.steps.filter.api_p95_ms.delta, -6);
  assert.equal(row(result, "dashboard", "mobile").steps.filter, undefined);
  const md = renderMarkdown(result);
  assert.match(md, /articles \| desktop \| improvement/);
  assert.match(md, /100ms → 80ms/);
  assert.match(md, /not statistical significance/);
});

test("regression, unchanged and zero baseline remain distinguishable", () => {
  const unchanged = analyzeReports(report(OLD), report(NEW), ENV, ENV);
  assert.equal(unchanged.overall, "unchanged");
  const faster = report(NEW, 0.8);
  faster.samples[0].navigation.requests = 40;
  const changed = analyzeReports(report(OLD), faster, ENV, ENV);
  const first = row(changed, "dashboard");
  assert.equal(first.metrics.requests.status, "improvement");
  assert.equal(first.metrics.requests.before, 10);
  assert.equal(first.metrics.requests.after, 8); // median of 8, 8, 40 = 8
  assert.equal(first.status, "improvement"); // one outlier does not change the median
  const regressed = analyzeReports(report(OLD), report(NEW, 1.2), ENV, ENV);
  assert.equal(regressed.overall, "regression");
  assert.equal(row(regressed).metrics.requests.delta, 2);
  const b = report(OLD), a = report(NEW);
  for (const r of b.samples) r.navigation.api_requests = 0;
  for (const r of a.samples) r.navigation.api_requests = 2;
  const zero = row(analyzeReports(b, a, ENV, ENV)).metrics.api_requests;
  assert.equal(zero.status, "regression");
  assert.equal(zero.percent_change, null);
});

test("one invalid sample/metric and incomplete interactions are insufficient, not zero", () => {
  const b = report(OLD), a = report(NEW, 0.8);
  a.samples.find((s) => s.screen === "articles" && s.device === "desktop" && s.repeat === 2)
    .navigation.api_p95_ms = null;
  let res = analyzeReports(b, a, ENV, ENV);
  assert.equal(row(res).metrics.api_p95_ms.status, "insufficient_data");
  assert.equal(row(res).metrics.api_p95_ms.after, null);
  assert.equal(row(res).metrics.api_p95_ms.after_samples, 2);
  assert.equal(row(res).status, "insufficient_data");
  const x = report(NEW, 0.8);
  x.samples = x.samples.filter((s) =>
    !(s.screen === "articles" && s.device === "desktop" && s.repeat === 2));
  x.summary = summarizeSamples(x.samples);
  res = analyzeReports(b, x, ENV, ENV);
  assert.equal(row(res).metrics.ready_ms.status, "insufficient_data");
  assert.equal(row(res).before_runs, 3);
  assert.equal(row(res).after_runs, 2);
  const y = report(NEW, 0.8);
  y.samples.find((s) => s.screen === "events" && s.device === "mobile").steps.editor.status = "unavailable";
  res = analyzeReports(b, y, ENV, ENV);
  assert.equal(row(res, "events", "mobile").steps.editor.status, "insufficient_data");
});

test("summaries are never treated as evidence; raw sample medians are decisive", () => {
  const b = report(OLD), a = report(NEW, 0.8);
  a.summary.find((r) => r.screen === "articles" && r.device === "desktop").metrics.ready_ms = 0;
  assert.equal(row(analyzeReports(b, a, ENV, ENV)).metrics.ready_ms.after, 80);
  for (const item of [...b.samples, ...a.samples]) {
    if (item.screen === "articles") item.steps.filter.status = "not_applicable";
  }
  const step = row(analyzeReports(b, a, ENV, ENV)).steps.filter;
  assert.equal(step.status, "not_applicable");
});

test("report mismatch rejection: fixture, browser, runtime, scope, devices and repeats", () => {
  const cases = [
    ["fixture_id", "different"], ["browser_version", "126"],
    ["node_version", "v24"], ["device", "desktop"], ["repeats", 2],
  ];
  for (const [field, value] of cases) {
    const after = field === "device" ? report(NEW, 1, { device: "desktop" })
      : field === "repeats" ? report(NEW, 1, { repeats: 2 }) : report(NEW);
    after[field] = value;
    checkThrows(() => analyzeReports(report(OLD), after, ENV, ENV), "INCOMPARABLE_REPORT:" + field);
  }
  const after = report(NEW);
  after.scope = "production_authenticated";
  checkThrows(() => analyzeReports(report(OLD), after, ENV, ENV), "UNSUPPORTED_REPORT_PROVENANCE");
  after.scope = "isolated_local_fixture_only";
  after.provenance = "production";
  checkThrows(() => analyzeReports(report(OLD), after, ENV, ENV), "UNSUPPORTED_REPORT_PROVENANCE");
  const same = report(OLD);
  checkThrows(() => analyzeReports(report(OLD), same, ENV, ENV), "IDENTICAL_CHECKOUT_SHA");
});

test("environment sidecar is mandatory and checked field-by-field", () => {
  for (const field of ["environment_id", "os", "hardware_profile", "server_mode",
    "network_profile", "cache_profile", "fixture_digest"]) {
    const changed = clone(ENV);
    changed[field] = field === "fixture_digest" ? "b".repeat(64) : "different";
    checkThrows(() => analyzeReports(report(OLD), report(NEW), ENV, changed),
      "INCOMPARABLE_ENVIRONMENT:" + field);
  }
  checkThrows(() => analyzeReports(report(OLD), report(NEW), ENV, null), "INVALID_ENVIRONMENT_MANIFEST");
  const bad = clone(ENV);
  delete bad.hardware_profile;
  checkThrows(() => analyzeReports(report(OLD), report(NEW), bad, ENV),
    "MISSING_ENVIRONMENT_FIELD:hardware_profile");
  const mislabeled = clone(ENV);
  mislabeled.fixture_id = "wrong";
  checkThrows(() => analyzeReports(report(OLD), report(NEW), mislabeled, ENV), "INVALID_ENVIRONMENT_MANIFEST");
});

test("corrupt provenance, duplicates, write attempts and bad inputs fail closed", () => {
  const b = report(OLD), a = report(NEW);
  a.checkout_sha = null;
  checkThrows(() => analyzeReports(b, a, ENV, ENV), "MISSING_REPORT_PROVENANCE");
  a.checkout_sha = NEW;
  a.samples.push(clone(a.samples[0]));
  checkThrows(() => analyzeReports(b, a, ENV, ENV), "DUPLICATE_SAMPLE");
  a.samples.pop();
  a.samples[0].blocked_writes = 1;
  checkThrows(() => analyzeReports(b, a, ENV, ENV), "UNSAFE_REPORT_SAMPLE");
  a.samples[0].blocked_writes = 0;
  a.samples[0].navigation = null;
  checkThrows(() => analyzeReports(b, a, ENV, ENV), "INVALID_NAVIGATION");
  checkThrows(() => parseArgs(["--before", "/tmp/input.json"]), "USAGE_REQUIRED_OPTIONS");
});

test("CLI writes machine JSON and Markdown from synthetic reports only", async () => {
  const dir = await mkdtemp(join(tmpdir(), "psipedia-perf-v2-"));
  try {
    const paths = ["before.json", "after.json", "before-env.json", "after-env.json",
      "comparison.json", "comparison.md"].map((p) => join(dir, p));
    const sources = [report(OLD), report(NEW, 0.8), ENV, ENV];
    for (let i = 0; i < 4; i++) await writeFile(paths[i], JSON.stringify(sources[i]));
    const args = ["--before", paths[0], "--after", paths[1],
      "--before-env", paths[2], "--after-env", paths[3], "--json", paths[4],
      "--markdown", paths[5]];
    assert.deepEqual(Object.keys(parseArgs(args)).sort(),
      ["before", "after", "beforeEnv", "afterEnv", "json", "markdown"].sort());
    const cli = spawnSync(process.execPath, [resolve("scripts/admin-perf-analyze.mjs"), ...args],
      { encoding: "utf8", timeout: 10000 });
    assert.equal(cli.status, 0, cli.stderr);
    const json = JSON.parse(await readFile(paths[4], "utf8"));
    assert.equal(json.schema, 2);
    assert.equal(json.rows.length, 18);
    assert.equal(json.overall, "improvement");
    assert.match(await readFile(paths[5], "utf8"), /API p95/);
    await writeFile(paths[3], JSON.stringify({ ...ENV, environment_id: "another" }));
    const incompatible = spawnSync(process.execPath,
      [resolve("scripts/admin-perf-analyze.mjs"), ...args], { encoding: "utf8", timeout: 10000 });
    assert.equal(incompatible.status, 1);
    assert.match(incompatible.stderr, /INCOMPARABLE_ENVIRONMENT:environment_id/);
    assert.doesNotMatch(incompatible.stderr, /psipedia-perf-v2-/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
