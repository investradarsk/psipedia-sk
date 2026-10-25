import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const VIEWPORTS = Object.freeze([
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-320", width: 320, height: 720 },
]);

/** Paths, never external URLs. The PR description names exactly the pages the author changed. */
export function parseVisualReviewRoutes(prBody) {
  const matched = String(prBody ?? "").match(/^VISUAL_REVIEW_ROUTES:[ \t]*([^\r\n]*)/m);
  if (!matched) throw new Error("PR body is missing VISUAL_REVIEW_ROUTES: /path");
  const routes = matched[1].split(",").map((item) => item.trim());
  if (routes.length < 1 || routes.length > 4) throw new Error("Select 1–4 changed routes.");
  const unique = [...new Set(routes)];
  if (unique.length !== routes.length) throw new Error("Routes must not be duplicated.");
  for (const route of routes) {
    if (!/^\/[A-Za-z0-9/_-]*$/.test(route) || route.includes("//") || route.includes("..") || route.length > 160) {
      throw new Error("Unsafe or unsupported preview route: " + route);
    }
  }
  return routes;
}

/** Optional extra routes use exactly the same guarded URL/path contract. */
export function parseVisualAcceptanceRoutes(prBody) {
  const matched = String(prBody ?? "").match(/^VISUAL_ACCEPTANCE_ROUTES:[ \t]*([^\r\n]*)/m);
  if (!matched) return [];
  return parseVisualReviewRoutes("VISUAL_REVIEW_ROUTES: " + matched[1]);
}

export function validatePreviewBase(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname) || url.username || url.password || url.search || url.hash) {
    throw new Error("PR visual evidence must run against a local HTTP server.");
  }
  return url.origin;
}

export function screenshotFolder(route) {
  return route === "/" ? "homepage" : route.slice(1).replace(/\//g, "__");
}

function markdownSummary(manifest) {
  const rows = [
    "# PR Visual Evidence — local build, not production",
    "",
    "PR: " + manifest.pr + " · Commit: \`" + manifest.commit + "\`",
    "Source: " + manifest.baseUrl + " · isolated local D1/R2, no production credentials.",
    "Images and content backed by production-only data may be missing; inspect the screenshot before merging.",
    "",
    "| Route | Viewport | HTTP | PNG | Full page | Horizontal overflow | Result |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const item of manifest.captures) {
    rows.push("| " + [item.route, item.viewport, item.httpStatus ?? "—",
      item.viewportFile ?? "—", item.fullFile ?? "—",
      item.horizontalOverflow === null ? "—" : item.horizontalOverflow + "px",
      item.error ? "FAIL: " + item.error.replace(/[|\r\n]/g, " ").slice(0, 180) : "OK"
    ].join(" | ") + " |");
  }
  rows.push("", "Screenshots show the unmerged PR revision. They do not authorize production merge.", "");
  return rows.join("\n");
}

async function run() {
  const body = process.env.PR_BODY ?? "";
  const routes = [...parseVisualReviewRoutes(body), ...parseVisualAcceptanceRoutes(body)];
  if (new Set(routes).size !== routes.length) throw new Error("A route cannot be captured twice across review and acceptance groups.");
  const baseUrl = validatePreviewBase(process.env.VISUAL_BASE_URL ?? "http://localhost:5173");
  const output = resolve(process.env.VISUAL_OUTPUT_DIR ?? ".e2e-artifacts/pr-visual");
  const manifest = {
    pr: process.env.PR_NUMBER ?? "local",
    commit: process.env.PR_HEAD_SHA ?? "local",
    baseUrl,
    routes,
    viewports: VIEWPORTS,
    captures: [],
  };
  await mkdir(output, { recursive: true });
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const route of routes) {
      for (const viewport of VIEWPORTS) {
        const item = { route, viewport: viewport.name, httpStatus: null, viewportFile: null, fullFile: null, horizontalOverflow: null, error: null };
        manifest.captures.push(item);
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 1,
          serviceWorkers: "block",
          acceptDownloads: false,
        });
        try {
          // Allow only read requests to the disposable local app. Do not fetch remote
          // production assets from the browser or submit writes during screenshots.
          await context.route("**/*", async (routed) => {
            const request = routed.request();
            if (!["GET", "HEAD"].includes(request.method()) ||
                new URL(request.url()).origin !== baseUrl) {
              await routed.abort("blockedbyclient");
            } else {
              await routed.continue();
            }
          });
          const page = await context.newPage();
          const response = await page.goto(baseUrl + route, { waitUntil: "domcontentloaded", timeout: 45_000 });
          item.httpStatus = response?.status() ?? null;
          if (item.httpStatus === null || item.httpStatus >= 400) throw new Error("HTTP " + item.httpStatus);
          await page.locator("body").waitFor({ state: "visible", timeout: 15_000 });
          await page.evaluate(() => document.fonts?.ready);
          await page.waitForTimeout(600);
          // Refuse optional analytics so a sticky cookie consent dialog does not obscure
          // the page being accepted. Nothing is persisted outside this local browser context.
          const rejectAnalytics = page.getByRole("button", { name: "Odmietnuť analytiku" });
          if (await rejectAnalytics.count()) {
            await rejectAnalytics.click({ timeout: 5_000 });
          }
          const folder = join(output, screenshotFolder(route));
          await mkdir(folder, { recursive: true });
          item.viewportFile = screenshotFolder(route) + "/" + viewport.name + "-viewport.png";
          item.fullFile = screenshotFolder(route) + "/" + viewport.name + "-full.png";
          // Paths in manifest are relative to artifact output.
          await page.screenshot({
            path: join(folder, viewport.name + "-viewport.png"), fullPage: false,
            animations: "disabled", timeout: 45_000,
          });
          await page.screenshot({
            path: join(folder, viewport.name + "-full.png"), fullPage: true,
            animations: "disabled", timeout: 60_000,
          });
          // A page wider than the device causes invisible controls on 320/390px.
          // Compare document width rather than scrollable inner carousels or map canvases.
          const width = await page.evaluate(() => document.documentElement.scrollWidth);
          item.horizontalOverflow = Math.max(0, width - viewport.width);
          if (item.horizontalOverflow > 1) {
            throw new Error("Horizontal document overflow: " + item.horizontalOverflow + "px");
          }
        } catch (error) {
          item.error = error instanceof Error ? error.message : String(error);
          console.error(route + " " + viewport.name + ": " + item.error);
          process.exitCode = 1;
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    if (browser) await browser.close();
    await writeFile(join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    await writeFile(join(output, "summary.md"), markdownSummary(manifest) + "\n");
    console.log(markdownSummary(manifest));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await run();
}
