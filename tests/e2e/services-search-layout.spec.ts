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

    const form = page.locator(".directory-results form").first();
    await expect(form).toBeVisible();
    await expect(page.locator("[data-section-hero-search]"), "Legacy hero search must stay removed").toHaveCount(0);

    const primarySearch = form.locator('input[name="q"]');
    const filterToggle = form.getByRole("button", { name: /^Ďalšie filtre/ });
    const submit = form.getByRole("button", { name: "Hľadať" });
    const secondaryFields = form.locator('select[name="category"], select[name="region"], select[name="district"], select[name="city"]');

    await expect(primarySearch).toBeVisible();
    await expect(filterToggle).toBeVisible();
    await expect(filterToggle).toHaveAttribute("aria-expanded", "false");
    await expect(secondaryFields).toHaveCount(4);
    for (const fieldName of ["category", "region", "district", "city"]) {
      await expect(form.locator(`[name="${fieldName}"]`), `${fieldName} collapsed mobile filter`).toBeHidden();
    }
    await expect(submit).toBeVisible();

    await expect(form).toBeVisible();
    const formBox = await form.boundingBox();
    expect(formBox).not.toBeNull();
    expect(formBox!.x).toBeGreaterThanOrEqual(12);
    expect(390 - (formBox!.x + formBox!.width)).toBeGreaterThanOrEqual(12);

    await filterToggle.click();
    await expect(filterToggle).toHaveAttribute("aria-expanded", "true");
    for (const fieldName of ["category", "region", "district", "city"]) {
      await expect(form.locator(`[name="${fieldName}"]`), `${fieldName} expanded mobile filter`).toBeVisible();
    }

    const visibleBoxes = await form.locator("input, select, button, a").evaluateAll((elements) => elements
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
      }));
    for (const box of visibleBoxes) {
      expect(box.left).toBeGreaterThanOrEqual(formBox!.x - 1);
      expect(box.right).toBeLessThanOrEqual(formBox!.x + formBox!.width + 1);
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    await expectNoHorizontalOverflow(page, "/adresar mobile");
    await expectSeriousCriticalAxeClean(page, ".directory-results", "/adresar mobile search");
    await testInfo.attach("ux1cb-after-adresar-mobile-390x844", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });

  test("PUBLIC-SEARCH-SIMPLIFY-1 keeps the desktop services search compact without overflow", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop layout contract");
    await page.setViewportSize({ width: 1440, height: 900 });

    const response = await page.goto("/adresar", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const form = page.locator(".directory-results form").first();
    await expect(form).toBeVisible();
    await expect(page.locator("[data-section-hero-search]"), "Legacy hero search must stay removed").toHaveCount(0);
    await expect(form.locator('input[name="q"]')).toBeVisible();

    const filterToggle = form.getByRole("button", { name: /^Ďalšie filtre/ });
    const submit = form.getByRole("button", { name: "Hľadať" });
    await expect(filterToggle).toBeVisible();
    await expect(filterToggle).toHaveAttribute("aria-expanded", "false");
    await expect(submit).toBeVisible();

    for (const fieldName of ["category", "region", "district", "city"]) {
      await expect(form.locator(`[name="${fieldName}"]`), `${fieldName} collapsed desktop filter`).toBeHidden();
    }

    await filterToggle.click();
    await expect(filterToggle).toHaveAttribute("aria-expanded", "true");
    for (const fieldName of ["category", "region", "district", "city"]) {
      await expect(form.locator(`[name="${fieldName}"]`), `${fieldName} expanded desktop filter`).toBeVisible();
    }

    const formBox = await form.boundingBox();
    expect(formBox).not.toBeNull();
    const visibleBoxes = await form.locator("input, select, button, a").evaluateAll((elements) => elements
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
      }));
    for (const box of visibleBoxes) {
      expect(box.left).toBeGreaterThanOrEqual(formBox!.x - 1);
      expect(box.right).toBeLessThanOrEqual(formBox!.x + formBox!.width + 1);
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    await expectNoHorizontalOverflow(page, "/adresar desktop");
    await expectSeriousCriticalAxeClean(page, ".directory-results", "/adresar desktop filters");
  });

  test("UX-1C-B progressively discloses secondary category filters on mobile", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Mobile filter UX contract");
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto("/adresar/veterinari", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const form = page.locator(".directory-results form").first();
    const primarySearch = form.locator('input[name="q"]');
    const filterToggle = form.getByRole("button", { name: /^Ďalšie filtre/ });
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
      form.getByRole("button", { name: "Hľadať" }).click(),
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

  test("PUBLIC-SEARCH-SIMPLIFY-1 keeps desktop secondary filters compact by default", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop filter UX contract");
    await page.setViewportSize({ width: 1440, height: 1000 });
    const response = await page.goto("/adresar/veterinari", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const form = page.locator(".directory-results form").first();
    await expect(form.locator('input[name="q"]')).toBeVisible();
    const filterToggle = form.getByRole("button", { name: /^Ďalšie filtre/ });
    await expect(filterToggle).toBeVisible();
    await expect(filterToggle).toHaveAttribute("aria-expanded", "false");
    await expect(form.locator('select[name="region"]')).toBeHidden();
    await expect(form.locator('select[name="sort"]')).toBeHidden();
    await page.waitForLoadState("networkidle");
    await expect(filterToggle).toBeEnabled();
    await filterToggle.click();
    await expect(filterToggle).toHaveAttribute("aria-expanded", "true");
    await expect(form.locator('select[name="region"]')).toBeVisible();
    await expect(form.locator('select[name="sort"]')).toBeVisible();
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

    const hero = page.locator("[data-unified-section-hero]").first();
    await expect(hero.getByRole("heading", { level: 1, name: "Služby pre psov" })).toBeVisible();
    await expect(hero.locator("[data-unified-section-hero-copy]")).toContainText("Nájdi veterinára, trénera, klub, salón, opatrovanie alebo ďalšiu praktickú službu");

    const categoryNav = page.getByRole("navigation", { name: "Kategórie služieb" });
    await expect(categoryNav).toHaveAttribute("data-public-subcategory-mode", "landing");
    const categoryLinks = categoryNav.getByRole("link");
    await expect(categoryLinks).toHaveCount(10);

    const canonicalHrefs = [
      "/adresar/veterinari",
      "/adresar/treneri",
      "/adresar/kynologicke-kluby",
      "/adresar/chovatelske-kluby",
      "/adresar/chovatelske-stanice",
      "/adresar/salony-a-sluzby",
      "/adresar/hotely-a-opatrovanie",
      "/adresar/vencenie",
      "/adresar/fyzioterapia",
      "/adresar/dalsie-sluzby",
    ];
    const hrefs = await categoryLinks.evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(hrefs).toEqual(canonicalHrefs);

    for (let index = 0; index < await categoryLinks.count(); index += 1) {
      const link = categoryLinks.nth(index);
      await expect(link).toBeVisible();
      await expect(link.locator("small"), `category ${canonicalHrefs[index]} is missing its data-backed count`).toHaveText(/^\d+ (?:profil|profily|profilov)$/);
    }

    const results = page.locator(".directory-results");
    await expect(results.getByRole("heading", { level: 2, name: "Odporúčané služby" })).toBeVisible();
    expect(await results.locator("[data-directory-card]").count()).toBeGreaterThan(0);

    const providerCta = page.locator("[data-directory-provider-cta]");
    await expect(providerCta.getByRole("heading", { name: "Poskytujete služby pre psov?" })).toBeVisible();
    await expect(providerCta.getByRole("link", { name: "Pridať alebo upraviť profil" })).toHaveAttribute("href", "/o-nas#kontakt");

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


  test("SERVICES-MOBILE-2 keeps search usable at 375, 390, 430 and tablet widths", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Mobile and tablet responsive contract");

    for (const viewport of [
      { width: 375, height: 812 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 768, height: 1024 },
    ]) {
      await page.setViewportSize(viewport);
      const response = await page.goto("/adresar?category=veterinari&q=publikovana", { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(200);

      const form = page.locator(".directory-results form").first();
      await expect(form).toBeVisible();
      await expect(page.locator("[data-section-hero-search]"), "Legacy hero search must stay removed").toHaveCount(0);

      const filterToggle = form.getByRole("button", { name: /^Ďalšie filtre/ });
      await expect(filterToggle).toBeVisible();
      await expect(filterToggle).toHaveAttribute("aria-expanded", "false");
      await page.waitForLoadState("networkidle");
      await expect(filterToggle).toBeEnabled();
      await filterToggle.click();
      await expect(filterToggle).toHaveAttribute("aria-expanded", "true");

      for (const fieldName of ["q", "category", "region", "district", "city"]) {
        await expect(form.locator(`[name="${fieldName}"]`), `${fieldName} at ${viewport.width}px`).toBeVisible();
      }
      await expect(form.getByRole("button", { name: "Hľadať" })).toBeVisible();

      const formBox = await form.boundingBox();
      expect(formBox).not.toBeNull();

      const controlBoxes = await form.locator("select, input, button, a").evaluateAll((elements) => elements
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
        }));
      for (const box of controlBoxes) {
        expect(box.left).toBeGreaterThanOrEqual(formBox!.x - 1);
        expect(box.right).toBeLessThanOrEqual(formBox!.x + formBox!.width + 1);
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }

      await expectNoHorizontalOverflow(page, `/adresar ${viewport.width}px`);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/adresar", { waitUntil: "domcontentloaded" });
    const form = page.locator(".directory-results form").first();
    const filterToggle = form.getByRole("button", { name: /^Ďalšie filtre/ });
    // The interaction requires hydrated client state; an early SSR-only click is inert.
    await page.waitForLoadState("networkidle");
    await expect(filterToggle).toBeEnabled();
    await filterToggle.click();
    await expect(filterToggle).toHaveAttribute("aria-expanded", "true");
    await expect(form.locator('select[name="category"]')).toBeVisible();
    await form.locator('select[name="category"]').selectOption("veterinari");
    await form.locator('input[name="q"]').fill("publikovana");
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/adresar" && url.searchParams.get("category") === "veterinari" && url.searchParams.get("q") === "publikovana"),
      form.getByRole("button", { name: "Hľadať" }).click(),
    ]);
    await expect(form.locator('select[name="category"]')).toHaveValue("veterinari");
    await expect(form.locator('input[name="q"]')).toHaveValue("publikovana");
    await expectNoHorizontalOverflow(page, "/adresar submitted mobile search");
    await expectSeriousCriticalAxeClean(page, "main#obsah", "/adresar SERVICES-MOBILE-2");
  });

  test("SERVICES-MOBILE-2 contains long native control values and long result copy", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Mobile overflow regression contract");
    await page.setViewportSize({ width: 390, height: 844 });

    const response = await page.goto("/adresar/veterinari", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await page.waitForLoadState("networkidle");

    const form = page.locator(".directory-results form").first();
    await expect(form).toBeVisible();
    const filterToggle = form.getByRole("button", { name: /^Ďalšie filtre/ });
    await expect(filterToggle).toBeVisible();
    await expect(filterToggle).toBeEnabled();
    await filterToggle.click();
    await expect(filterToggle).toHaveAttribute("aria-expanded", "true");

    const longValue = "VelmiDlhaLokalitaBezMedzierKtoraNesmieRozsiritSelectAniFormularMimoMobilnehoViewportu";
    const city = form.locator('select[name="city"]');
    await city.evaluate((element, value) => {
      const select = element as HTMLSelectElement;
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = String(value);
      option.selected = true;
      select.append(option);
    }, longValue);
    await form.locator('input[name="q"]').fill(longValue);

    const firstCard = page.locator("[data-directory-card]").first();
    if (await firstCard.count()) {
      await firstCard.evaluate((card, value) => {
        const title = card.querySelector("strong");
        if (title) title.textContent = String(value);
        const location = Array.from(card.querySelectorAll("span")).find((node) => node.textContent?.includes("·"));
        if (location) location.textContent = String(value);
      }, longValue);
    }

    const formBox = await form.boundingBox();
    expect(formBox).not.toBeNull();
    const visibleBoxes = await form.locator('input, select, button, a').evaluateAll((elements) => elements
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
      }));
    for (const box of visibleBoxes) {
      expect(box.left).toBeGreaterThanOrEqual(formBox!.x - 1);
      expect(box.right).toBeLessThanOrEqual(formBox!.x + formBox!.width + 1);
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    await expectNoHorizontalOverflow(page, "long mobile directory values");
  });

  test("SERVICES-MOBILE-2 preserves combined server-backed filters and reset", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Mobile filter contract");
    await page.setViewportSize({ width: 390, height: 844 });

    const response = await page.goto("/adresar/veterinari?q=publikovana&region=Bratislavsk%C3%BD%20kraj&city=Bratislava&sort=name-asc", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const form = page.locator(".directory-results form").first();
    await expect(form.locator('input[name="q"]')).toHaveValue("publikovana");
    await form.getByRole("button", { name: /^Ďalšie filtre/ }).click();
    await expect(form.locator('select[name="region"]')).toHaveValue("Bratislavský kraj");
    await expect(form.locator('select[name="city"]')).toHaveValue("Bratislava");
    await expect(form.locator('select[name="sort"]')).toHaveValue("name-asc");

    await Promise.all([
      page.waitForURL((url) =>
        url.pathname === "/adresar/veterinari" &&
        url.searchParams.get("q") === "publikovana" &&
        url.searchParams.get("region") === "Bratislavský kraj" &&
        url.searchParams.get("city") === "Bratislava" &&
        url.searchParams.get("sort") === "name-asc"
      ),
      form.getByRole("button", { name: "Hľadať" }).click(),
    ]);

    await expectNoHorizontalOverflow(page, "combined services filters");
    await expectSeriousCriticalAxeClean(page, ".directory-results", "combined services filters");

    const reset = page.locator(".directory-results form").first().getByRole("link", { name: "Zrušiť filtre" });
    await reset.click();
    await expectDirectoryLocation(page, "/adresar/veterinari");
    await expect(page.locator('.directory-results input[name="q"]').first()).toHaveValue("");
    await expectNoHorizontalOverflow(page, "services filters reset");
  });

});
