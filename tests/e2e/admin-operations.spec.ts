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

test("alerts center, shared bell and active/history controls are accessible and responsive", async ({ page }) => {
  const response = await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
  expect(response).not.toBeNull();
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByRole("heading", { name: "Upozornenia", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aktívne upozornenia", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Automatizačné zdroje", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Automatizácie na kontrolu", exact: true })).toBeVisible();
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

  const filter = page.getByRole("form", { name: "Filtrovať upozornenia" });
  await expect(filter).toHaveAttribute("method", "get");
  await expect(filter.getByLabel("Zobrazenie")).toHaveValue("active");
  await expect(filter.getByLabel("Zdroj")).toHaveValue("all");
  await expect(filter.getByLabel("Priorita")).toHaveValue("all");

  await expect(page.getByRole("link", { name: "Upozornenia", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mapy", exact: true })).toHaveAttribute("href", "/admin/operations/geo");
  await expect(page.getByRole("link", { name: "Technické nástroje", exact: true })).toHaveAttribute("href", "/admin/nastroje");
  await expect(page.getByRole("link", { name: "Operácie", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Lokality pre budúcu mapu", exact: true })).toHaveCount(0);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectAxeClean(page);
});

test("technical tools and maps have separate working admin entries without horizontal overflow", async ({ page }) => {
  let response = await page.goto("/admin/nastroje", { waitUntil: "domcontentloaded" });
  expect(response).not.toBeNull();
  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByRole("heading", { name: "Technické nástroje", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Import dát", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Profilový outreach", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  response = await page.goto("/admin/operations/geo", { waitUntil: "domcontentloaded" });
  expect(response).not.toBeNull();
  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByRole("heading", { name: "Mapy — profily", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Geo upozornenia", exact: true })).toHaveAttribute("href", "/admin/operations?source=GEO_LOCATION_ISSUE");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectAxeClean(page);
});
