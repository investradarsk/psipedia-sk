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

test("operations center, shared bell and active/history controls are accessible and responsive", async ({ page }) => {
  const response = await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
  expect(response).not.toBeNull();
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByRole("heading", { name: "Operácie", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Centrum pozornosti", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nájdené weby a registre", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stav automatizácií", exact: true })).toBeVisible();
  await expect(page.getByTestId("admin-attention-queue")).toBeVisible();

  const bell = page.getByTestId("admin-notification-bell");
  await expect(bell).toBeVisible();
  await expect(bell).toHaveAttribute("href", "/admin/operations");
  await expect(bell).toHaveAttribute("aria-label", /^Upozornenia:/);
  const bellBox = await bell.boundingBox();
  expect(bellBox?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(bellBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await bell.focus();
  await expect(bell).toBeFocused();

  const filter = page.getByRole("form", { name: "Filtrovať attention queue" });
  await expect(filter).toHaveAttribute("method", "get");
  await expect(filter.getByLabel("Zobrazenie")).toHaveValue("active");
  await expect(filter.getByLabel("Zdroj")).toHaveValue("all");
  await expect(filter.getByLabel("Priorita")).toHaveValue("all");
  await expect(page.getByRole("link", { name: "Operácie", exact: true })).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectAxeClean(page);
});
