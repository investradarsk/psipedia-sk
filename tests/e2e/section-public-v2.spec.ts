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

test("SECTION-PUBLIC landings group at most five real articles under each topic and preserve urgent care", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of LANDINGS) {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status(), path).toBe(200);
    const groups = page.locator("[data-section-article-group]");
    expect(await groups.count(), path + ": topic groups").toBeGreaterThan(1);
    await expect(page.locator("[data-section-topic-groups]")).toHaveCount(1);
    await expect(page.locator("[data-section-public-topic-body]")).toHaveCount(0);
    for (const group of await groups.all()) {
      await expect(group.locator("h3 a")).toBeVisible();
      const articleCount = await group.locator("[data-article-list-item]").count();
      expect(articleCount).toBeLessThanOrEqual(5);
      if (articleCount > 0) {
        const firstLink = group.locator("a[data-article-list-item]").first();
        await expect(firstLink).toHaveAttribute("href", /.+/);
        await expect(firstLink).not.toHaveAttribute("role", "listitem");
        await expect(firstLink.locator("xpath=..")).toHaveAttribute("role", "listitem");
      }
      await expect(group.getByRole("link", { name: "Všetky články z oblasti" }))
        .toHaveCount(articleCount > 0 ? 1 : 0);
      // Empty areas remain in navigation, but cannot promise a non-existent list.
      const order = await group.evaluate((element) => [...element.children].map((child) => {
        if (child.matches("h3")) return "heading";
        if (child.matches("[data-section-content-list]")) return "articles";
        if (child.querySelector("a")?.textContent?.includes("Všetky články z oblasti")) return "more";
        return "unexpected";
      }));
      expect(order, `${path}: topic → articles → optional CTA`)
        .toEqual(articleCount > 0 ? ["heading", "articles", "more"] : ["heading", "articles"]);
    }
    await expectNoHorizontalOverflow(page, `${path} editorial groups at 390px`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/aktivity");
  const desktopGroup = page.locator("[data-section-article-group]")
    .filter({ has: page.locator("[data-article-list-item]") }).first();
  await expect(desktopGroup.getByRole("link", { name: "Všetky články z oblasti" })).toBeVisible();
  await expectNoHorizontalOverflow(page, "Activity editorial groups at 1440px");
  await page.goto("/starostlivost");
  const urgent = page.locator("[data-section-public-callout]");
  await expect(urgent.getByRole("heading", { name: "Má pes akútny problém?" })).toBeVisible();
  await expect(urgent.getByRole("link", { name: "Kedy volať ihneď" })).toHaveAttribute("href", "/starostlivost/kedy-ist-so-psom-k-veterinarovi");
  await expect(urgent.getByRole("link", { name: "Nájsť veterinára" })).toHaveAttribute("href", "/adresar/veterinari");
  await expect(page.locator("[data-section-topic-groups]")).toBeVisible();
});
test("SECTION-PUBLIC landing groups reuse shared cards: newest lead plus up to four companions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const path of LANDINGS) {
    await page.goto(path);
    await expect(page.locator("[data-section-public-callout]")).toHaveCount(1);
    const lists = page.locator("[data-section-featured-list]");
    expect(await lists.count(), path).toBeGreaterThan(0);
    for (const list of await lists.all()) {
      const cards = list.locator("[data-article-list-item]");
      const count = await cards.count();
      expect(count).toBeLessThanOrEqual(5);
      if (!count) continue;
      await expect(cards.first().locator("[data-article-image]")).toBeVisible();
      const dates = await cards.locator("time[datetime]").evaluateAll((elements) =>
        elements.map((item) => item.getAttribute("datetime") ?? "")
      );
      expect(dates, path + ": newest article leads").toEqual([...dates].sort().reverse());
    }
    await expectNoHorizontalOverflow(page, path + " editorial lead at 1440px");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/steniatka");
  await expectNoHorizontalOverflow(page, "Puppy editorial lead at 390px");
});

test("SECTION-PUBLIC all topic samples reuse the health banner geometry with topic-specific copy", async ({ page }) => {
  const samples = [
    { path: "/steniatka/prve-dni", heading: "Šteniatko je doma. Čo riešiť ako prvé?" },
    { path: "/starostlivost/zdravie", heading: "Má pes akútny problém?" },
    { path: "/starostlivost/vyziva", heading: "Nevieš, či pes dostáva správnu dávku?" },
    { path: "/aktivity/trening", heading: "Ako dosiahnuť lepší výsledok pri tréningu?" },
  ];
  for (const { path, heading } of samples) {
    await page.goto(path);
    const banner = page.locator("[data-section-topic-banner]");
    await expect(banner).toHaveCount(1);
    await expect(banner.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.locator("[data-section-content-list]")).toHaveCount(1);
    if (path !== "/starostlivost/zdravie") {
      await expect(banner.getByRole("link", { name: "Čítať články" }))
        .toHaveAttribute("href", "#topic-related-heading");
    } else {
      await expect(banner.getByRole("link", { name: "Nájsť veterinára" }))
        .toHaveAttribute("href", "/adresar/veterinari");
    }
  }
});

