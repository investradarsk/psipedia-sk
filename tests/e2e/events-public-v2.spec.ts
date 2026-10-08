import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const CONSENT_KEY = "psipedia-cookie-consent";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(([key]) => localStorage.setItem(key, "necessary"), [CONSENT_KEY]);
});

test("PUBLIC-SEARCH-SIMPLIFY-1 events expose one primary URL-backed search", async ({ page }) => {
  await page.goto("/podujatia");

  await expect(page.getByRole("heading", { level: 1, name: "Podujatia" })).toBeVisible();
  await expect(page.locator("[data-public-subcategory-mode=landing]")).toHaveCount(1);
  await expect(page.locator("[data-event-filters]")).toHaveCount(1);
  await expect(page.locator("[data-unified-section-hero] input")).toHaveCount(0);
  await expect(page.locator('[data-public-search-form="events"]')).toHaveCount(1);
  await expect(page.getByPlaceholder("Názov, mesto, miesto alebo organizátor")).toHaveCount(1);

  const search = page.getByPlaceholder("Názov, mesto, miesto alebo organizátor");
  const firstCard = page.locator("[data-event-card]").first();
  if (await firstCard.count()) {
    const title = (await firstCard.locator("h3").innerText()).trim();
    if (title) {
      await search.fill(title);
      await Promise.all([
        page.waitForURL((url) => url.pathname === "/podujatia" && url.searchParams.get("q") === title),
        page.getByRole("button", { name: "Hľadať", exact: true }).click(),
      ]);
      await expect(page.locator("[data-event-card]").first()).toContainText(title);
    }
  }

  await page.goto("/podujatia");
  await page.getByRole("link", { name: "Ukončené", exact: true }).click();
  await expect(page).toHaveURL(/termin=ukoncene/);
  await page.getByRole("link", { name: "Najbližšie", exact: true }).click();
  await expect(page).not.toHaveURL(/termin=/);

  const organizer = page.locator("[data-public-context-banner]");
  await expect(organizer).toHaveCount(1);
  await expect(organizer.getByRole("link", { name: "Pridať podujatie", exact: true })).toHaveAttribute("href", "/podujatia/pridat-podujatie");
});

test("PUBLIC-SEARCH-SIMPLIFY-1 event filters preserve URL state and safe fallbacks", async ({ page }) => {
  await page.goto("/podujatia?q=pes&region=Nitriansky%20kraj&mesiac=2026-10&termin=vsetky");

  const toggle = page.getByRole("button", { name: /^Ďalšie filtre/ });
  await expect(toggle).toContainText("2 aktívne");
  await toggle.click();
  await expect(page.getByLabel("Kraj")).toHaveValue("Nitriansky kraj");
  await expect(page.getByLabel("Mesiac")).toHaveValue("2026-10");

  await page.getByRole("link", { name: "Ukončené", exact: true }).click();
  await expect(page).toHaveURL((url) =>
    url.pathname === "/podujatia"
    && url.searchParams.get("q") === "pes"
    && url.searchParams.get("region") === "Nitriansky kraj"
    && url.searchParams.get("mesiac") === "2026-10"
    && url.searchParams.get("termin") === "ukoncene"
  );

  await page.goto("/podujatia?region=neplatny&mesiac=2026-99&termin=neplatny&q=test");
  const invalidToggle = page.getByRole("button", { name: /^Ďalšie filtre/ });
  await invalidToggle.click();
  await expect(page.getByLabel("Kraj")).toHaveValue("");
  await expect(page.getByLabel("Mesiac")).toHaveValue("");
  await expect(page.getByRole("link", { name: "Najbližšie", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByPlaceholder("Názov, mesto, miesto alebo organizátor")).toHaveValue("test");
});

test("PUBLIC-SEARCH-SIMPLIFY-1 event type pages keep canonical navigation and one search", async ({ page }) => {
  await page.goto("/podujatia/vystavy");

  const compact = page.locator("[data-public-subcategory-mode=compact]");
  await expect(compact).toHaveCount(1);
  await expect(compact.locator("[data-public-subcategory-item]")).toHaveCount(7);
  await expect(compact.getByRole("link", { name: "Výstavy", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("[data-public-subcategory-mode=landing]")).toHaveCount(0);
  await expect(page.locator('[data-public-search-form="events"]')).toHaveCount(1);
  await expect(page.getByPlaceholder("Názov, mesto, miesto alebo organizátor")).toHaveCount(1);

  await compact.getByRole("link", { name: "Semináre", exact: true }).click();
  await expect(page).toHaveURL(/\/podujatia\/seminare(?:\?|$)/);
});

test("PUBLIC-SEARCH-SIMPLIFY-1 event disclosure is compact without horizontal overflow", async ({ page }) => {
  for (const width of [390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/podujatia");

    const search = page.getByPlaceholder("Názov, mesto, miesto alebo organizátor");
    const searchBox = await search.boundingBox();
    expect(searchBox, `search should have a measurable box at ${width}px`).not.toBeNull();
    expect(searchBox!.height).toBeGreaterThanOrEqual(44);

    const toggle = page.getByRole("button", { name: /^Ďalšie filtre/ });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByLabel("Kraj")).not.toBeVisible();
    await expect(page.getByLabel("Mesiac")).not.toBeVisible();

    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByLabel("Kraj")).toBeVisible();
    await expect(page.getByLabel("Mesiac")).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(dimensions.scroll, `body overflow at ${width}px`).toBeLessThanOrEqual(dimensions.client + 1);
  }
});

test("PUBLIC-SEARCH-SIMPLIFY-1 events stay Axe-clean at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/podujatia");
  await page.getByRole("button", { name: /^Ďalšie filtre/ }).click();

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = accessibility.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});
