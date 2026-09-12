import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("adoption catalog", () => {
  test("renders filters, status separation and passes critical accessibility", async ({ page }) => {
    await page.goto("/pomoc-psom/adopcia");
    await expect(page.getByRole("heading", { name: "Psy na adopciu", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Aktívne adopcie" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Rezervované" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Adoptované" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Filtre adopcií" })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("faceted catalog remains usable", async ({ page }) => {
    await page.goto("/pomoc-psom/adopcia?kraj=Nitriansky+kraj&pohlavie=MALE&deti=1");
    await expect(page.getByRole("heading", { name: "Psy na adopciu", level: 1 })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Kraj" })).toHaveValue("Nitriansky kraj");
    await expect(page.getByRole("combobox", { name: "Pohlavie" })).toHaveValue("MALE");
    await expect(page.getByRole("checkbox", { name: /k deťom/i })).toBeChecked();
  });
});
