#!/usr/bin/env node
// Offline-only comparator for PR #890 reports. No browser, network, D1 or app imports.
import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEVICES, METRICS, SCREENS, median } from "./admin-perf-core.mjs";

const STEP_NAMES = ["pagination", "filter", "editor"];
const ENV_KEYS = ["environment_id", "os", "hardware_profile", "server_mode",
  "network_profile", "cache_profile", "fixture_digest"];
const MAX_REPORT_BYTES = 10_000_000;
const SHA = /^[a-f0-9]{40}$/i;
const DIGEST = /^[a-f0-9]{64}$/i;
const TOKEN = /^[a-zA-Z0-9_.:-]{1,100}$/;
const round = (n) => Math.round(n * 100) / 100;
const valid = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

export class BenchmarkError extends Error {
  constructor(code) { super(code); this.name = "BenchmarkError"; this.code = code; }
}
function fail(code) { throw new BenchmarkError(code); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value); }

export function validateReport(report) {
  if (!object(report) || report.schema !== 1 || report.provenance !== "local_synthetic"
      || report.scope !== "isolated_local_fixture_only") fail("UNSUPPORTED_REPORT_PROVENANCE");
  if (!TOKEN.test(report.fixture_id ?? "") || report.playwright_browser !== "chromium"
      || typeof report.browser_version !== "string" || !report.browser_version
      || typeof report.node_version !== "string" || !report.node_version
      || !["both", ...Object.keys(DEVICES)].includes(report.device)
      || !Number.isInteger(report.repeats) || report.repeats < 1 || report.repeats > 10
      || !SHA.test(report.checkout_sha ?? "")) fail("MISSING_REPORT_PROVENANCE");
  if (!Array.isArray(report.samples) || !Array.isArray(report.summary)) fail("INVALID_REPORT_SAMPLES");
  const seen = new Set();
  for (const sample of report.samples) {
    if (!object(sample) || !SCREENS.some((screen) => screen.id === sample.screen)
        || !own(DEVICES, sample.device) || (report.device !== "both" && sample.device !== report.device)
        || !Number.isInteger(sample.repeat) || sample.repeat < 1 || sample.repeat > report.repeats
        || !["ok", "unavailable"].includes(sample.status)) fail("INVALID_SAMPLE");
    const key = sample.screen + ":" + sample.device + ":" + sample.repeat;
    if (seen.has(key)) fail("DUPLICATE_SAMPLE");
    seen.add(key);
    if (sample.blocked_writes !== 0 || sample.d1 !== null) fail("UNSAFE_REPORT_SAMPLE");
    if (sample.status === "ok" && !object(sample.navigation)) fail("INVALID_NAVIGATION");
    if (!object(sample.steps)) fail("INVALID_STEPS");
    for (const [name, step] of Object.entries(sample.steps)) {
      if (!STEP_NAMES.includes(name) || !object(step)
          || !["ok", "unavailable", "not_applicable"].includes(step.status)) fail("INVALID_STEP");
    }
  }
  // Summary is informational; recompute comparisons exclusively from raw samples.
  for (const row of report.summary) {
    if (!object(row) || !SCREENS.some((s) => s.id === row.screen)
        || !own(DEVICES, row.device)) fail("INVALID_SUMMARY");
  }
  return report;
}

