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

async function expectDirectoryLocation(page: Page, pathname: string, sort: string | null = null) {
  await expect.poll(() => {
    const url = new URL(page.url());
    return {
      pathname: url.pathname,
      sort: url.searchParams.get("sort"),
    };
  }).toEqual({ pathname, sort });
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
    expect(formBox!.x).toBeGreaterThanOrEqual(12);
    expect(390 - (formBox!.x + formBox!.width)).toBeGreaterThanOrEqual(12);

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

    await page.waitForLoadState("networkidle");
    await expect(filterToggle).toBeEnabled();
    await expect(filterToggle).toHaveAttribute("aria-expanded", "false");
    await filterToggle.click();
    await expect(filterToggle).toHaveAttribute("aria-expanded", "true");
    await expect(sort).toBeVisible();
    await sort.selectOption("name-asc");
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/adresar/veterinari" && url.searchParams.get("sort") === "name-asc"),
      form.getByRole("button", { name: "Zobraziť výsledky" }).click(),
    ]);
    await expectDirectoryLocation(page, "/adresar/veterinari", "name-asc");

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
    await expectDirectoryLocation(page, "/adresar/veterinari");
    await expect(filterToggle).not.toContainText("aktívny");

    await page.goBack();
    await expectDirectoryLocation(page, "/adresar/veterinari", "name-asc");
    await expect(filterToggle).toContainText("1 aktívny");
    await page.goForward();
    await expectDirectoryLocation(page, "/adresar/veterinari");

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

  test("SERVICES-PUBLIC landing is compact, data-backed and links every canonical category", async ({ page }) => {
    const response = await page.goto("/adresar", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const header = page.locator("[data-directory-public-header]");
    await expect(header.getByRole("heading", { level: 1, name: "Služby pre psov" })).toBeVisible();
    await expect(header.locator("img")).toHaveCount(0);

    const categoryNav = header.getByRole("navigation", { name: "Kategórie služieb" });
    await expect(categoryNav.getByRole("link")).toHaveCount(10);

    const panels = page.locator("section[data-directory-category]");
    await expect(panels).toHaveCount(10);
    for (let index = 0; index < await panels.count(); index += 1) {
      const panel = panels.nth(index);
      const slug = await panel.getAttribute("data-directory-category");
      expect(slug).toBeTruthy();
      await expect(panel.getByRole("link", { name: "Zobraziť všetkých" })).toHaveAttribute("href", `/adresar/${slug}`);
      const countValue = await panel.getAttribute("data-directory-category-count");
      expect(countValue).not.toBeNull();
      const count = Number(countValue);
      expect(Number.isInteger(count)).toBe(true);
      if (count === 0) {
        await expect(panel.locator("[data-directory-preview-profile]")).toHaveCount(0);
        await expect(panel.locator("[data-directory-empty-state]")).toHaveText("Zatiaľ bez publikovaných profilov.");
      }
    }

    const trainerPanel = page.locator('section[data-directory-category="treneri"]');
    expect(await trainerPanel.locator("[data-directory-preview-profile]").count()).toBeGreaterThan(0);
    await expect(trainerPanel.getByText("E2E Tréner", { exact: true })).toHaveCount(0);

    const jsonLd = (await page.locator('script[type="application/ld+json"]').allTextContents()).join("\n");
    expect(jsonLd).toContain("CollectionPage");
    expect(jsonLd).toContain("/adresar/veterinari");

    await expectNoHorizontalOverflow(page, "/adresar SERVICES-PUBLIC landing");
    await expectSeriousCriticalAxeClean(page, "main#obsah", "/adresar SERVICES-PUBLIC landing");
  });

  test("SERVICES-PUBLIC search is accent-insensitive and location filters stay server-backed", async ({ page }) => {
    let response = await page.goto("/adresar/veterinari?q=publikovana", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByText("E2E Veterina publikovaná", { exact: true })).toBeVisible();

    response = await page.goto("/adresar/veterinari?region=Bratislavsk%C3%BD%20kraj&city=Bratislava", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    const form = page.locator(".directory-results form").first();
    await expect(form.locator('select[name="region"]')).toHaveValue("Bratislavský kraj");
    await expect(form.locator('select[name="city"]')).toHaveValue("Bratislava");
    await expect(page.getByText("E2E Veterina publikovaná", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page, "SERVICES-PUBLIC location filter");
  });

  test("SERVICES-PUBLIC listing uses compact whole-row links and keyboard-sized controls", async ({ page }, testInfo) => {
    if (testInfo.project.name === "mobile-chromium") await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto("/adresar/treneri", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const cards = page.locator("[data-directory-card]");
    expect(await cards.count()).toBeGreaterThan(0);
    const firstCard = cards.first();
    await expect(firstCard).toHaveAttribute("href", /\/adresar\/treneri\//);
    await expect(firstCard.locator("a")).toHaveCount(0);
    await expect(page.locator(".directory-card-media")).toHaveCount(0);

    const controls = page.locator(".directory-results form").first().locator('input[name="q"], button, select');
    const visibleBoxes = await controls.evaluateAll((elements) => elements
      .filter((element) => {
        const style = window.getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" && element.getBoundingClientRect().height > 0;
      })
      .map((element) => ({ height: element.getBoundingClientRect().height, width: element.getBoundingClientRect().width })));
    for (const box of visibleBoxes) {
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThan(0);
    }

    const search = page.locator('.directory-results input[name="q"]').first();
    await search.focus();
    await expect(search).toBeFocused();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");

    if (testInfo.project.name === "mobile-chromium") {
      const cardBox = await firstCard.boundingBox();
      expect(cardBox).not.toBeNull();
      expect(cardBox!.height, "Compact mobile directory row became an oversized card").toBeLessThan(260);
    }

    await expectNoHorizontalOverflow(page, "SERVICES-PUBLIC listing");
    await expectSeriousCriticalAxeClean(page, ".directory-results", "SERVICES-PUBLIC listing");
  });

});
