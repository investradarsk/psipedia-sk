import assert from "node:assert/strict";
import test from "node:test";
import { SCREENS, DEVICES, requireLocalOrigin, median, percentile,
  summarizeNetwork, summarizeSamples, compareReports } from "../scripts/admin-perf-core.mjs";

test("explicit loopback origin only; no public, private LAN, credentials or redirects", () => {
  assert.equal(requireLocalOrigin("http://127.0.0.1:5173"), "http://127.0.0.1:5173");
  assert.equal(requireLocalOrigin("http://localhost:5173/"), "http://localhost:5173");
  for (const url of ["https://psipedia.sk", "http://psipedia.sk:5173/",
    "https://localhost:5173/", "http://192.168.1.4:5173/", "http://127.0.0.1/",
    "http://user:password@localhost:5173/", "http://localhost:5173/admin",
    "http://localhost:5173/?token=a", "http://localhost:5173/#token"]) {
    assert.throws(() => requireLocalOrigin(url), url);
  }
});

test("representative admin screens remain uniquely labelled", () => {
  assert.equal(new Set(SCREENS.map((s) => s.id)).size, SCREENS.length);
  assert.ok(SCREENS.some((s) => s.id === "partners"));
  assert.ok(SCREENS.some((s) => s.id === "events"));
  assert.deepEqual(Object.keys(DEVICES), ["desktop", "mobile"]);
});

test("median/p95 and missing API response size are not fabricated", () => {
  assert.equal(median([9, 1, 5]), 5);
  assert.equal(percentile([20, 10, 50, 30], 0.95), 50);
  assert.equal(median([]), null);
  const measured = summarizeNetwork([
    { is_api: true, ms: 12, bytes: 100, status: 200 },
    { is_api: true, ms: 42, bytes: null, status: 503 },
    { is_api: false, ms: 6, bytes: 90, status: 200 },
  ]);
  assert.equal(measured.requests, 3);
  assert.equal(measured.api_requests, 2);
  assert.equal(measured.api_p95_ms, 42);
  assert.equal(measured.http_errors, 1);
  assert.equal(measured.api_transfer_bytes, null);
  assert.equal(measured.transfer_bytes, null);
  assert.equal(summarizeNetwork([], false).requests, null);
  assert.equal(summarizeNetwork([], false).api_requests, null);
});

test("offline fixture aggregation and before/after comparison", () => {
  function report(ready, step) {
    const samples = [1, 2, 3].map((repeat) => ({
      screen: "articles", device: "desktop", repeat, status: "ok",
      navigation: { ready_ms: ready + repeat, requests: 4, api_p95_ms: 30 },
      steps: { filter: { status: "ok", duration_ms: step, api_p95_ms: 12 } },
    }));
    return { schema: 1, provenance: "local_synthetic", summary: summarizeSamples(samples) };
  }
  const before = report(100, 50), after = report(80, 30);
  assert.equal(before.summary[0].metrics.ready_ms, 102);
  const change = compareReports(before, after)[0];
  assert.equal(change.delta_after_minus_before.ready_ms, -20);
  assert.equal(change.steps_delta_ms.filter, -20);
  assert.equal(change.delta_after_minus_before.transfer_bytes, null);
  assert.equal(change.comparable, true);
  const incompatible = report(90, 20);
  incompatible.summary[0].total_runs = 1;
  assert.equal(compareReports(before, incompatible)[0].comparable, false);
  assert.throws(() => compareReports(before, { schema: 1, provenance: "production", summary: [] }));
});

test("missing/unavailable interactions cannot be mistaken for fast success", () => {
  const rows = summarizeSamples([{ screen: "events", device: "mobile", status: "unavailable",
    steps: { editor: { status: "not_applicable", duration_ms: null } } }]);
  assert.equal(rows[0].status, "unavailable");
  assert.equal(rows[0].metrics.ready_ms, null);
  assert.equal(rows[0].steps.editor.median_ms, null);
  assert.equal(rows[0].steps.editor.status, "not_applicable");
});
