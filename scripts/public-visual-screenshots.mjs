import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PRODUCTION_ORIGIN = "https://psipedia.sk";
export const PUBLIC_PAGES = Object.freeze({
  homepage: "/",
  adresar: "/adresar",
  plemena: "/plemena",
  podujatia: "/podujatia",
  "pomoc-psom": "/pomoc-psom",
  clanky: "/clanky",
  steniatka: "/steniatka",
  starostlivost: "/starostlivost",
  aktivity: "/aktivity",
  recenzie: "/recenzie",
  mapa: "/mapa",
});

export const VIEWPORTS = Object.freeze([
  { name: "mobile-320", width: 320, height: 720 },
  { name: "mobile-375", width: 375, height: 812 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-430", width: 430, height: 932 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1440", width: 1440, height: 900 },
]);

const GROUPS = Object.freeze({
  core: ["homepage", "adresar", "plemena", "podujatia", "pomoc-psom"],
  content: ["clanky", "steniatka", "starostlivost", "aktivity", "recenzie"],
  all: Object.keys(PUBLIC_PAGES),
});

export function resolveSelection(input) {
  if (Object.hasOwn(PUBLIC_PAGES, input)) return [input];
  if (Object.hasOwn(GROUPS, input)) return [...GROUPS[input]];
  throw new Error("Unsupported page/group: " + String(input) + ". Only the fixed public Psipedia allowlist is permitted.");
}

export function isProductionUrl(input) {
  try {
    const url = new URL(input);
    return url.origin === PRODUCTION_ORIGIN && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

export function isSuccessfulHttpStatus(status) {
  return Number.isInteger(status) && status >= 200 && status < 300;
}

export function classifyImages(images) {
  return {
    total: images.length,
    unloaded: images.filter((image) => !image.complete).length,
    broken: images.filter((image) => image.complete && !image.naturalWidth).length,
    notRendered: images.filter((image) => !image.rendered).length,
  };
}

export async function readPngDimensions(path) {
  const png = await readFile(path);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (png.length < 24 || !png.subarray(0, 8).equals(signature)) {
    throw new Error("Not a valid PNG: " + path);
  }
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20), bytes: png.length };
}

const errorText = (error) => error instanceof Error ? error.message : String(error);
const cleanCell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/[\r\n]/g, " ").slice(0, 240);

function summarize(manifest) {
  const rows = [
    "# PSIPEDIA — Public Visual Screenshots",
    "",
    "Source: " + PRODUCTION_ORIGIN + " (fresh, unauthenticated browser; cookie consent untouched).",
    "Selection: " + manifest.selection + ". Run: " + (manifest.runId || "local") + ".",
    "These screenshots are technical evidence, **not visual design approval**.",
    "",
    "| Page | Viewport | HTTP | Overflow | Image issues (unloaded/broken) | Viewport PNG | Full-page PNG | Result |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const item of manifest.results) {
    rows.push("| " + [
      item.page,
      item.viewport.width + "×" + item.viewport.height,
      item.httpStatus ?? "—",
      item.geometry ? item.geometry.overflowPx + "px" : "—",
      item.images ? item.images.unloaded + "/" + item.images.broken : "—",
      item.screenshots.viewport?.ok ? "OK" : "FAIL",
      item.screenshots.full?.ok ? "OK" : "FAIL",
      item.status,
    ].map(cleanCell).join(" | ") + " |");
    if (item.errors.length) rows.push("  - " + cleanCell(item.page + " " + item.viewport.name + ": " + item.errors.join("; ")));
  }
  rows.push("", "Successful: " + manifest.results.filter((r) => r.status !== "failed").length +
    "; failed: " + manifest.results.filter((r) => r.status === "failed").length + ".", "");
  if (manifest.fatalError) rows.push("Fatal error: " + cleanCell(manifest.fatalError), "");
  rows.push("PNG pixel dimensions are checked after capture. Full-page coverage is checked against the measured footer position when available.", "");
  return rows.join("\n");
}

