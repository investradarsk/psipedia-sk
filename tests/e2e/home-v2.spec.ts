import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("HOME-2 homepage portal", () => {
  test("renders the portal entry points and canonical live blocks", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Rozumej svojmu psovi");
    const hero = page.locator("[data-home-hero] .hero-card");
    await expect(hero).toBeVisible();
    const heroBox = await hero.boundingBox();
    expect(heroBox?.height ?? 999).toBeLessThan(520);

    const search = page.locator("[data-home-search] form[role=search]");
    await expect(search.locator("input[name=q]")).toBeVisible();
    await expect(search.getByRole("button", { name: "Nájsť všetko" })).toBeVisible();
    await expect(page.locator(".home-search-shortcuts").getByRole("link", { name: "Služby" })).toHaveAttribute("href", "/adresar");

    const services = page.locator("[data-home-services]");
    await expect(services).toBeVisible();
    await expect(services.getByRole("link", { name: /Veterinári/ })).toHaveAttribute("href", "/adresar/veterinari");
    await expect(services.getByRole("link", { name: /Tréneri a psie školy/ })).toHaveAttribute("href", "/adresar/treneri");
    await expect(services.getByRole("link", { name: /Hotely a opatrovanie/ })).toHaveAttribute("href", "/adresar/hotely-a-opatrovanie");
    await expect(services.getByRole("link", { name: /Všetky služby/ })).toHaveAttribute("href", "/adresar");

    const news = page.locator("[data-home-news]");
    await expect(news).toBeVisible();
    const lead = news.locator("[data-home-news-lead]");
    if (await lead.count()) {
      await expect(lead.locator("h3")).not.toHaveText("");
      await expect(lead).not.toContainText(/\b\d+\s*min(?:\s+čítania)?\b/i);
      const secondary = news.locator("[data-home-secondary-news] > a");
      if (await secondary.count()) {
        await expect(secondary.first().locator("strong")).not.toHaveText("");
        await expect(secondary.first()).not.toContainText(/\b\d+\s*min(?:\s+čítania)?\b/i);
      }
    } else {
      await expect(news.locator("[data-home-news-empty]")).toBeVisible();
    }

    const events = page.locator("[data-home-events]");
    const eventRows = events.locator("[data-home-event]");
    if (await eventRows.count()) {
      const first = eventRows.first();
      await expect(first.locator("time")).not.toHaveText("");
      await expect(first.locator("strong")).not.toHaveText("");
      await expect(first.locator("small")).toContainText("·");
    } else {
      await expect(events.locator("[data-home-events-empty]")).toBeVisible();
    }

    const help = page.locator("[data-home-help]");
    const helpRows = help.locator("[data-home-help-item]");
    if (await helpRows.count()) {
      await expect(helpRows.first().locator("strong")).not.toHaveText("");
    } else {
      await expect(help.locator("[data-home-help-empty]")).toBeVisible();
    }

    const breed = page.locator("[data-home-breed]");
    if (await breed.count()) {
      await expect(breed.locator("h3")).not.toHaveText("");
      await expect(breed.locator("dd").first()).not.toHaveText("");
    }

    await expect(page.locator("[data-home-calculator]")).toBeVisible();
  });

  test("homepage search is keyboard-operable and uses the canonical search route", async ({ page }) => {
    await page.goto("/");
    const input = page.locator("#home-search");
    await input.focus();
    await input.fill("labrador");

    await Promise.all([
      page.waitForURL(/\/hladat\?q=labrador/, { waitUntil: "commit" }),
      page.keyboard.press("Enter"),
    ]);

    expect(new URL(page.url()).pathname).toBe("/hladat");
    expect(new URL(page.url()).searchParams.get("q")).toBe("labrador");
  });

  test("keeps the 390x844 mobile viewport dense and free of horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);

    const heroBox = await page.locator("[data-home-hero] .hero-card").boundingBox();
    expect(heroBox?.height ?? 999).toBeLessThanOrEqual(360);

    await expect(page.locator("#home-search")).toBeVisible();
    await expect(page.getByRole("button", { name: "Nájsť všetko" })).toBeVisible();

    const servicesBox = await page.locator("[data-home-services]").boundingBox();
    expect(servicesBox?.y ?? 9999).toBeLessThan(844);

    for (const selector of ["[data-home-news]", "[data-home-events]", "[data-home-help]", "[data-home-calculator]"]) {
      const box = await page.locator(selector).boundingBox();
      expect((box?.width ?? 9999) <= 390).toBe(true);
    }
  });

  test("preserves homepage metadata, schema and serious accessibility checks", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Psipedia\.sk/);
    const schema = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(schema).toContain('"@type":"Organization"');
    expect(schema).toContain('"@type":"WebSite"');
    expect(schema).toContain('"@type":"SearchAction"');
    expect(schema).toContain("/hladat?q={search_term_string}");

    const accessibility = await new AxeBuilder({ page }).include("main").analyze();
    const serious = accessibility.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    expect(serious, serious.map((violation) => `${violation.id}: ${violation.help}`).join("\n")).toEqual([]);
  });
});
