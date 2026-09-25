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

  test("rollback kill-switch blocks Google renderer even with consent and valid config", async ({ page }) => {
    test.skip(process.env.MAP_E2E_EXPECT_PUBLIC_MAP_DISABLED !== "1", "Rollback-disabled server only");

    const googleRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("maps.googleapis.com") || url.includes("maps.gstatic.com")) {
        googleRequests.push(url);
      }
    });
    await page.addInitScript(() => {
      window.localStorage.setItem("psipedia-google-maps-consent", "granted");
    });

    await page.goto("/mapa");
    await page.waitForLoadState("networkidle");

    expect(googleRequests).toEqual([]);
    await expect(page.locator('script[data-psipedia-google-maps]')).toHaveCount(0);
    await expect(page.getByText("Interaktívna mapa ešte nie je verejne spustená", { exact: true })).toBeVisible();

    const html = await page.content();
    expect(html).not.toContain("ci-browser-key-not-real");
    expect(html).not.toContain("ci-map-id-not-real");

    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute("content", /noindex/i);
    await expect(robots).toHaveAttribute("content", /nofollow/i);

    await page.goto("/");
    await expect(page.locator(".desktop-nav").getByRole("link", { name: "Mapa", exact: true })).toHaveCount(0);
  });

  test("cookie settings expose a revocable Google Maps choice", async ({ page }) => {
    await page.goto("/cookies");
    await page.waitForFunction(() => Boolean((window as unknown as { __VINEXT_HYDRATED_AT?: number }).__VINEXT_HYDRATED_AT));
    await page.waitForTimeout(100);

    await expect(page.getByRole("heading", { name: "Google Maps" })).toBeVisible();
    const controls = page.locator(".privacy-controls").filter({ hasText: "Google Maps:" });
    const enable = controls.getByRole("button", { name: "Povoliť Google Maps" });
    await expect(enable).toBeVisible();
    await enable.click();

    await expect.poll(() => page.evaluate(() => window.localStorage.getItem("psipedia-google-maps-consent"))).toBe("granted");
    await expect(controls.locator("strong")).toHaveText("povolené");
    const disable = controls.getByRole("button", { name: "Vypnúť Google Maps" });
    await expect(disable).toBeVisible();
    await disable.click();
    await page.waitForLoadState("domcontentloaded");
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem("psipedia-google-maps-consent"))).toBeNull();
    await expect(controls.locator("strong")).toHaveText("nepovolené");
  });
});
