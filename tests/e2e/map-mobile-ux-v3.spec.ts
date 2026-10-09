import { expect, test, type Page } from "@playwright/test";

const ITEM = {
  id: "service:24", entityType: "service", entityId: 24, category: "services",
  name: "Veterina Test Nitra", href: "/adresar/veterinari/veterina-test-nitra",
  latitude: 48.3069, longitude: 18.0864, precision: "EXACT",
  displayLocation: "Nitra",
};
const BBOX = { north: 50, south: 47, east: 23, west: 16 };

async function mockMap(page: Page, preseedConsent = true) {
  if (preseedConsent) {
    await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
  }
  await page.route("**/api/map?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        mode: "items", items: [ITEM],
        meta: { count: 1, matched: 1, truncated: false, bbox: BBOX, zoom: 12, cacheTtlSeconds: 30, attribution: [] },
      }),
    });
  });
}

async function noHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test("MAP-MOBILE-UX-V3: iPhone 390px sheet, selection, close and filter dialog", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockMap(page);
  await page.goto("/mapa");
  // Wait for a real client-side /api/map response; SSR already renders the sheet
  // but a click before React hydration does not invoke its event handler.
  await expect(page.getByTestId("map-card-service:24")).toBeAttached();
  const sheet = page.getByTestId("map-results-panel");
  await expect(sheet).toHaveAttribute("data-sheet-state", "peek");
  await expect(page.getByRole("heading", { name: "Mapa Psipedie" })).toBeVisible();
  await noHorizontalOverflow(page);

  const showResults = sheet.getByRole("button", { name: "Výsledky" });
  await showResults.click();
  await expect(sheet).toHaveAttribute("data-sheet-state", "expanded");
  const result = page.getByTestId("map-card-service:24");
  await expect(result).toBeVisible();
  await result.getByRole("button", { name: /Zobraziť Veterina Test Nitra na mape/ }).click();
  await expect(result).toHaveAttribute("data-selected", "true");
  await expect(result.getByRole("link", { name: "Zobraziť profil" }))
    .toHaveAttribute("href", ITEM.href);

  await page.getByTestId("map-close-selection").click();
  await expect(sheet).toHaveAttribute("data-sheet-state", "peek");

  await page.getByRole("button", { name: /Ďalšie filtre/ }).click();
  const dialog = page.getByTestId("map-filter-dialog");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  // The clickable backdrop is not part of the modal keyboard or accessibility tree.
  const backdrop = page.getByTestId("map-filter-backdrop");
  await expect(backdrop).toHaveAttribute("tabindex", "-1");
  await expect(backdrop).toHaveAttribute("aria-hidden", "true");
  await expect(dialog.getByRole("button", { name: "Zavrieť filtre" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Použiť filtre" })).toBeFocused();
  await dialog.getByRole("combobox", { name: "Kraj" }).selectOption({ label: "Nitriansky kraj" });
  await dialog.getByRole("button", { name: "Použiť filtre" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/region=Nitriansky/);
  await noHorizontalOverflow(page);
});

test("PUBLIC-UX-V3 closeout: first-visit consent owns the modal layer before map filters", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockMap(page, false);
  await page.goto("/mapa");

  const consent = page.getByRole("dialog", { name: "Tvoje súkromie na Psipedii" });
  await expect(consent).toBeVisible();
  expect(await consent.evaluate((element) => element.matches(":modal"))).toBe(true);
  const reject = consent.getByRole("button", { name: "Odmietnuť analytiku" });
  await expect(reject).toBeFocused();
  const filterTrigger = page.locator('button[aria-haspopup="dialog"]').filter({ hasText: "Ďalšie filtre" });
  await expect(filterTrigger).toHaveAttribute("aria-expanded", "false");
  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press("Tab");
    expect(await consent.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(consent).toBeVisible();
  await expect(page.getByTestId("map-filter-dialog")).toHaveCount(0);
  await reject.click();
  await expect(consent).toHaveCount(0);
  await expect(filterTrigger).toBeVisible();

  await filterTrigger.click();
  const filters = page.getByTestId("map-filter-dialog");
  await expect(filters).toBeVisible();
  await expect(filters.getByRole("button", { name: "Zavrieť filtre" })).toBeFocused();

  // Reopening cookie settings while filters are visible must put the cookie
  // dialog above them, without leaking Escape to the underlying map handler.
  await page.evaluate(() => window.dispatchEvent(new Event("psipedia:open-cookie-settings")));
  await expect(consent).toBeVisible();
  expect(await consent.evaluate((element) => element.matches(":modal"))).toBe(true);
  await expect(reject).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(consent).toBeVisible();
  await expect(filters).toBeVisible();
  for (let index = 0; index < 4; index += 1) {
    await page.keyboard.press("Tab");
    expect(await consent.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await reject.click();
  await expect(consent).toHaveCount(0);
  await expect(filters).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(filters).toHaveCount(0);
  await expect(filterTrigger).toBeFocused();
  await noHorizontalOverflow(page);
});

test("PUBLIC-UX-V3 closeout: cookie dialog fits 320px portrait and short landscape", async ({ page }) => {
  await mockMap(page, false);
  for (const viewport of [{ width: 320, height: 640 }, { width: 740, height: 360 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/mapa");
    const consent = page.getByRole("dialog", { name: "Tvoje súkromie na Psipedii" });
    await expect(consent).toBeVisible();
    const box = await consent.boundingBox();
    expect(box, `cookie modal at ${viewport.width}x${viewport.height}`).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.y).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
    await noHorizontalOverflow(page);
  }
});

test("MAP-MOBILE-UX-V3: 320px portrait and short landscape have no page overflow", async ({ page }) => {
  await mockMap(page);
  for (const viewport of [{ width: 320, height: 640 }, { width: 740, height: 360 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/mapa");
    await expect(page.getByTestId("map-card-service:24")).toBeAttached();
    await expect(page.getByTestId("map-results-panel")).toBeVisible();
    await noHorizontalOverflow(page);
    await page.getByTestId("map-results-panel").getByRole("button", { name: "Výsledky" }).click();
    await expect(page.getByTestId("map-results-panel")).toHaveAttribute("data-sheet-state", "expanded");
    await noHorizontalOverflow(page);
  }
});

test("MAP-MOBILE-UX-V3: desktop keeps results side panel", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockMap(page);
  await page.goto("/mapa");
  await expect(page.getByTestId("map-card-service:24")).toBeVisible();
  await expect(page.getByTestId("map-results-panel").getByRole("button", { name: "Výsledky" }))
    .toBeHidden();
  await noHorizontalOverflow(page);
});
