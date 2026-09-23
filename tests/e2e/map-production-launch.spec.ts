import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(metrics.document).toBeLessThanOrEqual(metrics.viewport + 1);
}

test.describe("MAP-1E launch navigation", () => {
  test("desktop navigation exposes Mapa directly after services when launch flag is enabled", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop launch navigation check");
    await page.goto("/");
    const nav = page.locator(".desktop-nav");
    const links = nav.locator(":scope > a, :scope > .nav-group > a");
    const hrefs = await links.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
    const directoryIndex = hrefs.indexOf("/adresar");
    expect(directoryIndex).toBeGreaterThanOrEqual(0);
    expect(hrefs[directoryIndex + 1]).toBe("/mapa");
    await expect(nav.getByRole("link", { name: "Mapa", exact: true })).toHaveAttribute("href", "/mapa");
    await expectNoHorizontalOverflow(page);
  });

  test("mobile navigation exposes Mapa and keeps a safe 390px layout", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile launch navigation check");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.waitForFunction(() => Boolean((window as unknown as { __VINEXT_HYDRATED_AT?: number }).__VINEXT_HYDRATED_AT));
    await page.waitForTimeout(100);
    const menuTrigger = page.locator('button[aria-controls="mobile-menu"]:visible');
    await expect(menuTrigger).toHaveAttribute("aria-label", "Otvoriť menu");
    await menuTrigger.click();
    await expect(menuTrigger).toHaveAttribute("aria-expanded", "true");
    const menu = page.locator("#mobile-menu");
    await expect(menu.getByRole("link", { name: "Mapa", exact: true })).toHaveAttribute("href", "/mapa");
    await expect(menu.getByRole("link", { name: "Mapa", exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const axe = await new AxeBuilder({ page }).include("#mobile-menu").analyze();
    const serious = axe.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
    expect(serious).toEqual([]);
  });

  test("cookie settings expose a revocable Google Maps choice", async ({ page }) => {
    await page.goto("/cookies");
    await expect(page.getByRole("heading", { name: "Google Maps" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Povoliť Google Maps" })).toBeVisible();
    await page.getByRole("button", { name: "Povoliť Google Maps" }).click();
    await expect(page.getByText(/Google Maps:.*povolené/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Vypnúť Google Maps" })).toBeVisible();
  });
});
