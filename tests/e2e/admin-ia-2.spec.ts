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
  await expect(page.getByRole("link", { name: /Automatizácie na kontrolu/ })).toHaveAttribute("href", "/admin/operations?source=AUTOMATION_ACTION");
  await expect(page.getByRole("link", { name: /Partner claims/ })).toHaveAttribute("href", "/admin/operations?source=PARTNER_CLAIM_REVIEW");
  await expect(page.locator('a[href="/admin/kvalita"]').filter({ hasText: "profilov s jadrovým nedostatkom" })).toHaveAttribute("href", "/admin/kvalita");

  const breadcrumb = page.getByRole("navigation", { name: "Drobečková navigácia" });
  await expect(breadcrumb.getByText("Pracovný prehľad", { exact: true })).toHaveAttribute("aria-current", "page");

  if (mobile) {
    const menuButton = page.getByRole("button", { name: "Menu", exact: true });
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    const dialog = page.getByRole("dialog", { name: "Navigácia administrácie" });
    await expect(dialog).toBeVisible();

    const nav = dialog.getByRole("navigation", { name: "Redakčné moduly" });
    await expect(nav.getByRole("link", { name: "Pracovný prehľad", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Tipy", exact: true })).toHaveAttribute("href", "/admin/tipy");

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(menuButton).toBeFocused();
  } else {
    const nav = page.getByRole("navigation", { name: "Redakčné moduly" });
    await expect(nav).toHaveCSS("position", "sticky");
    const overviewTrigger = nav.getByText("Prehľad", { exact: true });
    await overviewTrigger.click();
    await expect(nav.getByRole("link", { name: "Pracovný prehľad", exact: true })).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
    await expect(overviewTrigger).toBeFocused();
    await expect(nav.getByRole("link", { name: "Pracovný prehľad", exact: true })).toBeHidden();
    await expect(page.locator(".site-header")).toBeHidden();
    await expect(page.locator(".site-footer")).toBeHidden();
    expect(await nav.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

    const navBox = await nav.boundingBox();
    const headingBox = await page.getByRole("heading", { name: "Pracovný prehľad", exact: true }).boundingBox();
    expect(navBox).not.toBeNull();
    expect(headingBox).not.toBeNull();
    expect((navBox?.y ?? 0) + (navBox?.height ?? 0)).toBeLessThan(headingBox?.y ?? Infinity);
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectAxeClean(page);

  const suffix = mobile ? "mobile-390" : "desktop";
  await page.screenshot({
    path: `.e2e-artifacts/admin-ia-2/dashboard-${suffix}.png`,
    fullPage: true,
  });
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
    await menuButton.click();
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
    await nav.getByText("Obsah", { exact: true }).click();
    await expect(nav.getByRole("link", { name: "Články", exact: true })).toHaveAttribute("aria-current", "page");
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectAxeClean(page);
});
