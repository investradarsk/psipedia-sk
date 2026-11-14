import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page, baseURL }) => {
  const host = baseURL ? new URL(baseURL).hostname : "";
  test.skip(!["localhost", "127.0.0.1", "::1"].includes(host), "Read-only local admin fixtures required");
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

async function expectNoPageOverflow(page: Page, width: number) {
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
  "document overflow at " + width + "px").toBe(true);
}

for (const { path, module } of [
  { path: "/admin/pomoc", module: "help-list" },
  { path: "/admin/adopcie", module: "adoptions-list" },
  { path: "/admin/stratene-najdene", module: "lost-found-list" },
  { path: "/admin/organizacie", module: "organizations-list" },
]) {
  test(`step 12: ${module} search and actions remain accessible at 320–1440px`, async ({ page }) => {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBe(200);
    const moduleRoot = page.locator('[data-admin-content-module="' + module + '"]');
    const filter = page.locator(`[data-admin-content-module="${module}"][data-admin-list-filters], [data-admin-content-module="${module}"] [data-admin-list-filters]`);
    await expect(moduleRoot).toBeVisible();
    await expect(filter).toBeVisible();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(filter).toBeVisible();
      await expectNoPageOverflow(page, width);
    }
    const table = page.locator('[data-sticky-actions="true"]');
    if (await table.count()) {
      await expect(table).toBeVisible();
      await expect(table.locator('th[data-column-id="actions"], td[data-column-id="actions"]').first()).toBeVisible();
    }
  });
}

test("step 12: adoption mobile cards remain usable with table hidden", async ({ page }) => {
  const res = await page.goto("/admin/adopcie", { waitUntil: "domcontentloaded" });
  expect(res?.status()).toBe(200);
  await page.setViewportSize({ width: 390, height: 844 });
  const cards = page.locator('[class*="adoptionCards"]');
  await expect(cards).toBeVisible();
  const firstCard = cards.locator("article").first();
  if (await firstCard.count()) {
    await expect(firstCard).toBeVisible();
    await expect(firstCard.getByRole("link", { name: /Upraviť/ })).toBeVisible();
  }
  await expectNoPageOverflow(page, 390);
});

for (const { path, module } of [
  { path: "/admin/pomoc/novy", module: "help-editor" },
  { path: "/admin/adopcie/novy", module: "adoptions-editor" },
  { path: "/admin/stratene-najdene/novy", module: "lost-found-editor" },
  { path: "/admin/organizacie/novy", module: "organizations-editor" },
]) {
  test(`step 12: ${module} sections and save remain reachable without submitting`, async ({ page }) => {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBe(200);
    const form = page.locator('[data-admin-content-module="' + module + '"]');
    await expect(form).toBeVisible();
    const nav = form.locator("[data-admin-editor-navigation], [data-editor-navigation]");
    if (await nav.count()) await expect(nav.first()).toBeVisible();
    await expect(form.locator("[data-admin-editor-pager]")).toBeVisible();
    await page.setViewportSize({ width: 320, height: 844 });
    await expectNoPageOverflow(page, 320);
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoPageOverflow(page, 390);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expectNoPageOverflow(page, 1440);
    // Never call submit, publish, archive or sync in this visual-only suite.
    await expect(form.locator('button[type="submit"]').first()).toBeVisible();
  });
}
