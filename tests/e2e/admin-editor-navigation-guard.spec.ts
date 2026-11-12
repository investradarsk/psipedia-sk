import { expect, test } from "@playwright/test";

// Read-only browser regression: never save, publish or delete live records.
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

async function openEmptyOrganization(page: import("@playwright/test").Page) {
  await page.goto("/admin/organizacie/novy", { waitUntil: "domcontentloaded" });
  const name = page.getByLabel("Názov *", { exact: true });
  await expect(name).toBeEnabled();
  await expect(page.locator("[data-admin-sidebar][data-admin-hydrated='true']")).toBeVisible();
  return name;
}

test("an unchanged editor never blocks ordinary sidebar navigation", async ({ page }) => {
  await openEmptyOrganization(page);
  await page.locator('[data-admin-sidebar] a[href="/admin/plemena"]').click();
  await expect(page).toHaveURL(/\/admin\/plemena$/);
  await expect(page.getByRole("dialog", { name: "Neuložené zmeny" })).toHaveCount(0);
});

test("dirty editor blocks sidebar exit, stay preserves all edits, discard resumes original Link", async ({ page }) => {
  const name = await openEmptyOrganization(page);
  await name.fill("Rozpracovaný názov bez uloženia");
  const route = page.url();
  await page.locator('[data-admin-sidebar] a[href="/admin/plemena"]').click();
  const dialog = page.getByRole("dialog", { name: "Neuložené zmeny" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Pokračovať v úpravách" }).click();
  await expect(dialog).toBeHidden();
  await expect(name).toHaveValue("Rozpracovaný názov bez uloženia");
  expect(page.url()).toBe(route);

  await page.locator('[data-admin-sidebar] a[href="/admin/plemena"]').click();
  await dialog.getByRole("button", { name: "Zahodiť zmeny a zavrieť" }).click();
  await expect(page).toHaveURL(/\/admin\/plemena$/);
  await expect(page.locator("[data-admin-shell]")).toBeVisible();
});

test("Ctrl+K programmatic navigation also asks before dropping a dirty draft", async ({ page }) => {
  const name = await openEmptyOrganization(page);
  await name.fill("Neuložené údaje organizácie");
  await page.keyboard.press("Control+k");
  const palette = page.locator("[data-admin-quick-navigation]");
  await expect(palette).toBeVisible();
  await palette.getByRole("combobox").fill("Plemená");
  await palette.getByRole("option", { name: /Plemená/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Neuložené zmeny" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Pokračovať v úpravách" }).click();
  await expect(name).toHaveValue("Neuložené údaje organizácie");
  await expect(page).toHaveURL(/\/admin\/organizacie\/novy$/);
});
