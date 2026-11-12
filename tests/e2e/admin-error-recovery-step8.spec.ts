import { expect, test } from "@playwright/test";

// The suite is read-only. It never changes canonical records or their status.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("malformed organization Admin ID has an explicit not-found screen, not a white page", async ({ page }) => {
  await page.goto("/admin/organizacie/0x80", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-admin-organization-not-found]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Organizácia sa nenašla" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Späť na zoznam organizácií" })).toHaveAttribute("href", "/admin/organizacie");
  await expect(page.locator("[data-admin-organization-editor]")).toHaveCount(0);
});

test("invalid out-of-range organization ID cannot be coerced into a valid record", async ({ page }) => {
  await page.goto("/admin/organizacie/999999999999999999999999", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-admin-organization-not-found]")).toBeVisible();
  await expect(page.locator("[data-admin-organization-editor]")).toHaveCount(0);
});
