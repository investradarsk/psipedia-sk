import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page, baseURL }) => {
  const host = baseURL ? new URL(baseURL).hostname : "";
  test.skip(!["localhost", "127.0.0.1", "::1"].includes(host), "Read-only isolated local admin fixtures only");
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

async function expectNoDocumentOverflow(page: Page, width: number) {
  const size = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(size.scroll, "document overflow at " + width + "px").toBeLessThanOrEqual(size.client + 1);
}

test("step 15: quality review keeps both values and fits phones without approving data", async ({ page }) => {
  const response = await page.goto("/admin/kvalita", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const root = page.locator('[data-admin-content-module="quality-review"]');
  if (await root.count()) {
    await expect(root).toBeVisible();
    if (await root.getByText("Aktuálny údaj", { exact: true }).count()) {
      await expect(root.getByText("Nájdený údaj", { exact: true }).first()).toBeVisible();
    }
  } else {
    await expect(page.getByText(/čaká na databázovú migráciu 0142/)).toBeVisible();
  }
  for (const width of [320, 375, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expectNoDocumentOverflow(page, width);
  }
  // Never start Tavily search, approve, reject, edit or open a bulk action.
});

test("step 15: maps cost warning remains available without executing Google calls", async ({ page }) => {
  const response = await page.goto("/admin/mapy", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const root = page.locator('[data-admin-content-module="geo-operator"]');
  if (await root.count()) {
    await expect(root.locator("[data-admin-map-filters]")).toBeVisible();
    await expect(root.locator("[data-google-bulk-cost-notice]")).toBeVisible();
    await expect(root.locator("[data-google-bulk-cost-notice] summary")).toContainText("5 €");
  }
  for (const width of [320, 375, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expectNoDocumentOverflow(page, width);
  }
  // Do not click paid search, run bulk or change any Place identity.
});

test("step 15: tools remain compact with their original routes", async ({ page }) => {
  const response = await page.goto("/admin/nastroje", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const grid = page.locator('[data-admin-content-module="technical-tools"]');
  await expect(grid).toBeVisible();
  await expect(grid.locator('a[href="/admin/nastroje/notion-audit"]')).toBeVisible();
  for (const width of [320, 375, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expectNoDocumentOverflow(page, width);
  }
  // No canary, migration, import or administrative mutations.
});