async function persist(manifest, output) {
  await mkdir(join(output, "reports"), { recursive: true });
  await writeFile(join(output, "reports", "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(join(output, "reports", "summary.md"), summarize(manifest) + "\n");
}

async function waitForFonts(page) {
  return page.evaluate(async () => {
    if (!document.fonts) return "unsupported";
    return Promise.race([
      document.fonts.ready.then(() => "ready", () => "failed"),
      new Promise((done) => setTimeout(() => done("timeout"), 10000)),
    ]);
  });
}

async function scrollForLazyImages(page, viewportHeight) {
  const stride = Math.max(180, Math.floor(viewportHeight * 0.75));
  for (let step = 0; step < 180; step++) {
    const current = await page.evaluate((amount) => {
      const maximum = Math.max(0, Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - innerHeight);
      window.scrollTo(0, Math.min(maximum, window.scrollY + amount));
      return { y: window.scrollY, maximum };
    }, stride);
    await page.waitForTimeout(125);
    const final = await page.evaluate(() => Math.max(0, Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - innerHeight));
    if (current.y >= final - 2) return { reachedBottom: true, steps: step + 1 };
  }
  return { reachedBottom: false, steps: 180 };
}

async function inspectPage(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const footer = document.querySelector("footer");
    const footerRect = footer?.getBoundingClientRect();
    const images = Array.from(document.images).map((img) => ({
      src: (img.currentSrc || img.src || "").slice(0, 400),
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      rendered: img.getClientRects().length > 0,
    }));
    return {
      geometry: {
        viewportWidth: innerWidth,
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        overflowPx: Math.max(0, root.scrollWidth - root.clientWidth),
        documentHeight: Math.max(root.scrollHeight, document.body.scrollHeight),
        footerBottom: footerRect ? Math.round(footerRect.bottom + scrollY) : null,
      },
      images,
    };
  });
}

