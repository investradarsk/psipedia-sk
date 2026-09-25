import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("MAP-1B admin geo foundation", () => {
  test("directory geo controls are safe on desktop/mobile and manual override is explicit", async ({ page }, testInfo) => {
    await page.setViewportSize(testInfo.project.name === "mobile-chromium"
      ? { width: 390, height: 844 }
      : { width: 1280, height: 900 });

    await page.goto("/admin/adresar?category=treneri&q=Directory+Admin+Editor+Fixture", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: "Directory Admin Editor Fixture" }).click();
    await expect(page.getByRole("heading", { name: "Poloha na mape" })).toBeVisible();
    await expect(page.getByText("Citlivý typ lokality.")).toBeVisible();

    const initialize = page.getByRole("button", { name: "Vytvoriť geo záznam" });
    if (await initialize.count()) {
      await initialize.click();
      await expect(page.getByRole("status")).toContainText("Geo záznam bol inicializovaný");
    }

    await expect(page.getByLabel("Verejná visibility")).toBeVisible();
    await page.getByLabel("Verejná visibility").selectOption("APPROXIMATE_PUBLIC");
    await page.getByLabel("Precision").selectOption("MUNICIPALITY");
    await page.getByRole("button", { name: "Uložiť klasifikáciu" }).click();
    await expect(page.getByRole("status")).toContainText("Privacy klasifikácia bola uložená");

    if (testInfo.project.name === "desktop-chromium") {
      await page.getByLabel("Latitude").fill("48.3061");
      await page.getByLabel("Longitude").fill("18.0764");
      await page.getByLabel("Dôvod manuálnej zmeny").fill("MAP-1B E2E manual marker");
      await page.getByRole("button", { name: "Uložiť manual marker" }).click();
      await expect(page.getByRole("status")).toContainText("Manual marker bol uložený");
      const geoPanel = page.locator("[data-admin-geo-location]");
      await expect(geoPanel.getByText(/MANUAL · manual override/i)).toBeVisible();
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Reset manual override" }).click();
      await expect(page.getByRole("status")).toContainText("Manual override bol resetovaný");
    }

    const scan = await new AxeBuilder({ page }).include("[data-admin-geo-location]").analyze();
    expect(scan.violations).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("geo operations shows gates and never exposes an unbounded full-backfill action", async ({ page }) => {
    await page.goto("/admin/operations/geo", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: "Geo foundation" })).toBeVisible();
    await expect(page.getByText(/Full production backfill je hard-disabled/)).toBeVisible();
    await expect(page.getByLabel("Target type", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Inicializovať SAFE max. 20" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Backfill max. 5" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Canary max. 5" })).toBeVisible();
    await expect(page.getByRole("button", { name: /geocode všetko/i })).toHaveCount(0);

    const explicit = page.locator("[data-admin-explicit-geo-onboarding]");
    await expect(explicit.getByRole("heading", { name: "Explicitný onboarding" })).toBeVisible();
    await expect(explicit.getByLabel("Explicit target type")).toHaveValue("DIRECTORY_PROFILE");
    await expect(explicit.getByLabel("Explicit visibility")).toHaveValue("APPROXIMATE_PUBLIC");
    await expect(explicit.getByLabel("Explicit precision")).toHaveValue("MUNICIPALITY");
    await expect(explicit.getByLabel("Canonical IDs")).toBeVisible();
    await expect(explicit.getByRole("button", { name: "Náhľad" })).toBeDisabled();
    await expect(explicit.getByRole("button", { name: "Spustiť explicitný batch" })).toHaveCount(0);

    await page.getByLabel("Target type", { exact: true }).selectOption("MANAGED_EVENT");
    await expect(page.getByLabel("Directory category")).toHaveCount(0);
  });
});
