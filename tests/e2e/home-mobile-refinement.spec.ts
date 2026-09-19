import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

test.beforeEach(async ({ page, baseURL }) => {
  expect(new URL(baseURL!).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("mobile homepage keeps the HOME-2 compact hero and exposes discovery above the fold", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  if (process.env.HOME1_CAPTURE_PRODUCTION === "1") {
    await page.goto("https://psipedia.sk", { waitUntil: "domcontentloaded" });
    await page.screenshot({ path: ".e2e-artifacts/home-1/before-production-mobile-390x844.png" });
  }
  await page.goto("/");

  const hero = page.locator(".hero-card");
  const headline = hero.getByRole("heading", { level: 1 });
  const discovery = page.locator(".home-search-panel");
  const searchInput = discovery.locator("#home-search");

  await expect(hero).toBeVisible();
  await expect(headline).toBeVisible();
  await expect(searchInput).toBeVisible();

  const metrics = await page.evaluate(() => {
    const box = (selector: string) => {
      const rect = document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    return {
      hero: box(".hero-card"),
      discovery: box(".home-search-panel"),
      search: box("#home-search"),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  // HOME-2 deliberately reduces the old 400–450px mobile hero to ~318px
  // so search/discovery appears materially earlier in the first viewport.
  expect(metrics.hero.height).toBeGreaterThanOrEqual(300);
  expect(metrics.hero.height).toBeLessThanOrEqual(340);
  expect(metrics.discovery.top).toBeLessThan(844 * 0.72);
  expect(metrics.search.top).toBeLessThan(844);
  expect(metrics.overflow).toBeLessThanOrEqual(1);
  expect(metrics.hero.width).toBeLessThanOrEqual(390);
  expect(metrics.discovery.width).toBeLessThanOrEqual(390 - 24);
  await expectNoSeriousAccessibilityViolations(page);
  await page.screenshot({ path: ".e2e-artifacts/home-1/after-local-mobile-390x844.png" });
});

test("desktop homepage keeps the HOME-2 compact hero composition", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const hero = page.locator(".hero-card");
  const image = hero.locator(".hero-image");
  const discovery = page.locator(".home-search-panel");
  await expect(hero).toBeVisible();
  await expect(image).toBeVisible();
  await expect(hero.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(discovery).toBeVisible();

  const metrics = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    heroHeight: document.querySelector<HTMLElement>(".hero-card")!.getBoundingClientRect().height,
    imageFit: getComputedStyle(document.querySelector<HTMLElement>(".hero-image")!).objectFit,
  }));

  // HOME-2 intentionally reduces the old 500px+ desktop hero while retaining
  // the same image-cover composition and keeping the portal search close by.
  expect(metrics.heroHeight).toBeGreaterThanOrEqual(430);
  expect(metrics.heroHeight).toBeLessThanOrEqual(500);
  expect(metrics.imageFit).toBe("cover");
  expect(metrics.overflow).toBeLessThanOrEqual(1);
  await expectNoSeriousAccessibilityViolations(page);
  await page.screenshot({ path: ".e2e-artifacts/home-1/after-local-desktop-1440x900.png" });
});
