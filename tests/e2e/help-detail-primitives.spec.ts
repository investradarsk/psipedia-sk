import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const cases = [
  { path: "/pomoc-psom/utulky/e2e-organizacia", title: "E2E pomocná organizácia", facts: "Typ organizácie" },
  { path: "/pomoc-psom/adopcia/e2e-adopcia", title: "Beny", facts: "Plemeno / typ" },
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

test("contact actions and help options remain operable; absent data creates no empty cards", async ({ page }) => {
  await page.goto(cases[0].path);
  await expect(page.getByRole("link", { name: "+421 900 123 456" })).toHaveAttribute("href", "tel:+421900123456");
  await expect(page.getByRole("link", { name: "help-e2e@example.invalid" })).toHaveAttribute("href", "mailto:help-e2e@example.invalid");
  await expect(page.getByRole("link", { name: "https://example.org ↗" })).toHaveAttribute("href", "https://example.org/");
  await expect(page.getByText("venčenie", { exact: true })).toBeVisible();

  await page.goto(cases[2].path);
  await expect(page.getByRole("heading", { name: "Kontakty" })).toHaveCount(0);
  await expect(page.locator("dt", { hasText: "Vek" })).toHaveCount(0);
  await expect(page.getByText("Nezistené", { exact: true })).toHaveCount(0);

  await page.goto(cases[3].path);
  await expect(page.getByRole("heading", { name: "Stav zbierky" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Priebeh zbierky" })).toHaveAttribute("aria-valuenow", "35");
  await expect(page.getByRole("link", { name: /Podporiť/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Prečo odkaz nemusí byť dostupný" })).toBeVisible();
});

test("Admin Help selects one, many, a page and all filtered drafts without writing local D1", async ({ page }) => {
  await page.goto("/admin/pomoc?status=draft");
  await expect(page.locator(".admin-help-row")).toHaveCount(50);
  await expect(page.getByText("Nájdené:").locator(".." )).toContainText("65");

  const rowChecks = page.locator('.admin-help-row input[type="checkbox"]');
  await rowChecks.nth(0).check();
  await expect(page.getByText("Označené: 1", { exact: true })).toBeVisible();
  await rowChecks.nth(1).check();
  await expect(page.getByText("Označené: 2", { exact: true })).toBeVisible();
  await rowChecks.nth(1).uncheck();
  await expect(page.getByText("Označené: 1", { exact: true })).toBeVisible();

  await page.getByLabel("Označiť všetky na tejto strane", { exact: true }).check();
  await expect(page.getByText("Označené: 50", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Označiť všetkých 65 výsledkov filtra", exact: true }).click();
  await expect(page.getByText("Označené: 65", { exact: true })).toBeVisible();
  await expect(page.getByText(/všetkých 65 výsledkov aktuálneho filtra naprieč 2 stranami/)).toBeVisible();

  let preflights = 0;
  let applies = 0;
  await page.route("**/api/admin/help/bulk", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "preflight") {
      preflights++;
      expect(body.targetStatus).toBe("published");
      expect(body.selection).toEqual({ mode: "filter", filters: { category: "all", status: "draft", q: "" }, expectedCount: 65 });
      const items = Array.from({ length: 65 }, (_, index) => ({ id: 930001 + index, status: "draft", updatedAt: `snapshot-${index + 1}` }));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ selectedCount: 65, changeCount: 65, items, targetStatus: "published" }) });
      return;
    }
    applies++;
    expect(body.action).toBe("apply");
    expect(body.confirmedCount).toBe(65);
    expect(body.items).toHaveLength(65);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ changed: 65 }) });
  });
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Publikovať 65 záznamov?");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Publikovať", exact: true }).click();
  await expect(page.getByText("Zmenených záznamov: 65.", { exact: true })).toBeVisible();
  expect(preflights).toBe(1);
  expect(applies).toBe(1);
  await expect(page.getByText("Označené: 0", { exact: true })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
