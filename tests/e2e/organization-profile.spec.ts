import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectNoSeriousAccessibilityViolations(page: import("@playwright/test").Page) {
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const seriousOrCritical = accessibility.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  expect(seriousOrCritical, JSON.stringify(seriousOrCritical, null, 2)).toEqual([]);
}

test.describe("organization public profile", () => {
  test("published canonical fixture renders public fields, relation, layout and accessibility", async ({ page }) => {
    const response = await page.goto("/organizacie/org-3b-e2e-kanonicka-organizacia", {
      waitUntil: "domcontentloaded",
    });

    expect(response?.status()).toBe(200);
    const main = page.locator("main#obsah");
    await expect(main.getByRole("heading", { level: 1, name: "E2E Kanonická organizácia" })).toBeVisible();
    await expect(main.getByText("Izolovaný lokálny CI profil pre ORG-3B.", { exact: true })).toBeVisible();
    await expect(main.getByText("Pomáhame psom v núdzi a hľadáme im bezpečné domovy.", { exact: true })).toBeVisible();
    await expect(main.getByRole("navigation", { name: "Drobečková navigácia" })).toContainText(
      "Domov›Organizácie›E2E Kanonická organizácia",
    );

    await expect(main.getByRole("link", { name: "org3b-e2e@example.invalid" })).toHaveAttribute(
      "href",
      "mailto:org3b-e2e@example.invalid",
    );
    await expect(main.getByRole("link", { name: "+421 900 987 654" })).toHaveAttribute(
      "href",
      "tel:+421900987654",
    );
    await expect(main.getByRole("link", { name: /https:\/\/example\.org\/organization/ })).toHaveAttribute(
      "href",
      "https://example.org/organization",
    );
    await expect(main.getByText("https://provenance.example.invalid/internal-only", { exact: true })).toHaveCount(0);

    const adoption = main.getByRole("link", { name: /E2E Neo na adopciu/ });
    await expect(adoption).toHaveAttribute("href", "/pomoc-psom/adopcia/org-3b-e2e-neo-na-adopciu");
    await expect(adoption).toContainText("Na adopciu");

    await expectNoHorizontalOverflow(page);
    await expectNoSeriousAccessibilityViolations(page);
  });

  test("@production canonical route fails closed for an ineligible legacy-only slug", async ({ page }) => {
    const response = await page.goto("/organizacie/e2e-organizacia");

    expect(response?.status()).toBe(404);
    expect(new URL(page.url()).pathname).toBe("/organizacie/e2e-organizacia");
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(/e2e organizacia/i);
    await expectNoHorizontalOverflow(page);
  });
});
