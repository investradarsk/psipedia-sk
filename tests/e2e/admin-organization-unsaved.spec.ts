import { expect, test } from "@playwright/test";

test("organization editor preserves unsaved input on cancelled navigation and failed save", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
  await page.goto("/admin/organizacie/novy", { waitUntil: "domcontentloaded" });
  const name = page.getByLabel("Názov *", {exact:true});
  await expect(name).toBeEnabled();
  await name.fill("Neuložená testovacia organizácia");
  await page.getByLabel("Slug *", {exact:true}).fill("neulozena-testovacia-organizacia");
  await expect(page.getByRole("status").filter({hasText:"Neuložené zmeny"})).toBeVisible();
  await page.getByRole("link", {name:"← Späť na organizácie",exact:true}).click();
  await expect(page.getByRole("dialog", {name:"Neuložené zmeny"})).toBeVisible();
  await page.getByRole("button", {name:"Pokračovať v úpravách"}).click();
  await expect(name).toHaveValue("Neuložená testovacia organizácia");
  await expect(page).toHaveURL(/\/admin\/organizacie\/novy/);

  // No real mutation: exercise the editor's failure path with a synthetic conflict.
  let requests = 0;
  await page.route("**/api/admin/organizations", async route => {
    requests++;
    await route.fulfill({status:409,json:{error:"Testovací konflikt uloženia"}});
  });
  await page.getByRole("button", {name:"Vytvoriť koncept",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("Testovací konflikt uloženia");
  expect(requests).toBe(1);
  await expect(page.getByRole("status").filter({hasText:"Neuložené zmeny"})).toBeVisible();
  await expect(name).toHaveValue("Neuložená testovacia organizácia");
  await page.getByRole("link", {name:"← Späť na organizácie",exact:true}).click();
  await page.getByRole("button", {name:"Zahodiť zmeny a zavrieť"}).click();
  await expect(page).toHaveURL(/\/admin\/organizacie$/);
});
