import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const directoryRich = "/adresar/treneri/e2e-services-detail-long";
const directoryMinimum = "/adresar/dalsie-sluzby/e2e-services-detail-minimum";
const organizationRich = "/organizacie/org-3b-e2e-kanonicka-organizacia";
const organizationNoLocation = "/organizacie/org-2b-e2e-jedna-lokalita";

for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test("shared profile UX " + viewport.width + "px: directory rich and organization", async ({ page }) => {
    await page.setViewportSize(viewport);

    for (const href of [directoryRich, organizationRich]) {
      const response = await page.goto(href, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(200);

      const main = page.locator("main#obsah");
      const hero = main.locator("[data-public-profile-hero]");
      const layout = main.locator("[data-public-profile-layout]");
      const aside = main.locator("[data-public-profile-sidebar]");
      const body = main.locator("[data-public-profile-body]");
      await expect(hero.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(layout).toBeVisible();
      await expect(aside).toBeVisible();
      await expect(body).toBeVisible();

      const primary = hero.locator("[data-profile-primary-action]");
      await expect(primary).toHaveCount(1);
      const targetSize = await primary.boundingBox();
      expect(targetSize?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(targetSize?.width ?? 0).toBeGreaterThanOrEqual(44);

      const asideBox = await aside.boundingBox();
      const bodyBox = await body.boundingBox();
      expect(asideBox).not.toBeNull();
      expect(bodyBox).not.toBeNull();
      if (viewport.width <= 900) {
        expect((asideBox?.y ?? 0) + (asideBox?.height ?? 0)).toBeLessThanOrEqual((bodyBox?.y ?? 0) + 2);
      } else {
        expect((asideBox?.x ?? 0)).toBeGreaterThan((bodyBox?.x ?? 0));
      }

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await expect(main.getByText("Overené", { exact: true })).toHaveCount(0);
      const accessibility = await new AxeBuilder({ page })
        .include("main#obsah")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
    }
  });
}

test("missing media and contact data render without fake fields or broken actions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto(directoryMinimum, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const main = page.locator("main#obsah");
  await expect(main.locator("[data-public-profile-media]")).toHaveCount(0);
  await expect(main.getByRole("heading", { name: "Kontakt", exact: true })).toHaveCount(0);
  await expect(main.locator("[data-profile-primary-action]")).toHaveAttribute("href", "#kontakt");
  await expect(main.getByRole("link", { name: "Zavolať", exact: true })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("canonical organization location stays single and support content survives", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto(organizationNoLocation, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const main = page.locator("main#obsah");
  await expect(main.locator("[data-organization-location-summary]")).toContainText("Trnava");
  await expect(main.locator("[data-fundraising-method]")).toHaveCount(1);
  await expect(main.locator("[data-organization-location]")).toHaveCount(0);
  await expect(main.getByRole("heading", { name: "Kontakty" })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
