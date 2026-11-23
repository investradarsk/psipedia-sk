import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("V5-04 Help workspace tabs, filters and mobile grid", async ({ page }, info) => {
  const mobile = info.project.name === "mobile-chromium";
  await page.setViewportSize({ width: mobile ? 390 : 1440, height: 850 });
  const response = await page.goto("/admin/pomoc-psom?category=adopcia", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);

  const tabs = page.getByRole("navigation", { name: "Typ pomoci" });
  await expect(tabs).toBeVisible();
  for (const label of ["Adopcie", "Stratené a nájdené", "Organizácie", "Ostatná pomoc"]) {
    const link = tabs.getByRole("link", { name: label });
    await expect(link).toBeVisible();
    if (mobile) {
      expect(await link.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    }
  }
  await expect(page.locator("[data-admin-help-unified-grid]")).toBeVisible();

  await tabs.getByRole("link", { name: "Ostatná pomoc" }).click();
  await expect(page).toHaveURL(/category=ostatna-pomoc/);
  const filters = page.getByRole("navigation", { name: "Podkategórie Pomoci psom" });
  await expect(filters.getByRole("link", { name: "Všetky prípady" })).toBeVisible();
  await filters.getByRole("link", { name: "Zbierky a výzvy" }).click();
  await expect(page).toHaveURL(/category=zbierky/);
  await expect(tabs.getByRole("link", { name: "Ostatná pomoc" })).toHaveAttribute("aria-current", "page");

  await page.getByRole("textbox", { name: "Hľadať v kategórii" }).fill("Bratislava");
  await page.getByRole("button", { name: "Hľadať", exact: true }).click();
  await expect(page).toHaveURL(/category=zbierky/);
  await expect(page).toHaveURL(/q=Bratislava/);
  await tabs.getByRole("link", { name: "Organizácie" }).click();
  await expect(page).toHaveURL(/category=organizacie/);
  await expect(page).toHaveURL(/q=Bratislava/);
  await expect(page.locator("[data-admin-help-unified-grid]")).toBeVisible();
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  )).toBe(true);
});
