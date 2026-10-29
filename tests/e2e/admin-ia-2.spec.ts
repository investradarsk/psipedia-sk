import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

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

test("workspace dashboard is responsive, accessible and has canonical queue links", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile-chromium";
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });

  const response = await page.goto("/admin", { waitUntil: "domcontentloaded" });
  expect(response).not.toBeNull();
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByRole("heading", { name: "Pracovný prehľad", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Čo potrebuje pozornosť", exact: true })).toBeVisible();

  await expect(page.getByRole("link", { name: /Aktívne upozornenia/ })).toHaveAttribute("href", "/admin/operations");
  // Old Tavily attention cards are retired: Gemini and Quality own active work.
  await expect(page.getByRole("link", { name: /Automatizácie na kontrolu/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Automatizácie Gemini →", exact: true })).toHaveAttribute("href", "/admin/automatizacie-gemini");
  await expect(page.getByRole("link", { name: "Kvalita údajov →", exact: true })).toHaveAttribute("href", "/admin/kvalita");
  await expect(page.getByRole("link", { name: /Žiadosti o správu profilu/ })).toHaveAttribute("href", "/admin/operations?source=PARTNER_CLAIM_REVIEW");
  await expect(page.locator('a[href="/admin/kvalita"][class*="metricCard"]')).toHaveAttribute("href", "/admin/kvalita");

  const breadcrumb = page.getByRole("navigation", { name: "Drobečková navigácia" });
  await expect(breadcrumb.getByText("Pracovný prehľad", { exact: true })).toHaveAttribute("aria-current", "page");

  if (mobile) {
    const menuButton = page.getByRole("button", { name: "Menu", exact: true });
    await expect(menuButton).toBeVisible();
    await expect.poll(async () => {
      if (await menuButton.getAttribute("aria-expanded") !== "true") await menuButton.click();
      return menuButton.getAttribute("aria-expanded");
    }).toBe("true");
    const dialog = page.getByRole("dialog", { name: "Navigácia administrácie" });
    await expect(dialog).toBeVisible();

    const nav = dialog.getByRole("navigation", { name: "Redakčné moduly" });
    await expect(nav.getByRole("link", { name: "Pracovný prehľad", exact: true })).toHaveAttribute("aria-current", "page");
    for (const label of ["Služby pre psov ↗", "Pomoc psom ↗"]) {
      const publicLink = dialog.getByRole("link", { name: label });
      await expect(publicLink).toBeVisible();
      expect(await publicLink.evaluate((link) => link.getBoundingClientRect().height), `${label} touch target`).toBeGreaterThanOrEqual(44);
    }
    await expect(nav.getByRole("link", { name: "Tipy", exact: true })).toHaveAttribute("href", "/admin/tipy");

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(menuButton).toBeFocused();
  } else {
    const nav = page.getByRole("navigation", { name: "Redakčné moduly" });
    await expect(page.locator("[data-admin-sidebar-shell]")).toHaveCSS("position", "sticky");
    await expect(nav).toHaveCSS("position", "static");
    await expect(nav).toHaveAttribute("data-admin-sidebar", "true");
    await expect(nav.getByRole("link", { name: "Pracovný prehľad", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(nav).toHaveAttribute("data-admin-hydrated", "true");
    const contentGroup = nav.getByRole("button", { name: "Obsah", exact: true });
    await contentGroup.click();
    await expect(contentGroup).toHaveAttribute("aria-expanded", "true");
    await expect(nav.getByRole("link", { name: "Články", exact: true })).toBeVisible();
    await expect(page.locator(".site-header")).toBeHidden();
    await expect(page.locator(".site-footer")).toBeHidden();
    expect(await nav.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

    const navBox = await nav.boundingBox();
    const headingBox = await page.getByRole("heading", { name: "Pracovný prehľad", exact: true }).boundingBox();
    expect(navBox).not.toBeNull();
    expect(headingBox).not.toBeNull();
    expect((navBox?.x ?? 0) + (navBox?.width ?? 0)).toBeLessThan(headingBox?.x ?? Infinity);
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectAxeClean(page);

  const suffix = mobile ? "mobile-390" : "desktop";
  await page.screenshot({
    path: `.e2e-artifacts/admin-ia-2/dashboard-${suffix}.png`,
    fullPage: true,
  });
});

test("admin logo navigates from content to the homepage without a blank screen", async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile-chromium") {
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await page.goto("/admin/clanky", { waitUntil: "domcontentloaded" });
  const brand = page.getByRole("link", { name: "Psipedia Admin – pracovný prehľad" });
  await expect(brand).toHaveAttribute("href", "/admin");
  await brand.click();
  await expect(page).toHaveURL(/\/admin\/?$/);
  await expect(page.getByRole("heading", { name: "Pracovný prehľad", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Čo potrebuje pozornosť" })).toBeVisible();
});

test("desktop admin navigation mounts only the active section and supports direct route changes", async ({ page }, info) => {
  test.skip(info.project.name === "mobile-chromium", "Desktop accordion check");
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  const nav = page.getByRole("navigation", { name: "Redakčné moduly" });
  await expect(nav).toHaveAttribute("data-admin-hydrated", "true");
  await expect(nav.getByRole("link", { name: "Pracovný prehľad", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Články", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "Obsah", exact: true })).toHaveAttribute("aria-expanded", "false");

  await nav.getByRole("button", { name: "Obsah", exact: true }).click();
  const articles = nav.getByRole("link", { name: "Články", exact: true });
  await expect(articles).toBeVisible();
  await expect(articles).toHaveAttribute("href", "/admin/clanky");
  await articles.click();
  await expect(page).toHaveURL(/\/admin\/clanky(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Články a novinky", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Články", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Upozornenia", exact: true })).toHaveCount(0);
});

test("legacy article-list URLs preserve filters and the explicit article route owns navigation state", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile-chromium";
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });

  const response = await page.goto("/admin?status=draft&query=canary&sort=title&direction=asc&page=2", {
    waitUntil: "domcontentloaded",
  });
  expect(response).not.toBeNull();
  expect(response?.status()).toBeLessThan(400);

  const url = new URL(page.url());
  expect(url.pathname).toBe("/admin/clanky");
  expect(url.searchParams.get("status")).toBe("draft");
  expect(url.searchParams.get("query")).toBe("canary");
  expect(url.searchParams.get("sort")).toBe("title");
  expect(url.searchParams.get("direction")).toBe("asc");
  expect(url.searchParams.get("page")).toBe("2");

  await expect(page.getByRole("heading", { name: "Články a novinky", exact: true })).toBeVisible();
  const filters = page.getByRole("search");
  await expect(filters.getByRole("textbox", { name: "Hľadať článok" })).toHaveValue("canary");
  await expect(filters.getByLabel("Stav")).toHaveValue("draft");
  await expect(filters.getByLabel("Zoradiť")).toHaveValue("title");
  await expect(filters.getByLabel("Smer")).toHaveValue("asc");

  const breadcrumb = page.getByRole("navigation", { name: "Drobečková navigácia" });
  await expect(breadcrumb.getByText("Články", { exact: true })).toHaveAttribute("aria-current", "page");

  if (mobile) {
    const menuButton = page.getByRole("button", { name: "Menu", exact: true });
    await expect.poll(async () => {
      if (await menuButton.getAttribute("aria-expanded") !== "true") await menuButton.click();
      return menuButton.getAttribute("aria-expanded");
    }).toBe("true");
    const dialog = page.getByRole("dialog", { name: "Navigácia administrácie" });
    const nav = dialog.getByRole("navigation", { name: "Redakčné moduly" });
    await expect(nav.getByRole("link", { name: "Články", exact: true })).toHaveAttribute("aria-current", "page");

    const firstLink = nav.getByRole("link", { name: "Pracovný prehľad", exact: true });
    await expect(firstLink).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Zatvoriť admin menu" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(firstLink).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menuButton).toBeFocused();
  } else {
    const nav = page.getByRole("navigation", { name: "Redakčné moduly" });
    await expect(nav.getByRole("link", { name: "Články", exact: true })).toHaveAttribute("aria-current", "page");
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectAxeClean(page);
});

test("V3 all seven navigation groups, focus and header actions work at 1440px, 390px and 320px", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile-chromium";
  for (const width of mobile ? [390, 320] : [1440]) {
    await page.setViewportSize({ width, height: 900 });
    const response = await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("admin-notification-bell")).toBeVisible();
    await expect(page.getByRole("link", { name: "Návrat na Psipedia.sk" })).toBeVisible();
    if (!mobile) await expect(page.getByRole("link", { name: "Odhlásiť" })).toBeVisible();
    const groups = ["Prehľad", "Obsah", "Adresár", "Komunita", "Automatizácie", "Kvalita dát", "Nastavenia"];
    let nav = page.getByRole("navigation", { name: "Redakčné moduly" });
    if (mobile) {
      const menu = page.getByRole("button", { name: "Menu", exact: true });
      const bell = page.getByTestId("admin-notification-bell");
      const back = page.getByRole("link", { name: "Návrat na Psipedia.sk" });
      await expect(bell).toBeInViewport();
      const [menuBox, bellBox, backBox] = await Promise.all([menu.boundingBox(), bell.boundingBox(), back.boundingBox()]);
      expect(menuBox && bellBox && backBox).toBeTruthy();
      // Visibility alone is insufficient: an absolutely positioned drawer
      // trigger can cover a visible, keyboard-focusable notification icon.
      expect((backBox?.x ?? 0) + (backBox?.width ?? 0)).toBeLessThanOrEqual((bellBox?.x ?? 0) + 1);
      expect((bellBox?.x ?? 0) + (bellBox?.width ?? 0)).toBeLessThanOrEqual((menuBox?.x ?? 0) + 1);
      await expect.poll(async () => {
        if (await menu.getAttribute("aria-expanded") !== "true") await menu.click();
        return menu.getAttribute("aria-expanded");
      }).toBe("true");
      const dialog = page.getByRole("dialog", { name: "Navigácia administrácie" });
      await expect(dialog.getByRole("group", { name: "Používateľ administrácie" })).toBeVisible();
      await expect(dialog.getByRole("link", { name: "Odhlásiť" })).toBeVisible();
      nav = dialog.getByRole("navigation", { name: "Redakčné moduly" });
    } else {
      await expect(nav).toHaveAttribute("data-admin-hydrated", "true");
    }
    for (const label of groups) {
      const group = nav.locator(`[data-admin-nav-group="${label}"]`);
      await expect(group).toHaveCount(1);
      if (!mobile) {
        const button = group.getByRole("button", { name: label, exact: true });
        if (await button.getAttribute("aria-expanded") !== "true") {
          await button.focus();
          await page.keyboard.press("Enter");
        }
        await expect(button).toHaveAttribute("aria-expanded", "true");
      }
      await expect(group.getByRole("link").first()).toBeVisible();
      if (label === "Prehľad") {
        await expect(nav.getByRole("link", { name: "Upozornenia", exact: true })).toHaveAttribute("href", "/admin/operations");
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expectAxeClean(page);
    if (mobile) {
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "Navigácia administrácie" })).toHaveCount(0);
    }
  }
});

test("compact finish 02: actual pages across four breakpoints, no horizontal overflow", async ({ page }, info) => {
  // Real routes, not the isolated demo editor. CI's local D1 is disposable;
  // snapshots of content requiring production data can still appear empty.
  const widths = info.project.name === "mobile-chromium" ? [390, 320] : [1440, 768];
  const routes = ["/admin", "/admin/kvalita", "/admin/operations", "/admin/pomoc-psom"] as const;
  for (const width of widths) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
    for (const route of routes) {
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status(), route + " should render from PR code").toBe(200);
      const main = page.locator("#obsah");
      await expect(main).toBeVisible();
      await expect(page.locator("[data-admin-workspace]")).toBeVisible();
      await expect.poll(async () => page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      ), { message: route + " overflows at " + width + "px" }).toBe(true);
      await page.screenshot({
        path: ".e2e-artifacts/admin-ia-2/compact-finish-02-" +
          route.replaceAll("/", "-").replace(/^-/, "") + "-" + width + ".png",
        fullPage: true,
        animations: "disabled",
      });
    }
  }
});

test("compact finish 02: specialized admin screens have rendered before-merge evidence", async ({ page }, info) => {
  // Screenshot the actual admin routes affected by standalone CSS modules.
  // Isolated local D1 may contain no records: screenshot geometry is valid,
  // but populated-list acceptance still needs separate realistic fixtures.
  const width = info.project.name === "mobile-chromium" ? 390 : 1440;
  const routes = [
    "/admin/mapy",
    "/admin/recenzie-profilov",
    "/admin/partners",
    "/admin/organizacie",
    "/admin/podujatia",
    "/admin/plemena",
    "/admin/sluzby-pre-psov",
  ] as const;
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  for (const route of routes) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), route + " should render from PR code").toBe(200);
    await expect(page.locator("#obsah")).toBeVisible();
    await expect(page.locator("[data-admin-workspace]")).toBeVisible();
    await expect.poll(async () => page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    ), { message: route + " should have no document overflow at " + width + "px" }).toBe(true);
    await page.screenshot({
      path: ".e2e-artifacts/admin-ia-2/compact-finish-02-special-" +
        route.replaceAll("/", "-").replace(/^-/, "") + "-" + width + ".png",
      fullPage: true,
      animations: "disabled",
    });
  }
});
