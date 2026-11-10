import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const fixtureName = "ORG-8A Testovacia organizácia";
const fixtureSlug = "org-8a-testovacia-organizacia";

async function showOrganizationSection(page: import("@playwright/test").Page, id: string, label: string) {
  const nav = page.getByRole("navigation", { name: "Sekcie editora organizácie" });
  const select = nav.getByRole("combobox", { name: "Sekcia editora" });
  if (await select.isVisible()) await select.selectOption(id);
  else await nav.getByRole("button", { name: label, exact: true }).click();
  await expect(page.locator("#" + id)).toBeVisible();
  await expect(page.locator("#" + id)).toBeFocused();
}


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

  // Canonical admin confirmation is an accessible HTML dialog, not window.confirm.
  // Cancelling must never send a publication mutation.
  await row.getByRole("button", { name: "Publikovať", exact: true }).click();
  let confirmation = page.getByRole("dialog", { name: "Publikovať organizáciu?" });
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByRole("button", { name: "Zrušiť" })).toBeFocused();
  await confirmation.getByRole("button", { name: "Zrušiť" }).click();
  await expect(confirmation).not.toBeVisible();
  await expect(row).toContainText("Koncept");

  await row.getByRole("button", { name: "Publikovať", exact: true }).click();
  confirmation = page.getByRole("dialog", { name: "Publikovať organizáciu?" });
  await expect(confirmation).toBeVisible();
  const [publishResponse] = await Promise.all([
    page.waitForResponse(response => response.url().includes("/api/admin/organizations/") && response.url().endsWith("/publication") && response.request().method() === "PUT"),
    confirmation.getByRole("button", { name: "Publikovať", exact: true }).click(),
  ]);
  expect(publishResponse.ok()).toBe(true);
  await expect(page.getByRole("status")).toContainText("Organizácia bola publikovaná");

  row = page.locator("article").filter({ hasText: fixtureName });
  await expect(row).toContainText("Publikované");
  await expect(row).toContainText("Verejný profil");
  await expect(row.getByRole("button", { name: "Presunúť do konceptu", exact: true })).toBeEnabled();

  const publicAfterPublish = await request.get(`/organizacie/${fixtureSlug}`);
  expect(publicAfterPublish.status()).toBe(200);

  await row.getByRole("button", { name: "Presunúť do konceptu", exact: true }).click();
  confirmation = page.getByRole("dialog", { name: "Presunúť organizáciu do konceptu?" });
  await expect(confirmation).toBeVisible();
  await confirmation.press("Escape");
  await expect(confirmation).not.toBeVisible();
  await expect(row).toContainText("Publikované");

  await row.getByRole("button", { name: "Presunúť do konceptu", exact: true }).click();
  confirmation = page.getByRole("dialog", { name: "Presunúť organizáciu do konceptu?" });
  await expect(confirmation).toBeVisible();
  const [unpublishResponse] = await Promise.all([
    page.waitForResponse(response => response.url().includes("/api/admin/organizations/") && response.url().endsWith("/publication") && response.request().method() === "PUT"),
    confirmation.getByRole("button", { name: "Presunúť do konceptu", exact: true }).click(),
  ]);
  expect(unpublishResponse.ok()).toBe(true);
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
  await showOrganizationSection(page, "organization-content", "Verejný obsah");
  await page.getByLabel("Krátky popis").fill("Testovací canonical profil.");
  await page.getByRole("button", { name: "Vytvoriť koncept" }).click();

  await expect(page).toHaveURL(new RegExp("/admin/organizacie/\\d+$"));
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await showOrganizationSection(page, "organization-general", "Základné");
  await expect(page.getByLabel("Publication stav")).toHaveValue("DRAFT");

  await showOrganizationSection(page, "organization-content", "Verejný obsah");
  await page.getByLabel("Verejný popis").fill("Verejný opis organizácie pre admin finalization E2E.");
  await showOrganizationSection(page, "organization-contacts", "Kontakty");
  await page.getByLabel("Verejný e-mail").fill("org-final@example.sk");
  await page.getByLabel("Web", { exact: true }).fill("https://example.sk/org-final");
  await showOrganizationSection(page, "organization-media", "Obrázok a zdroj");
  await page.getByLabel("Zdroj / referencia").fill("https://example.sk/source");
  await page.getByRole("button", { name: "Uložiť organizáciu" }).click();
  await expect(page.locator('[data-admin-form-feedback="success"]')).toContainText("Údaje organizácie sú uložené");

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


