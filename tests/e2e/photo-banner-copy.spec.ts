import { expect, test } from "@playwright/test";

for (const path of ["/", "/pomoc-psom"]) {
  test(`${path}: photographic help banner keeps readable desktop copy`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop-only styling");
    await page.setViewportSize({ width: 1440, height: 936 });
    await page.goto(path);
    const banner = page.locator(".home-magazine-banner").filter({
      has: page.locator('a[href="/pomoc-psom/stratene-a-najdene/nahlasit"]'),
    });
    await expect(banner).toHaveCount(1);
    const description = banner.locator('[class*="bannerDescription"]');
    await expect(description).toBeVisible();
    await expect(description).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(banner.locator(".eyebrow")).toHaveCSS("color", "rgb(247, 207, 189)");
  });
}
