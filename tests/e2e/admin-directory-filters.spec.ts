import { expect, test } from "@playwright/test";

test.describe("admin directory server filters", () => {
  test("filters and pagination use the full matching dataset", async ({ page }) => {
    const response = await page.goto("/admin/adresar?category=veterinari&status=draft&q=E2E", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Profily a služby" })).toBeVisible();
    await expect(page.locator(".admin-directory-results")).toContainText("Nájdené: 61");
    await expect(page.locator(".admin-directory-row")).toHaveCount(50);

    await page.getByRole("link", { name: "Ďalšia →" }).click();
    await expect(page).toHaveURL(/\/admin\/adresar\?category=veterinari&status=draft&q=E2E&page=2$/);
    await expect(page.locator(".admin-directory-results")).toContainText("Nájdené: 61");
    await expect(page.locator(".admin-directory-row")).toHaveCount(11);

    await page.getByRole("button", { name: "Publikované", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/admin/adresar" && url.searchParams.get("category") === "veterinari" && url.searchParams.get("status") === "published" && url.searchParams.get("q") === "E2E" && !url.searchParams.has("page"));
    await expect(page.locator(".admin-directory-results")).toContainText("Nájdené: 1");
    await expect(page.locator(".admin-directory-row")).toHaveCount(1);
  });

  test("form filters reset pagination and invalid params fall back safely", async ({ page }) => {
    let response = await page.goto("/admin/adresar?category=bogus&status=archived&page=-4", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByLabel("Kategória")).toHaveValue("");
    await expect(page.getByRole("button", { name: "Všetky", exact: true })).toHaveAttribute("aria-pressed", "true");

    response = await page.goto("/admin/adresar?category=veterinari&status=draft&q=E2E&page=2", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await page.getByLabel("Hľadať profil").fill("E2E");
    await page.getByLabel("Kategória").selectOption("treneri");
    await page.getByRole("button", { name: "Použiť filtre" }).click();
    await page.waitForURL((url) => url.pathname === "/admin/adresar" && url.searchParams.get("q") === "E2E" && url.searchParams.get("category") === "treneri" && url.searchParams.get("status") === "draft" && !url.searchParams.has("page"));
    await expect(page.locator(".admin-directory-results")).toContainText("Nájdené: 1");
    await expect(page.locator(".admin-directory-row")).toHaveCount(1);
  });
});
