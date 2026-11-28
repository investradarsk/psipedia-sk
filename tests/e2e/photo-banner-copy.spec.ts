import { expect, test } from "@playwright/test";

for (const path of ["/", "/pomoc-psom"]) {
  test(`${path}: help banner uses the canonical readable desktop palette`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop-only styling");
    await page.setViewportSize({ width: 1440, height: 936 });
    await page.goto(path);
    const banner = page.locator(".home-magazine-banner").filter({
      has: page.locator('a[href="/partner/koncepty/novy/nahlasit"]'),
    });
    await expect(banner).toHaveCount(1);
    const description = banner.locator('[class*="bannerDescription"]');
    await expect(description).toBeVisible();
    const theme = (await banner.getAttribute("data-banner-desktop-visual")) ?? (await banner.getAttribute("data-banner-visual"));
    expect(["light", "dark"]).toContain(theme);
    await expect(description).toHaveCSS("color", theme === "dark" ? "rgb(229, 238, 230)" : "rgb(75, 97, 86)");
    await expect(banner.locator(".eyebrow")).toHaveCSS("color", theme === "dark" ? "rgb(247, 242, 233)" : "rgb(180, 73, 57)");
  });
}
