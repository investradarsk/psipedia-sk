import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const PREVIEW_URL = process.env.E2E_BASE_URL ?? "";
const PRODUCTION_URL = process.env.CATEGORY_VISUAL_PRODUCTION_URL ?? "https://psipedia.sk";
const ARTIFACT_DIR = process.env.CATEGORY_VISUAL_ARTIFACT_DIR ?? ".e2e-artifacts/category-visual";
const CONSENT_KEY = "psipedia-cookie-consent";

const LANDINGS = [
  { slug: "plemena", path: "/plemena" },
  { slug: "steniatka", path: "/steniatka" },
  { slug: "starostlivost", path: "/starostlivost" },
  { slug: "aktivity", path: "/aktivity" },
  { slug: "adresar", path: "/adresar" },
  { slug: "podujatia", path: "/podujatia" },
  { slug: "pomoc-psom", path: "/pomoc-psom" },
  { slug: "recenzie", path: "/recenzie" },
  { slug: "novinky", path: "/novinky" },
] as const;

const VIEWPORTS = [
  { label: "desktop", width: 1440, height: 900 },
  { label: "mobile-390", width: 390, height: 844 },
  { label: "mobile-360", width: 360, height: 800 },
  { label: "tablet", width: 768, height: 1024 },
] as const;

async function makePage(browser: Browser, baseURL: string, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ baseURL, viewport });
  await context.addInitScript(([key]) => localStorage.setItem(key, "necessary"), [CONSENT_KEY]);
  return { context, page: await context.newPage() };
}

async function openProductionReference(page: Page, path: string, label: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status(), `${label}: ${path}`).toBe(200);
  await expect(page.locator("main")).toBeVisible();
}

async function assertPreviewLanding(page: Page, path: string, label: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status(), `${label}: ${path}`).toBe(200);
  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator("main h1")).toHaveCount(1);

  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth, `${label}: ${path} horizontal overflow`).toBeLessThanOrEqual(overflow.clientWidth + 1);

  const serious = (await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()).violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  expect(serious, `${label}: ${path} serious accessibility violations`).toEqual([]);
}

test("CATEGORY-VISUAL preview matches the landing-page contract and captures before/after evidence", async ({ browser }) => {
  test.setTimeout(12 * 60 * 1000);
  expect(PREVIEW_URL).toMatch(/^https:\/\//);
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  for (const viewport of VIEWPORTS) {
    const preview = await makePage(browser, PREVIEW_URL, viewport);
    const production = await makePage(browser, PRODUCTION_URL, viewport);
    try {
      for (const landing of LANDINGS) {
        await openProductionReference(production.page, landing.path, `production ${viewport.label}`);
        await production.page.screenshot({
          path: join(ARTIFACT_DIR, `before-${viewport.label}-${landing.slug}.png`),
          fullPage: true,
        });

        await assertPreviewLanding(preview.page, landing.path, `preview ${viewport.label}`);
        await preview.page.screenshot({
          path: join(ARTIFACT_DIR, `after-${viewport.label}-${landing.slug}.png`),
          fullPage: true,
        });
      }
    } finally {
      await preview.context.close();
      await production.context.close();
    }
  }
});

test("CATEGORY-VISUAL preview keeps primary navigation and filter state contracts", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/recenzie");
  const reviewModes = page.getByRole("navigation", { name: "Typ recenzií" }).getByRole("link");
  await expect(reviewModes).toHaveCount(4);
  for (const link of await reviewModes.all()) {
    expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  await page.goto("/adresar");
  const directoryNav = page.getByRole("navigation", { name: "Kategórie služieb" });
  await expect(directoryNav).toBeVisible();
  expect(await directoryNav.evaluate((element) => getComputedStyle(element).overflowX)).not.toBe("auto");

  await page.goto("/novinky");
  const newsNav = page.getByRole("navigation", { name: "Filtrovať novinky podľa kategórie" });
  await expect(newsNav).toBeVisible();
  expect(await newsNav.evaluate((element) => getComputedStyle(element).overflowX)).not.toBe("auto");

  await page.goto("/adresar?q=Nitra&category=veterinari");
  await expect(page).toHaveURL(/q=Nitra/);
  await expect(page).toHaveURL(/category=veterinari/);
  await page.goto("/pomoc-psom");
  await page.goBack();
  await expect(page).toHaveURL(/\/adresar\?/);
  await expect(page).toHaveURL(/q=Nitra/);
  await expect(page).toHaveURL(/category=veterinari/);
});
