import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("calendar article detail is keyboard-accessible without navigation, desktop and 390/430 mobile", async ({ page }) => {
  const response = await page.goto("/admin/clanky/kalendar", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);
  const calendar = page.getByRole("region", { name: "Redakčný kalendár" });
  await expect(page.getByRole("heading", { name: "Redakčný kalendár" })).toBeVisible();
  for (const width of [1280, 430, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const articleButton = calendar.locator('button[class*="entry"]').first();
  if (await articleButton.count() === 0) {
    const day = calendar.locator('button[class*="dayButton"]').first();
    await day.click();
    await expect(calendar.locator('[id="calendar-day-detail"]')).toBeVisible();
    test.skip(true, "Seeded E2E data has no scheduled or published items this month.");
  }
  await articleButton.focus();
  await page.keyboard.press("Enter");
  const articleDetail = calendar.locator('[aria-labelledby="calendar-article-detail"]');
  await expect(articleDetail).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/clanky\/kalendar/);
  await expect(articleDetail.getByRole("link", { name: "Otvoriť v editore" })).toHaveAttribute("href", /\/admin\/clanky\/\d+/);
  for (const width of [1280, 430, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await articleDetail.getByRole("heading").focus();
  await page.keyboard.press("Escape");
  await expect(articleDetail).toHaveCount(0);
  await expect(articleButton).toBeFocused();
});
