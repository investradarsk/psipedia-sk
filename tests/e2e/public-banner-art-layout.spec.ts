import { expect, test } from "@playwright/test";

/**
 * Regression for the approved Psipedia dog banners: CSS checks alone did not
 * catch the illustration sitting behind the CTA or oversizing in a sidebar.
 */
test("banner art uses its own right lane on wide home promos", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const banner = page.locator('[data-home-banner="profil"]').first();
  await expect(banner).toBeVisible();
  const result = await banner.evaluate((element) => {
    const copy = element.querySelector("[data-public-banner-content]");
    const art = element.querySelector("[data-ps-banner-art]");
    const action = copy?.querySelector("a[data-public-action]");
    if (!(copy instanceof HTMLElement) || !(art instanceof HTMLElement) || !(action instanceof HTMLElement)) {
      return null;
    }
    const bannerRect = element.getBoundingClientRect();
    const copyRect = copy.getBoundingClientRect();
    const actionRect = action.getBoundingClientRect();
    return {
      bannerWidth: bannerRect.width,
      copyWidth: copyRect.width,
      actionRight: actionRect.right,
      artVisible: getComputedStyle(art, "::after").display !== "none",
      bannerRight: bannerRect.right,
    };
  });
  expect(result).not.toBeNull();
  expect(result!.bannerWidth).toBeGreaterThan(820);
  expect(result!.copyWidth).toBeLessThan(result!.bannerWidth * 0.77);
  expect(result!.bannerRight - result!.actionRight).toBeGreaterThan(result!.bannerWidth * 0.19);
  expect(result!.artVisible).toBe(true);
});

test("directory content banners reserve artwork space according to their actual width", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/adresar");
  const banner = page.locator("[data-directory-map-cta] [data-public-banner-frame]").first();
  await expect(banner).toBeVisible();
  const result = await banner.evaluate((element) => {
    const art = element.querySelector("[data-ps-banner-art]");
    const action = element.querySelector("a[data-public-action]");
    if (!(art instanceof HTMLElement) || !(action instanceof HTMLElement)) return null;
    const outer = element.getBoundingClientRect();
    const button = action.getBoundingClientRect();
    return {
      width: outer.width,
      contentWidth: element.clientWidth - parseFloat(getComputedStyle(element).paddingLeft) - parseFloat(getComputedStyle(element).paddingRight),
      size: element.getAttribute("data-banner-size"),
      dogVisible: getComputedStyle(art, "::after").display !== "none",
      artBelowAction: art.getBoundingClientRect().top >= button.bottom - 1,
      rightLane: outer.right - button.right >= outer.width * .19,
      actionInside: button.left >= outer.left && button.right <= outer.right + 1,
    };
  });
  expect(result).not.toBeNull();
  expect(result!.size).toBe("medium");
  expect(result!.dogVisible).toBe(true);
  expect(result!.contentWidth <= 520 ? result!.artBelowAction : result!.rightLane).toBe(true);
  expect(result!.actionInside).toBe(true);
});
