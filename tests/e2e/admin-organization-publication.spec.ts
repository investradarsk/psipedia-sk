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
