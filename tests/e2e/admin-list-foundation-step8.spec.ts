import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, baseURL }) => {
  const host = baseURL ? new URL(baseURL).hostname : "";
  test.skip(!["localhost", "127.0.0.1", "::1"].includes(host), "Only isolated local admin fixtures");
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

for (const { name, path } of [
  { name: "articles", path: "/admin/clanky" },
  { name: "breeds", path: "/admin/plemena" },
  { name: "events", path: "/admin/podujatia" },
  { name: "directory", path: "/admin/adresar" },
]) {
  test(`step 8: ${name} list controls and results fit 320/390/1440px`, async ({ page }) => {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const filters = page.locator("[data-admin-list-filters]");
    await expect(filters).toBeVisible();
    const results = page.locator("[data-admin-list-results]");
    await expect(results).toBeVisible();
    const advanced = filters.locator("[data-admin-list-advanced]");
    const toggle = filters.locator("[aria-expanded][aria-controls]");

    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(filters).toBeVisible();
      await expect(results).toBeVisible();

      if (width <= 760 && await toggle.count()) {
        await expect(toggle.first()).toHaveCSS("min-height", "44px");
        // Show all filters, then return to original state, no API mutations.
        const original = await toggle.first().getAttribute("aria-expanded");
        if (original !== "true") await toggle.first().click();
        await expect(advanced.first()).toBeVisible();
        const controls = advanced.first().locator("select");
        if (await controls.count()) {
          const first = controls.first();
          await expect(first).toBeInViewport();
          await expect(first).toHaveCSS("font-size", "16px");
        }
        if (original !== "true") await toggle.first().click();
      }
      expect(await page.evaluate(() =>
        document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
        `${name}: document overflow at ${width}px`).toBe(true);
    }
  });
}

test("step 8: server and client paging share minimum 44px controls", async ({ page }) => {
  for (const path of ["/admin/clanky", "/admin/adresar", "/admin/plemena", "/admin/podujatia"]) {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    const pagination = page.locator("[data-admin-list-pagination]").first();
    if (await pagination.count()) {
      const controls = pagination.locator("a, button, span[aria-disabled='true']");
      await expect(pagination).toBeVisible();
      for (const control of await controls.all()) {
        expect(await control.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      }
      expect(await pagination.evaluate(el => el.getBoundingClientRect().width))
        .toBeLessThanOrEqual(1440);
    }
  }
});

test("step 8: TanStack mobile card switch preserves a full scrollable table alternative", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/admin/clanky", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const table = page.locator('[data-density][data-mobile-focus]').first();
  test.skip(!(await table.count()), "No article rows in isolated fixture");
  const toggle = table.getByRole("button", { name: /Kompaktný pohľad|Všetky stĺpce/ });
  const firstMode = await table.getAttribute("data-mobile-focus");
  await toggle.click();
  await expect(table).not.toHaveAttribute("data-mobile-focus", firstMode ?? "");
  await toggle.click();
  await expect(table).toHaveAttribute("data-mobile-focus", firstMode ?? "");
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
