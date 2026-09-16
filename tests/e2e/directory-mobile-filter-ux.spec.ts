import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const CONSENT_KEY = "psipedia-cookie-consent";

async function useNecessaryCookies(page: Page) {
  await page.addInitScript(([key]) => localStorage.setItem(key, "necessary"), [CONSENT_KEY]);
}

async function expectNoSeriousOrCriticalAxeViolations(page: Page, label: string) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  const details = violations.map((item) => `${item.id} (${item.impact}): ${item.help}`).join("\n");
  expect(violations, `${label} accessibility violations:\n${details}`).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label} horizontal overflow`).toBeLessThanOrEqual(1);
}

test.beforeEach(async ({ page }) => {
  await useNecessaryCookies(page);
});

test("UX-1C-B mobile keeps primary search visible and progressively discloses secondary filters", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/adresar");

  const mainSearch = page.locator(".directory-main-search");
  const category = mainSearch.locator('select[name="category"]');
  const query = mainSearch.locator('input[name="q"]');
  const submit = mainSearch.getByRole("button", { name: "Hľadať" });
  await expect(category).toBeVisible();
  await expect(query).toBeVisible();
  await expect(submit).toBeVisible();
  const [categoryBox, queryBox, submitBox] = await Promise.all([category.boundingBox(), query.boundingBox(), submit.boundingBox()]);
  expect(categoryBox).not.toBeNull();
  expect(queryBox).not.toBeNull();
  expect(submitBox).not.toBeNull();
  expect(categoryBox!.y).toBeLessThan(queryBox!.y);
  expect(queryBox!.y).toBeLessThan(submitBox!.y);
  await expectNoHorizontalOverflow(page, "/adresar mobile");
  await expectNoSeriousOrCriticalAxeViolations(page, "/adresar mobile");
  await testInfo.attach("ux1cb-after-adresar-mobile-390x844", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

  await page.goto("/adresar/veterinari");
  const form = page.locator(".directory-results form").first();
  const primarySearch = form.locator('input[name="q"]');
  const filterToggle = form.getByRole("button", { name: /^Filtre/ });
  const sort = form.locator('select[name="sort"]');
  await expect(primarySearch).toBeVisible();
  await expect(filterToggle).toBeVisible();
  await expect(filterToggle).toHaveAttribute("aria-expanded", "false");
  await expect(sort).toBeHidden();

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
  await expect(form.getByRole("link", { name: "Zrušiť filtre" })).toBeVisible();
  await expectNoHorizontalOverflow(page, "filtered veterinari mobile");
  await expectNoSeriousOrCriticalAxeViolations(page, "filtered veterinari mobile");
  await testInfo.attach("ux1cb-after-veterinari-active-filter-mobile-390x844", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

  await form.getByRole("link", { name: "Zrušiť filtre" }).click();
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
    await testInfo.attach("ux1cb-after-veterinari-empty-mobile-390x844", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  }
});

test("UX-1C-B desktop keeps secondary filters visible without redesign", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/adresar/veterinari");

  const form = page.locator(".directory-results form").first();
  await expect(form.locator('input[name="q"]')).toBeVisible();
  await expect(form.locator('select[name="region"]')).toBeVisible();
  await expect(form.locator('select[name="sort"]')).toBeVisible();
  await expect(form.getByRole("button", { name: /^Filtre/ })).toBeHidden();
  await expectNoHorizontalOverflow(page, "veterinari desktop");
  await expectNoSeriousOrCriticalAxeViolations(page, "veterinari desktop");
  await testInfo.attach("ux1cb-after-veterinari-desktop-1440", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});
