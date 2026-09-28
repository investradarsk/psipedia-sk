import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const fixtureName = "ORG-8A Testovacia organizácia";
const fixtureSlug = "org-8a-testovacia-organizacia";

async function expectAxeClean(page: import("@playwright/test").Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  expect(violations, violations.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("organization publication workflow is explicit, reversible and fail-closed", async ({ page, request }) => {
  const response = await page.goto("/admin/organizacie", { waitUntil: "domcontentloaded" });
  expect(response).not.toBeNull();
  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByRole("heading", { name: "Organizácie", exact: true })).toBeVisible();

  let row = page.locator("article").filter({ hasText: fixtureName });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Koncept");
  await expect(row).toContainText("READY");
  await expect(row.getByRole("button", { name: "Publikovať", exact: true })).toBeEnabled();

  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "Publikovať", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Organizácia bola publikovaná");

  row = page.locator("article").filter({ hasText: fixtureName });
  await expect(row).toContainText("Publikované");
  await expect(row).toContainText("Verejný profil");
  await expect(row.getByRole("button", { name: "Presunúť do konceptu", exact: true })).toBeEnabled();

  const publicAfterPublish = await request.get(`/organizacie/${fixtureSlug}`);
  expect(publicAfterPublish.status()).toBe(200);

  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "Presunúť do konceptu", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Organizácia bola presunutá do konceptu");

  row = page.locator("article").filter({ hasText: fixtureName });
  await expect(row).toContainText("Koncept");
  await expect(row).toContainText("Neverejný profil");
  await expect(row.getByRole("button", { name: "Publikovať", exact: true })).toBeEnabled();

  const publicAfterUnpublish = await request.get(`/organizacie/${fixtureSlug}`);
  expect(publicAfterUnpublish.status()).toBe(404);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectAxeClean(page);
});


test("organization admin supports mobile filters, DRAFT create and canonical edit", async ({ page }) => {
  const externalBase = process.env.E2E_BASE_URL && !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(process.env.E2E_BASE_URL);
  test.skip(Boolean(externalBase), "Mutating organization management E2E never runs against an external or production base URL.");

  await page.setViewportSize({ width: 390, height: 844 });
  const suffix = String(Date.now());
  const name = "ORG-FINAL " + suffix;
  const slug = "org-final-" + suffix;

  await page.goto("/admin/organizacie?q=ORG-8A&status=DRAFT", { waitUntil: "domcontentloaded" });
  await expect(page.locator("article").filter({ hasText: fixtureName })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("link", { name: "+ Nová organizácia" }).click();
  await page.getByLabel("Názov *").fill(name);
  await page.getByLabel("Slug *").fill(slug);
  await page.getByLabel("Typ *").selectOption("CIVIC_ASSOCIATION");
  await page.getByLabel("Krátky popis").fill("Testovací canonical profil.");
  await page.getByRole("button", { name: "Vytvoriť koncept" }).click();

  await expect(page).toHaveURL(new RegExp("/admin/organizacie/\\d+$"));
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.getByLabel("Publication stav")).toHaveValue("DRAFT");

  await page.getByLabel("Verejný popis").fill("Verejný opis organizácie pre admin finalization E2E.");
  await page.getByLabel("Verejný e-mail").fill("org-final@example.sk");
  await page.getByLabel("Web").fill("https://example.sk/org-final");
  await page.getByLabel("Zdroj / referencia").fill("https://example.sk/source");
  await page.getByRole("button", { name: "Uložiť organizáciu" }).click();
  await expect(page.getByRole("status")).toContainText("Canonical údaje organizácie boli uložené");

  await page.goto("/admin/organizacie?q=" + encodeURIComponent(name), { waitUntil: "domcontentloaded" });
  const result = page.locator("article").filter({ hasText: name });
  await expect(result).toBeVisible();
  await expect(result).toContainText("Koncept");
  await expect(result).toContainText("Publication READY");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
  await expectAxeClean(page);
});
