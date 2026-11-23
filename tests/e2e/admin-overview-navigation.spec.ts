import { expect, test, type Page } from "@playwright/test";

// Read-only Admin regression: never save, publish or delete user data.
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

async function expectOverview(page: Page) {
  await expect(page).toHaveURL(/\/admin\/?$/);
  await expect(page.locator("[data-admin-shell]")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Pracovný prehľad" })).toBeVisible();
  await expect(page.locator('[data-admin-sidebar][data-admin-hydrated="true"]')).toBeAttached();
}

function overviewGroup(page: Page) {
  return page.locator('[data-admin-sidebar] [data-admin-nav-group="Prehľad"] > button');
}

async function clickOverviewGroup(page: Page) {
  // Server HTML can render well before the client navigation button hydrates.
  await expect(page.locator('[data-admin-sidebar][data-admin-hydrated="true"]')).toBeAttached();
  await expect(overviewGroup(page)).toBeVisible();
  await overviewGroup(page).click();
}

test("repeated Prehľad → Adresár → Prehľad client transitions do not stall", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-chromium", "Desktop sidebar behavior");
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await expectOverview(page);
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.locator('[data-admin-shell] a[href="/admin/sluzby-pre-psov"]').first().click();
    await expect(page).toHaveURL(/\/admin\/sluzby-pre-psov$/);
    await expect(page.getByRole("heading", { level: 1, name: "Služby pre psov" })).toBeVisible();
    await expect(overviewGroup(page)).toBeVisible();
    await clickOverviewGroup(page);
    await expectOverview(page);
  }
});

test("Prehľad opens from an actual directory record editor", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-chromium", "Desktop sidebar behavior");
  // Reuse the same deterministic fixture as the existing directory E2E suite.
  // Never assume the first live record is editable or even present.
  await page.goto("/admin/adresar?category=treneri&q=Directory+Admin+Editor+Fixture", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { level: 1, name: "Profily a služby" })).toBeVisible();
  const detail = page.getByRole("link", { name: "Directory Admin Editor Fixture", exact: true });
  await expect(detail).toBeVisible();
  await detail.click();
  await expect(page).toHaveURL(/\/admin\/adresar\/\d+(?:\?.*)?$/);
  await expect(overviewGroup(page)).toBeVisible();
  await clickOverviewGroup(page);
  await expectOverview(page);
});

test("mobile drawer returns from Adresár to Prehľad repeatedly", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-chromium", "Mobile drawer behavior");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await expectOverview(page);

  for (let attempt = 0; attempt < 2; attempt++) {
    const menu = page.getByRole("button", { name: "Menu", exact: true });
    await menu.click();
    const drawer = page.getByRole("dialog", { name: "Navigácia administrácie" });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name: "Služby pre psov", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/sluzby-pre-psov$/);
    await expect(page.getByRole("heading", { level: 1, name: "Služby pre psov" })).toBeVisible();

    await menu.click();
    const home = page.getByRole("dialog", { name: "Navigácia administrácie" })
      .getByRole("link", { name: "Pracovný prehľad", exact: true });
    await home.click();
    await expectOverview(page);
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  }
});

test("Prehľad header asks before leaving a dirty editor and preserves edits on Stay", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-chromium", "Desktop sidebar behavior");
  await page.goto("/admin/organizacie/novy", { waitUntil: "domcontentloaded" });
  const name = page.getByLabel("Názov *", { exact: true });
  await expect(name).toBeEnabled();
  await name.fill("Neuložený záznam – regresný test navigácie");
  await expect(overviewGroup(page)).toBeVisible();

  await clickOverviewGroup(page);
  const dialog = page.getByRole("dialog", { name: "Neuložené zmeny" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Pokračovať v úpravách" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/admin\/organizacie\/novy$/);
  await expect(name).toHaveValue("Neuložený záznam – regresný test navigácie");

  await clickOverviewGroup(page);
  await dialog.getByRole("button", { name: "Zahodiť zmeny a zavrieť" }).click();
  await expectOverview(page);
});
