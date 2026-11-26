import { expect, test } from "@playwright/test";

for (const width of [1280, 1440]) {
  test(`homepage editorial columns share a bottom boundary at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const sections = page.locator(".home-editorial-section:has(.home-magazine-side)");
    expect(await sections.count()).toBeGreaterThan(0);
    for (const section of await sections.all()) {
      const side = await section.locator(".home-magazine-side").boundingBox();
      const action = await section.locator(":scope > .home-section-cta").boundingBox();
      expect(side).not.toBeNull();
      expect(action).not.toBeNull();
      expect(Math.abs(side!.y + side!.height - action!.y - action!.height)).toBeLessThan(2);
    }
    for (const rail of await page
      .locator(".home-magazine-side .home-magazine-sidebar-block")
      .all()) {
      const lastRow = await rail.locator("[data-home-sidebar-row]").last().boundingBox();
      const link = await rail.locator(".home-magazine-sidebar-action").boundingBox();
      expect(lastRow).not.toBeNull();
      expect(link).not.toBeNull();
      expect(link!.y - lastRow!.y - lastRow!.height).toBeLessThanOrEqual(24);
    }
    const rows = page.locator(".home-magazine-main .home-latest-item > [data-article-list-item]");
    expect(await rows.count()).toBeGreaterThan(0);
    for (const row of await rows.all()) {
      const padding = await row.evaluate((element) => {
        const style = getComputedStyle(element);
        return [parseFloat(style.paddingLeft), parseFloat(style.paddingRight)];
      });
      expect(padding.every((value) => value >= 12)).toBe(true);
    }
  });
}

test("mobile editorial action remains after the contextual rail", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const sections = page.locator(".home-editorial-section:has(.home-magazine-side)");
  expect(await sections.count()).toBeGreaterThan(0);
  for (const section of await sections.all()) {
    const side = await section.locator(".home-magazine-side").boundingBox();
    const action = await section.locator(":scope > .home-section-cta").boundingBox();
    expect(side).not.toBeNull();
    expect(action).not.toBeNull();
    expect(action!.y).toBeGreaterThanOrEqual(side!.y + side!.height);
  }
});

for (const width of [1280, 1440, 1920]) {
  test(`homepage affiliate keeps the full event rail width at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    const artwork = Promise.withResolvers<void>();
    await page.route(
      /https:\/\/(?:api\.app\.dognet\.com|visibility\.postaffiliatepro\.com)\//,
      async (route) => {
        await artwork.promise;
        await route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><rect width="100%" height="100%" fill="green"/></svg>',
        });
      },
    );
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const rail = page.locator("[data-home-latest] .home-magazine-side");
    const events = rail.locator(".home-magazine-sidebar-block");
    const ad = rail.locator('[data-affiliate-rotating-banner="sidebar"]');
    await events.scrollIntoViewIfNeeded();
    const image = ad.locator("img");
    const link = ad.locator("a");
    const reservedSize = await link
      .evaluate((element) => {
        const { width, height } = element.getBoundingClientRect();
        return { width, height };
      })
      .finally(artwork.resolve);
    expect(reservedSize.height).toBeGreaterThan(0);
    await ad.scrollIntoViewIfNeeded();
    await expect(ad).toBeVisible();
    await expect(events).toBeVisible();
    expect(await link.boundingBox()).toMatchObject(reservedSize);
    expect(await image.boundingBox()).toEqual(await link.boundingBox());
    const railBox = (await rail.boundingBox())!;
    const eventBox = (await events.boundingBox())!;
    const adBox = (await ad.boundingBox())!;
    expect(eventBox.width).toBeGreaterThanOrEqual(railBox.width - 2);
    expect(eventBox.width).toBeGreaterThanOrEqual(258);
    expect(adBox.x).toBeGreaterThanOrEqual(railBox.x - 1);
    expect(adBox.x + adBox.width).toBeLessThanOrEqual(railBox.x + railBox.width + 1);
    expect(adBox.y).toBeGreaterThanOrEqual(eventBox.y + eventBox.height);
  });
}