async function captureViewport(browser, pageName, viewport, output) {
  const item = {
    page: pageName,
    requestedUrl: PRODUCTION_ORIGIN + PUBLIC_PAGES[pageName],
    finalUrl: null,
    viewport,
    httpStatus: null,
    fonts: null,
    lazyScroll: null,
    geometry: null,
    images: null,
    failedImageRequests: [],
    blockedWriteRequests: 0,
    screenshots: { viewport: null, full: null },
    errors: [],
    status: "failed",
  };
  const folder = join(output, "screenshots", pageName);
  await mkdir(folder, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    serviceWorkers: "block",
    acceptDownloads: false,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.setDefaultNavigationTimeout(25000);
  context.on("requestfailed", (request) => {
    if (request.resourceType() === "image" && item.failedImageRequests.length < 20) {
      item.failedImageRequests.push(request.url().slice(0, 400) + " — " + (request.failure()?.errorText ?? "failed"));
    }
  });
  page.on("response", (response) => {
    if (response.request().resourceType() === "image" && response.status() >= 400 && item.failedImageRequests.length < 20) {
      item.failedImageRequests.push(response.url().slice(0, 400) + " — HTTP " + response.status());
    }
  });
  try {
    // A browser must never submit data to production. Service workers are disabled
    // so they cannot bypass this request guard. No cookies or consent state are set.
    await context.route("**/*", async (route) => {
      const request = route.request();
      if (request.method() !== "GET" && request.method() !== "HEAD") {
        item.blockedWriteRequests++;
        await route.abort("blockedbyclient");
        return;
      }
      if (request.isNavigationRequest() && request.frame() === page.mainFrame() && !isProductionUrl(request.url())) {
        await route.abort("blockedbyclient");
        return;
      }
      await route.continue();
    });

    const response = await page.goto(item.requestedUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
    item.httpStatus = response?.status() ?? null;
    item.finalUrl = page.url();
    if (!isProductionUrl(item.finalUrl)) throw new Error("Redirect outside psipedia.sk blocked: " + item.finalUrl);
    if (!isSuccessfulHttpStatus(item.httpStatus)) throw new Error("Main document HTTP " + String(item.httpStatus));
    await page.locator("body").waitFor({ state: "visible", timeout: 12000 });
    item.fonts = await waitForFonts(page);
    if (item.fonts !== "ready" && item.fonts !== "unsupported") item.errors.push("Fonts: " + item.fonts);

    // Capture the genuine initial viewport before scrolling or changing page state.
    await page.waitForFunction(() => Array.from(document.images)
      .filter((img) => img.getBoundingClientRect().top < innerHeight && img.getBoundingClientRect().bottom > 0)
      .every((img) => img.complete), null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(250);
    const viewportPath = join(folder, viewport.name + "-viewport.png");
    try {
      await page.screenshot({ path: viewportPath, fullPage: false, timeout: 30000 });
      const png = await readPngDimensions(viewportPath);
      if (png.width !== viewport.width || png.height !== viewport.height) throw new Error("Viewport PNG size mismatch");
      item.screenshots.viewport = { ok: true, path: relative(output, viewportPath), ...png };
    } catch (error) {
      item.screenshots.viewport = { ok: false };
      item.errors.push("Viewport PNG: " + errorText(error));
    }

    item.lazyScroll = await scrollForLazyImages(page, viewport.height);
    if (!item.lazyScroll.reachedBottom) item.errors.push("Lazy loading scan reached its 180-step limit");
    await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete), null, { timeout: 8000 }).catch(() => {});
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    await page.waitForTimeout(400);

    const inspection = await inspectPage(page);
    item.geometry = inspection.geometry;
    item.images = {
      ...classifyImages(inspection.images),
      issues: inspection.images.filter((image) => !image.complete || (image.complete && !image.naturalWidth)).slice(0, 20).map((image) => image.src),
    };
    const fullPath = join(folder, viewport.name + "-full.png");
    try {
      await page.screenshot({ path: fullPath, fullPage: true, timeout: 45000 });
      const png = await readPngDimensions(fullPath);
      if (png.width !== viewport.width || png.height < viewport.height) throw new Error("Full-page PNG pixel dimensions invalid");
      if (item.geometry.footerBottom === null) throw new Error("Footer not found: cannot verify full-page coverage");
      if (item.geometry.footerBottom !== null && png.height < item.geometry.footerBottom - 2) {
        throw new Error("Full-page PNG does not include measured footer");
      }
      item.screenshots.full = { ok: true, path: relative(output, fullPath), ...png };
    } catch (error) {
      item.screenshots.full = { ok: false };
      item.errors.push("Full-page PNG: " + errorText(error));
    }
    item.finalUrl = page.url();
    const bothCaptured = item.screenshots.viewport?.ok && item.screenshots.full?.ok;
    item.status = bothCaptured
      ? (item.errors.length || item.geometry.overflowPx > 1 || item.images.unloaded || item.images.broken || item.failedImageRequests.length ? "warning" : "success")
      : "failed";
  } catch (error) {
    item.errors.push(errorText(error));
    item.finalUrl = page.url();
    item.status = "failed";
  } finally {
    await context.close();
  }
  return item;
}

export async function main() {
  const selection = process.env.VISUAL_PAGE || "homepage";
  const pageNames = resolveSelection(selection);
  const output = resolve(process.env.VISUAL_OUTPUT_DIR || ".e2e-artifacts/public-visual-screenshots");
  const manifest = {
    schemaVersion: 1,
    source: PRODUCTION_ORIGIN,
    consentState: "fresh-browser-no-consent-mutation",
    writePolicy: "block-all-non-GET-or-HEAD",
    selection,
    runId: process.env.GITHUB_RUN_ID || null,
    createdAt: new Date().toISOString(),
    viewports: VIEWPORTS,
    results: [],
    fatalError: null,
  };
  await persist(manifest, output);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const pageName of pageNames) {
      for (const viewport of VIEWPORTS) {
        console.log("Capturing " + pageName + " " + viewport.name);
        const item = await captureViewport(browser, pageName, viewport, output);
        manifest.results.push(item);
        await persist(manifest, output);
        console.log(item.status + ": " + item.page + " " + item.viewport.name);
      }
    }
  } catch (error) {
    manifest.fatalError = errorText(error);
    console.error(manifest.fatalError);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    await persist(manifest, output);
  }
  if (manifest.results.length !== pageNames.length * VIEWPORTS.length ||
      manifest.results.some((item) => item.status === "failed")) process.exitCode = 1;
  console.log(summarize(manifest));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
