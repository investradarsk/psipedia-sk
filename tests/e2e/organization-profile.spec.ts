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

async function setOrganizationProfileViewport(
  page: import("@playwright/test").Page,
  projectName: string,
) {
  await page.setViewportSize(
    projectName.includes("mobile")
      ? { width: 390, height: 844 }
      : { width: 1440, height: 900 },
  );
}

test.describe("organization public profile", () => {
  test("published canonical fixture renders public fields, adoption cards, layout and accessibility", async ({ page }, testInfo) => {
    await setOrganizationProfileViewport(page, testInfo.project.name);
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

    await expect(main.getByRole("heading", { name: "Psy na adopciu" })).toBeVisible();
    const cards = main.locator("[data-adoption-card]");
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toHaveAttribute("data-adoption-card", "org-3c-e2e-luna-rezervovana");
    await expect(cards.nth(1)).toHaveAttribute("data-adoption-card", "org-3b-e2e-neo-na-adopciu");

    const luna = main.locator('[data-adoption-card="org-3c-e2e-luna-rezervovana"]');
    await expect(luna).toContainText("E2E Luna rezervovaná");
    await expect(luna).toContainText("Rezervovaný");
    await expect(luna.locator('[data-adoption-media="fallback"]')).toHaveCount(1);
    await expect(luna.getByRole("link", { name: "Zobraziť profil", exact: true })).toHaveAttribute(
      "href",
      "/pomoc-psom/adopcia/org-3c-e2e-luna-rezervovana",
    );

    const neo = main.locator('[data-adoption-card="org-3b-e2e-neo-na-adopciu"]');
    await expect(neo).toContainText("E2E Neo na adopciu");
    await expect(neo).toContainText("Na adopciu");
    await expect(neo.locator('[data-adoption-media="fallback"]')).toHaveCount(1);
    await expect(neo.getByRole("link", { name: "Zobraziť profil", exact: true })).toHaveAttribute(
      "href",
      "/pomoc-psom/adopcia/org-3b-e2e-neo-na-adopciu",
    );
    await expect(main.getByText("E2E Skrytý draft", { exact: true })).toHaveCount(0);

    const media = luna.getByRole("link", { name: "Zobraziť profil E2E Luna rezervovaná" });
    const mediaBox = await media.boundingBox();
    expect(mediaBox).not.toBeNull();
    expect(Math.abs((mediaBox?.width ?? 0) / (mediaBox?.height ?? 1) - (4 / 3))).toBeLessThan(0.04);

    const ctaBox = await luna.getByRole("link", { name: "Zobraziť profil", exact: true }).boundingBox();
    expect(ctaBox).not.toBeNull();
    expect(ctaBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    for (const card of await cards.all()) {
      const overflow = await card.evaluate((element) => Math.max(0, element.scrollWidth - element.clientWidth));
      expect(overflow).toBeLessThanOrEqual(1);
    }

    await expectNoHorizontalOverflow(page);
    await expectNoSeriousAccessibilityViolations(page);
  });

  test("non-public, unknown and non-exact organization slugs fail closed", async ({ page }) => {
    for (const slug of [
      "org-3b-e2e-draft-organizacia",
      "org-3b-e2e-archivovana-organizacia",
      "org-3b-e2e-unknown-organizacia",
      "org-3b-e2e-kanonicka",
      "e2e-kanonicka-organizacia",
    ]) {
      const response = await page.goto(`/organizacie/${slug}`);
      expect(response?.status(), slug).toBe(404);
      expect(new URL(page.url()).pathname, slug).toBe(`/organizacie/${slug}`);
      await expect(page.getByRole("heading", { level: 1 }), slug).not.toHaveText(/E2E Kanonická organizácia/);
      await expectNoHorizontalOverflow(page);
    }
  });

  test("@production canonical route fails closed for an ineligible legacy-only slug", async ({ page }) => {
    const response = await page.goto("/organizacie/e2e-organizacia");

    expect(response?.status()).toBe(404);
    expect(new URL(page.url()).pathname).toBe("/organizacie/e2e-organizacia");
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(/e2e organizacia/i);
    await expectNoHorizontalOverflow(page);
  });
});
