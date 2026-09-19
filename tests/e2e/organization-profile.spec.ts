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

    await expect(main.getByRole("heading", { name: "Ako môžete pomôcť" })).toBeVisible();
    const fundraisingCards = main.locator("[data-fundraising-method]");
    await expect(fundraisingCards).toHaveCount(3);
    await expect(fundraisingCards.nth(0)).toHaveAttribute("data-fundraising-method", "990201");
    await expect(fundraisingCards.nth(1)).toHaveAttribute("data-fundraising-method", "990202");
    await expect(fundraisingCards.nth(2)).toHaveAttribute("data-fundraising-method", "990203");

    const donation = main.locator('[data-fundraising-method="990201"]');
    await expect(donation).toContainText("Podporte našu starostlivosť");
    await expect(donation.getByRole("link", { name: /Otvoriť stránku podpory/ })).toHaveAttribute(
      "href",
      "https://example.org/support",
    );

    const bank = main.locator('[data-fundraising-method="990202"]');
    await expect(bank).toContainText("GB82 WEST 1234 5698 7654 32");
    await expect(bank).toContainText("dlhší syntetický text");

    const material = main.locator('[data-fundraising-method="990203"]');
    await expect(material).toContainText("Materiálna pomoc s veľmi dlhým názvom");
    await expect(material).toContainText("Granule, deky a hygienické potreby");

    for (const hidden of [
      "ORG-7E skrytá neaktívna metóda",
      "ORG-7E skrytá rejected metóda",
      "ORG-7E skrytá expired metóda",
      "ORG-7E citlivý príjemca – NESMIE BYŤ V HTML",
      "ORG-7E bank beneficiary – NESMIE BYŤ V HTML",
      "org7e-verifier@example.invalid",
      "internal-verification-source",
    ]) {
      await expect(main.getByText(hidden, { exact: false })).toHaveCount(0);
    }

    for (const card of await fundraisingCards.all()) {
      const overflow = await card.evaluate((element) => Math.max(0, element.scrollWidth - element.clientWidth));
      expect(overflow).toBeLessThanOrEqual(1);
    }
    const fundraisingCtaBox = await donation.getByRole("link", { name: /Otvoriť stránku podpory/ }).boundingBox();
    expect(fundraisingCtaBox).not.toBeNull();
    expect(fundraisingCtaBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    await expect(main.locator("[data-organization-location-summary]")).toHaveCount(0);
    const locations = main.locator("[data-organization-location]");
    await expect(locations).toHaveCount(2);
    await expect(locations.nth(0)).toHaveAttribute("data-organization-location", "990101");
    await expect(locations.nth(0)).toContainText("Pôsobnosť");
    await expect(locations.nth(0)).toContainText("Šaľa · Nitriansky kraj");
    await expect(locations.nth(0)).toContainText("Hlavná lokalita");
    await expect(locations.nth(1)).toHaveAttribute("data-organization-location", "990102");
    await expect(locations.nth(1)).toContainText("Výdajné miesto");
    await expect(locations.nth(1)).toContainText("Nitra · Nitriansky kraj");
    await expect(main.getByText("Legacy mesto", { exact: true })).toHaveCount(0);
    for (const location of await locations.all()) {
      const box = await location.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.height ?? 0).toBeLessThan(180);
      const overflow = await location.evaluate((element) => Math.max(0, element.scrollWidth - element.clientWidth));
      expect(overflow).toBeLessThanOrEqual(1);
    }

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

    const adoptionDetailPage = await page.context().newPage();
    await setOrganizationProfileViewport(adoptionDetailPage, testInfo.project.name);
    const adoptionResponse = await adoptionDetailPage.goto("/pomoc-psom/adopcia/org-3b-e2e-neo-na-adopciu", {
      waitUntil: "domcontentloaded",
    });
    expect(adoptionResponse?.status()).toBe(200);
    const adoptionMain = adoptionDetailPage.locator("main#obsah");
    await expect(adoptionMain.getByRole("link", { name: "E2E Kanonická organizácia", exact: true })).toHaveAttribute(
      "href",
      "/organizacie/org-3b-e2e-kanonicka-organizacia",
    );
    await expectNoHorizontalOverflow(adoptionDetailPage);
    await expectNoSeriousAccessibilityViolations(adoptionDetailPage);

    const draftOrganizationResponse = await adoptionDetailPage.goto(
      "/pomoc-psom/adopcia/org-3c-e2e-pes-draft-organizacie",
      { waitUntil: "domcontentloaded" },
    );
    expect(draftOrganizationResponse?.status()).toBe(200);
    const draftOrganizationMain = adoptionDetailPage.locator("main#obsah");
    await expect(draftOrganizationMain.getByText("E2E Draft organizácia", { exact: true })).toBeVisible();
    await expect(draftOrganizationMain.getByRole("link", { name: "E2E Draft organizácia", exact: true })).toHaveCount(0);
    await adoptionDetailPage.close();

    await expectNoHorizontalOverflow(page);
    await expectNoSeriousAccessibilityViolations(page);
  });

  test("single canonical location stays compact and empty location data renders no placeholder", async ({ page }, testInfo) => {
    await setOrganizationProfileViewport(page, testInfo.project.name);

    const singleResponse = await page.goto("/organizacie/org-2b-e2e-jedna-lokalita", {
      waitUntil: "domcontentloaded",
    });
    expect(singleResponse?.status()).toBe(200);
    const singleMain = page.locator("main#obsah");
    await expect(singleMain.getByRole("heading", { level: 1, name: "E2E Jedna lokalita" })).toBeVisible();
    const locationSummary = singleMain.locator("[data-organization-location-summary]");
    await expect(locationSummary).toContainText("Prevádzka · Trnava · Trnavský kraj");
    await expect(locationSummary.locator("svg")).toHaveCount(1);
    await expect(singleMain.locator("[data-organization-location]")).toHaveCount(0);
    await expect(singleMain.getByText("Legacy mesto", { exact: true })).toHaveCount(0);
    await expect(singleMain.getByRole("heading", { name: "Ako môžete pomôcť" })).toBeVisible();
    const singleFundraising = singleMain.locator("[data-fundraising-method]");
    await expect(singleFundraising).toHaveCount(1);
    await expect(singleFundraising).toHaveAttribute("data-fundraising-method", "990207");
    await expect(singleFundraising).toContainText("Transparentný účet");
    await expect(singleFundraising.getByRole("link", { name: /Otvoriť transparentný účet/ })).toHaveAttribute(
      "href",
      "https://example.org/transparent",
    );
    await expectNoHorizontalOverflow(page);

    const emptyResponse = await page.goto("/organizacie/org-2b-e2e-bez-lokality", {
      waitUntil: "domcontentloaded",
    });
    expect(emptyResponse?.status()).toBe(200);
    const emptyMain = page.locator("main#obsah");
    await expect(emptyMain.getByRole("heading", { level: 1, name: "E2E Bez lokality" })).toBeVisible();
    await expect(emptyMain.locator("[data-organization-location-summary]")).toHaveCount(0);
    await expect(emptyMain.locator("[data-organization-location]")).toHaveCount(0);
    await expect(emptyMain.getByRole("heading", { name: "Kde organizácia pôsobí" })).toHaveCount(0);
    await expect(emptyMain.getByRole("heading", { name: "Ako môžete pomôcť" })).toHaveCount(0);
    await expect(emptyMain.locator("[data-organization-fundraising]")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
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

test.describe("organization location admin CRUD", () => {
  test("admin create/edit/primary/delete updates the canonical ORG-2B read without overflow", async ({ page }, testInfo) => {
    const configuredBase = process.env.E2E_BASE_URL;
    if (configuredBase) {
      const hostname = new URL(configuredBase).hostname;
      test.skip(!["localhost", "127.0.0.1", "::1"].includes(hostname), "Mutating ORG-2C E2E runs only against isolated local D1.");
    }

    await setOrganizationProfileViewport(page, testInfo.project.name);
    const response = await page.goto("/admin/organizacie/990007", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1, name: "E2E Jedna lokalita" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Lokality", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Uložiť organizáciu" })).toBeEnabled();

    const stalePrefix = `ORG-2C ${testInfo.project.name}`;
    for (;;) {
      const stale = page.locator("[data-location-id]").filter({ hasText: stalePrefix });
      if (await stale.count() === 0) break;
      page.once("dialog", (dialog) => dialog.accept());
      await stale.first().getByRole("button", { name: "Odstrániť lokalitu" }).click();
      await expect(page.getByRole("status")).toContainText("Lokalita bola odstránená");
    }

    const create = page.locator("[data-location-create]");
    const suffix = `${stalePrefix} r${testInfo.retry}`;
    await create.getByLabel("Typ lokality").selectOption("SERVICE_AREA");
    await create.getByLabel("Názov / štítok").fill(suffix);
    await create.getByLabel("Adresa").fill("Neverejná ORG-2C 1");
    await create.getByLabel("Mesto").fill("Bratislava");
    await create.getByLabel("Okres").fill("Bratislava");
    await create.getByLabel("Kraj", { exact: true }).fill("Bratislavský kraj");
    await create.getByLabel("Kód krajiny").fill("SK");
    await create.getByLabel("Poradie").fill("-10");
    await create.getByLabel("Hlavná lokalita").check();
    await create.getByRole("button", { name: "Pridať lokalitu" }).click();
    await expect(page.getByRole("status")).toContainText("Lokalita bola pridaná");

    let created = page.locator("[data-location-id]").filter({ hasText: suffix });
    await expect(created).toBeVisible();
    await expect(created.getByLabel("Hlavná lokalita")).toBeChecked();
    const original = page.locator('[data-location-id="990107"]');
    await expect(original.getByLabel("Hlavná lokalita")).not.toBeChecked();

    await created.getByLabel("Názov / štítok").fill(`${suffix} upravená`);
    await created.getByLabel("Mesto").fill("Košice");
    await created.getByLabel("Okres").fill("Košice");
    await created.getByLabel("Kraj", { exact: true }).fill("Košický kraj");
    await created.getByLabel("Poradie").fill("-20");
    await created.getByRole("button", { name: "Uložiť lokalitu" }).click();
    await expect(page.getByRole("status")).toContainText("Lokalita bola uložená");

    await page.goto(`/organizacie/org-2b-e2e-jedna-lokalita?org2c=${testInfo.project.name}-${testInfo.retry}`, { waitUntil: "domcontentloaded" });
    const publicLocations = page.locator("[data-organization-location]");
    await expect(publicLocations).toHaveCount(2);
    await expect(publicLocations.nth(0)).toContainText(`${suffix} upravená`);
    await expect(publicLocations.nth(0)).toContainText("Košice");
    await expect(publicLocations.nth(0)).toContainText("Hlavná lokalita");
    await expect(page.getByText("Neverejná ORG-2C 1", { exact: true })).toHaveCount(0);

    await page.goto("/admin/organizacie/990007", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Uložiť organizáciu" })).toBeEnabled();
    created = page.locator("[data-location-id]").filter({ hasText: `${suffix} upravená` });
    page.once("dialog", (dialog) => dialog.accept());
    await created.getByRole("button", { name: "Odstrániť lokalitu" }).click();
    await expect(page.getByRole("status")).toContainText("Lokalita bola odstránená");
    await expect(page.locator('[data-location-id="990107"]').getByLabel("Hlavná lokalita")).not.toBeChecked();

    const restored = page.locator('[data-location-id="990107"]');
    await restored.getByLabel("Hlavná lokalita").check();
    await restored.getByRole("button", { name: "Uložiť lokalitu" }).click();
    await expect(page.getByRole("status")).toContainText("Lokalita bola uložená");

    await expectNoHorizontalOverflow(page);
    await expectNoSeriousAccessibilityViolations(page);
  });
});