for (const width of [1440, 390, 320]) {
  test(`organization shared editor retains profile and address fields while switching five panels at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const response = await page.goto("/admin/organizacie/novy", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    const form = page.locator("form[data-admin-organization-editor]");
    const nav = form.getByRole("navigation", { name: "Sekcie editora organizácie" });
    await expect(nav.locator("option")).toHaveCount(5);
    await expect(form.locator("#organization-general")).toBeVisible();
    await expect(page.getByLabel("Názov *", { exact: true })).toBeEnabled();
    const writes: string[] = [];
    page.on("request", request => {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) &&
          /\/api\/admin\/organizations(?:\/|$)/.test(new URL(request.url()).pathname)) writes.push(request.url());
    });
    await page.getByLabel("Názov *", { exact: true }).fill("Neuložená organizácia krok 15");
    await page.getByLabel("Slug *", { exact: true }).fill("neulozena-organizacia-krok-15");
    await showOrganizationSection(page, "organization-content", "Verejný obsah");
    await page.getByLabel("Krátky popis").fill("Pomoc strateným a nájdeným psom.");
    await showOrganizationSection(page, "organization-location-panel", "Adresa a mapa");
    await page.getByLabel("Adresa", { exact: true }).fill("Skúšobná 12");
    await page.getByLabel("Mesto", { exact: true }).fill("Nitra");
    await expect(form.locator("form")).toHaveCount(0); // address has no nested independent submit
    await showOrganizationSection(page, "organization-contacts", "Kontakty");
    await page.getByLabel("Verejný e-mail").fill("kontakt@example.sk");
    await page.getByLabel("Web", { exact: true }).fill("https://example.sk/");
    await showOrganizationSection(page, "organization-media", "Obrázok a zdroj");
    await page.getByLabel("Zdroj / referencia").fill("https://example.sk/zdroj");
    await showOrganizationSection(page, "organization-contacts", "Kontakty");
    await expect(page.getByLabel("Verejný e-mail")).toHaveValue("kontakt@example.sk");
    await showOrganizationSection(page, "organization-location-panel", "Adresa a mapa");
    await expect(page.getByLabel("Adresa", { exact: true })).toHaveValue("Skúšobná 12");
    await expect(page.getByLabel("Mesto", { exact: true })).toHaveValue("Nitra");
    await showOrganizationSection(page, "organization-content", "Verejný obsah");
    await expect(page.getByLabel("Krátky popis")).toContainText("Pomoc strateným a nájdeným psom.");
    await showOrganizationSection(page, "organization-general", "Základné");
    await expect(page.getByLabel("Názov *", { exact: true })).toHaveValue("Neuložená organizácia krok 15");
    await expect(page.getByLabel("Slug *", { exact: true })).toHaveValue("neulozena-organizacia-krok-15");
    expect(writes).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });
}

test("organization submit reveals an invalid field in a hidden section without API writes", async ({ page }) => {
  await page.goto("/admin/organizacie/novy", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Názov *", { exact: true }).fill("Neplatný e-mail v skrytej sekcii");
  await page.getByLabel("Slug *", { exact: true }).fill("neplatny-email-v-skrytej-sekcii");
  await showOrganizationSection(page, "organization-contacts", "Kontakty");
  await page.getByLabel("Verejný e-mail").fill("not-valid-email");
  const writes: string[] = [];
  page.on("request", request => {
    if (["POST", "PUT"].includes(request.method()) && request.url().includes("/api/admin/organizations")) writes.push(request.url());
  });
  await showOrganizationSection(page, "organization-media", "Obrázok a zdroj");
  await page.getByRole("button", { name: "Vytvoriť koncept" }).click();
  // The invalid email is in a hidden panel at submit time.
  await expect(page.locator("#organization-contacts")).toBeVisible();
  await expect(page.locator('[data-admin-form-feedback="error"]')).toContainText("Verejný e-mail");
  expect(writes).toEqual([]);
});
