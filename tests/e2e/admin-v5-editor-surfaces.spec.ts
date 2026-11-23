import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, baseURL }) => {
  const host = baseURL ? new URL(baseURL).hostname : "";
  test.skip(!["localhost", "127.0.0.1", "::1"].includes(host), "Only isolated local admin fixtures");
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("Admin V5 shared editor stays compact, accessible and scrollable without editing data", async ({ page }) => {
  const response = await page.goto("/admin/plemena/novy", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator('[data-admin-breed-editor-ready="true"]')).toBeVisible();

  const editor = page.locator("[data-editor-page]");
  const footer = editor.locator("[data-admin-editor-footer]");
  const field = page.getByLabel("Názov plemena", { exact: true });

  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(editor).toBeVisible();
    await expect(footer).toBeVisible();
    await expect(field).toBeVisible();

    const min = width <= 820 ? 44 : 38;
    const buttons = footer.locator("button, a");
    for (const element of await buttons.all()) {
      expect(await element.evaluate(node => node.getBoundingClientRect().height))
        .toBeGreaterThanOrEqual(min);
    }
    if (width <= 820) {
      await expect(field).toHaveCSS("font-size", "16px");
      await field.focus();
      const actionbarParent = editor.locator("[data-editor-actionbar]").locator("xpath=..");
      await expect(actionbarParent).toHaveCSS("position", "static");
      await field.evaluate(node => (node as HTMLInputElement).blur());
    }
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    )).toBe(true);
  }
});
