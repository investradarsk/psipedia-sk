import { expect, test } from "@playwright/test";

for (const path of ["/steniatka", "/starostlivost", "/aktivity"]) {
  for (const width of [1280, 1440, 390]) {
    test(`${path}: shared editorial layout at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const groups = page.locator("[data-section-article-group]");
      await expect(groups.first()).toBeVisible();
      const card = groups.locator("[data-article-list-item]").first();
      await expect(card).toBeVisible();
      const media = await card.locator("[data-article-image]").boundingBox();
      const title = await card.locator("[data-article-title]").boundingBox();
      expect(media).not.toBeNull();
      expect(title).not.toBeNull();
      if (width > 900) {
        await expect(page.locator(".portal-section-tabs select")).toBeVisible();
        const serviceImages = page.locator("[data-section-next-card] img");
        for (const image of await serviceImages.all()) await expect(image).toBeHidden();
        expect(title!.y).toBeGreaterThanOrEqual(media!.y + media!.height);
        expect(media!.width).toBeGreaterThan(260);
        const first = await groups.first().boundingBox();
        const second = await groups.nth(1).boundingBox();
        expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
      } else {
        expect(title!.x).toBeGreaterThanOrEqual(media!.x + media!.width);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
    });
  }
}
