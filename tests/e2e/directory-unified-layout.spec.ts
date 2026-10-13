import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const artifactDir = ".e2e-artifacts/services-v2-directory";
const paths = ["/adresar", "/adresar/veterinari", "/adresar/treneri", "/adresar/salony-a-sluzby"];
const viewports = [
  { width: 320, height: 720 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1180, height: 900 },
  { width: 1440, height: 900 },
];

async function open(page: Page, path: string) {
  let status = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await page.goto(path, {waitUntil:"domcontentloaded"});
    status = response?.status() ?? 0;
    if (![500,502,503,504].includes(status)) break;
    console.warn("[directory-preview-5xx]", {path,status,attempt:attempt + 1});
    if (attempt < 2) await page.waitForTimeout(500 * (attempt + 1));
  }
  expect(status, path + " must return 200").toBe(200);
  await expect(page.locator("[data-directory-main-search]")).toBeVisible();
}

test("SERVICES-V2 desktop/mobile matrix uses one search, accessible categories and bounded columns", async ({ browser }) => {
  test.setTimeout(6 * 60 * 1000);
  mkdirSync(artifactDir,{recursive:true});
  for (const viewport of viewports) {
    const context = await browser.newContext({viewport, baseURL: process.env.E2E_BASE_URL});
    const page = await context.newPage();
    try {
      for (const path of paths) {
        await open(page,path);
        await expect(page.locator("[data-unified-section-hero]")).toHaveCount(1);
        await expect(page.locator('form[data-public-search-form="services"]')).toHaveCount(1);
        await expect(page.locator('form[data-public-search-form="services"] input[name="q"]')).toHaveCount(1);
        await expect(page.locator("[data-directory-category-navigation] [data-public-subcategory-item]")).toHaveCount(11);
        await expect(page.locator("[data-directory-columns]")).toBeVisible();
        await expect(page.locator("[data-directory-filter-form]")).toHaveCount(1);
        await expect(page.locator("[data-directory-results]")).toBeVisible();
        await expect(page.locator("[data-directory-map-cta] a")).toHaveAttribute("href", /\/mapa\?category=services/);
        await expect(page.locator("[data-directory-provider-cta] a")).toHaveAttribute("href", "/o-nas#kontakt");
        const metrics = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
          columns: getComputedStyle(document.querySelector("[data-directory-columns]")!).gridTemplateColumns.trim().split(/\s+/).length,
        }));
        expect(metrics.scroll, path+" horizontal overflow").toBeLessThanOrEqual(metrics.viewport+1);
        expect(metrics.columns, path+" column count").toBe(viewport.width > 1100 ? 3 : viewport.width > 820 ? 2 : 1);
        if (path === "/adresar" && [390,1440].includes(viewport.width)) {
          await page.screenshot({path:join(artifactDir, `after-root-${viewport.width}.png`), fullPage:true});
        }
        if (path === "/adresar/veterinari" && [390,1440].includes(viewport.width)) {
          await page.screenshot({path:join(artifactDir, `after-veterinari-${viewport.width}.png`), fullPage:true});
        }
      }
    } finally { await context.close(); }
  }
});

test("SERVICES-V2 GET search and filters work without JavaScript and keep category route", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL:process.env.E2E_BASE_URL,
    viewport:{width:390,height:844},
    javaScriptEnabled:false,
  });
  try {
    const page = await context.newPage();
    await open(page,"/adresar/veterinari");
    await page.locator('form[data-public-search-form="services"] input[name="q"]').fill("Nitra");
    await Promise.all([
      page.waitForURL((url) => url.pathname==="/adresar/veterinari" && url.searchParams.get("q")==="Nitra"),
      page.locator('form[data-public-search-form="services"] button[type="submit"]').click(),
    ]);
    await expect(page.locator("[data-directory-filter-form]")).toBeVisible();
    await expect(page.locator('[data-directory-filter-form] input[type=hidden][name=q]')).toHaveValue("Nitra");
    await expect(page.locator('[data-directory-filter-form] select[name="region"]')).toBeVisible();
    await expect(page.locator('[data-directory-filter-form] button[type="submit"]')).toBeVisible();
    await expect(page.locator('[data-directory-category-navigation] [aria-current="page"]')).toHaveCount(1);
  } finally {await context.close();}
});

test("SERVICES-V2 category more keyboard interaction and 200% text do not clip", async ({ page }) => {
  await page.setViewportSize({width:1180,height:900});
  await open(page,"/adresar");
  const more = page.getByRole("button",{name:"Ďalšie",exact:true});
  if (await more.isVisible()) {
    await more.focus();
    await more.press("Enter");
    await expect(more).toHaveAttribute("aria-expanded","true");
    await expect(page.locator('[data-directory-category-navigation][data-expanded="true"]')).toBeVisible();
  }
  await page.evaluate(() => {document.documentElement.style.fontSize="200%";});
  await expect(page.locator("[data-directory-results] h2").first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(1181);
  const results = await new AxeBuilder({page}).include("[data-directory-columns]").analyze();
  expect(results.violations.filter(v=>v.impact==="critical"||v.impact==="serious")).toEqual([]);
});
