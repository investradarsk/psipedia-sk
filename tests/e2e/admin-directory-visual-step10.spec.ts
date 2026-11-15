import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, baseURL }) => {
  const host = baseURL ? new URL(baseURL).hostname : "";
  test.skip(!["localhost", "127.0.0.1", "::1"].includes(host), "Read-only isolated localhost admin fixtures only");
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

async function expectNoDocumentOverflow(page: import("@playwright/test").Page, width: number) {
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
  "unexpected document overflow at " + width + "px").toBe(true);
}

test("step 10: category links and secondary tools remain accessible on phones", async ({ page }) => {
  const response = await page.goto("/admin/sluzby-pre-psov", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const categories = page.locator("[data-admin-directory-categories]");
  const links = categories.getByRole("navigation", { name: "Kategórie profilov" });
  await expect(categories).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(links).toBeVisible();
    if (width <= 760) await expect(links).toHaveCSS("overflow-x", "auto");
    const all = links.getByRole("link", { name: "Všetky profily" });
    await expect(all).toHaveAttribute("href", "/admin/sluzby-pre-psov");
    expect(await all.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await expectNoDocumentOverflow(page, width);
  }
  const tools = categories.locator("[data-admin-directory-tools]");
  await expect(tools.locator("summary")).toBeVisible();
  await tools.locator("summary").click();
  await expect(tools.getByRole("link", { name: "Katalóg služieb a vlastností" }))
    .toHaveAttribute("href", "/admin/sluzby-pre-psov/katalog");
  await expect(tools.getByRole("link", { name: "Návrhy úprav" }))
    .toHaveAttribute("href", "/admin/adresar/navrhy");
});

test("step 10: service directory filters and table actions keep their original links", async ({ page }) => {
  const response = await page.goto("/admin/adresar", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const list = page.locator("[data-admin-directory-list]");
  const form = list.locator("form[data-admin-list-filters]");
  await expect(form).toBeVisible();
  await expect(form.locator('select[name="category"]')).toBeVisible();
  await expect(form.getByRole("button", { name: "Použiť filtre" })).toBeVisible();
  await expect(list.locator("[data-admin-list-results]")).toBeVisible();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expectNoDocumentOverflow(page, width);
  }
  const table = list.locator("[data-density][data-mobile-focus]");
  if (await table.count()) {
    const actions = table.locator("button").filter({ hasText: "Archivovať" }).first();
    if (await actions.count()) expect(await actions.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  }
});

test("step 10: directory editor provides original fields and one compact tools disclosure", async ({ page }) => {
  const response = await page.goto("/admin/adresar/novy", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const editor = page.locator("[data-admin-directory-editor]");
  await expect(editor).toBeVisible();
  await expect(editor.locator("#directory-name")).toBeVisible();
  await expect(editor.locator("#directory-category")).toBeVisible();
  const tools = editor.locator("[data-admin-directory-secondary-tools]");
  await expect(tools.locator("summary")).toBeVisible();
  await tools.locator("summary").click();
  await expect(tools.getByRole("button", { name: "Pokročilé a SEO" })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Uložiť koncept" })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Publikovať profil" })).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expectNoDocumentOverflow(page, width);
  }
});

test("step 10: service catalog remains readable on 320px and keeps working filters", async ({ page }) => {
  const response = await page.goto("/admin/sluzby-pre-psov/katalog", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const catalog = page.locator("[data-admin-directory-catalog]");
  await expect(catalog.locator("[data-admin-list-filters]")).toBeVisible();
  await expect(catalog.locator("[data-admin-list-results]")).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expectNoDocumentOverflow(page, width);
  }
});
