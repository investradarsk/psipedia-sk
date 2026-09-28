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

test("admin PWA settings are responsive, accessible and do not prompt on load", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/admin/nastavenia", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByRole("heading", { name: "Nastavenia aplikácie" })).toBeVisible();
  await expect(page.getByTestId("admin-pwa-settings")).toBeVisible();
  await expect(page.getByText("Offline úpravy").locator("..")).toContainText("Vypnuté");
  await expect(page.getByTestId("push-state")).toBeVisible();
  const refreshButton = page.getByRole("button", { name: "Obnoviť stav", exact: true });
  await expect(refreshButton).toBeVisible();
  const adminActionStyle = await refreshButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      minHeight: Number.parseFloat(style.minHeight),
      borderWidth: Number.parseFloat(style.borderTopWidth),
      borderRadius: Number.parseFloat(style.borderTopLeftRadius),
    };
  });
  expect(adminActionStyle.minHeight).toBeGreaterThanOrEqual(44);
  expect(adminActionStyle.borderWidth).toBeGreaterThan(0);
  expect(adminActionStyle.borderRadius).toBeGreaterThanOrEqual(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectAxeClean(page);
});

test("service worker registers without intercepting admin requests and offline mutations stay network-only", async ({ page, context }) => {
  await page.goto("/admin/nastavenia", { waitUntil: "domcontentloaded" });
  await expect.poll(async () => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration("/admin/");
    return Boolean(registration?.active);
  }), { timeout: 15_000 }).toBe(true);

  await context.setOffline(true);
  await expect(page.getByText(/Si offline/)).toBeVisible();
  const result = await page.evaluate(async () => {
    try {
      await fetch("/api/admin/push/config", { cache: "no-store" });
      return "unexpected-response";
    } catch {
      return "network-error";
    }
  });
  expect(result).toBe("network-error");
  await context.setOffline(false);
});
