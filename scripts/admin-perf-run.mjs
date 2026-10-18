#!/usr/bin/env node
// Local-only, GET-only, read-only Chromium measurement; NOT a production browser test.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEVICES, SCREENS, requireLocalOrigin, safeNumber, summarizeNetwork, summarizeSamples } from "./admin-perf-core.mjs";

const EDITORS = {
  articles: /^\/admin\/clanky\/\d+$/,
  directory: /^\/admin\/adresar\/\d+$/,
  events: /^\/admin\/podujatia\/\d+$/,
  partners: /^\/admin\/partners\/accounts\/[a-zA-Z0-9_-]+$/,
};
function parseArgs(args) {
  const opts = { baseUrl: "", out: "reports/admin-perf/local-baseline.json", label: "baseline", repeats: 3, device: "both", fixtureId: "" };
  const keys = { "--base-url": "baseUrl", "--out": "out", "--label": "label", "--repeats": "repeats", "--device": "device", "--fixture-id": "fixtureId" };
  if (args.length % 2) throw new Error("Each option requires a value.");
  for (let i = 0; i < args.length; i += 2) {
    if (!keys[args[i]]) throw new Error("Unknown option.");
    opts[keys[args[i]]] = args[i + 1];
  }
  opts.baseUrl = requireLocalOrigin(opts.baseUrl);
  opts.repeats = Number(opts.repeats);
  if (!Number.isInteger(opts.repeats) || opts.repeats < 1 || opts.repeats > 10) throw new Error("1..10 repeats only.");
  if (!["both", "desktop", "mobile"].includes(opts.device)) throw new Error("Invalid device.");
  if (!/^[a-z0-9_-]{1,32}$/i.test(opts.label)) throw new Error("Invalid label.");
  if (!/^[a-z0-9_-]{1,48}$/i.test(opts.fixtureId)) throw new Error("Explicit non-secret --fixture-id required.");
  if (!opts.out.endsWith(".json")) throw new Error("JSON output only.");
  return opts;
}
async function networkIdle(page) {
  try { await page.waitForLoadState("networkidle", { timeout: 5000 }); return true; }
  catch { return false; }
}
async function timedStep(page, name, fn, phases, changePhase) {
  const records = [];
  phases[name] = records;
  changePhase(name);
  const start = performance.now();
  let status = "ok";
  try { status = await fn() ?? "ok"; }
  catch { status = "unavailable"; }
  const settled = await networkIdle(page);
  await Promise.allSettled(records.map((r) => r.pending));
  const stats = summarizeNetwork(records.map((r) => r.info).filter(Boolean), settled);
  return { status: settled && status === "ok" ? "ok" : status === "not_applicable" ? status : "unavailable",
    duration_ms: status === "ok" && settled ? safeNumber(performance.now() - start) : null,
    api_p95_ms: stats.api_p95_ms, api_requests: stats.api_requests };
}
async function performStep(page, screen, name) {
  if (name === "pagination") {
    const target = screen.id === "events"
      ? page.getByRole("button", { name: "Nasledujúca", exact: true })
      : page.getByRole("link", { name: "Ďalšia →", exact: true });
    if (!(await target.count()) || !(await target.first().isEnabled())) return "not_applicable";
    await target.first().click();
    if (screen.id === "directory") {
      await page.waitForURL((url) => url.searchParams.get("page") === "2", { timeout: 10000 });
    } else if (screen.id === "events") {
      await page.getByText(/^Strana 2 z [0-9]+$/).waitFor({ state: "visible", timeout: 10000 });
    }
    return "ok";
  }
  if (name === "filter") {
    if (screen.id === "events") {
      const input = page.getByLabel("Hľadať podujatie", { exact: true });
      if (!(await input.count())) return "not_applicable";
      await input.fill("e2e");
      await page.waitForTimeout(300); // debounce floor is included in the interaction metric
      return "ok";
    }
    if (screen.id === "articles") {
      const form = page.locator('form[role="search"][action="/admin/clanky"]');
      if (!(await form.count())) return "not_applicable";
      await form.getByPlaceholder("Názov, slug, perex alebo téma").fill("e2e");
      await form.getByRole("button", { name: "Filtrovať" }).click();
      await page.waitForURL((url) => url.searchParams.get("query") === "e2e", { timeout: 10000 });
      return "ok";
    }
    if (screen.id === "directory") {
      const input = page.getByLabel("Hľadať", { exact: true });
      const button = page.getByRole("button", { name: "Použiť filtre" });
      if (!(await input.count()) || !(await button.count())) return "not_applicable";
      await input.fill("e2e");
      await button.click();
      await page.waitForURL((url) => url.searchParams.get("q") === "e2e", { timeout: 10000 });
      return "ok";
    }
    if (screen.id === "partners") {
      const input = page.locator('form.admin-partner-search input[name="q"]');
      const button = page.locator("form.admin-partner-search button");
      if (!(await input.count()) || !(await button.count())) return "not_applicable";
      await input.fill("e2e");
      await button.click();
      return "ok";
    }
    return "not_applicable";
  }
  if (name === "editor") {
    const prefix = EDITORS[screen.id];
    if (!prefix) return "not_applicable";
    const links = page.locator("main#obsah a[href]");
    const hrefs = await links.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href")).filter(Boolean));
    const href = hrefs.find((h) => prefix.test(h));
    if (!href) return "not_applicable";
    const matching = links;
    const count = await matching.count();
    for (let i = 0; i < count; i++) {
      if (await matching.nth(i).getAttribute("href") === href) {
        await matching.nth(i).click();
        await page.locator("main#obsah").waitFor({ state: "visible", timeout: 10000 });
        if (new URL(page.url()).pathname !== href) throw new Error("Editor navigation failed.");
        return "ok";
      }
    }
    return "not_applicable";
  }
  return "not_applicable";
}
async function sample(browser, screen, device, index, origin) {
  const context = await browser.newContext({ viewport: DEVICES[device], serviceWorkers: "block" });
  const page = await context.newPage();
  const phases = { navigation: [] };
  let phase = "navigation", blockedWrites = 0, blockedExternal = 0;
  const originUrl = new URL(origin);
  try {
    await page.addInitScript(() => { localStorage.setItem("psipedia-cookie-consent", "necessary"); });
    await page.route("**/*", (route) => {
      const request = route.request();
      let target;
      try { target = new URL(request.url()); } catch { return route.abort(); }
      if (target.origin !== originUrl.origin || !["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) blockedWrites++;
        if (target.origin !== originUrl.origin) blockedExternal++;
        return route.abort();
      }
      return route.continue();
    });
    page.on("response", (response) => {
      const records = phases[phase] ?? (phases[phase] = []);
      const entry = { info: null, pending: null };
      records.push(entry);
      entry.pending = (async () => {
        let bytes = null, ms = null;
        try {
          const sizes = await response.sizes();
          bytes = sizes.responseBodySize + sizes.responseHeadersSize;
        } catch { /* unavailable, not zero */ }
        try {
          const timing = response.request().timing();
          ms = timing.responseEnd >= 0 ? safeNumber(timing.responseEnd) : null;
        } catch { /* unavailable */ }
        entry.info = { is_api: new URL(response.url()).pathname.startsWith("/api/"),
          bytes: safeNumber(bytes), ms, status: response.status() };
      })();
    });
    const start = performance.now();
    const response = await page.goto(screen.path, { waitUntil: "domcontentloaded", timeout: 30000 });
    if (!response || response.status() !== 200 || new URL(page.url()).pathname !== screen.path) {
      throw new Error("Not authenticated local admin, redirect, or HTTP error.");
    }
    await page.locator("main#obsah").waitFor({ state: "visible", timeout: 12000 });
    const ready = performance.now() - start;
    const settled = await networkIdle(page);
    await Promise.allSettled(phases.navigation.map((r) => r.pending));
    if (blockedWrites) throw new Error("Browser attempted a non-read HTTP method.");
    const timings = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0];
      return { dom_content_loaded_ms: n?.domContentLoadedEventEnd ?? null,
        load_event_ms: n?.loadEventEnd > 0 ? n.loadEventEnd : null };
    });
    const navigation = { blocked_external_requests: blockedExternal, ready_ms: safeNumber(ready),
      dom_content_loaded_ms: safeNumber(timings.dom_content_loaded_ms),
      load_event_ms: safeNumber(timings.load_event_ms),
      ...summarizeNetwork(phases.navigation.map((r) => r.info).filter(Boolean), settled) };
    const steps = {};
    // Each step starts from a fresh local route; setup navigations are excluded from step timings.
    for (const name of ["pagination", "filter", "editor"]) {
      if (!screen[name]) continue;
      if (name !== "pagination") {
        phase = "setup";
        await page.goto(screen.path, { waitUntil: "domcontentloaded" });
        await page.locator("main#obsah").waitFor({ state: "visible" });
        await networkIdle(page);
      }
      steps[name] = await timedStep(page, name,
        () => performStep(page, screen, name), phases, (value) => { phase = value; });
      if (blockedWrites) throw new Error("Browser attempted a non-read HTTP method.");
    }
    return { screen: screen.id, device, repeat: index, status: settled ? "ok" : "unavailable",
      navigation, steps, blocked_writes: blockedWrites, d1: null };
  } catch {
    return { screen: screen.id, device, repeat: index, status: "unavailable",
      navigation: null, steps: {}, blocked_writes: blockedWrites, d1: null };
  } finally { await context.close(); }
}
export async function run(argv = process.argv.slice(2)) {
  if (process.env.PSIPEDIA_ADMIN_PERF_LOCAL !== "1" || process.env.NODE_ENV === "production") {
    throw new Error("Explicit PSIPEDIA_ADMIN_PERF_LOCAL=1 required; production runs forbidden.");
  }
  const opts = parseArgs(argv);
  const browser = await chromium.launch({ headless: true });
  const samples = [];
  try {
    for (const device of opts.device === "both" ? Object.keys(DEVICES) : [opts.device]) {
      for (const screen of SCREENS) {
        for (let run = 1; run <= opts.repeats; run++) {
          const measured = await sample(browser, screen, device, run, opts.baseUrl);
          samples.push(measured);
          console.log(screen.id + " " + device + " run " + run + ": " + measured.status);
        }
      }
    }
  } finally { await browser.close(); }
  const report = { schema: 1, provenance: "local_synthetic", scope: "isolated_local_fixture_only",
    label: opts.label, measured_at: new Date().toISOString(),
    checkout_sha: /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? "") ? process.env.GITHUB_SHA : null,
    node_version: process.version, playwright_browser: "chromium", browser_version: browser.version(),
    fixture_id: opts.fixtureId,
    d1_attribution: "unavailable_without_server_instrumentation",
    repeats: opts.repeats, device: opts.device,
    samples, summary: summarizeSamples(samples) };
  const output = resolve(opts.out);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  console.log("Local synthetic report: " + output);
  if (samples.some((s) => s.status !== "ok" || s.blocked_writes)) process.exitCode = 1;
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch(() => { console.error("Admin benchmark failed: check local origin, fixtures and Playwright browser."); process.exitCode = 1; });
}
