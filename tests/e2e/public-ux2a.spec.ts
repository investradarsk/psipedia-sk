import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const CONSENT_KEY = "psipedia-cookie-consent";
const VIEWPORTS = [
  { width: 375, height: 844, label: "375" },
  { width: 390, height: 844, label: "390" },
  { width: 430, height: 900, label: "430" },
  { width: 768, height: 1024, label: "768" },
  { width: 1440, height: 900, label: "1440" },
] as const;

async function gotoPublic(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response, `No response for ${path}`).not.toBeNull();
  expect(response?.status(), `${path} returned HTTP ${response?.status()}`).toBeLessThan(400);
  await expect(page.locator("main#obsah")).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
  );
  expect(overflow, `${label}: document horizontal overflow`).toBeLessThanOrEqual(1);
}

async function expectNoLocatorOverflow(locator: Locator, label: string) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const item = locator.nth(index);
    if (!(await item.isVisible())) continue;
    const overflow = await item.evaluate((element) =>
      Math.max(0, element.scrollWidth - element.clientWidth),
    );
    expect(overflow, `${label} #${index + 1}: horizontal overflow`).toBeLessThanOrEqual(1);
  }
}

async function expectMinHeight(locator: Locator, label: string, minimum = 44) {
  const count = await locator.count();
  expect(count, `${label}: no touch targets found`).toBeGreaterThan(0);
  for (let index = 0; index < Math.min(count, 12); index += 1) {
    const item = locator.nth(index);
    if (!(await item.isVisible())) continue;
    const box = await item.boundingBox();
    expect(box, `${label} #${index + 1}: cannot measure target`).not.toBeNull();
    expect(box?.height ?? 0, `${label} #${index + 1}: target is below 44px`).toBeGreaterThanOrEqual(minimum);
  }
}

async function expectBreadcrumbsFit(page: Page, label: string) {
  const breadcrumbs = page.getByRole("navigation", { name: "Drobečková navigácia" });
  if (await breadcrumbs.count() === 0) return;
  await expectNoLocatorOverflow(breadcrumbs, `${label} breadcrumbs`);
}

async function expectAxeClean(page: Page, label: string) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.filter(
    (item) => item.impact === "critical" || item.impact === "serious",
  );
  expect(violations, `${label}: serious/critical Axe violations\n${JSON.stringify(violations, null, 2)}`).toEqual([]);
}

function shouldRunAxe(width: number) {
  return width === 390 || width === 1440;
}

test.describe("UX-2A public visual consistency", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(([key]) => localStorage.setItem(key, "necessary"), [CONSENT_KEY]);
  });

  test("Plemená stay within the viewport and use accessible atlas controls", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport matrix runs once.");
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await gotoPublic(page, "/plemena");
      await expect(page.getByRole("heading", { level: 1, name: /Plemená|Atlas plemien/ })).toBeVisible();
      await expectNoHorizontalOverflow(page, `Plemená ${viewport.label}`);
      await expectBreadcrumbsFit(page, `Plemená ${viewport.label}`);
      await expectMinHeight(
        page.getByRole("group", { name: "Filtrovať podľa skupiny FCI" }).getByRole("button"),
        `Plemená FCI controls ${viewport.label}`,
      );
      await expectNoLocatorOverflow(page.locator(".breed-card"), `Plemená cards ${viewport.label}`);
      if (shouldRunAxe(viewport.width)) await expectAxeClean(page, `Plemená ${viewport.label}`);
    }
  });

  test("Podujatia preserve date/status semantics across responsive layouts", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport matrix runs once.");
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await gotoPublic(page, "/podujatia");
      await expect(page.getByRole("heading", { level: 1, name: /Podujatia|Výstavy psov|Preteky a skúšky|Semináre a tréningy/ })).toBeVisible();
      await expectNoHorizontalOverflow(page, `Podujatia ${viewport.label}`);
      await expectBreadcrumbsFit(page, `Podujatia ${viewport.label}`);
      await expectMinHeight(
        page.getByRole("group", { name: "Obdobie podujatia" }).getByRole("link"),
        `Podujatia time controls ${viewport.label}`,
      );
      const cards = page.locator("[data-event-card]");
      await expectNoLocatorOverflow(cards, `Podujatia cards ${viewport.label}`);
      const statuses = await cards.evaluateAll((items) => items.map((item) => item.getAttribute("data-event-status")));
      for (const status of statuses) {
        expect(["upcoming", "current", "past", "cancelled"]).toContain(status);
      }
      if (shouldRunAxe(viewport.width)) await expectAxeClean(page, `Podujatia ${viewport.label}`);
    }
  });

  test("Pomoc psom keeps truthful active filtering and responsive cards", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport matrix runs once.");
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await gotoPublic(page, "/pomoc-psom");
      await expect(page.getByRole("heading", { level: 1, name: "Pomoc psom" })).toBeVisible();
      await expect(page.getByLabel("Len aktívne")).toBeChecked();
      await expectNoHorizontalOverflow(page, `Pomoc psom ${viewport.label}`);
      await expectBreadcrumbsFit(page, `Pomoc psom ${viewport.label}`);
      await expectNoLocatorOverflow(page.locator("[data-help-category-nav] > a"), `Pomoc category cards ${viewport.label}`);
      await expectMinHeight(
        page.getByPlaceholder("Meno, mesto alebo organizácia"),
        `Pomoc search ${viewport.label}`,
      );
      if (shouldRunAxe(viewport.width)) await expectAxeClean(page, `Pomoc psom ${viewport.label}`);
    }
  });

  test("Organizácia wraps long content without changing public eligibility/status data", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport matrix runs once.");
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await gotoPublic(page, "/organizacie/org-3b-e2e-kanonicka-organizacia");
      const main = page.locator("main#obsah");
      await expect(main.getByRole("heading", { level: 1, name: "E2E Kanonická organizácia" })).toBeVisible();
      await expect(main.locator("[data-fundraising-method]")).toHaveCount(3);
      await expect(main.locator("[data-adoption-card]")).toHaveCount(2);
      await expect(main.locator('[data-adoption-card="org-3c-e2e-luna-rezervovana"]')).toContainText("Rezervovaný");
      await expect(main.locator('[data-adoption-card="org-3b-e2e-neo-na-adopciu"]')).toContainText("Na adopciu");
      await expect(main.getByText("org7e-verifier@example.invalid", { exact: true })).toHaveCount(0);
      await expectNoHorizontalOverflow(page, `Organizácia ${viewport.label}`);
      await expectBreadcrumbsFit(page, `Organizácia ${viewport.label}`);
      await expectNoLocatorOverflow(main.locator("[data-fundraising-method]"), `Fundraising cards ${viewport.label}`);
      await expectNoLocatorOverflow(main.locator("[data-adoption-card]"), `Adoption cards ${viewport.label}`);
      if (shouldRunAxe(viewport.width)) await expectAxeClean(page, `Organizácia ${viewport.label}`);
    }
  });
});
