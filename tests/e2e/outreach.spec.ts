import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const base = process.env.E2E_BASE_URL ?? "http://localhost:5173";

test("verification page is mobile-safe and has no serious/critical axe violations", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/overenie-profilu/outreach-e2e-verification-token");
  await expect(page.getByRole("heading", { level: 1, name: "Skontrolujte svoj profil na Psipedia.sk" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Ukážková organizácia" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Čo treba opraviť alebo doplniť?" })).toBeVisible();
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
