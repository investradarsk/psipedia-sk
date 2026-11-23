import { expect, test, type Page } from "@playwright/test";

// Read-only Admin regression: never save, publish or delete user data.
test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-chromium", "Desktop sidebar behavior");
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

async function expectOverview(page: Page) {
  await expect(page).toHaveURL(/\/admin\/?$/);
  await expect(page.locator("[data-admin-shell]")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Pracovný prehľad" })).toBeVisible();
}

function overviewGroup(page: Page) {
  return page.locator('[data-admin-sidebar] [data-admin-nav-group="Prehľad"] > button');
}

test("repeated Prehľad → Adresár → Prehľad client transitions do not stall", async ({ page }) => {
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await expectOverview(page);
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.locator('[data-admin-shell] a[href="/admin/sluzby-pre-psov"]').first().click();
    await expect(page).toHaveURL(/\/admin\/sluzby-pre-psov$/);
    await expect(page.getByRole("heading", { level: 1, name: "Služby pre psov" })).toBeVisible();
    await expect(overviewGroup(page)).toBeVisible();
    await overviewGroup(page).click();
    await expectOverview(page);
  }
});

test("Prehľad opens from an actual directory record editor", async ({ page }) => {
  await page.goto("/admin/adresar", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Profily a služby" })).toBeVisible();
  const detail = page.locator('[data-testid="admin-record-row"] a[href^="/admin/adresar/"]').first();
  await expect(detail).toBeVisible();
  await detail.click();
  await expect(page).toHaveURL(/\/admin\/adresar\/\d+(?:\?.*)?$/);
  await expect(overviewGroup(page)).toBeVisible();
  await overviewGroup(page).click();
  await expectOverview(page);
});

test("Prehľad header asks before leaving a dirty editor and preserves edits on Stay", async ({ page }) => {
  await page.goto("/admin/organizacie/novy", { waitUntil: "domcontentloaded" });
  const name = page.getByLabel("Názov *", { exact: true });
  await expect(name).toBeEnabled();
  await name.fill("Neuložený záznam – regresný test navigácie");
  await expect(overviewGroup(page)).toBeVisible();

  await overviewGroup(page).click();
  const dialog = page.getByRole("dialog", { name: "Neuložené zmeny" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Pokračovať v úpravách" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/admin\/organizacie\/novy$/);
  await expect(name).toHaveValue("Neuložený záznam – regresný test navigácie");

  await overviewGroup(page).click();
  await dialog.getByRole("button", { name: "Zahodiť zmeny a zavrieť" }).click();
  await expectOverview(page);
});
