import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, label).toBeLessThanOrEqual(1);
}

async function expectReviewAxeClean(page: Page) {
  const accessibility = await new AxeBuilder({ page })
    .include("#recenzie")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
}

test("directory zero state has no fake rating or submission CTA", async ({ page }) => {
  const response = await page.goto("/adresar/dalsie-sluzby/e2e-services-detail-minimum", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const reviews = page.locator("#recenzie");
  await expect(reviews.getByRole("heading", { name: "Recenzie" })).toBeVisible();
  await expect(reviews.getByText("Zatiaľ bez recenzií", { exact: true })).toBeVisible();
  await expect(reviews.getByText(/0,0/)).toHaveCount(0);
  await expect(reviews.locator("[data-review-rating]")).toHaveCount(0);
  await expect(reviews.getByRole("link", { name: /Napísať recenziu/i })).toHaveCount(0);
  await expect(reviews.getByRole("button", { name: /Napísať recenziu/i })).toHaveCount(0);
  await expectReviewAxeClean(page);
});

test("directory visible reviews render summary, distribution, dimensions and safe reply only", async ({ page }) => {
  const response = await page.goto("/adresar/veterinari/health-fixture-vet-rich", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const reviews = page.locator("#recenzie");
  await expect(reviews.locator("[data-review-summary-score]").getByText("4,5 z 5", { exact: true })).toBeVisible();
  await expect(reviews.getByText("2 recenzie", { exact: true })).toBeVisible();
  await expect(reviews.getByText("Prístup", { exact: true }).first()).toBeVisible();
  await expect(reviews.getByText("Komunikácia", { exact: true }).first()).toBeVisible();
  await expect(reviews.getByText("Kvalita starostlivosti", { exact: true }).first()).toBeVisible();
  await expect(reviews.getByText("Jana Testovacia", { exact: true })).toBeVisible();
  await expect(reviews.getByText("Používateľ Psipedia.sk", { exact: true })).toBeVisible();
  await expect(reviews.getByText("Odpoveď prevádzkovateľa", { exact: true })).toBeVisible();
  await expect(reviews.getByText("Ďakujeme za spätnú väzbu a dôveru.", { exact: true })).toBeVisible();
  await expect(reviews.getByText("Táto skrytá odpoveď sa nesmie zobraziť.", { exact: true })).toHaveCount(0);
  await expect(reviews.getByText("Táto skrytá recenzia sa na verejnom profile nesmie zobraziť.", { exact: true })).toHaveCount(0);
  await expect(reviews.getByText("Táto čakajúca recenzia sa na verejnom profile nesmie zobraziť.", { exact: true })).toHaveCount(0);
  await expect(reviews.getByText(/alert\(1\)/)).toBeVisible();
  await expect(reviews.locator("script")).toHaveCount(0);
  await expect(reviews.getByText("raw-unknown-service-key", { exact: true })).toHaveCount(0);
  await expect(reviews.getByText(/2× označené ako užitočné/)).toBeVisible();

  const schemaText = (await page.locator('script[type="application/ld+json"]').allTextContents()).join("\n");
  expect(schemaText).not.toContain("AggregateRating");
  expect(schemaText).not.toContain('"Review"');

  await expectNoHorizontalOverflow(page, "directory reviews");
  await expectReviewAxeClean(page);
});

test("different directory category reuses engine with configured labels", async ({ page }) => {
  const response = await page.goto("/adresar/treneri/e2e-services-detail-long", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const reviews = page.locator("#recenzie");
  await expect(reviews.locator("[data-review-summary-score]").getByText("4,0 z 5", { exact: true })).toBeVisible();
  await expect(reviews.getByText("Kvalita tréningu", { exact: true }).first()).toBeVisible();
  await expect(reviews.getByText("Kvalita starostlivosti", { exact: true })).toHaveCount(0);
});

test("organization profile uses the same review engine", async ({ page }) => {
  const response = await page.goto("/organizacie/e2e-organizacia", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const reviews = page.locator("#recenzie");
  await expect(reviews.locator("[data-review-summary-score]").getByText("5,0 z 5", { exact: true })).toBeVisible();
  await expect(reviews.getByText("Kvalita služby", { exact: true }).first()).toBeVisible();
  await expect(reviews.getByText("Organizácia komunikovala jasne a pomoc bola zorganizovaná veľmi dobre.", { exact: true })).toBeVisible();
  await expectReviewAxeClean(page);
});

test("review section stays usable at 390x844 and long plain text cannot break layout", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "390px mobile contract");
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/adresar/veterinari/health-fixture-vet-rich", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const reviews = page.locator("#recenzie");
  await expect(reviews).toBeVisible();
  const metrics = await reviews.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  await expectNoHorizontalOverflow(page, "390x844 review profile");
  await expectReviewAxeClean(page);
});
