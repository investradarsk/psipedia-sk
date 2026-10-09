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
    await expect(main.locator("header").getByText("Tréner / psia škola", { exact: true })).toBeVisible();
    const basicInformation = main.getByRole("heading", { name: "Základné informácie", exact: true }).locator("xpath=ancestor::section[1]");
    await expect(basicInformation.getByText("Typ profilu", { exact: true })).toBeVisible();
    await expect(basicInformation.getByText("Tréner / psia škola", { exact: true })).toBeVisible();
    await expect(basicInformation.getByText("Telefón", { exact: true })).toBeVisible();
    await expect(basicInformation.getByRole("link", { name: "+421 900 123 456", exact: true })).toHaveAttribute("href", "tel:+421900123456");
    await expect(main.getByText("Overené", { exact: true })).toHaveCount(0);
    await expect(main.getByText("Odporúčame", { exact: true })).toBeVisible();
    await expect(main.getByRole("link", { name: "Poslať dopyt", exact: true })).toHaveAttribute("href", "#kontakt");
    await expect(main.getByRole("link", { name: "Zavolať", exact: true })).toHaveAttribute("href", "tel:+421900123456");
    await expect(main.getByRole("heading", { name: "Služby", exact: true })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Kontakt", exact: true })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Praktické informácie", exact: true })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Odborné údaje", exact: true })).toBeVisible();
    await expect(main.getByText("Nitra a okolie", { exact: true })).toBeVisible();
    await expect(main.getByRole("link", { name: "Facebook ↗", exact: true })).toHaveAttribute("href", "https://facebook.com/example");
    await expect(main.getByRole("link", { name: "Instagram ↗", exact: true })).toHaveAttribute("href", "https://instagram.com/example");

    const schemaText = (await page.locator('script[type="application/ld+json"]').allTextContents()).join("\n");
    expect(schemaText, "SERVICES-PUBLIC structured data").toContain('"@type":"LocalBusiness"');
    expect(schemaText).toContain('"telephone":"+421 900 123 456"');
    expect(schemaText).toContain('"email":"detail-e2e@example.invalid"');
    expect(schemaText).toContain("https://facebook.com/example");
    expect(schemaText).toContain("https://instagram.com/example");
    expect(schemaText).not.toContain("AggregateRating");

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
    await expect(main.locator("header").getByText("Služba pre psov", { exact: true })).toBeVisible();
    const basicInformation = main.getByRole("heading", { name: "Základné informácie", exact: true }).locator("xpath=ancestor::section[1]");
    await expect(basicInformation.getByText("Typ profilu", { exact: true })).toBeVisible();
    await expect(basicInformation.getByText("Služba pre psov", { exact: true })).toBeVisible();
    await expect(basicInformation.getByText("Telefón", { exact: true })).toHaveCount(0);
    await expect(basicInformation.getByText("E-mail", { exact: true })).toHaveCount(0);
    await expect(basicInformation.getByText("Web", { exact: true })).toHaveCount(0);
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

  test("Health variant renders rich veterinary data from existing fields only", async ({ page }) => {
    const response = await page.goto("/adresar/veterinari/health-fixture-vet-rich", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const main = page.locator("main#obsah");
    await expect(main.getByRole("heading", { level: 1, name: "Health veterinárna klinika" })).toBeVisible();
    const healthHeading = main.getByRole("heading", { name: "Veterinárna starostlivosť a vybavenie", exact: true });
    await expect(healthHeading).toBeVisible();
    const healthSection = healthHeading.locator("xpath=ancestor::section[1]");
    await expect(healthSection.getByText("Špecializácie", { exact: true })).toBeVisible();
    await expect(healthSection.getByText("Interná medicína, chirurgia", { exact: true })).toBeVisible();
    await expect(healthSection.getByText("Pohotovosť", { exact: true })).toBeVisible();
    await expect(healthSection.getByText("Hospitalizácia", { exact: true })).toBeVisible();
    await expect(healthSection.getByText("Digitálne RTG", { exact: true })).toBeVisible();
    await expect(healthSection.getByText("Interné laboratórium", { exact: true })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Odborné údaje", exact: true })).toHaveCount(0);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const accessibility = await new AxeBuilder({ page })
      .include("main#obsah")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
  });

  test("Health variant omits veterinary section when only placeholder data exists", async ({ page }) => {
    const response = await page.goto("/adresar/veterinari/health-fixture-vet-minimum", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const main = page.locator("main#obsah");
    await expect(main.getByRole("heading", { level: 1, name: "Health veterinár minimum" })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Veterinárna starostlivosť a vybavenie", exact: true })).toHaveCount(0);
    await expect(main.getByRole("heading", { name: "Odborné údaje", exact: true })).toHaveCount(0);
    await expect(main.getByText("Neuvedené", { exact: true })).toHaveCount(0);
    await expect(main.getByText("Neoverené", { exact: true })).toHaveCount(0);
    await expect(main.getByText("Nezistené", { exact: true })).toHaveCount(0);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const accessibility = await new AxeBuilder({ page })
      .include("main#obsah")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
  });

  test("Health variant renders physiotherapy therapies and rehabilitation data", async ({ page }) => {
    const response = await page.goto("/adresar/fyzioterapia/health-fixture-fyzioterapia", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const main = page.locator("main#obsah");
    await expect(main.getByRole("heading", { level: 1, name: "Health fyzioterapia" })).toBeVisible();
    const healthHeading = main.getByRole("heading", { name: "Terapie a rehabilitácia", exact: true });
    await expect(healthHeading).toBeVisible();
    const healthSection = healthHeading.locator("xpath=ancestor::section[1]");
    await expect(healthSection.getByText("Hydroterapia", { exact: true })).toBeVisible();
    await expect(healthSection.getByText("Laserterapia", { exact: true })).toBeVisible();
    await expect(healthSection.getByText("Mäkké a mobilizačné techniky", { exact: true })).toBeVisible();
    await expect(healthSection.getByText("Pooperačná rehabilitácia", { exact: true })).toBeVisible();
    await expect(healthSection.getByText("Ortopedickí pacienti", { exact: true })).toBeVisible();
    await expect(healthSection.getByText("Veterinárny fyzioterapeut", { exact: true })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Odborné údaje", exact: true })).toHaveCount(0);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const accessibility = await new AxeBuilder({ page })
      .include("main#obsah")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
  });

  test("existing breed and organization relations on a public profile are visible", async ({ page }) => {
    const response = await page.goto("/adresar/treneri/e2e-services-detail-long", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const main = page.locator("main#obsah");
    await expect(main.getByRole("heading", { level: 1, name: "E2E Centrum komplexného výcviku, socializácie a behaviorálneho poradenstva pre psy" })).toBeVisible();
    const facts = main.getByRole("heading", { name: "Odborné údaje", exact: true }).locator("xpath=ancestor::section[1]");
    await expect(facts.getByText("Plemeno", { exact: true })).toBeVisible();
    await expect(facts.getByText("Labradorský retriever", { exact: true })).toBeVisible();
    await expect(facts.getByText("Organizácia", { exact: true })).toBeVisible();
    await expect(facts.getByText("Fixture klub", { exact: true })).toBeVisible();
  });

});

test("PUBLIC-PROFILE-UX-UNIFICATION-1: responsive service profile puts contacts first without hiding specialist data", async ({ page }) => {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width < 900 ? 844 : 900 });
    const response = await page.goto("/adresar/treneri/e2e-services-detail-long", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    const main = page.locator("main#obsah");
    const hero = main.locator("[data-public-profile-hero]");
    const aside = main.locator("[data-public-profile-sidebar]");
    const body = main.locator("[data-public-profile-body]");
    await expect(hero.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Služby", exact: true })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Kontakt", exact: true })).toBeVisible();
    const action = hero.locator("[data-profile-primary-action]");
    await expect(action).toHaveAttribute("href", "#kontakt");
    const actionBox = await action.boundingBox();
    expect(actionBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(actionBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    const asideBox = await aside.boundingBox();
    const bodyBox = await body.boundingBox();
    expect(asideBox).not.toBeNull();
    expect(bodyBox).not.toBeNull();
    if (width < 900) {
      expect((asideBox?.y ?? 0) + (asideBox?.height ?? 0)).toBeLessThanOrEqual((bodyBox?.y ?? 0) + 2);
    } else {
      expect(asideBox?.x ?? 0).toBeGreaterThan(bodyBox?.x ?? 0);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const accessibility = await new AxeBuilder({ page }).include("main#obsah")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/adresar/dalsie-sluzby/e2e-services-detail-minimum", { waitUntil: "domcontentloaded" });
  const minimum = page.locator("main#obsah");
  await expect(minimum.locator("[data-public-profile-media]")).toHaveCount(0);
  await expect(minimum.getByRole("heading", { name: "Kontakt", exact: true })).toHaveCount(0);
  await expect(minimum.locator("[data-profile-primary-action]")).toHaveAttribute("href", "#kontakt");
});
