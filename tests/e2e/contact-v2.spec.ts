import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function expectSeriousCriticalAxeClean(page: Page) {
  const accessibility = await new AxeBuilder({ page })
    .include("main#obsah")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const seriousOrCritical = accessibility.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
  expect(seriousOrCritical, JSON.stringify(seriousOrCritical, null, 2)).toEqual([]);
}

test.describe("CONTACT 2.0", () => {
  test("routes each contact intent to the canonical existing workflow", async ({ page }) => {
    const response = await page.goto("/kontakt", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { level: 1, name: "Ako ti môžeme pomôcť?" })).toBeVisible();
    await expect(page.locator("[data-contact-routes] [data-contact-route]")).toHaveCount(10);

    await expect(page.locator('[data-contact-route="content-error"]')).toHaveAttribute("href", "/opravy-a-podnety");
    await expect(page.locator('[data-contact-route="news-tip"]')).toHaveAttribute("href", "/novinky/poslat-tip");
    await expect(page.locator('[data-contact-route="directory-inquiry"]')).toHaveAttribute("href", "/adresar");
    await expect(page.locator('[data-contact-route="directory-change"]')).toHaveAttribute("href", "/adresar");
    await expect(page.locator('[data-contact-route="lost-dog"]')).toHaveAttribute("href", "/pomoc-psom/stratene-psy");
    await expect(page.locator('[data-contact-route="found-dog"]')).toHaveAttribute("href", "/pomoc-psom/najdene-psy");
    await expect(page.locator('[data-contact-route="dog-in-need"]')).toHaveAttribute("href", "/pomoc-psom/nahlasit-psa-v-nudzi");

    await expect(page.locator('[data-contact-route="general"]')).toHaveAttribute("href", /^mailto:psipedia\.sk@gmail\.com\?subject=/);
    await expect(page.locator('[data-contact-route="missing-service"]')).toHaveAttribute("href", /^mailto:psipedia\.sk@gmail\.com\?subject=/);
    await expect(page.locator('[data-contact-route="collaboration"]')).toHaveAttribute("href", /^mailto:psipedia\.sk@gmail\.com\?subject=/);

    await expect(page.getByRole("link", { name: "Napísať e-mail" })).toHaveAttribute("href", /^mailto:psipedia\.sk@gmail\.com\?subject=/);
    await expect(page.getByRole("link", { name: "Ochrana osobných údajov" })).toHaveAttribute("href", "/sukromie");
    await expect(page.getByRole("link", { name: "Prevádzkovateľ a právne informácie" })).toHaveAttribute("href", "/pravne-informacie");

    await expect(page.locator("form")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("keeps urgent guidance explicit and separate from editorial contact", async ({ page }) => {
    await page.goto("/kontakt", { waitUntil: "domcontentloaded" });

    const urgent = page.locator("[data-contact-urgent]");
    await expect(urgent.getByRole("heading", { level: 2, name: "Ak ide o akútny problém so psom" })).toBeVisible();
    await expect(urgent).toContainText("nie je veterinárna pohotovosť ani tiesňová služba");
    await expect(urgent.getByRole("link", { name: "Nájsť veterinára" })).toHaveAttribute("href", "/adresar/veterinari");
    await expect(urgent.getByRole("link", { name: "Postup pri psovi v núdzi" })).toHaveAttribute("href", "/pomoc-psom/nahlasit-psa-v-nudzi");
  });

  test("is touch-safe, keyboard reachable and axe-clean at 390x844", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Mobile CONTACT contract");
    await page.setViewportSize({ width: 390, height: 844 });

    const response = await page.goto("/kontakt", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const actions = page.locator("[data-contact-action]");
    expect(await actions.count()).toBeGreaterThan(8);
    const boxes = await actions.evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }));
    for (const box of boxes) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    const firstRoute = page.locator('[data-contact-route="general"]');
    const secondRoute = page.locator('[data-contact-route="content-error"]');
    await firstRoute.focus();
    await expect(firstRoute).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(secondRoute).toBeFocused();

    await expectNoHorizontalOverflow(page);
    await expectSeriousCriticalAxeClean(page);

    await testInfo.attach("contact-v2-mobile-390x844", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });
});
