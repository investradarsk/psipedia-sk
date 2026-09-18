import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const CONSENT_KEY = "psipedia-cookie-consent";
const LANDINGS = ["/steniatka", "/starostlivost", "/aktivity"] as const;
const DETAILS = ["/steniatka/prve-dni", "/starostlivost/zdravie", "/aktivity/trening"] as const;
const ALL_SECTION_PAGES = [...LANDINGS, ...DETAILS];

async function useNecessaryCookies(page: Page) {
  await page.addInitScript(([key]) => localStorage.setItem(key, "necessary"), [CONSENT_KEY]);
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll, `${label}: horizontal overflow ${dimensions.scroll}px > ${dimensions.viewport}px`).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function expectAxeClean(page: Page, label: string) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  const details = violations.map((item) =>
    `${item.id} (${item.impact}): ${item.help}\n${item.nodes.slice(0, 5).map((node) => `  ${node.target.join(" ")} – ${node.failureSummary ?? "failed"}`).join("\n")}`
  ).join("\n\n");
  expect(violations, `${label} accessibility violations:\n${details}`).toEqual([]);
}

test.beforeEach(async ({ page }) => useNecessaryCookies(page));

test("SECTION-PUBLIC landings use compact content lists and keep the health urgent contract", async ({ page }) => {
  for (const path of LANDINGS) {
    const response = await page.goto(path, { waitUntil: "commit" });
    expect(response?.status(), path).toBe(200);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator(".portal-hero")).toHaveCount(0);
    await expect(page.locator("[data-section-content-list]")).toHaveCount(1);
    await expect(page.locator("[data-section-directory]")).toHaveCount(1);
    await expect(page.locator("main .article-card")).toHaveCount(0);
  }

  await page.goto("/starostlivost");
  const urgent = page.locator("[data-health-urgent]");
  await expect(urgent.getByText("Keď ide o čas", { exact: true })).toBeVisible();
  await expect(urgent.getByRole("heading", { name: "Má pes akútny problém?" })).toBeVisible();
  await expect(urgent.getByRole("link", { name: "Kedy volať ihneď" })).toHaveAttribute("href", "/starostlivost/kedy-ist-so-psom-k-veterinarovi");
  await expect(urgent.getByRole("link", { name: "Nájsť veterinára" })).toHaveAttribute("href", "/adresar/veterinari");
});

test("SECTION-PUBLIC details use compact headers, preserve useful content and avoid duplicate category blocks", async ({ page }) => {
  for (const path of DETAILS) {
    const response = await page.goto(path, { waitUntil: "commit" });
    expect(response?.status(), path).toBe(200);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator(".portal-topic-hero")).toHaveCount(0);
    await expect(page.locator("[data-section-directory]")).toHaveCount(0);
    await expect(page.locator("[data-section-content-list]")).toHaveCount(1);
    await expect(page.locator("main .article-card")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Na čo sa ľudia pri tejto téme pýtajú" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Užitočné kroky a hranice" })).toBeVisible();
  }

  await page.goto("/steniatka/prve-dni");
  await expect(page.getByText("Praktická orientácia", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Praktické kroky" })).toBeVisible();
  await expect(page.getByText("Krok za krokom", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Čo urobiť teraz", { exact: true })).toHaveCount(0);

  await page.goto("/starostlivost/zdravie");
  const urgent = page.locator("[data-health-urgent]");
  await expect(urgent.getByRole("link", { name: "Kedy volať ihneď" })).toBeVisible();
  await expect(urgent.getByRole("link", { name: "Nájsť veterinára" })).toBeVisible();
});

test("SECTION-PUBLIC navigation is keyboard-operable, touch-sized and locally scrollable at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/aktivity");

  const nav = page.getByRole("navigation", { name: "Navigácia v sekcii Výcvik a aktivity" });
  await expect(nav).toBeVisible();
  expect(await nav.evaluate((element) => getComputedStyle(element).position)).toBe("sticky");

  const navMetrics = await nav.locator(".section-tabs-inner").evaluate((element) => ({
    overflowX: getComputedStyle(element).overflowX,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(navMetrics.overflowX).toBe("auto");
  expect(navMetrics.scrollWidth).toBeGreaterThanOrEqual(navMetrics.clientWidth);

  const heights = await nav.locator(".section-tab").evaluateAll((links) => links.map((link) => link.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(1);
  expect(heights.every((height) => height >= 44)).toBe(true);
  await expectNoHorizontalOverflow(page, "Výcvik landing at 390px");

  const training = nav.getByRole("link", { name: "Tréning", exact: true });
  await training.focus();
  await expect(training).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/aktivity\/trening$/);
  const active = page.getByRole("navigation", { name: "Navigácia v sekcii Výcvik a aktivity" }).getByRole("link", { name: "Tréning", exact: true });
  await expect(active).toHaveAttribute("aria-current", "page");
  await expectNoHorizontalOverflow(page, "Výcvik detail at 390px");
});

test("SECTION-PUBLIC pages keep canonical metadata and CollectionPage structured data", async ({ page }) => {
  for (const path of ALL_SECTION_PAGES) {
    await page.goto(path);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical, `${path}: missing canonical`).toBeTruthy();
    expect(new URL(canonical!).pathname, `${path}: wrong canonical`).toBe(path);

    const schemas = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(schemas.some((schema) => schema.includes('"@type":"CollectionPage"')), `${path}: CollectionPage schema missing`).toBe(true);
    expect(schemas.some((schema) => schema.includes('"@type":"BreadcrumbList"')), `${path}: BreadcrumbList schema missing`).toBe(true);
  }
});

test("SECTION-PUBLIC representative pages are Axe-clean on desktop and mobile", async ({ page }) => {
  for (const path of ["/steniatka", "/starostlivost/zdravie", "/aktivity/trening"]) {
    await page.goto(path);
    await expectAxeClean(page, `${path} desktop`);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/steniatka/prve-dni", "/starostlivost", "/aktivity"]) {
    await page.goto(path);
    await expectNoHorizontalOverflow(page, path);
    await expectAxeClean(page, `${path} mobile`);
  }
});

test("SECTION-PUBLIC keeps public 404 and legacy training redirect contracts", async ({ page }) => {
  const missing = await page.goto("/steniatka/neexistujuca-kategoria-section-v2", { waitUntil: "commit" });
  expect(missing?.status()).toBe(404);

  const legacy = await page.goto("/aktivity/-vycvik-a-aktivity-trening", { waitUntil: "commit" });
  expect(legacy?.status()).toBe(200);
  const redirectRequest = legacy?.request().redirectedFrom();
  expect(redirectRequest, "legacy training request must redirect").not.toBeNull();
  const redirectResponse = await redirectRequest?.response();
  expect(redirectResponse?.status()).toBe(301);
  await expect(page).toHaveURL(/\/aktivity\/trening$/);
});
