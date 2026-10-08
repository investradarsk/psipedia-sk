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

  const sharedArticleLayouts = [
    { root: "[data-home-latest]", id: "latest" },
    { root: '[data-home-editorial="steniatka"]', id: "steniatka" },
    { root: '[data-home-editorial="starostlivost"]', id: "starostlivost" },
    { root: '[data-home-editorial="aktivity"]', id: "aktivity" },
  ];
  for (const item of sharedArticleLayouts) {
    const root = page.locator(item.root);
    const layout = root.locator(`[data-home-article-layout="${item.id}"]`);
    await expect(layout).toHaveCount(1);
    await expect(layout.locator(".home-latest-lead")).toHaveCount(1);
    await expect(layout.locator(".home-latest-list")).toHaveCount(1);
  }

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  for (const item of sharedArticleLayouts) {
    await expect(page.locator(item.root).locator(`[data-home-article-layout="${item.id}"]`)).toBeVisible();
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


test("homepage dynamic image cards use canonical public media and keep navigation at five responsive widths", async ({ page }) => {
  const blocks = [
    { section: "[data-home-events]", card: "[data-home-event]", empty: "[data-home-events-empty]", cta: "Celý kalendár", href: "/podujatia" },
    { section: "[data-home-veterinarians]", card: ".home-vet-item", empty: "[data-home-veterinarians-empty]", cta: "Všetci veterinári", href: "/adresar/veterinari" },
    { section: "[data-home-help]", card: "[data-home-help-item]", empty: "[data-home-help-empty]", cta: "Všetky možnosti pomoci", href: "/pomoc-psom" },
  ];
  for (const width of [1440, 1280, 1024, 430, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    for (const block of blocks) {
      const section = page.locator(block.section);
      const cards = section.locator(block.card);
      const count = await cards.count();
      expect(count).toBeLessThanOrEqual(3);
      await expect(section.getByRole("link", { name: block.cta })).toHaveAttribute("href", block.href);
      if (count === 0) {
        await expect(section.locator(block.empty)).toBeVisible();
      } else {
        await expect(section.locator(block.empty)).toHaveCount(0);
        const checks = await cards.evaluateAll((items) => items.map((card) => ({
          images: [...card.querySelectorAll("img")].map((img) => ({
            src: img.getAttribute("src"),
            alt: img.getAttribute("alt"),
            loading: img.getAttribute("loading"),
          })),
          links: card.querySelectorAll("a").length,
        })));
        for (const card of checks) {
          expect(card.images).toHaveLength(1);
          expect(card.images[0].src?.startsWith("/media/")).toBe(true);
          expect(card.images[0].alt?.trim().length).toBeGreaterThan(5);
          expect(card.images[0].loading).toBe("lazy");
          expect(card.links).toBe(1);
        }
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
});

test("homepage grids collapse gracefully for zero to four image-backed cards", async ({ page }) => {
  await page.goto("/");
  for (const width of [1440, 1280, 1024, 430, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const samples = await page.evaluate(() => {
      const fixtures = [
        { parent: "[data-home-events]", grid: "home-event-list", card: "home-event-item" },
        { parent: "[data-home-veterinarians]", grid: "home-vet-list", card: "home-vet-item" },
        { parent: "[data-home-help]", grid: "home-help-grid", card: "home-help-item" },
      ];
      const measurements = [];
      for (const fixture of fixtures) {
        const parent = document.querySelector(fixture.parent);
        if (!parent) throw new Error("Missing homepage section");
        for (const count of [0, 1, 2, 3, 4]) {
          const grid = document.createElement("div");
          grid.className = fixture.grid;
          grid.setAttribute("data-home-grid-fixture", fixture.grid);
          for (let index = 0; index < count; index += 1) {
            const card = document.createElement("article");
            card.className = fixture.card;
            const link = document.createElement("a");
            link.href = "/adresar";
            const media = document.createElement("span");
            media.className = fixture.grid === "home-event-list" ? "home-event-media" : fixture.grid === "home-help-grid" ? "home-help-media" : "";
            link.appendChild(media);
            card.appendChild(link);
            grid.appendChild(card);
          }
          parent.appendChild(grid);
          const rect = grid.getBoundingClientRect();
          const nodes = [...grid.children].map((node) => node.getBoundingClientRect());
          measurements.push({
            grid: fixture.grid,
            count,
            children: nodes.length,
            overflow: grid.scrollWidth > grid.clientWidth + 1,
            outside: nodes.some((node) => node.left < rect.left - 1 || node.right > rect.right + 1),
          });
          grid.remove();
        }
      }
      return measurements;
    });
    for (const sample of samples) {
      expect(sample.children, `${width}px ${sample.grid} count ${sample.count}`).toBe(sample.count);
      expect(sample.overflow, `${width}px ${sample.grid} count ${sample.count}`).toBe(false);
      expect(sample.outside, `${width}px ${sample.grid} count ${sample.count}`).toBe(false);
    }
  }
});
