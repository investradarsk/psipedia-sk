import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const base = process.env.E2E_BASE_URL ?? "http://localhost:5173";

test("legacy verification link offers Partner claim and no anonymous correction form", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/overenie-profilu/outreach-e2e-verification-token");
  await expect(page.getByRole("heading", { level: 1, name: "Spravujte svoj profil cez Partner účet" })).toBeVisible();
  await expect(page.getByText("Ukážková organizácia")).toBeVisible();
  await expect(page.getByRole("link", { name: "Požiadať o správu cez Partner účet" })).toHaveAttribute(
    "href", "/partner/prevziat-profil/HELP_ORGANIZATION/101",
  );
  await expect(page.getByRole("textbox", { name: "Čo treba opraviť alebo doplniť?" })).toHaveCount(0);
  const retired = await request.post(base + "/api/outreach/verification", {
    data: { token: "outreach-e2e-verification-token", changes: [{ entityType: "HELP_ORGANIZATION", entityId: "101", note: "Zmeňte údaje" }] },
  });
  expect(retired.status()).toBe(410);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
});

test("unsubscribe page is explicit and does not auto-unsubscribe on GET", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/odhlasenie-osloveni/outreach-e2e-unsubscribe-token");
  await expect(page.getByRole("heading", { level: 1, name: "Odhlásenie z ďalších oslovení" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nechcem ďalší profilový outreach" })).toBeVisible();
});
