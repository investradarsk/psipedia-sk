import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const cases = [
  { path: "/pomoc-psom/utulky/e2e-organizacia", title: "E2E pomocná organizácia", facts: "Typ organizácie" },
  { path: "/pomoc-psom/adopcia/e2e-adopcia", title: "Beny", facts: "Plemeno / typ" },
  { path: "/pomoc-psom/docasna-opatera/e2e-docasna-opatera", title: "Max", facts: "Organizácia" },
  { path: "/pomoc-psom/zbierky/e2e-zbierka", title: "E2E finančná výzva", facts: "Overenie" },
  { path: "/pomoc-psom/dobrovolnictvo/e2e-dobrovolnictvo", title: "E2E dobrovoľnícka výzva", facts: "Organizácia" },
] as const;

for (const entry of cases) {
  test(`${entry.path}: preserves public Help content, layout and accessibility`, async ({ page }) => {
    const response = await page.goto(entry.path, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    const main = page.locator("main#obsah");
    await expect(main.getByRole("heading", { level: 1, name: entry.title })).toBeVisible();
    await expect(main.locator("article")).toBeVisible();
    await expect(main.getByRole("complementary", { name: "Praktické informácie" })).toBeVisible();
    await expect(main.locator("dt", { hasText: entry.facts })).toHaveCount(1);
    await expect(main.getByRole("heading", { name: "Pomáhajte bezpečne" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
  });
}

test("contact actions and help options remain operable; absent data creates no empty cards", async ({ page }) => {
  await page.goto(cases[0].path);
  await expect(page.getByRole("link", { name: "+421 900 123 456" })).toHaveAttribute("href", "tel:+421900123456");
  await expect(page.getByRole("link", { name: "help-e2e@example.invalid" })).toHaveAttribute("href", "mailto:help-e2e@example.invalid");
  await expect(page.getByRole("link", { name: "https://example.org ↗" })).toHaveAttribute("href", "https://example.org/");
  await expect(page.getByText("venčenie", { exact: true })).toBeVisible();

  await page.goto(cases[2].path);
  await expect(page.getByRole("heading", { name: "Kontakty" })).toHaveCount(0);
  await expect(page.locator("dt", { hasText: "Vek" })).toHaveCount(0);
  await expect(page.getByText("Nezistené", { exact: true })).toHaveCount(0);

  await page.goto(cases[3].path);
  await expect(page.getByRole("heading", { name: "Stav zbierky" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Priebeh zbierky" })).toHaveAttribute("aria-valuenow", "35");
  await expect(page.getByRole("link", { name: /Podporiť/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Prečo odkaz nemusí byť dostupný" })).toBeVisible();
});
