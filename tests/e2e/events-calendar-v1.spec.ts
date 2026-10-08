import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("EVENTS-CALENDAR-V1 month, today, day panel, URLs and browser history", async ({ page }) => {
  await page.goto("/podujatia?kalendar=2026-10&termin=vsetky");
  await expect(page.locator("[data-events-month-calendar]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "október 2026" })).toBeVisible();
  await expect(page.locator("[data-calendar-date]")).toHaveCount(31);

  await page.getByRole("link", { name: "Nasledujúci mesiac" }).click();
  await expect(page).toHaveURL(/kalendar=2026-11/);
  await expect(page.getByRole("heading", { name: "november 2026" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "október 2026" })).toBeVisible();

  await page.locator('[data-calendar-date="2026-10-15"]').click();
  await expect(page).toHaveURL(/den=2026-10-15/);
  await expect(page.locator('[data-selected-day="2026-10-15"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: /15. októbra 2026/ })).toBeVisible();

  const links = page.locator('[data-selected-day="2026-10-15"] a[href^="/podujatia/"]');
  for (const link of await links.all()) {
    const url = await link.getAttribute("href");
    expect(url).toMatch(/^\/podujatia\/[a-z0-9-]+$/);
  }
  await page.getByRole("link", { name: "Zrušiť výber dňa" }).click();
  await expect(page.locator("[data-selected-day]")).toHaveCount(0);

  await page.getByRole("link", { name: "Prejsť na aktuálny mesiac" }).click();
  await expect(page.locator('[data-calendar-date][aria-current="date"]')).toHaveCount(1);
});

test("EVENTS-CALENDAR-V1 retains public filters without duplicating search", async ({ page }) => {
  await page.goto("/podujatia?q=pes&region=Nitriansky%20kraj&mesiac=2026-10&termin=vsetky&kalendar=2026-10");
  await expect(page.locator('[data-public-search-form="events"]')).toHaveCount(1);
  await page.getByRole("link", { name: "Nasledujúci mesiac" }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === "pes"
    && url.searchParams.get("region") === "Nitriansky kraj"
    && url.searchParams.get("mesiac") === "2026-10"
    && url.searchParams.get("termin") === "vsetky"
    && url.searchParams.get("kalendar") === "2026-11");

  await page.getByRole("button", { name: /^Ďalšie filtre/ }).click();
  await expect(page.getByLabel("Kraj")).toHaveValue("Nitriansky kraj");
  await expect(page.getByLabel("Mesiac")).toHaveValue("2026-10");
  await expect(page.getByRole("heading", { name: "Zoznam podujatí" })).toBeVisible();
  expect(await page.locator("[data-event-list]").count()).toBeLessThanOrEqual(1);
});

test("EVENTS-CALENDAR-V1 stays usable without horizontal page overflow", async ({ page }) => {
  for (const width of [390, 430, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/podujatia?kalendar=2026-10&den=2026-10-15&termin=vsetky");
    await expect(page.locator("[data-events-month-calendar]")).toBeVisible();
    const rect = await page.locator('[data-calendar-date="2026-10-15"]').boundingBox();
    expect(rect).not.toBeNull();
    expect(rect!.width).toBeGreaterThan(25);
    const widths = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(widths[0], "page overflow at " + width).toBeLessThanOrEqual(widths[1] + 1);
  }
});

test("EVENTS-CALENDAR-V1 native keyboard links and accessibility", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/podujatia?kalendar=2026-10&termin=vsetky");
  const day = page.locator('[data-calendar-date="2026-10-15"]');
  await day.focus();
  await expect(day).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-selected-day="2026-10-15"]')).toBeVisible();

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(accessibility.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});
