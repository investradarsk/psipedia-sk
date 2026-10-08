import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const articlePath = "/aktivity/bikejoring-so-psom-kompletny-sprievodca-od-prveho-treningu-az-po-preteky-na-slovensku";

test.beforeEach(async ({ page, baseURL }) => {
  expect(new URL(baseURL!).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

for (const width of [390, 1440]) {
  test(`CONTENT-DISCOVERY-V3 keeps one compact article next step at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto(articlePath);
    const trail = page.locator("[data-content-discovery-v3]");
    await expect(trail).toHaveCount(1);
    await trail.scrollIntoViewIfNeeded();
    await expect(trail.getByRole("link")).toHaveCount(1);
    const link = trail.getByRole("link");
    await expect(link).toHaveAttribute("href", /^\/(?!\/)/);
    const rect = await link.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect!.height).toBeGreaterThanOrEqual(44);
    await link.focus();
    await expect(link).toBeFocused();
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`content-discovery-v3-${width}.png`), fullPage: false });
    const results = await new AxeBuilder({ page }).include("[data-content-discovery-v3]")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
  });
}
