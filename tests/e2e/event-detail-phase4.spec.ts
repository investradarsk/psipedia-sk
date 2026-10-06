import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const CONSENT_KEY = "psipedia-cookie-consent";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(([key]) => localStorage.setItem(key, "necessary"), [CONSENT_KEY]);
});

test("event detail exposes primary facts before long content and keeps optional media honest", async ({ page }, testInfo) => {
  await page.setViewportSize(testInfo.project.name.includes("mobile") ? { width: 390, height: 844 } : { width: 1440, height: 960 });
  const href = "/podujatia/e2e-admin-event-2";
  const response = await page.goto(href, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const header = page.locator("[data-event-detail-header]");
  await expect(header.locator("h1")).toBeVisible();

  const breadcrumbs = header.locator(".page-breadcrumbs");
  await expect(breadcrumbs.getByRole("link", { name: "Domov" })).toHaveAttribute("href", "/");
  await expect(breadcrumbs.getByRole("link", { name: "Podujatia" })).toHaveAttribute("href", "/podujatia");

  const facts = page.locator("[data-event-facts]");
  await expect(facts).toBeVisible();
  await expect(facts.getByText("Termín", { exact: true })).toBeVisible();
  await expect(facts.getByText("Miesto", { exact: true })).toBeVisible();
  await expect(facts.getByText("Organizátor", { exact: true })).toBeVisible();

  const image = page.locator("[data-event-image]");
  if (await image.count()) {
    await expect(image).toBeVisible();
  }

  const externalActions = header.locator('a[target="_blank"]');
  for (let index = 0; index < await externalActions.count(); index += 1) {
    await expect(externalActions.nth(index)).toHaveAttribute("href", /^https?:\/\//);
  }

  const body = page.locator("body");
  await expect(body).not.toContainText(/Nezistené\s*[–—-]\s*zdroj/i);
  await expect(body).not.toContainText(/Zdroje:\s*https?:\/\//i);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const axe = await new AxeBuilder({ page })
    .include("main#obsah")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(axe.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);
});
