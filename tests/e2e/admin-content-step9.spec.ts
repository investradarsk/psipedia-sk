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
  { path: "/admin/steniatka", module: "puppy-areas", title: "Šteniatka" },
  { path: "/admin/sekcie", module: "sections", title: "Sekcie a podsekcie" },
  { path: "/admin/recenzie", module: "reviews", title: "Recenzie a testy" },
  { path: "/admin/meniny", module: "name-days", title: "Psie meniny" },
]) {
  test(`step 9: ${route.module} content module keeps one title and fits a narrow phone`, async ({ page }) => {
    const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: route.title, exact: true, level: 1 })).toHaveCount(1);
    const module = page.locator('[data-admin-content-module="' + route.module + '"]');
    await expect(module).toBeVisible();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(module).toBeVisible();
      await expectNoPageOverflow(page, width);
    }
  });
}

test("step 9: puppy accordion keeps edit and article links accessible", async ({ page }) => {
  const response = await page.goto("/admin/steniatka", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const content = page.locator('[data-admin-content-module="puppy-areas"]');
  const area = content.locator("details.admin-puppy-content-item").first();
  test.skip(!(await area.count()), "No puppy area in local fixture");
  await page.setViewportSize({ width: 320, height: 844 });
  const summary = area.locator("summary");
  await expect(summary).toBeVisible();
  expect(await summary.evaluate(x => x.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  if (!(await area.evaluate(x => (x as HTMLDetailsElement).open))) await summary.click();
  await expect(area.getByRole("link", { name: /Pridať článok do oblasti/ })).toBeVisible();
  await expectNoPageOverflow(page, 320);
});

test("step 9: name-day table uses mobile cards and import is optional", async ({ page }) => {
  const response = await page.goto("/admin/meniny", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const module = page.locator('[data-admin-content-module="name-days"]');
  const importPanel = module.locator("details");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(importPanel).not.toHaveAttribute("open", "");
  await expect(importPanel.locator("summary")).toBeVisible();
  await importPanel.locator("summary").click();
  await expect(importPanel.getByRole("textbox", { name: "JSON dáta na import" })).toBeVisible();
  await expect(importPanel.getByRole("button", { name: "Skontrolovať import" })).toBeVisible();
  const table = module.getByRole("table");
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
