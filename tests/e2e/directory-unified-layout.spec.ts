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
        await expect(page.locator("[data-directory-filter-form]")).toHaveCount(2);
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
    // Native GET with q="" must finish on a clean canonical URL, even without JS.
    await page.locator('form[data-public-search-form="services"] input[name="q"]').fill("");
    await Promise.all([
      page.waitForURL((url) => url.pathname==="/adresar/veterinari" && !url.searchParams.has("q")),
      page.locator('form[data-public-search-form="services"] button[type="submit"]').click(),
    ]);
  } finally {await context.close();}
});

test("SERVICES-V2 category more keyboard interaction and 200% text do not clip", async ({ page }) => {
  await page.setViewportSize({width:1180,height:900});
  await open(page,"/adresar");
  const more = page.locator("[data-directory-category-navigation] button[aria-controls]");
  await expect(more, "The category track needs a keyboard-accessible overflow affordance").toBeVisible();
  await more.focus();
  await more.press("Enter");
  await expect(more).toHaveAttribute("aria-expanded","true");
  await expect(page.locator('[data-directory-category-navigation][data-expanded="true"]')).toBeVisible();
  await more.press("Enter");
  await expect(more).toHaveAttribute("aria-expanded","false");
  await expect(more).toBeFocused();
  await page.evaluate(() => {document.documentElement.style.fontSize="200%";});
  await expect(page.locator("[data-directory-results] h2").first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(1181);
  const results = await new AxeBuilder({page}).include("[data-directory-columns]").analyze();
  expect(results.violations.filter(v=>v.impact==="critical"||v.impact==="serious")).toEqual([]);
});

test("SERVICES-V2 all ten canonical service categories share the same public layout", async ({ page }) => {
  test.setTimeout(3 * 60 * 1000);
  await page.setViewportSize({width:390,height:844});
  for (const slug of [
    "veterinari", "treneri", "kynologicke-kluby", "chovatelske-kluby",
    "chovatelske-stanice", "salony-a-sluzby", "hotely-a-opatrovanie",
    "vencenie", "fyzioterapia", "dalsie-sluzby",
  ]) {
    const route = "/adresar/" + slug;
    await open(page,route);
    await expect(page.locator("[data-unified-section-hero]")).toHaveAttribute("data-section-visual-key", "directory." + slug);
    await expect(page.locator("[data-directory-results]")).toBeVisible();
    await expect(page.locator('[data-directory-category-navigation] [aria-current="page"]')).toHaveCount(1);
    await expect(page.locator("[data-directory-filter-form]")).toHaveCount(2);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth), route + " mobile overflow")
      .toBeLessThanOrEqual(391);
  }
});


// The hybrid acceptance matrix is split into independent viewport cases so
// a stalled browser action cannot consume the entire desktop+mobile matrix.
for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 720 }]) {
  test(`SERVICES-V2 hybrid accepted UI — ${viewport.width}px`, async ({ browser }) => {
    test.setTimeout(150_000);
    mkdirSync(artifactDir, { recursive: true });
    const context = await browser.newContext({ viewport, baseURL: process.env.E2E_BASE_URL });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(25_000);
    try {
      await test.step("Load category and verify responsive shell", async () => {
        await open(page, "/adresar/veterinari");
        await expect(page.locator("[data-directory-columns]")).toBeVisible();
      }, { timeout: 35_000 });

      const desktopForm = page.locator('[data-directory-filter-form][data-directory-modal="false"]');
      const mobileToolbar = page.locator("[data-directory-mobile-filters]");
      if (viewport.width > 820) {
        await test.step("Desktop sidebar preserves existing three columns and 21-facet registry", async () => {
          await expect(desktopForm).toBeVisible();
          await expect(mobileToolbar).toBeHidden();
          await expect(desktopForm.locator('input[type="radio"][name="f.veterinari.emergency"]')).toHaveCount(3);
          const columns = await page.locator("[data-directory-columns]").evaluate(el =>
            getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length);
          expect(columns).toBe(3);
          await page.screenshot({ path: join(artifactDir, "hybrid-desktop-1440.png"), animations: "disabled", timeout: 20_000 });
        }, { timeout: 40_000 });
      } else {
        const dialog = page.locator("#directory-filter-dialog");
        await test.step("Mobile Filter and Map buttons open category-specific native dialog", async () => {
          await expect(desktopForm).toBeHidden();
          await expect(mobileToolbar.locator('button[aria-haspopup="dialog"]')).toBeVisible();
          await expect(mobileToolbar.locator('a[href*="/mapa?"]')).toBeVisible();
          await mobileToolbar.locator("button").click();
          await expect(dialog).toBeVisible();
          await expect(dialog.locator('input[type="radio"][name="f.veterinari.emergency"]')).toHaveCount(3);
          await expect(dialog.locator('[name="f.veterinari.facility_type"]')).toBeVisible();
          await page.screenshot({ path: join(artifactDir, `hybrid-mobile-${viewport.width}-dialog.png`), animations: "disabled", timeout: 20_000 });
        }, { timeout: 45_000 });

        await test.step("Mobile native dialog meets axe serious/critical accessibility", async () => {
          const axe = await new AxeBuilder({ page }).include("#directory-filter-dialog").analyze();
          expect(axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
        }, { timeout: 35_000 });

        await test.step("GET selected facet preserves map state, and removable chip resets URL", async () => {
          await dialog.locator('input[type="radio"][name="f.veterinari.emergency"][value="yes"]').check();
          await Promise.all([
            page.waitForURL(url =>
              url.pathname === "/adresar/veterinari" && url.searchParams.get("f.veterinari.emergency") === "yes"),
            dialog.locator('button[type="submit"]').click({ timeout: 15_000 }),
          ]);
          await expect(page.locator('[data-directory-active-filters]')).toBeVisible();
          await expect(page.locator('[data-directory-map-cta] a')).toHaveAttribute("href", /f\.veterinari\.emergency=yes/);
          await expect(page.locator("[data-directory-results]")).toBeVisible();
          await page.screenshot({ path: join(artifactDir, `hybrid-mobile-${viewport.width}-results.png`), animations: "disabled", timeout: 20_000 });
          const remove = page.locator('[data-directory-active-filters] a[aria-label*="Pohotovosť"]');
          await expect(remove).toBeVisible();
          await remove.click({ timeout: 15_000 });
          await expect(page).not.toHaveURL(/f\.veterinari\.emergency=yes/);
        }, { timeout: 65_000 });

        await test.step("Escape closes dialog and restores focus", async () => {
          await mobileToolbar.locator("button").click();
          await expect(dialog).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(dialog).toBeHidden();
          await expect(mobileToolbar.locator("button")).toBeFocused();
        }, { timeout: 25_000 });
      }
      await test.step("No horizontal overflow", async () => {
        const size = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
        }));
        expect(size.scroll).toBeLessThanOrEqual(size.viewport + 1);
      }, { timeout: 10_000 });
    } finally {
      await context.close();
    }
  });
}
