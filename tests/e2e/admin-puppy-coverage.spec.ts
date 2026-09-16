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

test("puppy coverage matrix is authenticated, readable, responsive and mutation-free", async ({ page }) => {
  const mutationRequests: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) {
      mutationRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  const response = await page.goto("/admin/steniatka/pokrytie", { waitUntil: "domcontentloaded" });
  expect(response).not.toBeNull();
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByRole("heading", { name: "Pokrytie obsahu: Šteniatka", exact: true })).toBeVisible();
  await expect(page.getByTestId("admin-puppy-coverage")).toBeVisible();
  await expect(page.getByText("COVERED = oblasť má aspoň jeden publikovaný článok.", { exact: true })).toBeVisible();
  await expect(page.getByText("PARTIAL = existuje iba draft alebo naplánovaný článok.", { exact: true })).toBeVisible();
  await expect(page.getByText("MISSING = k oblasti nie je priradený žiadny článok.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "+ Pridať článok", exact: true }).first()).toBeVisible();

  const statusCount = await page.locator('[data-testid^="coverage-status-"]').count();
  expect(statusCount).toBeGreaterThan(0);
  expect(mutationRequests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectAxeClean(page);
});
