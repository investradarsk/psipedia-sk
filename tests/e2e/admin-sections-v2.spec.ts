import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function expectAxeClean(page: import("@playwright/test").Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  expect(violations, violations.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("section management explains hierarchy, counts and secondary settings", async ({ page }) => {
  const response = await page.goto("/admin/sekcie", { waitUntil: "domcontentloaded" });
  expect(response).not.toBeNull();
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByRole("heading", { name: "Sekcie a podsekcie", exact: true })).toBeVisible();
  await expect(page.getByTestId("admin-section-management")).toBeVisible();
  await expect(page.getByText("Hlavná sekcia").first()).toBeVisible();
  await expect(page.getByText(/podsekcií/).first()).toBeVisible();

  const firstToggle = page.locator("button[aria-controls^='section-editor-']").first();
  if ((await firstToggle.getAttribute("aria-expanded")) !== "true") await firstToggle.click();

  const settings = page.getByRole("button", { name: "Nastavenia", exact: true }).first();
  await settings.click();
  const drawer = page.locator("dialog[data-admin-drawer]");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("SEO title", { exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: "Zavrieť panel" }).click();
  await expect(settings).toBeFocused();

  await expectAxeClean(page);
});

test("section management stays inside the 390px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/admin/sekcie", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByTestId("admin-section-management")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const interactive = page.locator("[data-testid='admin-section-management'] button:visible, [data-testid='admin-section-management'] a:visible");
  const count = await interactive.count();
  for (let index = 0; index < Math.min(count, 12); index += 1) {
    const box = await interactive.nth(index).boundingBox();
    if (box) expect(box.height).toBeGreaterThanOrEqual(44);
  }
});
