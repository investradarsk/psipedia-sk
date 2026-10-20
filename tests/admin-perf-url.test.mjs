import assert from "node:assert/strict";
import test from "node:test";
import { DEVICES, localBrowserContextOptions, navigateLocalAdmin, requireLocalOrigin,
  summarizeSamples } from "../scripts/admin-perf-core.mjs";
import { sample, timedStep } from "../scripts/admin-perf-run.mjs";
import { analyzeReports, validateReport } from "../scripts/admin-perf-analyze.mjs";

function fakeBrowser(options = {}) {
  const state = { contextOptions: null, goto: [], route: null, closed: false, url: "about:blank" };
  const page = {
    async addInitScript() {},
    async route(pattern, handler) { assert.equal(pattern, "**/*"); state.route = handler; },
    on() {},
    async goto(path, options) {
      state.goto.push({ path, options });
      if (options === undefined || options.waitUntil !== "domcontentloaded") {
        throw new Error("Navigation must wait for DOM content.");
      }
      if (typeof options.timeout !== "number") throw new Error("Navigation timeout missing.");
      if (optionsForCall.gotoError) throw optionsForCall.gotoError;
      state.url = optionsForCall.redirect ?? new URL(path, state.contextOptions.baseURL).href;
      return optionsForCall.status === null ? null : { status: () => optionsForCall.status ?? 200 };
    },
    url() { return state.url; },
    locator(selector) {
      assert.equal(selector, "main#obsah");
      return { async waitFor() { if (optionsForCall.selectorError) throw optionsForCall.selectorError; } };
    },
    async waitForLoadState(name) {
      assert.equal(name, "networkidle");
      if (optionsForCall.idleError) throw optionsForCall.idleError;
    },
    async evaluate() { return { dom_content_loaded_ms: 12, load_event_ms: 20 }; },
  };
  const optionsForCall = options;
  const browser = {
    async newContext(config) {
      state.contextOptions = config;
      return { async newPage() { return page; }, async close() { state.closed = true; } };
    },
  };
  return { browser, page, state };
}
const dashboard = { id: "dashboard", path: "/admin" };
const local = "http://127.0.0.1:5173";

test("context baseURL is precisely the prevalidated local origin", () => {
  assert.deepEqual(localBrowserContextOptions("http://localhost:5173/", "desktop"),
    { baseURL: "http://localhost:5173", viewport: DEVICES.desktop, serviceWorkers: "block" });
  assert.equal(localBrowserContextOptions(local, "mobile").baseURL, local);
  assert.equal(new URL("/admin/clanky", localBrowserContextOptions(local, "mobile").baseURL).href,
    local + "/admin/clanky");
  assert.equal(requireLocalOrigin(local), local);
});

test("context rejects external hosts, unsafe scheme and unqualified relative URLs", () => {
  for (const url of ["https://localhost:5173", "http://psipedia.sk:5173",
    "http://127.0.0.2:5173", "http://192.168.0.1:5173", "file:///admin",
    "javascript:alert(1)", "/admin", "../admin", "//localhost:5173/admin",
    "http://localhost:5173/admin", "http://localhost:5173?x=1"]) {
    assert.throws(() => localBrowserContextOptions(url, "desktop"), url);
  }
  assert.throws(() => localBrowserContextOptions(local, "tablet"), /Unknown benchmark device/);
});

test("real sample passes baseURL to Chromium and resolves relative /admin navigation", async () => {
  const { browser, state } = fakeBrowser();
  const result = await sample(browser, dashboard, "desktop", 1, local);
  assert.equal(state.contextOptions.baseURL, local);
  assert.deepEqual(state.contextOptions.viewport, DEVICES.desktop);
  assert.equal(state.contextOptions.serviceWorkers, "block");
  assert.deepEqual(state.goto.map((r) => r.path), ["/admin"]);
  assert.equal(state.url, local + "/admin");
  assert.equal(result.status, "ok");
  assert.equal(result.blocked_writes, 0);
  assert.equal(result.d1, null);
  assert.equal(state.closed, true);
});

test("sample refuses an invalid baseURL before any navigation", async () => {
  const { browser, state } = fakeBrowser();
  await assert.rejects(sample(browser, dashboard, "desktop", 1, "https://psipedia.sk"));
  assert.equal(state.contextOptions, null);
  assert.equal(state.goto.length, 0);
});

test("unexpected navigation exceptions abort instead of reporting unavailable", async () => {
  const { browser, state } = fakeBrowser({ gotoError: new Error("synthetic navigation failure") });
  await assert.rejects(sample(browser, dashboard, "desktop", 1, local), /synthetic navigation failure/);
  assert.equal(state.closed, true);
});

