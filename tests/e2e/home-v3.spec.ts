import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { Article } from "../../lib/content";
import { selectHomepageArticles } from "../../lib/homepage-content";

function article(slug: string, dateIso: string, portalSection: Article["portalSection"]): Article {
  return {
    slug,
    title: slug,
    excerpt: "Testovací perex pre homepage výber.",
    category: "Život so psom",
    date: dateIso,
    dateIso,
    updatedDate: dateIso,
    updatedDateIso: dateIso,
    readTime: "5 min",
    accent: "forest",
    author: "Redakcia Psipedia",
    intro: "",
    takeaway: "",
    sources: [],
    sections: [],
    portalSection,
  };
}

async function useNecessaryCookies(page: Page) {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
}

test.beforeEach(async ({ page }) => {
  await useNecessaryCookies(page);
});

test("homepage article selection is publication-ordered, multi-section and deduplicated", () => {
  const selected = selectHomepageArticles([
    article("older-news", "2026-09-14", "novinky"),
    article("latest-health", "2026-09-19", "starostlivost"),
    article("latest-puppy", "2026-09-18", "steniatka"),
    article("latest-training", "2026-09-17", "aktivity"),
    article("second-health", "2026-09-16", "starostlivost"),
    article("second-puppy", "2026-09-15", "steniatka"),
    article("second-training", "2026-09-13", "aktivity"),
  ], { latestLimit: 3, sectionLimit: 2 });

  expect(selected.latest.map((item) => item.slug)).toEqual([
    "latest-health",
    "latest-puppy",
    "latest-training",
  ]);
  expect(new Set(selected.latest.map((item) => item.portalSection)).size).toBe(3);

  const allSlugs = [
    ...selected.latest,
    ...selected.bySection.steniatka,
    ...selected.bySection.starostlivost,
    ...selected.bySection.aktivity,
  ].map((item) => item.slug);
  expect(new Set(allSlugs).size).toBe(allSlugs.length);
  expect(selected.bySection.starostlivost.map((item) => item.slug)).toEqual(["second-health"]);
  expect(selected.bySection.steniatka.map((item) => item.slug)).toEqual(["second-puppy"]);
  expect(selected.bySection.aktivity.map((item) => item.slug)).toEqual(["second-training"]);

  const backfilled = selectHomepageArticles([
    article("health-3", "2026-09-20", "starostlivost"),
    article("puppy-3", "2026-09-19", "steniatka"),
    article("training-3", "2026-09-18", "aktivity"),
    article("health-2", "2026-09-17", "starostlivost"),
    article("puppy-2", "2026-09-16", "steniatka"),
    article("training-2", "2026-09-15", "aktivity"),
    article("health-1", "2026-09-14", "starostlivost"),
    article("puppy-1", "2026-09-13", "steniatka"),
    article("training-1", "2026-09-12", "aktivity"),
  ], { latestLimit: 3, sectionLimit: 3, backfillSectionsFromLatest: true });

  expect(backfilled.bySection.starostlivost).toHaveLength(3);
  expect(backfilled.bySection.steniatka).toHaveLength(3);
  expect(backfilled.bySection.aktivity).toHaveLength(3);
});

