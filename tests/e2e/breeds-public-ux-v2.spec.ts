import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("breed atlas uses three text-only compact destinations and responsive stacking", async ({ page }) => {
  for (const width of [1440, 1280, 1024, 430, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/plemena");
    const actions = page.locator('[data-breed-primary-actions] nav');
    await expect(actions.locator("a")).toHaveCount(3);
    await expect(actions.locator("img, picture")).toHaveCount(0);
    const columns = await actions.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(width > 760 ? 3 : 1);
    for (const link of await actions.locator("a").all()) {
      await expect(link).toHaveAttribute("href", /^\//);
      await link.focus();
      await expect(link).toBeFocused();
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test("breed detail presents the four existing utility destinations beside readable content", async ({ page }) => {
  for (const width of [1440, 1280, 1024, 430, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/plemena/biely-svajciarsky-ovciak");
    const layout = page.getByTestId("breed-content-layout");
    const sidebar = page.getByTestId("breed-utility-sidebar");
    await expect(sidebar).toBeVisible();
    const links = sidebar.getByRole("link");
    await expect(links).toHaveCount(4);
    for (const href of ["/adresar/chovatelske-kluby", "/adresar/treneri", "/adresar/kynologicke-kluby"]) {
      await expect(sidebar.locator(`a[href="${href}"]`)).toHaveCount(1);
    }
    await expect(links.nth(1)).toHaveAttribute("href", /^\/adresar\/chovatelske-stanice/);
    const cols = await layout.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(cols).toBe(width > 1024 ? 2 : 1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    if (width === 1440) {
      const report = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(report.violations.filter((v) => ["critical", "serious"].includes(v.impact ?? ""))).toEqual([]);
    }
  }
});
