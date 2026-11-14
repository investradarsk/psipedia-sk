import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page, baseURL }) => {
  const host = baseURL ? new URL(baseURL).hostname : "";
  test.skip(!["localhost", "127.0.0.1", "::1"].includes(host), "Read-only localhost admin fixture only");
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

async function fitsViewport(page: Page, width: number) {
  const size = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(size.scroll, "page overflow at " + width).toBeLessThanOrEqual(size.client + 1);
}

test("step 14: Gemini STOP stays obvious and 22-category workspace fits mobile", async ({ page }) => {
  const response = await page.goto("/admin/automatizacie-gemini", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const dashboard = page.locator('[data-admin-content-module="gemini-automation"]');
  await expect(dashboard).toBeVisible();
  const stop = dashboard.locator("[data-admin-gemini-global-stop]");
  await expect(stop.getByRole("heading", { name: "Hlavný STOP Gemini" })).toBeVisible();
  await expect(stop.getByRole("button", { name: /STOP|Obnoviť Gemini/ })).toBeVisible();
  await expect(dashboard.locator("[data-admin-automation-metrics]")).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await fitsViewport(page, width);
  }
  // Do not click STOP, schedule settings, manual runs or any paid API operation.
});

test("step 14: Gemini concepts filter/table retain local scrolling and never submit changes", async ({ page }) => {
  const response = await page.goto("/admin/automatizacie-gemini/koncepty", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const area = page.locator('[data-admin-content-module="gemini-concepts"]');
  await expect(area).toBeVisible();
  const filters = area.locator('[data-admin-list-filters]');
  const table = area.locator('[data-admin-list-table]');
  const pager = area.locator('[data-admin-list-pagination]');
  await expect(filters).toBeVisible();
  await expect(table).toBeVisible();
  await expect(pager).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(filters).toBeVisible();
    if (width <= 760) await expect(table).toHaveCSS("overflow-x", "auto");
    await fitsViewport(page, width);
  }
  const prev = pager.getByRole("button", { name: "Predchádzajúca" });
  expect(await prev.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
});

test("step 14: Facebook month/week and post list are readable on phones", async ({ page }) => {
  const response = await page.goto("/admin/facebook-obrazky", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const root = page.locator('[data-admin-content-module="facebook-posts"]');
  await expect(root).toBeVisible();
  await expect(root.locator('[data-admin-social-calendar]')).toBeVisible();
  await expect(root.locator('[data-admin-social-metrics]')).toBeVisible();
  const week = root.getByRole("button", { name: "Týždeň", exact: true });
  const month = root.getByRole("button", { name: "Mesiac", exact: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(week).toBeVisible();
    await expect(month).toBeVisible();
    await fitsViewport(page, width);
  }
  await week.click(); // read-only calendar layout switch
  await expect(week).toHaveAttribute("aria-pressed", "true");
  await month.click(); // read-only calendar layout switch
  await expect(month).toHaveAttribute("aria-pressed", "true");
  await expect(root.locator('[data-admin-social-list]')).toBeVisible();
  await expect(root.locator('[data-admin-list-pagination]')).toBeVisible();
});

test("step 14: Facebook graphic editor fields open without publishing or exporting", async ({ page }) => {
  const response = await page.goto("/admin/facebook-obrazky", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const root = page.locator('[data-admin-content-module="facebook-posts"]');
  const create = root.locator("[data-facebook-create-post]");
  await expect(create).toBeVisible();
  await expect(create).toBeEnabled();
  await create.click();
  const dialog = page.getByRole("dialog", { name: /Nový Facebook obrázok/ });
  await expect(dialog).toBeVisible();
  const graphic = dialog.getByRole("button", { name: /Grafický editor|Vytvoriť grafiku|Grafika/ }).first();
  if (await graphic.count() && await graphic.isVisible()) {
    await graphic.click();
    const editor = dialog.locator('[data-admin-content-module="facebook-graphic-editor"]');
    await expect(editor).toBeVisible();
    await expect(editor.locator("[data-admin-graphic-controls]")).toBeVisible();
    await expect(editor.locator("[data-admin-graphic-preview]")).toBeVisible();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await fitsViewport(page, width);
    }
  }
  // No save, upload, publishing, consent, drag or export in a read-only suite.
});