test("desktop homepage uses the HOME-3 hierarchy without editorial filler", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 2, name: "Najnovšie články" })).toBeVisible();
  await expect(page.getByText("Vybrané redakciou", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-home-latest] .home-heading-actions")).toHaveCount(0);
  const latestCta = page.locator('[data-home-section-cta="latest"]');
  await expect(latestCta.getByRole("link", { name: /Všetky články/ })).toHaveAttribute("href", "/clanky");
  expect(await page.locator("[data-home-latest]").evaluate((section) => {
    const content = section.querySelector(".home-latest-layout, [data-home-latest-empty]");
    const cta = section.querySelector('[data-home-section-cta="latest"]');
    return Boolean(content && cta && (content.compareDocumentPosition(cta) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(true);
  await expect(page.locator("[data-home-latest]").getByRole("link", { name: /Všetky novinky/ })).toHaveCount(0);

  const hero = await page.locator("[data-home-hero] .hero-card").boundingBox();
  expect(hero).not.toBeNull();
  expect(hero!.height).toBeLessThanOrEqual(370);

  await expect(page.locator("[data-home-services-gateway]")).toHaveCount(0);
  const services = page.locator("[data-home-services-secondary]");
  await expect(services.locator(".home-service-card")).toHaveCount(6);
  await expect(services.getByRole("link", { name: /Všetky služby/ })).toHaveAttribute("href", "/adresar");

  const dates = await page.locator("[data-home-latest] [data-home-article-date]").evaluateAll((items) =>
    items.map((item) => item.getAttribute("data-home-article-date") ?? ""),
  );
  expect(dates).toEqual([...dates].sort((left, right) => right.localeCompare(left)));

  for (const section of ["steniatka", "starostlivost", "aktivity"]) {
    const slugs = await page.locator(`[data-home-editorial="${section}"] [data-home-article-slug]`).evaluateAll((items) =>
      items.map((item) => item.getAttribute("data-home-article-slug") ?? ""),
    );
    expect(slugs.length).toBeLessThanOrEqual(5);
    expect(new Set(slugs).size).toBe(slugs.length);
  }

  const events = page.locator("[data-home-event]");
  const eventsEmpty = page.locator("[data-home-events-empty]");
  expect((await events.count()) + (await eventsEmpty.count())).toBeGreaterThan(0);
  if (await events.count()) await expect(events.first().locator(".home-event-media")).toBeVisible();
  await expect(page.locator("[data-home-events]").getByRole("link", { name: /Celý kalendár/ })).toHaveAttribute("href", "/podujatia");

  const helpItems = page.locator("[data-home-help-item]");
  if (await helpItems.count()) {
    const lifecycle = await helpItems.evaluateAll((items) => items.map((item) => ({
      status: item.getAttribute("data-home-help-status"),
      resolved: item.getAttribute("data-home-help-resolved"),
    })));
    expect(lifecycle.every((item) => item.status === "published" && item.resolved === "false")).toBe(true);
  } else {
    await expect(page.locator("[data-home-help-empty]")).toBeVisible();
  }

  await expect(page.locator("[data-home-breed]").getByRole("link", { name: /Porovnať plemená/ })).toHaveAttribute("href", "/porovnat-plemena");

  const schemaText = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(schemaText).toBeTruthy();
  const schema = JSON.parse(schemaText!);
  expect(schema["@context"]).toBe("https://schema.org");
  expect(schema["@graph"].some((item: { "@type"?: string }) => item["@type"] === "WebSite")).toBe(true);
});

test("390x844 homepage preserves order, has no horizontal overflow and passes axe", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const orderedSelectors = [
    "[data-home-hero]",
    "[data-home-search]",
    "[data-home-latest]",
    "[data-home-events]",
    '[data-home-editorial="steniatka"]',
    "[data-home-veterinarians]",
    '[data-home-editorial="starostlivost"]',
    "[data-home-services-secondary]",
    '[data-home-editorial="aktivity"]',
    "[data-home-help]",
    "[data-home-breed]",
  ];
  const positions: number[] = [];
  for (const selector of orderedSelectors) {
    const locator = page.locator(selector);
    await expect(locator, `Missing homepage section ${selector}`).toBeVisible();
    const box = await locator.boundingBox();
    expect(box, `Cannot measure homepage section ${selector}`).not.toBeNull();
    positions.push(box!.y);
  }
  expect(positions).toEqual([...positions].sort((left, right) => left - right));

  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewport);
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewport);

  const servicesCarousel = page.locator("[data-home-services-secondary] .home-service-carousel");
  await expect(servicesCarousel).toBeVisible();
  expect(await servicesCarousel.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await expect(page.locator("[data-home-services-secondary] .home-service-carousel-cue")).toBeVisible();

  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = result.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  expect(serious, serious.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);
});
