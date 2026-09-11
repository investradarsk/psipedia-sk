#!/usr/bin/env node

import { chromium } from "@playwright/test";

const DEFAULT_BASE_URL = "http://localhost:5173";
const DEFAULT_CANONICAL_ORIGIN = "https://psipedia.sk";
const MIN_EXPECTED_BREEDS = 300;

function parseArguments(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    canonicalOrigin: DEFAULT_CANONICAL_ORIGIN,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === "--base" && value) {
      options.baseUrl = value.replace(/\/$/, "");
      index += 1;
    } else if (argument === "--canonical-origin" && value) {
      options.canonicalOrigin = value.replace(/\/$/, "");
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }
  return options;
}

function decodeXml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function sitemapBreedPaths(xml) {
  const paths = [...xml.matchAll(/<loc(?:\s[^>]*)?>([\s\S]*?)<\/loc>/gi)]
    .map((match) => {
      try {
        return new URL(decodeXml(match[1].trim())).pathname;
      } catch {
        return "";
      }
    })
    .filter((path) => /^\/plemena\/[^/]+$/.test(path) && path !== "/plemena/vyber-plemena");
  return [...new Set(paths)].sort();
}

function obviousRuntimeFailure(text) {
  return /Internal Server Error|Application error|This page could not be found|Unhandled Runtime Error|Minified React error/i.test(text);
}

const { baseUrl, canonicalOrigin } = parseArguments(process.argv.slice(2));
const sitemapResponse = await fetch(`${baseUrl}/sitemap.xml`, {
  headers: { accept: "application/xml,text/xml;q=0.9,*/*;q=0.8" },
});
if (!sitemapResponse.ok) {
  throw new Error(`[breed-profile-audit] sitemap returned HTTP ${sitemapResponse.status}`);
}
const breedPaths = sitemapBreedPaths(await sitemapResponse.text());
if (breedPaths.length < MIN_EXPECTED_BREEDS) {
  throw new Error(`[breed-profile-audit] only ${breedPaths.length} canonical breed URLs found; expected at least ${MIN_EXPECTED_BREEDS}`);
}

console.log(`[breed-profile-audit] Loaded ${breedPaths.length} published canonical breed URLs from sitemap.`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
const page = await context.newPage();
page.setDefaultNavigationTimeout(10_000);
page.setDefaultTimeout(5_000);

const failures = [];

for (let index = 0; index < breedPaths.length; index += 1) {
  const path = breedPaths[index];
  const pageErrors = [];
  const consoleErrors = [];

  const onPageError = (error) => pageErrors.push(error.message);
  const onConsole = (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/Failed to load resource|googletagmanager|Google Analytics/i.test(text)) return;
    consoleErrors.push(text);
  };
  page.on("pageerror", onPageError);
  page.on("console", onConsole);

  try {
    const response = await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
    if (!response || response.status() !== 200) {
      failures.push(`${path}: HTTP ${response?.status() ?? "no response"}`);
      continue;
    }

    await page.waitForTimeout(100);

    const bodyText = (await page.locator("body").innerText()).trim();
    if (!bodyText || obviousRuntimeFailure(bodyText)) {
      failures.push(`${path}: runtime/error document detected`);
    }

    const h1 = page.locator("h1").first();
    if (await h1.count() === 0 || !(await h1.textContent())?.trim()) {
      failures.push(`${path}: empty or missing H1`);
    }

    const canonical = await page.locator('link[rel="canonical"]').first().getAttribute("href").catch(() => null);
    const expectedCanonical = `${canonicalOrigin}${path}`;
    if (canonical !== expectedCanonical) {
      failures.push(`${path}: canonical ${JSON.stringify(canonical)} != ${expectedCanonical}`);
    }

    const ids = await page.locator("[id]").evaluateAll((elements) =>
      elements.map((element) => element.id).filter(Boolean),
    );
    const duplicateIds = [...new Set(ids.filter((id, idIndex) => ids.indexOf(id) !== idIndex))];
    if (duplicateIds.length) {
      failures.push(`${path}: duplicate IDs ${duplicateIds.slice(0, 8).join(", ")}`);
    }

    const invalidAnchors = await page.locator('a[href*="#"]').evaluateAll((anchors) => {
      const current = new URL(location.href);
      return anchors.flatMap((anchor) => {
        const href = anchor.getAttribute("href");
        if (!href) return [];
        let target;
        try {
          target = new URL(href, location.href);
        } catch {
          return [];
        }
        if (target.origin !== current.origin || target.pathname !== current.pathname || !target.hash) return [];
        const id = decodeURIComponent(target.hash.slice(1));
        return id && !document.getElementById(id) ? [href] : [];
      });
    });
    if (invalidAnchors.length) {
      failures.push(`${path}: invalid same-page anchors ${invalidAnchors.slice(0, 8).join(", ")}`);
    }

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    if (dimensions.scrollWidth > dimensions.clientWidth + 1) {
      failures.push(`${path}: horizontal overflow ${dimensions.scrollWidth}px > ${dimensions.clientWidth}px`);
    }

    const imageFrame = page.locator('[data-testid="breed-hero-photo"]');
    if (await imageFrame.count() !== 1) {
      failures.push(`${path}: breed hero image/fallback frame missing`);
    } else {
      const hasFallbackContract = await imageFrame.getAttribute("data-image-fallback");
      if (hasFallbackContract !== "breed-photo") {
        failures.push(`${path}: image fallback contract missing`);
      }
      const images = imageFrame.locator("img");
      if (await images.count()) {
        const brokenImages = await images.evaluateAll((items) =>
          items.filter((item) => item.complete && item.naturalWidth === 0).length,
        );
        if (brokenImages > 0 && await imageFrame.locator('[role="img"]').count() === 0) {
          failures.push(`${path}: broken hero image rendered without fallback`);
        }
      } else if (await imageFrame.locator('[role="img"]').count() === 0) {
        failures.push(`${path}: neither hero image nor fallback is rendered`);
      }
    }

    if (pageErrors.length) {
      failures.push(`${path}: page errors ${pageErrors.slice(0, 4).join(" | ")}`);
    }
    if (consoleErrors.length) {
      failures.push(`${path}: console errors ${consoleErrors.slice(0, 4).join(" | ")}`);
    }
  } catch (error) {
    failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
  }

  if ((index + 1) % 50 === 0 || index + 1 === breedPaths.length) {
    console.log(`[breed-profile-audit] Checked ${index + 1}/${breedPaths.length}.`);
  }
}

await browser.close();

if (failures.length) {
  console.error(`[breed-profile-audit] FAIL ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `[breed-profile-audit] PASS ${breedPaths.length}/${breedPaths.length}: HTTP 200, runtime, H1, image fallback, duplicate IDs, anchors, canonical and mobile horizontal overflow.`,
  );
}
