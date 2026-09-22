import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const AUTH_TOKENS = {
  "desktop-chromium": "partner-e2e-desktop-auth-token-0000000000000001",
  "mobile-chromium": "partner-e2e-mobile-auth-token-000000000000000002",
} as const;

const AUTH_EMAILS = {
  "desktop-chromium": "partner-desktop-e2e@example.sk",
  "mobile-chromium": "partner-mobile-e2e@example.sk",
} as const;

async function expectNoHorizontalOverflow(page: Page) {
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

test("valid one-time link creates a session and exposes membership dashboard/settings", async ({ page }, testInfo) => {
  const project = testInfo.project.name as keyof typeof AUTH_TOKENS;
  const token = AUTH_TOKENS[project];
  const expectedEmail = AUTH_EMAILS[project];
  expect(token).toBeTruthy();

  await page.goto("/partner/overenie#token=" + encodeURIComponent(token));
  await expect(page).toHaveURL(/\/partner$/);
  await expect(page.getByRole("heading", { name: "Prehľad" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Partner navigácia" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("link", { name: "Moje profily" }).click();
  if (project === "desktop-chromium") {
    await expect(page.getByRole("heading", { name: "Partner E2E Veterina" })).toBeVisible();
    await expect(page.getByText("OWNER")).toBeVisible();
  } else {
    await expect(page.getByRole("heading", { name: "Žiadne priradené profily" })).toBeVisible();
  }
  await expectNoHorizontalOverflow(page);

  await page.getByRole("link", { name: "Nastavenia" }).click();
  await expect(page).toHaveURL(/\/partner\/nastavenia$/);
  await expect(page.getByRole("heading", { name: "Nastavenia" })).toBeVisible();
  await expect(page.getByText(expectedEmail)).toBeVisible();
  await expect(page.getByText("Aktívny")).toBeVisible();
  await expect(page.getByRole("button", { name: "Odhlásiť sa" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Deaktivovať účet" })).toBeDisabled();
  await expectNoHorizontalOverflow(page);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByRole("button", { name: "Odhlásiť sa" }).click();
  await expect(page).toHaveURL(/\/partner\/prihlasenie$/);
});

test("internal admin Partner overview and account detail are protected admin pages", async ({ page }, testInfo) => {
  const project=testInfo.project.name as keyof typeof AUTH_EMAILS;
  await page.goto("/admin/partners");
  await expect(page.getByRole("heading",{name:"Partneri"})).toBeVisible();
  await expect(page.getByText(AUTH_EMAILS[project])).toBeVisible();
  await expect(page.getByText("Žiadne Partner workflows momentálne nečakajú")).toBeVisible();
  await page.getByRole("row").filter({hasText:AUTH_EMAILS[project]}).getByRole("link",{name:"Detail →"}).click();
  await expect(page.getByRole("heading",{name:AUTH_EMAILS[project]})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Bezpečnostné akcie"})).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

for (const token of [
  "partner-e2e-used-auth-token-00000000000000000003",
  "partner-e2e-revoked-auth-token-000000000000000004",
  "partner-e2e-expired-auth-token-000000000000000005",
  "partner-e2e-suspended-auth-token-0000000000000006",
  "partner-e2e-deactivated-auth-token-000000000000007",
]) {
  test("unusable magic link fails safely: " + token.slice(12, 20), async ({ page }) => {
    await page.goto("/partner/overenie#token=" + encodeURIComponent(token));
    await expect(page.getByRole("heading", { name: "Odkaz sa nepodarilo overiť" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Vyžiadať nový odkaz" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}
