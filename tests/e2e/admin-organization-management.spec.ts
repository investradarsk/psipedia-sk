import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function expectAxeClean(page: import("@playwright/test").Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  expect(violations, violations.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  test.skip(Boolean(process.env.E2E_BASE_URL), "Mutating organization create/edit validation runs only against isolated local D1.");
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("organization admin supports mobile filters, draft create and canonical edit without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const suffix = String(Date.now());
  const name = "ORG-FINAL " + suffix;
  const slug = "org-final-" + suffix;

  await page.goto("/admin/organizacie?q=ORG-8A&status=DRAFT", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Organizácie", exact: true })).toBeVisible();
  await expect(page.locator("article").filter({ hasText: "ORG-8A Testovacia organizácia" })).toBeVisible();
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
