import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const CONSENT_KEY = "psipedia-cookie-consent";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(([key]) => localStorage.setItem(key, "necessary"), [CONSENT_KEY]);
});

test("EVENTS-PUBLIC-UX-1 root has one image-first type navigation and one local search", async ({ page }) => {
  await page.goto("/podujatia");

  await expect(page.getByRole("heading", { level: 1, name: "Podujatia" })).toBeVisible();
  await expect(page.locator(".section-hero-photo")).toHaveCount(0);
  await expect(page.locator("[data-public-subcategory-mode=landing]")).toHaveCount(1);
  await expect(page.locator("[data-public-subcategory-mode=landing] [data-public-subcategory-item]")).toHaveCount(6);
  await expect(page.locator("[data-event-filters]")).toBeVisible();
  await expect(page.locator("[data-unified-section-hero] input")).toHaveCount(0);
  await expect(page.getByPlaceholder("Názov, mesto, miesto alebo organizátor")).toHaveCount(1);
  await expect(page.getByRole("group", { name: "Typ podujatia" })).toHaveCount(0);

  const search = page.getByPlaceholder("Názov, mesto, miesto alebo organizátor");
  const firstCard = page.locator("[data-event-card]").first();
  if (await firstCard.count()) {
    await expect(firstCard.locator("time")).toBeVisible();
    const title = (await firstCard.locator("h3").innerText()).trim();
    if (title) {
      await search.fill(title);
      await expect(page.locator("[data-event-card]").first()).toContainText(title);
      await search.fill("");
    }
  }

  await page.getByRole("link", { name: "Ukončené", exact: true }).click();
  await expect(page).toHaveURL(/termin=ukoncene/);
  await page.getByRole("link", { name: "Najbližšie", exact: true }).click();
  await expect(page).not.toHaveURL(/termin=/);

  const organizer = page.locator("[data-public-context-banner]");
  await expect(organizer).toHaveCount(1);
  await expect(organizer.getByRole("link", { name: "Pridať podujatie", exact: true })).toHaveAttribute("href", "/podujatia/pridat-podujatie");
});

test("EVENTS-PUBLIC-UX-1 type pages use compact crawlable sibling navigation", async ({ page }) => {
  await page.goto("/podujatia/vystavy");

  const compact = page.locator("[data-public-subcategory-mode=compact]");
  await expect(compact).toHaveCount(1);
  await expect(compact.locator("[data-public-subcategory-item]")).toHaveCount(7);
  await expect(compact.getByRole("link", { name: "Výstavy", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("[data-public-subcategory-mode=landing]")).toHaveCount(0);
  await expect(page.getByPlaceholder("Názov, mesto, miesto alebo organizátor")).toHaveCount(1);

  await compact.getByRole("link", { name: "Semináre", exact: true }).click();
  await expect(page).toHaveURL(/\/podujatia\/seminare(?:\?|$)/);
  await expect(page.locator("[data-public-subcategory-mode=compact]").getByRole("link", { name: "Semináre", exact: true })).toHaveAttribute("aria-current", "page");
});

test("EVENTS-PUBLIC-UX-1 responsive flow stays compact from 320 through 768 px", async ({ page }) => {
  for (const width of [320, 375, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/podujatia");

    const search = page.getByPlaceholder("Názov, mesto, miesto alebo organizátor");
    const searchBox = await search.boundingBox();
    expect(searchBox, `search should have a measurable box at ${width}px`).not.toBeNull();
    expect(searchBox!.height).toBeGreaterThanOrEqual(44);

    if (width <= 760) {
      const toggle = page.getByRole("button", { name: "Filtre", exact: true });
      await expect(toggle).toBeVisible();
      const toggleBox = await toggle.boundingBox();
      expect(toggleBox, `filter toggle should have a measurable box at ${width}px`).not.toBeNull();
      expect(toggleBox!.height).toBeGreaterThanOrEqual(44);
      await expect(page.getByLabel("Kraj")).not.toBeVisible();
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(page.getByLabel("Kraj")).toBeVisible();
      await expect(page.getByLabel("Mesiac")).toBeVisible();
    } else {
      await expect(page.getByRole("button", { name: "Filtre", exact: true })).not.toBeVisible();
      await expect(page.getByLabel("Kraj")).toBeVisible();
      await expect(page.getByLabel("Mesiac")).toBeVisible();
    }

    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(dimensions.scroll, `body overflow at ${width}px`).toBeLessThanOrEqual(dimensions.client + 1);
  }
});

test("EVENTS-PUBLIC-UX-1 mobile landing shows the next type card and has no serious Axe findings", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/podujatia");

  const landing = page.locator("[data-public-subcategory-mode=landing]");
  const track = landing.locator("[data-public-subcategory-track]");
  const items = landing.locator("[data-public-subcategory-item]");
  await expect(items).toHaveCount(6);

  const trackBox = await track.boundingBox();
  const secondBox = await items.nth(1).boundingBox();
  expect(trackBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  expect(secondBox!.x).toBeLessThan(trackBox!.x + trackBox!.width);

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = accessibility.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});
