import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("MAP-1B admin geo foundation", () => {
  test("directory geo controls are simple, privacy-safe and mobile-friendly", async ({ page }, testInfo) => {
    await page.setViewportSize(testInfo.project.name === "mobile-chromium"
      ? { width: 390, height: 844 }
      : { width: 1280, height: 900 });

    await page.goto("/admin/adresar?category=treneri&q=Directory+Admin+Editor+Fixture", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: "Directory Admin Editor Fixture" }).click();

    const locationSection = page.locator("#directory-location");
    const geoPanel = locationSection.locator("[data-admin-geo-location]");
    await expect(geoPanel.getByRole("heading", { name: "Poloha na mape" })).toBeVisible();
    await expect(geoPanel.getByLabel("Verejná poloha")).toBeVisible();

    // Tréner je privacy-sensitive category: bezpečný default zostáva neverejný.
    await expect(geoPanel.getByLabel("Verejná poloha")).toHaveValue("no");
    await expect(geoPanel.getByText(/bezpečný predvolený stav neverejný/i)).toBeVisible();

    // Staré technické ovládanie už nesmie dominovať bežnému editoru.
    await expect(geoPanel.getByLabel("Latitude")).toHaveCount(0);
    await expect(geoPanel.getByLabel("Longitude")).toHaveCount(0);
    await expect(geoPanel.getByLabel("Precision")).toHaveCount(0);
    await expect(geoPanel.getByRole("button", { name: "Uložiť klasifikáciu" })).toHaveCount(0);
    await expect(geoPanel.getByRole("button", { name: "Uložiť manual marker" })).toHaveCount(0);
    await expect(geoPanel.getByRole("button", { name: "Diagnostika Geoapify (bez zápisu)" })).toHaveCount(0);

    await geoPanel.getByLabel("Verejná poloha").selectOption("yes");
    await expect(geoPanel.getByRole("button", { name: /Nájsť polohu podľa adresy|Overiť znova|Nájsť polohu znova/ })).toBeVisible();

    await geoPanel.getByText("Technické informácie").click();
    await expect(geoPanel.getByText("Verejná mapa")).toBeVisible();

    const scan = await new AxeBuilder({ page }).include("[data-admin-geo-location]").analyze();
    expect(scan.violations).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("maps are operator-first and advanced safety gates remain available under tools", async ({ page }) => {
    await page.goto("/admin/mapy", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: "Mapy" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Stav verejných profilov" })).toBeVisible();
    await expect(page.getByPlaceholder("Hľadať názov, obec, okres alebo kategóriu")).toBeVisible();
    await expect(page.getByRole("button", { name: "Na mape" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Čaká na spracovanie" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Treba skontrolovať" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Chýba adresa" })).toBeVisible();

    await page.goto("/admin/nastroje/geo", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: "GEO nástroje" })).toBeVisible();
    await expect(page.getByText(/Full production backfill je hard-disabled/)).toBeVisible();
    await expect(page.getByLabel("Target type", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Inicializovať SAFE max. 20" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Backfill max. 5" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Canary max. 5" })).toBeVisible();
    await expect(page.getByRole("button", { name: /geocode všetko/i })).toHaveCount(0);

    const a2 = page.locator("[data-admin-a2-exact-automation]");
    await expect(a2.getByRole("heading", { name: "A2 — Exact directory automation" })).toBeVisible();
    await expect(a2.getByText(/Read-only preview — nič nemení a nevolá Geoapify/)).toBeVisible();
    await expect(a2.getByRole("button", { name: "Obnoviť A2 preview" })).toBeVisible();
    await expect(a2.getByLabel("A2 canary — DIRECTORY_PROFILE IDs")).toBeVisible();
    await expect(a2.getByRole("button", { name: "Spustiť A2 canary" })).toBeDisabled();

    const explicit = page.locator("[data-admin-explicit-geo-onboarding]");
    await expect(explicit.getByRole("heading", { name: "Legacy explicit approximate onboarding" })).toBeVisible();
    await expect(explicit.getByText(/Legacy approximate onboarding — nepoužíva sa pre A2 exact rollout/)).toBeVisible();
    await expect(explicit.getByLabel("Explicit target type")).toHaveValue("DIRECTORY_PROFILE");
    await expect(explicit.getByLabel("Explicit visibility")).toHaveValue("APPROXIMATE_PUBLIC");
    await expect(explicit.getByLabel("Explicit precision")).toHaveValue("MUNICIPALITY");
    await expect(explicit.getByLabel("Canonical IDs")).toBeVisible();
    await expect(explicit.getByRole("button", { name: "Náhľad" })).toBeDisabled();
    await expect(explicit.getByRole("button", { name: "Spustiť explicitný batch" })).toHaveCount(0);

    await page.getByLabel("Target type", { exact: true }).selectOption("MANAGED_EVENT");
    await expect(page.getByLabel("Directory category")).toHaveCount(0);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
