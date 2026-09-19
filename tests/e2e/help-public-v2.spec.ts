import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function expectNoAxeViolations(page: Page) {
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
}

test("Help landing is compact, canonical, accessible and touch-safe", async ({ page }) => {
  const response = await page.goto("/pomoc-psom", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Pomoc psom" })).toBeVisible();

  const categoryNav = page.locator("[data-help-category-nav]");
  await expect(categoryNav.locator("a")).toHaveCount(6);
  await expect(categoryNav.getByRole("link", { name: /Psy na adopciu/ })).toHaveAttribute("href", "/pomoc-psom/adopcia");
  await expect(categoryNav.getByRole("link", { name: /Stratené a nájdené psy/ })).toHaveAttribute("href", "/pomoc-psom/stratene-psy");
  await expect(categoryNav.getByRole("link", { name: /Útulky a organizácie/ })).toHaveAttribute("href", "/pomoc-psom/utulky");

  await expect(page.getByRole("form", { name: "Filtrovať pomoc" })).toBeVisible();
  await expect(page.getByPlaceholder("Meno, mesto alebo organizácia")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Kraj" })).toBeVisible();

  const targets = await categoryNav.locator("a").evaluateAll((links) => links.map((link) => {
    const rect = link.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  for (const target of targets) {
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  }

  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);
});

test("Help category flows preserve dedicated domains and canonical organization profiles", async ({ page }) => {
  await page.goto("/pomoc-psom/utulky", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Útulky a organizácie" })).toBeVisible();
  await expect(page.locator('a[href="/organizacie/e2e-organizacia"]').first()).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("/pomoc-psom/docasna-opatera", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Dočasná opatera" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "E2E dočasná opatera", exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("/pomoc-psom/stratene-a-najdene", { waitUntil: "domcontentloaded" });
  expect(new URL(page.url()).pathname).toBe("/pomoc-psom/stratene-psy");
  await expect(page.getByRole("heading", { level: 1, name: "Stratené psy" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("canonical adoption cards expose organization context without changing lifecycle filters", async ({ page }) => {
  await page.goto("/pomoc-psom/adopcia", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Psy na adopciu" })).toBeVisible();
  await expect(page.getByRole("link", { name: "E2E Rex", exact: true })).toBeVisible();
  await expect(page.getByText(/E2E útulok Nitra/).first()).toBeVisible();
  await expect(page.getByLabel("Stav")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);
});
