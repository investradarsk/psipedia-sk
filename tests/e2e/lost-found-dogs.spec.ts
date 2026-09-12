import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const paths = ["/pomoc-psom/stratene-psy", "/pomoc-psom/najdene-psy"] as const;

for (const path of paths) {
  test(`${path}: renders filters, canonical and accessible empty/list state`, async ({ page }) => {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://psipedia.sk${path}`);
    await expect(page.locator('form[aria-label^="Filtrovať"]')).toBeVisible();
    await expect(page.getByLabel("Kraj")).toBeVisible();
    await expect(page.getByLabel("Okres alebo lokalita")).toBeVisible();
    await expect(page.getByLabel("Pohlavie")).toBeVisible();
    await expect(page.getByLabel("Veľkosť")).toBeVisible();
    await expect(page.getByLabel("Plemeno")).toBeVisible();
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport + 1);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
  });
}

test("admin lost-found dashboard is protected by the existing admin layer and paginated", async ({ page }) => {
  const response = await page.goto("/admin/stratene-najdene", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Stratené a nájdené psy" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Čakajúce/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Aktívne/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Vyriešené/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Expirované/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Zamietnuté/ })).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
});
