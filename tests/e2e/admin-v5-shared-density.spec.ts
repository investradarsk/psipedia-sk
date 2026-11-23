import { expect, test } from "@playwright/test";

test("Admin V5 desktop density and mobile touch targets", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile-chromium";
  await page.setViewportSize({ width: mobile ? 390 : 1440, height: 900 });

  const response = await page.goto("/admin/clanky", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);

  const workspace = page.locator("[data-admin-workspace]");
  await expect(workspace.locator("[data-admin-shell] h1")).toBeVisible();
  const controlHeight = await workspace.evaluate((element) =>
    getComputedStyle(element).getPropertyValue("--admin-ui-control-height").trim()
  );
  expect(controlHeight).toBe(mobile ? "44px" : "38px");

  const bell = page.getByTestId("admin-notification-bell");
  await expect(bell).toBeVisible();
  expect(await bell.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);

  if (mobile) {
    const filterInput = page.getByRole("search").locator('input[type="search"], input[type="text"]').first();
    if (await filterInput.count()) {
      expect(await filterInput.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize)
      )).toBeGreaterThanOrEqual(16);
    }
  } else {
    const grid = page.locator('[data-density="compact"] table').first();
    if (await grid.count()) {
      await expect(grid.locator("th").first()).toHaveCSS("height", "38px");
    }
  }
});