test("a redirect, bad HTTP response or missing admin main is a benchmark failure", async () => {
  for (const options of [{ status: 401 }, { status: 500 }, { status: null },
    { redirect: local + "/login" }, { redirect: "http://localhost:5173/admin" },
    { selectorError: new Error("admin main missing") }]) {
    const { browser, state } = fakeBrowser(options);
    await assert.rejects(sample(browser, dashboard, "desktop", 1, local));
    assert.equal(state.closed, true);
  }
});

test("only fixed relative admin paths may be navigated", async () => {
  const { page, state } = fakeBrowser();
  await assert.rejects(navigateLocalAdmin(page, "https://psipedia.sk/admin", local));
  await assert.rejects(navigateLocalAdmin(page, "/api/admin", local));
  await assert.rejects(navigateLocalAdmin(page, "//psipedia.sk/admin", local));
  assert.equal(state.goto.length, 0);
});

test("external requests and non-read methods remain blocked before network", async () => {
  const { browser, state } = fakeBrowser();
  await sample(browser, dashboard, "mobile", 1, local);
  const check = (url, method) => {
    const calls = [];
    state.route({ request: () => ({ url: () => url, method: () => method }),
      abort: () => { calls.push("abort"); }, continue: () => { calls.push("continue"); } });
    return calls;
  };
  assert.deepEqual(check(local + "/admin", "GET"), ["continue"]);
  assert.deepEqual(check(local + "/admin", "HEAD"), ["continue"]);
  assert.deepEqual(check("https://psipedia.sk/admin", "GET"), ["abort"]);
  assert.deepEqual(check("http://localhost:5173/admin", "GET"), ["abort"]);
  assert.deepEqual(check(local + "/api/admin", "POST"), ["abort"]);
  assert.deepEqual(check(local + "/admin", "DELETE"), ["abort"]);
});

test("explicitly inapplicable interaction stays distinct from unavailable", async () => {
  const { page } = fakeBrowser();
  const phases = {};
  const change = () => {};
  const missing = await timedStep(page, "pagination", async () => "not_applicable", phases, change);
  assert.equal(missing.status, "not_applicable");
  assert.equal(missing.duration_ms, null);
  const unavailable = await timedStep(page, "filter", async () => "unavailable", phases, change);
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.duration_ms, null);
});

test("network-idle timeout marks a step unavailable; other errors propagate", async () => {
  const timeout = Object.assign(new Error("timeout"), { name: "TimeoutError" });
  const fixture = fakeBrowser({ idleError: timeout });
  const step = await timedStep(fixture.page, "filter", async () => "ok", {}, () => {});
  assert.equal(step.status, "unavailable");
  assert.equal(step.duration_ms, null);
  const failing = fakeBrowser({ idleError: new Error("page crashed") });
  await assert.rejects(timedStep(failing.page, "filter", async () => "ok", {}, () => {}), /page crashed/);
});

test("interaction execution failures are never swallowed into unavailable", async () => {
  const { page } = fakeBrowser();
  await assert.rejects(timedStep(page, "editor", async () => { throw new Error("failed click"); },
    {}, () => {}), /failed click/);
  await assert.rejects(timedStep(page, "editor", async () => "success", {}, () => {}),
    /Unexpected interaction status/);
});

test("sample JSON structure is compatible with merged comparator #910", async () => {
  const { browser } = fakeBrowser();
  const observed = await sample(browser, dashboard, "desktop", 1, local);
  const old = { schema: 1, provenance: "local_synthetic", scope: "isolated_local_fixture_only",
    fixture_id: "offline-local-only", checkout_sha: "1".repeat(40), repeats: 1,
    device: "desktop", playwright_browser: "chromium", browser_version: "test-chromium",
    node_version: process.version, samples: [observed], summary: summarizeSamples([observed]) };
  assert.doesNotThrow(() => validateReport(old));
  const newer = { ...old, checkout_sha: "2".repeat(40) };
  const env = { schema: 1, fixture_id: "offline-local-only", fixture_digest: "a".repeat(64),
    environment_id: "unit-test", os: "linux", hardware_profile: "fixture",
    server_mode: "local", network_profile: "loopback", cache_profile: "fresh" };
  const compared = analyzeReports(old, newer, env, env);
  assert.equal(compared.schema, 2);
  assert.equal(compared.rows.length, 9);
  assert.equal(compared.rows[0].screen, "dashboard");
  assert.equal(compared.before_sha, old.checkout_sha);
  assert.equal(compared.after_sha, newer.checkout_sha);
  assert.equal(compared.overall, "insufficient_data");
});
