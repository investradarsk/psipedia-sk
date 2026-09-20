import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const legacyShelterPath = "/pomoc-psom/utulky/e2e-organizacia";
const canonicalShelterPath = "/organizacie/e2e-organizacia";

const cases = [
  { path: "/pomoc-psom/docasna-opatera/e2e-docasna-opatera", title: "Max", facts: "Organizácia" },
  { path: "/pomoc-psom/zbierky/e2e-zbierka", title: "E2E finančná výzva", facts: "Overenie" },
  { path: "/pomoc-psom/dobrovolnictvo/e2e-dobrovolnictvo", title: "E2E dobrovoľnícka výzva", facts: "Organizácia" },
] as const;

for (const entry of cases) {
  test(`${entry.path}: preserves public Help content, layout and accessibility`, async ({ page }) => {
    const response = await page.goto(entry.path, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    const main = page.locator("main#obsah");
    await expect(main.getByRole("heading", { level: 1, name: entry.title })).toBeVisible();
    await expect(main.locator("article")).toBeVisible();
    await expect(main.getByRole("complementary", { name: "Praktické informácie" })).toBeVisible();
    await expect(main.locator("dt", { hasText: entry.facts })).toHaveCount(1);
    await expect(main.getByRole("heading", { name: "Pomáhajte bezpečne" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
  });
}

test("legacy shelter detail redirects to canonical organization without a legacy help_cases row", async ({ page }) => {
  const response = await page.goto(legacyShelterPath, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe(canonicalShelterPath);

  const main = page.locator("main#obsah");
  await expect(main.getByRole("heading", { level: 1, name: "E2E pomocná organizácia" })).toBeVisible();
  await expect(main.getByText("Canonical profil pre ORG-6C E2E.", { exact: true })).toBeVisible();
  await expect(main.getByText("Overenie profilu organizácie.", { exact: true })).toHaveCount(0);
  await expect(main.getByRole("heading", { name: "Základné informácie" })).toBeVisible();
  await expect(main.getByRole("heading", { name: "Kontakty" })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
});

test("contact actions and help options remain operable; absent data creates no empty cards", async ({ page }) => {
  await page.goto(legacyShelterPath);
  expect(new URL(page.url()).pathname).toBe(canonicalShelterPath);
  await expect(page.getByRole("link", { name: "+421 900 123 456" })).toHaveAttribute("href", "tel:+421900123456");
  await expect(page.getByRole("link", { name: "help-e2e@example.invalid" })).toHaveAttribute("href", "mailto:help-e2e@example.invalid");
  await expect(page.getByRole("link", { name: "https://example.org ↗" })).toHaveAttribute("href", "https://example.org/");
  await expect(page.getByText(/Dobrovoľníctvo: venčenie/)).toBeVisible();

  await page.goto(cases[0].path);
  await expect(page.getByRole("heading", { name: "Kontakty" })).toHaveCount(0);
  await expect(page.locator("dt", { hasText: "Vek" })).toHaveCount(0);
  await expect(page.getByText("Nezistené", { exact: true })).toHaveCount(0);

  await page.goto(cases[1].path);
  await expect(page.getByRole("heading", { name: "Stav zbierky" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Priebeh zbierky" })).toHaveAttribute("aria-valuenow", "35");
  await expect(page.getByRole("link", { name: /Podporiť/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Prečo odkaz nemusí byť dostupný" })).toBeVisible();
});

test("Admin Help keeps bulk selection page-scoped and publishes only the current view without writing local D1", async ({ page }) => {
  await page.goto("/admin/pomoc?q=E2E+bulk&status=draft");
  await expect(page.locator(".admin-help-row")).toHaveCount(50);
  await expect(page.locator(".admin-help-results")).toContainText("Nájdené: 65");

  const rowChecks = page.locator('.admin-help-row input[type="checkbox"]');
  await rowChecks.nth(0).check();
  await expect(page.getByText("Označené: 1", { exact: true })).toBeVisible();
  await rowChecks.nth(1).check();
  await expect(page.getByText("Označené: 2", { exact: true })).toBeVisible();
  await rowChecks.nth(1).uncheck();
  await expect(page.getByText("Označené: 1", { exact: true })).toBeVisible();

  const selectPage = page.getByLabel("Označiť všetky na tejto strane", { exact: true });
  await selectPage.check();
  await expect(page.getByText("Označené: 50", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Označiť všetkých .* výsledkov filtra/ })).toHaveCount(0);
  await expect(page.getByText("Výber patrí iba aktuálnej filtrovanej strane.", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Ďalšia →", exact: true }).click();
  await expect(page.locator(".admin-help-row")).toHaveCount(15);
  await expect(page.getByText("Označené: 0", { exact: true })).toBeVisible();

  await page.getByLabel("Označiť všetky na tejto strane", { exact: true }).check();
  await expect(page.getByText("Označené: 15", { exact: true })).toBeVisible();

  let preflights = 0;
  let applies = 0;
  await page.route("**/api/admin/help/bulk", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "preflight") {
      preflights++;
      expect(body.targetStatus).toBe("published");
      expect(body.selection.mode).toBe("ids");
      expect(body.selection.ids).toHaveLength(15);
      const items = body.selection.ids.map((id: number, index: number) => ({
        id,
        status: "draft",
        updatedAt: `snapshot-${index + 1}`,
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ selectedCount: 15, changeCount: 15, items, targetStatus: "published" }),
      });
      return;
    }
    applies++;
    expect(body.action).toBe("apply");
    expect(body.confirmedCount).toBe(15);
    expect(body.items).toHaveLength(15);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ requested: 15, changed: 15 }),
    });
  });

  // Cookie consent is unrelated to this admin bulk-action contract and can mount
  // late on mobile, covering the sticky action bar. Remove only the overlay in
  // this isolated E2E before exercising the bulk publish interaction.
  await page.locator(".cookie-consent").evaluate((element) => element.remove()).catch(() => {});

  const publishButton = page.getByRole("button", { name: "Publikovať", exact: true });
  await publishButton.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await publishButton.click();

  const dialog = page.getByRole("dialog", { name: "Publikovať vybrané Help záznamy" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Zmení sa\s*15\s*z 15 označených záznamov\./)).toBeVisible();
  await dialog.getByRole("button", { name: "Publikovať", exact: true }).click();

  await expect(page.getByText("Zmenených záznamov: 15 z 15 potvrdených.", { exact: true })).toBeVisible();
  expect(preflights).toBe(1);
  expect(applies).toBe(1);
  await expect(page.getByText("Označené: 0", { exact: true })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
