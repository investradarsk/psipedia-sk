import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page, baseURL }) => {
  const host = baseURL ? new URL(baseURL).hostname : "";
  test.skip(!["localhost", "127.0.0.1", "::1"].includes(host), "Read-only isolated localhost admin only");
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

const widths = [320, 375, 390, 430, 768, 1440];

async function expectNoDocumentOverflow(page: Page, width: number) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth, "document overflow at " + width + "px")
    .toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

for (const { url, module } of [
  { url: "/admin/nastavenia", module: "application-settings" },
  { url: "/admin/nastavenia/notion", module: "notion-settings" },
  { url: "/admin/komponenty", module: "visual-library" },
  { url: "/admin/navigacia", module: "navigation-settings" },
  { url: "/admin/monetizacia", module: "monetization-settings" },
  { url: "/admin/pravne", module: "legal-settings" },
]) {
  test(`step 16: ${url} keeps admin module readable on mobile`, async ({ page }) => {
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    const root = page.locator('[data-admin-content-module="' + module + '"]');
    await expect(root).toBeVisible();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      await expectNoDocumentOverflow(page, width);
      await expect(root).toBeVisible();
    }
    // No saving, publishing, publishing settings, push permission or external API call.
  });
}

test("step 16: component registry is optional, visual preview stays available", async ({ page }) => {
  const response = await page.goto("/admin/komponenty", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const root = page.locator('[data-admin-content-module="visual-library"]');
  await expect(root.getByRole("navigation", { name: "Kategórie knižnice" })).toBeVisible();
  const technical = root.locator("details.admin-components-technical-register");
  await expect(technical).toBeVisible();
  await expect(technical).not.toHaveAttribute("open");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expectNoDocumentOverflow(page, width);
  }
  // Don't open any edit proposal or publish actions.
});

test("step 16: navigation save and destructive buttons retain 44px hit targets", async ({ page }) => {
  const response = await page.goto("/admin/navigacia", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const root = page.locator('[data-admin-content-module="navigation-settings"]');
  const save = root.getByRole("button", { name: "Uložiť navigáciu" });
  await expect(save).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const height = await save.evaluate(element => element.getBoundingClientRect().height);
    expect(height).toBeGreaterThanOrEqual(44);
    await expectNoDocumentOverflow(page, width);
  }
  // Never edit, reorder or save navigation during read-only visual test.
});
