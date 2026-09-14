import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const longServicesDetailName = "E2E Centrum komplexného výcviku, socializácie a behaviorálneho poradenstva pre psy";

test.describe("public services detail shell", () => {
  test("long profile renders statuses, CTA hierarchy and rich content without overflow", async ({ page }) => {
    const response = await page.goto("/adresar/treneri/e2e-services-detail-long", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const main = page.locator("main#obsah");
    const heading = main.getByRole("heading", { level: 1, name: longServicesDetailName });
    await expect(heading).toBeVisible();
    await expect(main.getByText("Tréner / psia škola", { exact: true })).toBeVisible();
    await expect(main.getByText("Overené", { exact: true })).toBeVisible();
    await expect(main.getByText("Odporúčame", { exact: true })).toBeVisible();
    await expect(main.getByRole("link", { name: "Poslať dopyt", exact: true })).toHaveAttribute("href", "#kontakt");
    await expect(main.getByRole("link", { name: "Zavolať", exact: true })).toHaveAttribute("href", "tel:+421900123456");
    await expect(main.getByRole("heading", { name: "Služby", exact: true })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Kontakt", exact: true })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Praktické informácie", exact: true })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Odborné údaje", exact: true })).toBeVisible();
    await expect(main.getByText("Nitra a okolie", { exact: true })).toBeVisible();

    expect(await heading.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    const accessibility = await new AxeBuilder({ page })
      .include("main#obsah")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
  });

  test("minimum profile omits absent image, contacts, optional sections and placeholder values", async ({ page }) => {
    const response = await page.goto("/adresar/dalsie-sluzby/e2e-services-detail-minimum", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const main = page.locator("main#obsah");
    await expect(main.getByRole("heading", { level: 1, name: "E2E Minimálna služba" })).toBeVisible();
    await expect(main.getByText("Služba pre psov", { exact: true })).toBeVisible();
    await expect(main.getByText("Overené", { exact: true })).toHaveCount(0);
    await expect(main.getByText("Odporúčame", { exact: true })).toHaveCount(0);
    await expect(main.getByRole("heading", { name: "Služby", exact: true })).toHaveCount(0);
    await expect(main.getByRole("heading", { name: "Kvalifikácie a zameranie", exact: true })).toHaveCount(0);
    await expect(main.getByRole("heading", { name: "Kontakt", exact: true })).toHaveCount(0);
    await expect(main.getByRole("heading", { name: "Odborné údaje", exact: true })).toHaveCount(0);
    await expect(main.getByRole("heading", { name: "Praktické informácie", exact: true })).toBeVisible();
    await expect(main.locator('img[alt^="Fotografia služby"]')).toHaveCount(0);
    await expect(main.getByRole("link", { name: "Zavolať", exact: true })).toHaveCount(0);
    await expect(main.getByRole("link", { name: "Web ↗", exact: true })).toHaveCount(0);
    await expect(main.getByRole("link", { name: "Navigovať ↗", exact: true })).toHaveCount(0);
    await expect(main.getByText("N/A", { exact: true })).toHaveCount(0);
    await expect(main.getByText("Neuvedené", { exact: true })).toHaveCount(0);
    await expect(main.getByText("Nezistené", { exact: true })).toHaveCount(0);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    const accessibility = await new AxeBuilder({ page })
      .include("main#obsah")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
  });
});
