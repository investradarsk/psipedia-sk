import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("Gemini V3 desktop/mobile workspace renders all 22 options without horizontal overflow", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile-chromium";
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  const response = await page.goto("/admin/automatizacie-gemini", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByRole("heading", { name: "Automatizácie Gemini" })).toBeVisible();
  const category = page.getByLabel("Kategória", { exact: true });
  await expect(category.locator("option")).toHaveCount(22);
  await expect(page.getByRole("heading", { name: "História behov" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Koncepty z automatizácie" })).toBeVisible();

  const values = await category.locator("option").evaluateAll((elements) =>
    elements.map((el) => (el as HTMLOptionElement).value),
  );
  expect(new Set(values).size).toBe(22);
  await category.selectOption(values[1]);
  await expect(category).toHaveValue(values[1]);
  await expect(page.getByRole("link", { name: "Upraviť prompt" })).toHaveAttribute(
    "href", new RegExp("stable_key="),
  );
  // Do not click the paid Gemini queue action: e2e is read-only.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.screenshot({
    path: mobile
      ? ".e2e-artifacts/gemini-dashboard-v3/mobile-390.png"
      : ".e2e-artifacts/gemini-dashboard-v3/desktop-1440.png",
    fullPage: true,
  });
});
