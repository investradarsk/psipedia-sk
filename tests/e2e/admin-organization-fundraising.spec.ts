import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const fixtureName = "ORG-8A Testovacia organizácia";

async function expectAxeClean(page: import("@playwright/test").Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  expect(violations, violations.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  test.skip(Boolean(process.env.E2E_BASE_URL), "Mutating fundraising CRUD validation runs only against isolated local D1, never an external/production base URL.");
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("organization fundraising CRUD is fail-closed, persistent and responsive", async ({ page }) => {
  const response = await page.goto("/admin/organizacie", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);
  const row = page.getByRole("row").filter({ hasText: fixtureName });
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: "Fundraising" }).click();

  await expect(page.getByRole("heading", { name: fixtureName, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fundraising", exact: true })).toBeVisible();
  await expect(page.getByText(/uloženie nikdy automaticky neznamená VERIFIED/i)).toBeVisible();

  const suffix = `${Date.now()}-${test.info().project.name}`;
  await page.getByLabel("Názov v admin rozhraní").first().fill(`ORG-7C ${suffix}`);
  await page.getByLabel("URL *").first().fill(`https://example.com/donate/${suffix}`);
  await page.getByLabel("Identita príjemcu").first().fill(fixtureName);
  await page.getByLabel("Poradie").first().fill("7");
  await page.getByRole("button", { name: "Pridať metódu" }).click();
  await expect(page.getByRole("status")).toContainText("neaktívna a UNVERIFIED");

  const card = page.locator("[data-fundraising-method-id]").filter({ hasText: `ORG-7C ${suffix}` });
  await expect(card).toBeVisible();
  await expect(card.getByLabel("Verification stav")).toHaveValue("Neoverené");
  const active = card.getByRole("checkbox", { name: "Aktívna metóda" });
  await expect(active).not.toBeChecked();

  await card.getByLabel("Názov v admin rozhraní").fill(`ORG-7C ${suffix} upravené`);
  await card.getByLabel("Poradie").fill("2");
  await active.check();
  await card.getByRole("button", { name: "Uložiť metódu" }).click();
  await expect(page.getByRole("status")).toContainText("bola uložená");
  await expect(card.getByLabel("Verification stav")).toHaveValue("Neoverené");
  await expect(active).toBeChecked();

  await page.reload({ waitUntil: "domcontentloaded" });
  const persisted = page.locator("[data-fundraising-method-id]").filter({ hasText: `ORG-7C ${suffix} upravené` });
  await expect(persisted).toBeVisible();
  await expect(persisted.getByRole("checkbox", { name: "Aktívna metóda" })).toBeChecked();
  await expect(persisted.getByLabel("Poradie")).toHaveValue("2");

  page.once("dialog", (dialog) => dialog.accept());
  await persisted.getByRole("button", { name: "Archivovať" }).click();
  await expect(page.getByRole("status")).toContainText("archivovaná a deaktivovaná");
  await expect(persisted).toContainText("ARCHIVED");
  await expect(persisted.getByRole("checkbox", { name: "Aktívna metóda" })).not.toBeChecked();
  await expect(persisted.getByRole("button", { name: "Uložiť metódu" })).toHaveCount(0);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectAxeClean(page);
});
