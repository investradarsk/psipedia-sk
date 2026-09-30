import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function configurePage(page: Page, projectName: string) {
  await page.setViewportSize(projectName.includes("mobile")
    ? { width: 390, height: 844 }
    : { width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectAccessibleMain(page: Page) {
  const result = await new AxeBuilder({ page })
    .include("main#obsah")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = result.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical");
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test.beforeEach(async ({ page }, testInfo) => {
  await configurePage(page, testInfo.project.name);
});

test("explicit article, breed and directory relations use canonical links and hide invalid targets", async ({ page }, testInfo) => {
  const articleResponse = await page.goto("/clanky/content-relations-e2e-clanok", { waitUntil: "domcontentloaded" });
  expect(articleResponse?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "CONTENT-RELATIONS E2E článok" })).toBeVisible();
  const articleSection = page.locator('[data-explicit-content-relation="article-breed"]');
  await expect(articleSection.getByRole("heading", { name: "Plemená prepojené s týmto článkom" })).toBeVisible();
  const articleBreedLink = articleSection.getByRole("link", { name: /CONTENT-RELATIONS E2E plemeno/i }).first();
  await expect(articleBreedLink).toHaveAttribute("href", "/plemena/content-relations-e2e-plemeno");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://psipedia.sk/clanky/content-relations-e2e-clanok",
  );
  await articleBreedLink.focus();
  await expect(articleBreedLink).toBeFocused();
  await expectNoHorizontalOverflow(page);

  const emptyArticleResponse = await page.goto("/clanky/content-relations-e2e-bez-vazby", { waitUntil: "domcontentloaded" });
  expect(emptyArticleResponse?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Plemená prepojené s týmto článkom" })).toHaveCount(0);

  const breedResponse = await page.goto("/plemena/content-relations-e2e-plemeno", { waitUntil: "domcontentloaded" });
  expect(breedResponse?.status()).toBe(200);
  const breedMain = page.locator("main#obsah");
  await expect(breedMain.getByRole("heading", { name: "Články o tomto plemene" })).toBeVisible();
  await expect(breedMain.getByRole("link", { name: /CONTENT-RELATIONS E2E článok/i })).toHaveAttribute(
    "href",
    "/clanky/content-relations-e2e-clanok",
  );
  await expect(breedMain.getByText("CONTENT-RELATIONS skrytý draft článok", { exact: false })).toHaveCount(0);
  await expect(breedMain.getByText("CONTENT-RELATIONS noncanonical článok", { exact: false })).toHaveCount(0);
  await expect(breedMain.getByRole("heading", { name: "Chovateľské kluby pre toto plemeno" })).toBeVisible();
  await expect(breedMain.getByRole("link", { name: /CONTENT-RELATIONS E2E chovateľský klub/i })).toHaveAttribute(
    "href",
    "/adresar/chovatelske-kluby/content-relations-e2e-klub",
  );
  await expect(breedMain.getByText("CONTENT-RELATIONS archivovaná stanica", { exact: false })).toHaveCount(0);
  await expect(breedMain.getByText("CONTENT-RELATIONS noncanonical klub", { exact: false })).toHaveCount(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://psipedia.sk/plemena/content-relations-e2e-plemeno",
  );
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: `.e2e-artifacts/content-relations/content-relations-${testInfo.project.name}.png`,
    fullPage: true,
  });

  const directoryResponse = await page.goto(
    "/adresar/chovatelske-kluby/content-relations-e2e-klub",
    { waitUntil: "domcontentloaded" },
  );
  expect(directoryResponse?.status()).toBe(200);
  const directoryMain = page.locator("main#obsah");
  await expect(directoryMain.getByRole("heading", { name: "Plemená prepojené s týmto profilom" })).toBeVisible();
  const directoryBreedLink = directoryMain.getByRole("link", { name: /CONTENT-RELATIONS E2E plemeno/i }).first();
  await expect(directoryBreedLink).toHaveAttribute("href", "/plemena/content-relations-e2e-plemeno");
  await directoryBreedLink.focus();
  await expect(directoryBreedLink).toBeFocused();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://psipedia.sk/adresar/chovatelske-kluby/content-relations-e2e-klub",
  );
  await expectNoHorizontalOverflow(page);
  await expectAccessibleMain(page);

  const emptyDirectoryResponse = await page.goto(
    "/adresar/chovatelske-kluby/content-relations-e2e-profil-bez-vazby",
    { waitUntil: "domcontentloaded" },
  );
  expect(emptyDirectoryResponse?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Plemená prepojené s týmto profilom" })).toHaveCount(0);
});

test("organization relation is explicit, lifecycle-filtered and bounded to six adoption cards", async ({ page }) => {
  const response = await page.goto("/organizacie/content-relations-e2e-organizacia", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const main = page.locator("main#obsah");
  await expect(main.getByRole("heading", { level: 1, name: "CONTENT-RELATIONS E2E organizácia" })).toBeVisible();
  await expect(main.getByRole("heading", { name: "Psy na adopciu v tejto organizácii" })).toBeVisible();

  const cards = main.locator("[data-adoption-card]");
  await expect(cards).toHaveCount(6);
  await expect(cards.first()).toHaveAttribute("data-adoption-card", "cr-pes-7");
  await expect(cards.last()).toHaveAttribute("data-adoption-card", "cr-pes-2");
  await expect(main.getByText("CR Pes 1", { exact: true })).toHaveCount(0);
  await expect(main.getByText("CR Draft pes", { exact: true })).toHaveCount(0);

  const firstCta = cards.first().getByRole("link", { name: "Zobraziť profil", exact: true });
  await expect(firstCta).toHaveAttribute("href", "/pomoc-psom/adopcia/cr-pes-7");
  await firstCta.focus();
  await expect(firstCta).toBeFocused();
  await expectNoHorizontalOverflow(page);
  await expectAccessibleMain(page);
});
