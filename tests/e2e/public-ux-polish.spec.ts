import { expect, test } from "@playwright/test";

const widths = [320, 390, 768, 1024, 1440];
const landings = ["/plemena", "/steniatka", "/starostlivost", "/aktivity", "/adresar", "/podujatia", "/pomoc-psom", "/recenzie"];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

for (const width of widths) {
  test(`landing hero navigation and overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of landings) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBe(200);
      await expect(page.locator("main h1")).toHaveCount(1);
      const hero = page.locator("[data-unified-section-hero-visual]");
      const breadcrumb = page.locator("[data-section-hero-breadcrumbs] .page-breadcrumbs");
      await expect(breadcrumb).toBeVisible();
      // The nested article navigation must inherit the photographic hero's light color.
      await expect.poll(() => breadcrumb.evaluate((element) => getComputedStyle(element).color)).toBe("rgba(255, 255, 255, 0.84)");
      const home = breadcrumb.getByRole("link").first();
      await expect(home).toHaveAttribute("href", "/");
      await home.hover();
      expect(await home.evaluate((element) => getComputedStyle(element).color)).toBe("rgba(255, 255, 255, 0.84)");
      await home.focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      await expect(home).toBeFocused();
      expect(await home.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
      expect(await breadcrumb.evaluate((element) => getComputedStyle(element).marginBottom)).toBe("0px");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), route).toBeLessThanOrEqual(1);
      if (width <= 620) {
        const box = await hero.boundingBox();
        expect(box?.x).toBeCloseTo(0, 0);
        expect(box?.width).toBeCloseTo(width, 0);
        expect(await hero.evaluate((element) => getComputedStyle(element).borderRadius)).toBe("0px");
      }
    }
  });

  test(`breed search has keyboard focus and still filters at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/plemena");
    const search = page.locator(".breed-search-primary input");
    await expect(search).toBeVisible();
    await search.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(search).toBeFocused();
    await expect.poll(() => search.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
    expect(await search.evaluate((element) => getComputedStyle(element).outlineWidth)).toBe("3px");
    await page.keyboard.type("australsky");
    await expect(search).toHaveValue("australsky");
    await expect(page.locator('main a[href="/plemena/australsky-ovciak"]').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}
