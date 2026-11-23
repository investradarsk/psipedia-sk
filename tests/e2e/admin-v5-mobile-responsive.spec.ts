import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, baseURL }) => {
  const hostname = baseURL ? new URL(baseURL).hostname : "";
  test.skip(!["localhost", "127.0.0.1", "::1"].includes(hostname), "Only isolated local admin fixtures");
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("Admin V5 topbar fits 320–820px without shrinking its action touch targets", async ({ page }) => {
  const response = await page.goto("/admin/clanky", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const topbar = page.locator("[data-admin-topbar]");
  for (const width of [320, 390, 768, 820]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(topbar).toBeVisible();
    const edge = await topbar.evaluate((element) => {
      const { left, right } = element.getBoundingClientRect();
      return { left, right };
    });
    expect(edge.left).toBeGreaterThanOrEqual(-1);
    expect(edge.right).toBeLessThanOrEqual(width + 1);
    for (const locator of [
      page.locator("[data-admin-quick-nav-trigger]"),
      page.getByRole("link", { name: "Návrat na Psipedia.sk" }),
      page.getByTestId("admin-notification-bell"),
    ]) {
      await expect(locator).toBeVisible();
      expect(await locator.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    )).toBe(true);
  }
});

test("Admin V5 complete table keeps sortable headings and 44px column controls on mobile/tablet", async ({ page }) => {
  const response = await page.goto("/admin/clanky", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const table = page.locator('[data-density="compact"][data-mobile-focus]').first();
  test.skip((await table.count()) === 0, "No shared TanStack grid in the fixture");
  for (const width of [390, 768, 820]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(table).toBeVisible();
    if (width <= 700 && await table.getAttribute("data-mobile-focus") === "true") {
      await table.getByRole("button", { name: "Všetky stĺpce" }).click();
    }
    const sortButton = table.locator("th button").first();
    if (await sortButton.count()) {
      expect(await sortButton.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    }
    const picker = table.locator("details").first();
    await picker.locator("summary").click();
    const checkboxLabel = picker.locator("label").first();
    if (await checkboxLabel.count()) {
      expect(await checkboxLabel.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    }
    await picker.locator("summary").click();
  }
});

test("Admin V5 section selector is 16px on phones without changing editor draft", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/admin/plemena/novy", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator('[data-admin-breed-editor-ready="true"]')).toBeVisible();
  const select = page.getByRole("combobox", { name: "Sekcia editora" }).first();
  await expect(select).toBeVisible();
  await expect(select).toHaveCSS("font-size", "16px");
  expect(await select.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  const field = page.getByLabel("Názov plemena", { exact: true });
  await field.focus();
  await expect(page.locator("[data-editor-page] [data-editor-actionbar]").locator("xpath=..")).toHaveCSS("position", "static");
});
