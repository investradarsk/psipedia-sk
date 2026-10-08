import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("homepage entry opens independent canonical month calendar", async ({ page }) => {
  await page.goto("/");
  const entry = page.locator("[data-home-dog-name-day]");
  await expect(entry).toBeVisible();
  await entry.getByRole("link", { name: /Otvoriť mesačný kalendár/ }).click();
  await expect(page).toHaveURL(/\/psie-meniny/);
  await expect(page.locator("[data-name-day-calendar]")).toBeVisible();
  const count = await page.locator("[data-name-day-date]").count();
  expect(count).toBeGreaterThanOrEqual(28);
  expect(count).toBeLessThanOrEqual(31);
});

test("native keyboard controls, Slovak months and December/January boundary", async ({ page }) => {
  await page.goto("/psie-meniny?mesiac=2026-12");
  await expect(page.getByRole("heading", { name: "december 2026" })).toBeVisible();
  const next = page.getByRole("link", { name: "Nasledujúci mesiac" });
  await next.focus();
  await expect(next).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "január 2027" })).toBeVisible();
  await page.locator('[data-name-day-date="2027-01-01"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-name-day-selected-date="2027-01-01"]')).toBeVisible();
  await expect(page.locator('[data-name-day-selected-date="2027-01-01"]')).toContainText(/Psie meniny/);
  await page.getByRole("link", { name: "Prejsť na dnešný dátum" }).click();
  await expect(page.locator('[data-name-day-date][aria-current="true"]')).toHaveCount(1);
});

test("leap year, desktop/mobile viewport, focus, axe and visual captures", async ({ page }, testInfo) => {
  for (const width of [375, 390, 430, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/psie-meniny?mesiac=2028-02&den=2028-02-29");
    await expect(page.getByRole("heading", { name: "február 2028" })).toBeVisible();
    await expect(page.locator('[data-name-day-date="2028-02-29"]')).toHaveAttribute("data-selected", "true");
    await expect(page.locator("[data-name-day-date]")).toHaveCount(29);
    const delta = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(delta, "horizontal overflow at " + width + "px").toBeLessThanOrEqual(1);
    const rect = await page.locator('[data-name-day-date="2028-02-29"]').boundingBox();
    expect(rect?.width ?? 0, "tap target at " + width + "px").toBeGreaterThanOrEqual(40);
    expect(rect?.height ?? 0).toBeGreaterThanOrEqual(44);

    if (width === 390 || width === 1440) {
      const violations = (await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze())
        .violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
      expect(violations).toEqual([]);
      await testInfo.attach("dog-name-day-calendar-" + width + "px.png", {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
    }
  }
  await page.goto("/psie-meniny?mesiac=2027-02");
  await expect(page.locator("[data-name-day-date]")).toHaveCount(28);
});
