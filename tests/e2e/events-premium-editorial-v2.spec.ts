import { expect, test } from "@playwright/test";

test("V2-09 event calendar consumes premium tokens at every required viewport", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
  test.setTimeout(120_000);
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/podujatia");
    const heading = page.locator("#events-calendar-title");
    await expect(heading).toBeVisible();
    await expect(heading).toHaveCSS("font-family", /Psipedia Newsreader/);
    const panel = page.locator("[data-events-month-calendar]");
    await expect(panel).toHaveCSS("border-top-left-radius", "14px");
    const next = page.getByRole("link", { name: "Nasledujúci mesiac" });
    await expect(next).toBeVisible();
    await expect(next).toHaveAttribute("href", /kalendar=/);
    await expect(next).toHaveCSS("min-height", "44px");
    await expect(next).toHaveCSS("border-top-left-radius", "9px");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
    await expect(page.locator("[data-event-filters]")).toHaveCount(1);
    await expect(page.locator("[data-events-legend]")).toBeVisible();
  }
});

test("V2-09 category, empty results and event detail retain public semantics", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
  await page.goto("/podujatia/vystavy?q=zzzz-v2-09-no-match");
  await expect(page.getByRole("heading", { name: "Nenašli sme zhodu" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nenašli sme zhodu" })).toHaveCSS("font-family", /Psipedia Newsreader/);
  await page.goto("/podujatia?termin=vsetky");
  const card = page.locator("[data-event-card]").first();
  await expect(card).toBeVisible();
  await expect(card).toHaveCSS("border-top-left-radius", "14px");
  await expect(card.locator("[data-public-card-title]")).toHaveCSS("font-family", /Psipedia Newsreader/);
  await expect(card.locator("[data-event-date]")).toHaveAttribute("datetime", /\d{4}-\d{2}-\d{2}/);
  await card.getByRole("link").click();
  const hero = page.locator("[data-event-detail-header]");
  await expect(hero).toBeVisible();
  await expect(hero.getByRole("heading", { level: 1 })).toHaveCSS("font-family", /Psipedia Newsreader/);
  await expect(page.locator("[data-event-facts]")).toContainText("Termín");
});
