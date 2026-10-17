import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function expectAxeClean(page: import("@playwright/test").Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = result.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  expect(serious, serious.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("article admin search finds an accented article beyond page one and keeps URL state", async ({ page }) => {
  const response = await page.goto("/admin/clanky", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);

  const filterForm = page.locator('form[role="search"][action="/admin/clanky"]');
  const search = filterForm.getByPlaceholder("Názov, slug, perex alebo téma");
  // Verify the actual V3 layout at 1440px; do not bypass pointer hit-testing.
  await page.setViewportSize({ width: 1440, height: 900 });
  await search.fill("zubky");
  await filterForm.locator('select[name="status"]').selectOption("draft");
  await filterForm.locator('select[name="section"]').selectOption("clanky");
  const submit = filterForm.getByRole("button", { name: "Filtrovať" });
  await expect(submit).toBeInViewport();
  await submit.click();

  await expect(page).toHaveURL(/query=zubky/);
  await expect(page).toHaveURL(/status=draft/);
  await expect(page).toHaveURL(/section=clanky/);
  await expect(page.getByRole("heading", { name: "Žlté zúbky ADMIN SEARCH cieľ" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Nájdené" })).toContainText("Nájdené: 1");

  await page.reload({ waitUntil: "domcontentloaded" });
  const restoredFilterForm = page.locator('form[role="search"][action="/admin/clanky"]');
  await expect(restoredFilterForm.getByPlaceholder("Názov, slug, perex alebo téma")).toHaveValue("zubky");
  await expect(restoredFilterForm.locator('select[name="status"]')).toHaveValue("draft");
  await expect(restoredFilterForm.locator('select[name="section"]')).toHaveValue("clanky");
  await expect(page.getByRole("heading", { name: "Žlté zúbky ADMIN SEARCH cieľ" })).toBeVisible();

  await page.getByRole("heading", { name: "Žlté zúbky ADMIN SEARCH cieľ" }).getByRole("link").click();
  await expect(page).toHaveURL(/\/admin\/clanky\/973061/);
});

test("article admin list is keyboard-usable, axe-clean and fits desktop/mobile viewports", async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile-chromium") await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/admin/clanky?query=ADMIN+SEARCH&status=draft&page=2", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);
  const search = page.getByPlaceholder("Názov, slug, perex alebo téma");
  await search.focus();
  await expect(search).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: "Nájdené" })).toContainText("61");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectAxeClean(page);
  if (testInfo.project.name === "mobile-chromium") {
    await page.setViewportSize({ width: 320, height: 800 });
    await expect(page.locator('form[role="search"][action="/admin/clanky"]').getByRole("button", { name: "Filtrovať" })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
