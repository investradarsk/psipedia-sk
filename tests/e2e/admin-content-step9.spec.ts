import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, baseURL }) => {
  const host = baseURL ? new URL(baseURL).hostname : "";
  test.skip(!["localhost", "127.0.0.1", "::1"].includes(host), "Requires isolated authenticated local admin fixtures");
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

async function expectNoPageOverflow(page: import("@playwright/test").Page, width: number) {
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
  "unexpected page-level overflow at " + width).toBe(true);
}

for (const route of [
  { path: "/admin/sekcie", module: "sections", title: "Sekcie a podsekcie" },
  { path: "/admin/recenzie", module: "reviews", title: "Recenzie a testy" },
  { path: "/admin/meniny", module: "name-days", title: "Psie meniny" },
]) {
  test(`step 9: ${route.module} content module keeps one title and fits a narrow phone`, async ({ page }) => {
    const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: route.title, exact: true, level: 1 })).toHaveCount(1);
    const contentModule = page.locator('[data-admin-content-module="' + route.module + '"]');
    await expect(contentModule).toBeVisible();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(contentModule).toBeVisible();
      await expectNoPageOverflow(page, width);
    }
  });
}

test("V5-01: legacy puppy tabs lead to Articles or Sections without losing filters", async ({ page }) => {
  await page.goto("/admin/steniatka?status=published&query=pes&page=2", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/clanky\?.*section=steniatka/);
  await expect(page).toHaveURL(/status=published/);
  await expect(page).toHaveURL(/query=pes/);
  await expect(page).toHaveURL(/page=2/);

  await page.goto("/admin/steniatka?tab=oblasti", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/sekcie\?sekcia=steniatka/);
  await expect(page.getByTestId("admin-section-management")).toBeVisible();
  const puppySection = page.locator("#portal-section-steniatka");
  await expect(puppySection).toBeVisible();
  await expect(puppySection.getByRole("link", { name: "Pokrytie tém" })).toHaveAttribute("href", "/admin/steniatka/pokrytie");
  await page.setViewportSize({ width: 320, height: 844 });
  await expectNoPageOverflow(page, 320);
});

test("step 9: name-day table uses mobile cards and import is optional", async ({ page }) => {
  const response = await page.goto("/admin/meniny", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const contentModule = page.locator('[data-admin-content-module="name-days"]');
  const importPanel = contentModule.locator("details");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(importPanel).not.toHaveAttribute("open", "");
  await expect(importPanel.locator("summary")).toBeVisible();
  await importPanel.locator("summary").click();
  await expect(importPanel.getByRole("textbox", { name: "JSON dáta na import" })).toBeVisible();
  await expect(importPanel.getByRole("button", { name: "Skontrolovať import" })).toBeVisible();
  const table = contentModule.getByRole("table");
  await expect(table).toBeVisible();
  const cards = table.locator("tbody tr");
  if (await cards.count() && await cards.first().locator('td[data-label="Dátum"]').count()) {
    await expect(cards.first().locator('td[data-label="Dátum"]')).toBeVisible();
    await expect(cards.first()).toHaveCSS("display", "grid");
  }
  await expectNoPageOverflow(page, 390);
  await page.setViewportSize({ width: 1440, height: 900 });
  if (await cards.count()) await expect(cards.first()).toHaveCSS("display", "table-row");
});

test("step 9: sections still expose search, hierarchy and original save controls", async ({ page }) => {
  const response = await page.goto("/admin/sekcie", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const editor = page.getByTestId("admin-section-management");
  await expect(editor).toBeVisible();
  await expect(editor.getByRole("textbox", { name: "Hľadať sekciu alebo podsekciu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Uložiť sekcie" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoPageOverflow(page, 390);
});
