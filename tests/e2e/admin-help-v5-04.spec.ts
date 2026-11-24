import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("V6-04 shared profile tabs and retained quick editing", async ({ page }, info) => {
  const mobile = info.project.name === "mobile-chromium";
  await page.setViewportSize({ width: mobile ? 390 : 1440, height: 850 });
  const response = await page.goto("/admin/pomoc-psom?category=zbierky&q=Bratislava", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const tabs = page.getByRole("navigation", { name: "Typy profilov" });
  await expect(tabs.getByRole("link", { name: "Ostatná pomoc" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("[data-admin-help-unified-grid]")).toBeVisible();
  const filters = page.getByRole("navigation", { name: "Podkategórie Pomoci psom" });
  await expect(filters.getByRole("link", { name: "Zbierky a výzvy" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Podrobný zoznam" }).click();
  await expect(page).toHaveURL(/\/admin\/pomoc\?/);
  await expect(page).toHaveURL(/category=zbierky/);
  await expect(page).toHaveURL(/q=Bratislava/);
  await expect(page.locator("[data-admin-list-filters]")).toBeVisible();
  await tabs.getByRole("link", { name: "Organizácie a útulky" }).click();
  await expect(page).toHaveURL(/\/admin\/organizacie$/);
  await expect(page.locator("[data-admin-profile-create]")).toHaveAttribute("href", "/admin/organizacie/novy");
  await page.getByRole("link", { name: "Rýchla úprava" }).click();
  await expect(page).toHaveURL(/category=organizacie/);
  await expect(page.locator("[data-admin-help-unified-grid]")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
