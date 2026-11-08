import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const LONG = "/adresar/treneri/e2e-services-detail-long";
const MINIMUM = "/adresar/dalsie-sluzby/e2e-services-detail-minimum";
const PHOTO = "[data-public-profile-media]";
const contact = "Adresa a kontakt";

async function openProfile(page: Page, href: string) {
  const response = await page.goto(href, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator("main#obsah")).toBeVisible();
  return page.locator("main#obsah");
}

async function assertAccessible(page: Page) {
  const result = await new AxeBuilder({ page }).include("main#obsah")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
}

async function assertNoOverflow(page: Page) {
  const width = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(width.document, JSON.stringify(width)).toBeLessThanOrEqual(width.viewport + 1);
}

test.describe("PSIPEDIA-SERVICES-PROFILE-UX-1", () => {
  test("all requested widths have responsive split / media-first details, correct section order and working CTAs", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "One explicit viewport matrix is sufficient.");
    for (const width of [320, 390, 430, 768, 1180, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const main = await openProfile(page, LONG);
      const hero = main.locator("[data-directory-profile-hero]");
      const heading = hero.getByRole("heading", { level: 1 });
      await expect(heading).toBeVisible();
      await expect(main.getByText("Overené", { exact: true })).toHaveCount(0);
      await expect(main.getByText("Odporúčame", { exact: true })).toBeVisible();

      if (await hero.locator(PHOTO).count()) {
        const photoY = await hero.locator(PHOTO).evaluate((node) => node.getBoundingClientRect().top);
        const titleY = await heading.evaluate((node) => node.getBoundingClientRect().top);
        if (width <= 800) expect(photoY, "Mobile photo before heading at " + width).toBeLessThan(titleY);
        else expect((await hero.locator(PHOTO).boundingBox())!.x).toBeGreaterThan((await heading.boundingBox())!.x);
        const existingPhoto = hero.locator(PHOTO + " img");
        const missingPhotoVisual = hero.locator(PHOTO + " [data-public-media-fallback]");
        if (await existingPhoto.count()) {
          await expect(existingPhoto).toHaveAttribute("loading", "eager");
          await expect(missingPhotoVisual).toHaveCount(0);
        } else {
          await expect(missingPhotoVisual).toBeVisible();
          await expect(missingPhotoVisual).toHaveAttribute("role", "img");
        }
      }

      // The unified detail flow keeps main content and contact in independent
      // desktop stacks; mobile restores the intended visual section order.
      const flow = main.locator("[data-public-detail-flow]");
      const section = (key: string) => flow.locator(`[data-detail-block="${key}"]`);
      const orderedSections = [
        { key: "intro", heading: "O službe" },
        { key: "contact", heading: contact },
        // Shared profile template: expertise sits directly below contact
        // in the right column, and immediately follows it on mobile.
        { key: "expertise", heading: "Odborné informácie" },
        { key: "services", heading: "Poskytované služby" },
        { key: "reviews", heading: "Recenzie" },
      ];
      for (const { key, heading: sectionHeading } of orderedSections) {
        await expect(section(key).getByRole("heading", { level: 2, name: sectionHeading, exact: true })).toBeVisible();
      }
      if (width <= 800) {
        const tops = await Promise.all(
          orderedSections.map(async ({ key }) => (await section(key).boundingBox())!.y),
        );
        for (let index = 1; index < tops.length; index++) {
          expect(tops[index], `Mobile section order at ${width}px: ${orderedSections[index].key}`).toBeGreaterThan(tops[index - 1]);
        }
      } else {
        const introBox = (await section("intro").boundingBox())!;
        const contactBox = (await section("contact").boundingBox())!;
        expect(contactBox.x, `Desktop contact column at ${width}px`).toBeGreaterThan(introBox.x);
      }

      const primary = hero.locator("[data-profile-primary-action]");
      await expect(primary).toHaveAttribute("href", "#kontakt");
      const box = await primary.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      await expect(hero.getByRole("link", { name: "Zavolať" })).toHaveAttribute("href", "tel:+421900123456");
      await expect(main.getByRole("link", { name: "Facebook ↗" })).toHaveAttribute("href", "https://facebook.com/example");
      await expect(main.getByRole("link", { name: "Instagram ↗" })).toHaveAttribute("href", "https://instagram.com/example");
      await expect(main.locator("#kontakt form")).toBeVisible();
      await assertNoOverflow(page);
      if (width === 320 || width === 1440) await assertAccessible(page);
      await page.screenshot({ path: ".e2e-artifacts/services-profile-ux/long-" + width + ".png", fullPage: true });
    }
  });

  test("minimal profile has no broken photo, empty sections or fabricated contact data", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const main = await openProfile(page, MINIMUM);
    await expect(main.getByRole("heading", { level: 1, name: "E2E Minimálna služba" })).toBeVisible();
    await expect(main.locator(PHOTO + " img")).toHaveCount(0);
    await expect(main.locator(PHOTO + " [data-public-media-fallback]")).toBeVisible();
    await expect(main.getByRole("heading", { name: "Poskytované služby" })).toHaveCount(0);
    await expect(main.getByRole("heading", { name: "Odborné informácie" })).toHaveCount(0);
    await expect(main.getByRole("link", { name: "Zavolať" })).toHaveCount(0);
    await expect(main.getByRole("link", { name: "Navigovať" })).toHaveCount(0);
    await expect(main.locator("[data-profile-primary-action]")).toHaveAttribute("href", "#kontakt");
    for (const placeholder of ["N/A", "Neuvedené", "Nezistené", "Neoverené"]) {
      await expect(main.getByText(placeholder, { exact: true })).toHaveCount(0);
    }
    await assertNoOverflow(page);
    await assertAccessible(page);
    await page.screenshot({ path: ".e2e-artifacts/services-profile-ux/minimum-390.png", fullPage: true });
  });

  test("veterinary specialist data are shown only when populated", async ({ page }) => {
    const rich = await openProfile(page, "/adresar/veterinari/health-fixture-vet-rich");
    const hero = rich.locator("[data-directory-profile-hero]");
    const photo = hero.locator("[data-public-profile-media] img");
    await expect(photo).toBeVisible();
    await expect(photo).toHaveAttribute("src", "/images/zdravie-veterinar.webp");
    await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    const photoTop = await photo.evaluate((image) => image.getBoundingClientRect().top);
    const headingTop = await hero.getByRole("heading", { level: 1 }).evaluate((heading) => heading.getBoundingClientRect().top);
    if ((page.viewportSize()?.width ?? 1440) <= 800) expect(photoTop).toBeLessThan(headingTop);
    else expect((await photo.boundingBox())!.x).toBeGreaterThan((await hero.getByRole("heading", { level: 1 }).boundingBox())!.x);
    await page.screenshot({ path: ".e2e-artifacts/services-profile-ux/veterinary-photo.png", fullPage: true });
    const expert = rich.getByRole("heading", { name: "Veterinárna starostlivosť a vybavenie" }).locator("xpath=ancestor::section[1]");
    await expect(expert.getByText("Špecializácie", { exact: true })).toBeVisible();
    await expect(expert.getByText("Interná medicína, chirurgia", { exact: true })).toBeVisible();
    await expect(expert.getByText("Pohotovosť", { exact: true })).toBeVisible();
    await expect(expert.getByText("Digitálne RTG", { exact: true })).toBeVisible();
    await assertNoOverflow(page);

    const minimum = await openProfile(page, "/adresar/veterinari/health-fixture-vet-minimum");
    await expect(minimum.getByRole("heading", { name: "Veterinárna starostlivosť a vybavenie" })).toHaveCount(0);
    await assertNoOverflow(page);
  });

  test("physiotherapy uses plain-text expertise, not retired therapy facets", async ({ page }) => {
    const main = await openProfile(page, "/adresar/fyzioterapia/health-fixture-fyzioterapia");
    const hero = main.locator("[data-directory-profile-hero]");
    // A perex must remain visible even when the profile has a longer description.
    await expect(hero.locator("p").filter({ hasText: /.+/ }).first()).toBeVisible();
    // Therapies are managed through Services V3, not the old Notion/import facts.
    await expect(main.getByRole("heading", { name: "Terapie a rehabilitácia" })).toHaveCount(0);
    const expert = main.getByRole("heading", { name: "Odbornosť a skúsenosti" }).locator("xpath=ancestor::section[1]");
    await expect(expert).toBeVisible();
    await expect(expert.getByText("Veterinárny fyzioterapeut", { exact: true })).toHaveCount(1);
    await expect(main.getByText("Hydroterapia", { exact: true })).toHaveCount(0);
    await expect(main.getByText("Pooperačná rehabilitácia", { exact: true })).toHaveCount(0);
    await assertNoOverflow(page);
  });

  test("profiles without a public GEO point do not expose map or navigation", async ({ page }) => {
    // Directory PR CI seeds directory-admin-e2e.sql only. The dedicated map
    // workflow seeds map-e2e-vet-a and exercises exact GEO, consent and directions
    // in public-detail-maps.spec.ts; those profiles are not available here.
    for (const href of [
      "/adresar/veterinari/health-fixture-vet-rich",
      "/adresar/dalsie-sluzby/e2e-services-detail-minimum",
    ]) {
      const main = await openProfile(page, href);
      await expect(main.getByTestId("public-location-map")).toHaveCount(0);
      await expect(main.getByRole("link", { name: "Navigovať", exact: true })).toHaveCount(0);
      await expect(main.getByTestId("detail-map-consent-gate")).toHaveCount(0);
      await assertNoOverflow(page);
    }
  });

  test("contact form and review section remain navigable by keyboard", async ({ page }) => {
    const main = await openProfile(page, LONG);
    await expect(main.getByRole("heading", { name: "Recenzie", exact: true })).toBeVisible();
    const primary = main.locator("[data-profile-primary-action]");
    await primary.focus();
    await expect(primary).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#kontakt$/);
    await expect(main.locator("#kontakt form")).toBeVisible();
    await expect(main.getByRole("button", { name: "Odoslať dopyt cez Psipediu" })).toBeVisible();

    const schema = (await page.locator('script[type="application/ld+json"]').allTextContents()).join("\n");
    expect(schema).toContain('"@type":"LocalBusiness"');
    expect(schema).toContain('"telephone":"+421 900 123 456"');
    expect(schema).not.toContain("AggregateRating");
    await assertAccessible(page);
  });
});
