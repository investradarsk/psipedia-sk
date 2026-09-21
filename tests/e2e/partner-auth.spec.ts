import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function expectNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

for (const path of ["/partner/registracia", "/partner/prihlasenie"]) {
  test(path + " is usable, accessible and overflow-safe", async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("main#obsah")).toBeVisible();
    await expect(page.getByLabel("Pracovný e-mail")).toBeVisible();
    await expect(page.getByRole("button", { name: "Poslať prihlasovací odkaz" })).toBeDisabled();
    await expectNoHorizontalOverflow(page);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  });
}

test("invalid verification link has a safe recovery state", async ({ page }) => {
  await page.goto("/partner/overenie");
  await expect(page.getByRole("heading", { name: "Odkaz sa nepodarilo overiť" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Vyžiadať nový odkaz" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("anonymous Partner shell and settings redirect to login", async ({ page }) => {
  await page.goto("/partner");
  await expect(page).toHaveURL(/\/partner\/prihlasenie$/);
  await page.goto("/partner/nastavenia");
  await expect(page).toHaveURL(/\/partner\/prihlasenie$/);
});