test("SECTION-PUBLIC single-result topics retain health's four-column cards and banner styling", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const paths = ["/steniatka/vyber-plemena", "/starostlivost/zdravie", "/aktivity/trening"];
  const bannerColors: string[] = [];
  for (const path of paths) {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status(), path).toBe(200);
    const banner = page.locator("[data-section-topic-banner] section");
    await expect(banner).toBeVisible();
    bannerColors.push(await banner.evaluate((element) => getComputedStyle(element).backgroundColor));

    const cards = page.locator("[data-section-public-topic-body] [role=list] [data-article-list-item]");
    const count = await cards.count();
    const grid = page.locator('[data-section-public-topic-body] [role="list"]').first();
    if (count > 0) {
      const computed = await grid.evaluate((element) => ({
        columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
        firstCardColumns: getComputedStyle(element.querySelector("[data-article-list-item]")!).gridTemplateColumns.split(" ").length,
      }));
      expect(computed.columns, path + ": four cards per row even with one result").toBe(4);
      expect(computed.firstCardColumns, path + ": image-above-title card").toBe(1);
      await expect(cards.first().locator("[data-article-image]")).toBeVisible();
    }
    await expectNoHorizontalOverflow(page, path + " desktop");
  }
  expect(new Set(bannerColors).size, "topic banners must use one surface").toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/steniatka/vyber-plemena");
  await expectNoHorizontalOverflow(page, "single-result puppy topic mobile");
});

test("SECTION-PUBLIC grouped topics keep meaningful thumbnails and mobile static services", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/steniatka");
  const groups = page.locator("[data-section-article-group]");
  await expect(groups.first().locator("img")).toBeVisible();
  const carousel = page.locator("[data-section-next-carousel]");
  await expect(carousel).toBeVisible();
  expect(await carousel.locator("[data-section-next-card]").count()).toBe(3);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/aktivity");
  await expectNoHorizontalOverflow(page, "Activity landing at 390px");
  const mobileCarousel = page.locator("[data-section-next-carousel]");
  expect(await mobileCarousel.locator("[data-section-next-card]").count()).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Posunúť carousel doprava" })).toBeHidden();
});
test("SECTION-PUBLIC details have scoped articles, shared search and safety note", async ({ page }) => {
  for (const path of DETAILS) {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status(), path).toBe(200);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator("[data-section-topic-groups]")).toHaveCount(0);
    await expect(page.locator("[data-section-public-topic-body]")).toHaveCount(1);
    await expect(page.locator("[data-section-content-list]")).toHaveCount(1);
    await expect(page.locator("[data-section-hero-intro]")).toBeVisible();
    await expect(page.locator("[data-section-public-topic-body] .safety-note")).toHaveCount(0);
  }
  await page.goto("/starostlivost/zdravie");
  const urgent = page.locator("[data-health-urgent]");
  await expect(urgent.getByRole("link", { name: "Kedy volať ihneď" })).toBeVisible();
  await expect(urgent.getByRole("link", { name: "Nájsť veterinára" })).toBeVisible();
});
test("SECTION-PUBLIC article lists retain title, category and date without repeated abstracts", async ({ page }) => {
  for (const path of ALL_SECTION_PAGES) {
    await page.goto(path);
    for (const list of await page.locator("[data-section-content-list]").all()) {
      const first = list.locator("[data-article-list-item]").first();
      if (!(await first.count())) continue;
      await expect(first.locator("[data-article-title]")).toBeVisible();
      await expect(first.locator("[data-article-topic]")).toBeVisible();
      await expect(first.locator("[data-article-date]")).toBeVisible();
      await expect(first.locator("p")).toHaveCount(0);
    }
  }
});
test("SECTION-PUBLIC navigation uses one labelled mobile select and normal desktop links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/aktivity/trening");
  const nav = page.getByRole("navigation", { name: "Navigácia v sekcii Výcvik a aktivity" });
  await expect(nav).toBeVisible();
  expect(await nav.evaluate((element) => getComputedStyle(element).position)).not.toBe("sticky");
  const select = nav.getByRole("combobox", { name: "Oblasť v sekcii Výcvik a aktivity" });
  await expect(select).toBeVisible();
  await expect(select).toHaveValue("/aktivity/trening");
  await select.selectOption("/aktivity/psie-sporty");
  await expect(page).toHaveURL(/\/aktivity\/psie-sporty$/);
  await expectNoHorizontalOverflow(page, "Activity topic at 390px");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/aktivity/trening");
  await expect(nav.getByRole("link", { name: "Psie športy" })).toBeVisible();
  await expect(select).toBeHidden();
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
