import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectSeriousCriticalAxeClean(page: Page, include: string, label: string) {
  const accessibility = await new AxeBuilder({ page })
    .include(include)
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const seriousOrCritical = accessibility.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
  expect(seriousOrCritical, `${label}: ${JSON.stringify(seriousOrCritical, null, 2)}`).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label} horizontal overflow`).toBeLessThanOrEqual(1);
}

test.describe("public services search layout", () => {
  test("keeps the search controls inside the mobile public shell", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Mobile layout contract");
    await page.setViewportSize({ width: 390, height: 844 });

    const response = await page.goto("/adresar", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const form = page.locator(".directory-main-search");
    const controls = form.locator("select, input, button");
    await expect(form).toBeVisible();
    await expect(controls).toHaveCount(3);

    const formBox = await form.boundingBox();
    expect(formBox).not.toBeNull();
    expect(formBox!.x).toBeGreaterThanOrEqual(15);
    expect(390 - (formBox!.x + formBox!.width)).toBeGreaterThanOrEqual(15);

    const controlBoxes = await controls.evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width, top: rect.top };
    }));
    for (const box of controlBoxes) {
      expect(box.left).toBeGreaterThanOrEqual(formBox!.x);
      expect(box.right).toBeLessThanOrEqual(formBox!.x + formBox!.width + 1);
      expect(box.width).toBeGreaterThan(0);
    }
    expect(controlBoxes[0]!.top).toBeLessThan(controlBoxes[1]!.top);
    expect(controlBoxes[1]!.top).toBeLessThan(controlBoxes[2]!.top);

    await expectNoHorizontalOverflow(page, "/adresar mobile");
    await expectSeriousCriticalAxeClean(page, ".directory-main-search", "/adresar mobile search");
    await testInfo.attach("ux1cb-after-adresar-mobile-390x844", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });

  test("retains the desktop three-column search layout without overflow", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop layout contract");
    await page.setViewportSize({ width: 1366, height: 900 });

    const response = await page.goto("/adresar", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const form = page.locator(".directory-main-search");
    const controls = form.locator("select, input, button");
    await expect(controls).toHaveCount(3);
    const tops = await controls.evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);

    await expectNoHorizontalOverflow(page, "/adresar desktop");
  });

  test("UX-1C-B progressively discloses secondary category filters on mobile", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Mobile filter UX contract");
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto("/adresar/veterinari", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const form = page.locator(".directory-results form").first();
    const primarySearch = form.locator('input[name="q"]');
    const filterToggle = form.getByRole("button", { name: /^Filtre/ });
    const sort = form.locator('select[name="sort"]');
    const reset = form.getByRole("link", { name: "Zrušiť filtre" });

    await expect(primarySearch).toBeVisible();
    await expect(filterToggle).toBeVisible();
    await expect(filterToggle).toHaveAttribute("aria-expanded", "false");
    await expect(sort).toBeHidden();
    await expect(reset).toBeVisible();

    const collapsedBox = await form.boundingBox();
    expect(collapsedBox).not.toBeNull();
    expect(collapsedBox!.height, "Collapsed mobile filter form is too tall").toBeLessThan(300);

    await filterToggle.click();
    await expect(filterToggle).toHaveAttribute("aria-expanded", "true");
    await expect(sort).toBeVisible();
    await sort.selectOption("name-asc");
    await Promise.all([
      page.waitForURL(/\/adresar\/veterinari\?sort=name-asc$/),
      form.getByRole("button", { name: "Zobraziť výsledky" }).click(),
    ]);

    await expect(filterToggle).toContainText("1 aktívny");
    await expect(filterToggle).toHaveAttribute("aria-expanded", "false");
    await expect(sort).toBeHidden();
    await expect(reset).toBeVisible();
    await expectNoHorizontalOverflow(page, "filtered veterinari mobile");
    await expectSeriousCriticalAxeClean(page, ".directory-results", "filtered veterinari mobile");
    await testInfo.attach("ux1cb-after-veterinari-active-filter-mobile-390x844", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });

    await reset.click();
    await expect(page).toHaveURL(/\/adresar\/veterinari$/);
    await expect(filterToggle).not.toContainText("aktívny");

    await page.goBack();
    await expect(page).toHaveURL(/\/adresar\/veterinari\?sort=name-asc$/);
    await expect(filterToggle).toContainText("1 aktívny");
    await page.goForward();
    await expect(page).toHaveURL(/\/adresar\/veterinari$/);

    await page.goto("/adresar/veterinari?q=ux1cb-no-match-7e39b2");
    const empty = page.locator(".directory-empty");
    if (await empty.isVisible()) {
      await expect(empty.getByRole("link", { name: "Zrušiť filtre" })).toHaveAttribute("href", "/adresar/veterinari");
      await testInfo.attach("ux1cb-after-veterinari-empty-mobile-390x844", {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
    }
  });

  test("UX-1C-B keeps desktop category filters visible without redesign", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop filter UX contract");
    await page.setViewportSize({ width: 1440, height: 1000 });
    const response = await page.goto("/adresar/veterinari", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const form = page.locator(".directory-results form").first();
    await expect(form.locator('input[name="q"]')).toBeVisible();
    await expect(form.locator('select[name="region"]')).toBeVisible();
    await expect(form.locator('select[name="sort"]')).toBeVisible();
    await expect(form.getByRole("button", { name: /^Filtre/ })).toBeHidden();
    await expectNoHorizontalOverflow(page, "veterinari desktop");
    await expectSeriousCriticalAxeClean(page, ".directory-results", "veterinari desktop");
    await testInfo.attach("ux1cb-after-veterinari-desktop-1440", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });
});
