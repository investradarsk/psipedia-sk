import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const CONSENT_KEY = "psipedia-cookie-consent";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(([key]) => localStorage.setItem(key, "necessary"), [CONSENT_KEY]);
});

test("Events 2.0 listing is compact, filterable and has no giant random hero", async ({ page }) => {
  await page.goto("/podujatia");

  await expect(page.getByRole("heading", { level: 1, name: "Podujatia" })).toBeVisible();
  await expect(page.locator(".section-hero-photo")).toHaveCount(0);
  await expect(page.locator("[data-event-filters]")).toBeVisible();

  const search = page.getByPlaceholder("Názov, mesto, miesto alebo organizátor");
  await expect(search).toBeVisible();
  await expect(page.getByLabel("Kraj")).toBeVisible();
  await expect(page.getByLabel("Mesiac")).toBeVisible();

  const firstCard = page.locator("[data-event-card]").first();
  if (await firstCard.count()) {
    await expect(firstCard.locator("time")).toBeVisible();
    const title = (await firstCard.locator("h3").innerText()).trim();
    if (title) {
      await search.fill(title);
      await expect(page.locator("[data-event-card]")).toHaveCount(1);
      await search.fill("");
    }
  }

  await page.getByRole("link", { name: "Ukončené", exact: true }).click();
  await expect(page).toHaveURL(/termin=ukoncene/);
  await page.getByRole("link", { name: "Najbližšie", exact: true }).click();
  await expect(page).not.toHaveURL(/termin=/);
});

test("Events 2.0 mobile layout has usable controls, no horizontal overflow and no serious Axe findings", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/podujatia");

  const controls = [
    page.getByPlaceholder("Názov, mesto, miesto alebo organizátor"),
    page.getByLabel("Kraj"),
    page.getByLabel("Mesiac"),
    page.getByRole("link", { name: "Najbližšie", exact: true }),
  ];

  for (const control of controls) {
    const box = await control.boundingBox();
    expect(box, "control should have a measurable box").not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client + 1);

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = accessibility.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});