export function validateEnvironment(env, report) {
  if (!object(env) || env.schema !== 1 || env.fixture_id !== report.fixture_id) {
    fail("INVALID_ENVIRONMENT_MANIFEST");
  }
  for (const key of ENV_KEYS) {
    const value = env[key];
    if (typeof value !== "string" || !(key === "fixture_digest" ? DIGEST : TOKEN).test(value)) {
      fail("MISSING_ENVIRONMENT_FIELD:" + key);
    }
  }
  return env;
}
function assertComparable(before, after, envBefore, envAfter) {
  validateReport(before);
  validateReport(after);
  validateEnvironment(envBefore, before);
  validateEnvironment(envAfter, after);
  for (const key of ["fixture_id", "browser_version", "node_version",
    "playwright_browser", "scope", "provenance", "repeats", "device"]) {
    if (before[key] !== after[key]) fail("INCOMPARABLE_REPORT:" + key);
  }
  for (const key of ENV_KEYS) {
    if (envBefore[key] !== envAfter[key]) fail("INCOMPARABLE_ENVIRONMENT:" + key);
  }
  if (before.checkout_sha.toLowerCase() === after.checkout_sha.toLowerCase()) {
    fail("IDENTICAL_CHECKOUT_SHA");
  }
}
function metric(before, after, beforeCount, afterCount, expectedCount) {
  const usable = beforeCount === expectedCount && afterCount === expectedCount
    && valid(before) && valid(after);
  if (!usable) return { status: "insufficient_data", before: null, after: null,
    delta: null, percent_change: null, before_samples: beforeCount, after_samples: afterCount };
  const delta = round(after - before);
  return { status: delta < 0 ? "improvement" : delta > 0 ? "regression" : "unchanged",
    before: round(before), after: round(after), delta,
    percent_change: before === 0 ? null : round((after - before) / before * 100),
    before_samples: beforeCount, after_samples: afterCount };
}
function getMetric(samples, field, from) {
  const numbers = samples.map((sample) => sample.status === "ok"
    ? from(sample)?.[field] : null).filter(valid);
  return { value: median(numbers), count: numbers.length };
}
function compareMeasure(bSamples, aSamples, field, from, repeats) {
  const b = getMetric(bSamples, field, from);
  const a = getMetric(aSamples, field, from);
  return metric(b.value, a.value, b.count, a.count, repeats);
}
function compareStep(bSamples, aSamples, name, repeats) {
  const b = bSamples.map((s) => s.steps?.[name]).filter(Boolean);
  const a = aSamples.map((s) => s.steps?.[name]).filter(Boolean);
  if (b.length === repeats && a.length === repeats
      && b.every((s) => s.status === "not_applicable")
      && a.every((s) => s.status === "not_applicable")) {
    return { status: "not_applicable", duration_ms: null, api_p95_ms: null };
  }
  const bOk = bSamples.filter((s) => s.status === "ok" && s.steps?.[name]?.status === "ok");
  const aOk = aSamples.filter((s) => s.status === "ok" && s.steps?.[name]?.status === "ok");
  const duration = compareMeasure(bOk, aOk, "duration_ms", (s) => s.steps[name], repeats);
  const apiP95 = compareMeasure(bOk, aOk, "api_p95_ms", (s) => s.steps[name], repeats);
  return { status: aggregate([duration.status, apiP95.status]),
    duration_ms: duration, api_p95_ms: apiP95 };
}
function aggregate(statuses) {
  if (statuses.includes("regression")) return "regression";
  if (statuses.includes("insufficient_data")) return "insufficient_data";
  if (statuses.includes("improvement")) return "improvement";
  return "unchanged";
}
export function analyzeReports(before, after, envBefore, envAfter) {
  assertComparable(before, after, envBefore, envAfter);
  const devices = before.device === "both" ? Object.keys(DEVICES) : [before.device];
  const rows = [];
  for (const screen of SCREENS) for (const device of devices) {
    const take = (report) => report.samples.filter((sample) =>
      sample.screen === screen.id && sample.device === device);
    const b = take(before), a = take(after);
    const metrics = Object.fromEntries(METRICS.map((field) =>
      [field, compareMeasure(b, a, field, (s) => s.navigation, before.repeats)]));
    const steps = {};
    for (const name of STEP_NAMES) {
      if (screen[name]) steps[name] = compareStep(b, a, name, before.repeats);
    }
    const statuses = Object.values(metrics).map((value) => value.status);
    for (const step of Object.values(steps)) {
      if (step.status !== "not_applicable") statuses.push(step.status);
    }
    rows.push({ screen: screen.id, device, status: aggregate(statuses),
      before_runs: b.length, after_runs: a.length, expected_runs: before.repeats,
      metrics, steps });
  }
  const counts = Object.fromEntries(["improvement", "regression", "unchanged", "insufficient_data"]
    .map((status) => [status, rows.filter((row) => row.status === status).length]));
  return { schema: 2, kind: "offline_admin_performance_comparison",
    provenance: "local_synthetic", comparable_metadata: true,
    before_sha: before.checkout_sha.toLowerCase(), after_sha: after.checkout_sha.toLowerCase(),
    fixture_id: before.fixture_id, fixture_digest: envBefore.fixture_digest.toLowerCase(),
    environment_id: envBefore.environment_id, browser_version: before.browser_version,
    node_version: before.node_version, repeats: before.repeats, device: before.device,
    threshold: "direction_only_not_statistical_significance",
    overall: aggregate(rows.map((row) => row.status)), counts, rows };
}
const fmt = (m, unit = "") => {
  if (!m || m.status === "insufficient_data") return "N/D";
  return String(m.before) + unit + " → " + String(m.after) + unit
    + " (" + (m.delta > 0 ? "+" : "") + m.delta + unit
    + (m.percent_change === null ? ", % N/D" : ", " + (m.percent_change > 0 ? "+" : "")
      + m.percent_change + "%") + ")";
};
export function renderMarkdown(result) {
  const lines = [
    "# ADMIN PERFORMANCE COMPARATOR V2 — local synthetic",
    "",
    "**Baseline:** " + result.before_sha + "  ",
    "**New version:** " + result.after_sha + "  ",
    "**Fixture:** " + result.fixture_id + " (" + result.fixture_digest + ")  ",
    "**Environment:** " + result.environment_id + "  ",
    "**Chromium:** " + result.browser_version + " · **Node:** " + result.node_version
      + " · **Repeats:** " + result.repeats + " · **Device selection:** " + result.device,
    "",
    "**Overall:** " + result.overall + " · improvement " + result.counts.improvement
      + " · regression " + result.counts.regression + " · unchanged " + result.counts.unchanged
      + " · insufficient " + result.counts.insufficient_data,
    "",
    "| Screen | Device | Verdict | Ready | API p95 | Requests | Transfer |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const row of result.rows) {
    lines.push("| " + row.screen + " | " + row.device + " | " + row.status
      + " | " + fmt(row.metrics.ready_ms, "ms") + " | " + fmt(row.metrics.api_p95_ms, "ms")
      + " | " + fmt(row.metrics.requests) + " | " + fmt(row.metrics.transfer_bytes, "B") + " |");
  }
  lines.push("", "## Interaction deltas", "",
    "| Screen | Device | Action | Verdict | Duration | API p95 |",
    "|---|---|---|---|---|---|");
  for (const row of result.rows) for (const [name, step] of Object.entries(row.steps)) {
    lines.push("| " + row.screen + " | " + row.device + " | " + name
      + " | " + step.status + " | " + fmt(step.duration_ms, "ms")
      + " | " + fmt(step.api_p95_ms, "ms") + " |");
  }
  lines.push("", "N/D = insufficient data, not zero. Negative delta means faster or smaller.",
    "Values are medians of per-run metrics; API p95 is a median of run-level p95 values, not a pooled p95.",
    "Direction-only verdicts are descriptive, **not statistical significance** or production acceptance.",
    "Matching manifests cannot independently prove identical hardware, fixture contents or cache state.",
    "No production data, authentication, RUM, D1 or external services were accessed.", "");
  return lines.join("\n");
}
export function parseArgs(argv) {
  const keys = new Map([["--before", "before"], ["--after", "after"],
    ["--before-env", "beforeEnv"], ["--after-env", "afterEnv"],
    ["--json", "json"], ["--markdown", "markdown"]]);
  if (argv.length !== keys.size * 2) fail("USAGE_REQUIRED_OPTIONS");
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = keys.get(argv[i]);
    if (!key || own(args, key) || !argv[i + 1]) fail("USAGE_INVALID_OPTION");
    args[key] = resolve(argv[i + 1]);
  }
  if (Object.keys(args).length !== keys.size || new Set(Object.values(args)).size !== keys.size
      || !args.json.endsWith(".json") || !args.markdown.endsWith(".md")) fail("USAGE_INVALID_PATHS");
  return args;
}
async function loadJson(path) {
  const info = await stat(path);
  if (!info.isFile() || info.size > MAX_REPORT_BYTES) fail("INVALID_INPUT_SIZE");
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch { fail("INVALID_INPUT_JSON"); }
}
export async function run(argv = process.argv.slice(2)) {
  const paths = parseArgs(argv);
  const [before, after, envBefore, envAfter] = await Promise.all([
    loadJson(paths.before), loadJson(paths.after), loadJson(paths.beforeEnv), loadJson(paths.afterEnv),
  ]);
  const result = analyzeReports(before, after, envBefore, envAfter);
  await Promise.all([mkdir(dirname(paths.json), { recursive: true }),
    mkdir(dirname(paths.markdown), { recursive: true })]);
  await writeFile(paths.json, JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
  await writeFile(paths.markdown, renderMarkdown(result), { mode: 0o600 });
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().then((result) => {
    console.log("Offline comparison: " + result.overall + ", " + result.rows.length + " screen/device rows.");
    if (result.overall === "regression") process.exitCode = 2;
    else if (result.overall === "insufficient_data") process.exitCode = 3;
  }).catch((error) => {
    // Never print user-controlled paths, payloads or parser exceptions.
    console.error(error instanceof BenchmarkError ? error.code : "OFFLINE_ANALYSIS_FAILED");
    process.exitCode = 1;
  });
}
