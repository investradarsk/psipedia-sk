import { expect, test } from "@playwright/test";

test("mobile drawer opens Articles and Workspace as fresh documents, never a blank router view", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-chromium", "Mobile-only document navigation fallback");

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Menu", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "Navigácia administrácie" });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name: "Články", exact: true }).click();

    await expect(page).toHaveURL(/\/admin\/clanky(?:\?.*)?$/);
    await expect(page.getByRole("heading", { name: "Články a novinky", exact: true })).toBeVisible();
    await expect.poll(async () => page.evaluate(() =>
      new URL((performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming).name).pathname
    )).toBe("/admin/clanky");

    await page.getByRole("button", { name: "Menu", exact: true }).click();
    const workspaceLink = page.getByRole("dialog", { name: "Navigácia administrácie" })
      .getByRole("link", { name: "Pracovný prehľad", exact: true });
    await workspaceLink.click();

    await expect(page).toHaveURL(/\/admin\/?$/);
    await expect(page.getByRole("heading", { name: "Pracovný prehľad", exact: true })).toBeVisible();
    await expect.poll(async () => page.evaluate(() =>
      new URL((performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming).name).pathname
    )).toBe("/admin");
    await expect(page.locator("[data-admin-shell]")).toBeVisible();
  }
});
