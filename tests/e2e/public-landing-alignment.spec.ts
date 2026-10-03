import { expect, test, type Browser, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const PREVIEW_URL = process.env.E2E_BASE_URL ?? "";
const ARTIFACT_DIR = process.env.PUBLIC_LANDING_ALIGNMENT_ARTIFACT_DIR ?? ".e2e-artifacts/public-landing-alignment";
const CONSENT_KEY = "psipedia-cookie-consent";

const ROUTES = [
  { slug: "clanky", path: "/clanky" },
  { slug: "plemena", path: "/plemena" },
  { slug: "steniatka", path: "/steniatka" },
  { slug: "starostlivost", path: "/starostlivost" },
  { slug: "aktivity", path: "/aktivity" },
  { slug: "adresar", path: "/adresar", categoryGrid: "[data-public-category-tiles]" },
  { slug: "adresar-veterinari", path: "/adresar/veterinari" },
  { slug: "podujatia", path: "/podujatia", categoryGrid: "[data-public-category-tiles]" },
  { slug: "podujatia-vystavy", path: "/podujatia/vystavy" },
  { slug: "pomoc", path: "/pomoc-psom", categoryGrid: "[data-help-category-nav]" },
  { slug: "pomoc-adopcia", path: "/pomoc-psom/adopcia" },
  { slug: "pomoc-utulky", path: "/pomoc-psom/utulky" },
  { slug: "pomoc-stratene-a-najdene", path: "/pomoc-psom/stratene-a-najdene" },
  { slug: "recenzie", path: "/recenzie", categoryGrid: "[data-public-category-tiles]" },
  { slug: "recenzie-krmiva", path: "/recenzie/krmiva" },
] as const;

const VIEWPORTS = [
  { label: "mobile-390", width: 390, height: 844 },
  { label: "mobile-430", width: 430, height: 932 },
  { label: "tablet-768", width: 768, height: 1024 },
  { label: "desktop-1280", width: 1280, height: 800 },
  { label: "desktop-1440", width: 1440, height: 900 },
  { label: "desktop-1920", width: 1920, height: 1080 },
] as const;

type Box = { x: number; y: number; width: number; height: number };

async function makePage(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ baseURL: PREVIEW_URL, viewport });
  await context.addInitScript(([key]) => localStorage.setItem(key, "necessary"), [CONSENT_KEY]);
  return { context, page: await context.newPage() };
}

async function settle(page: Page, path: string, label: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status(), label + ": response").toBe(200);
  await page.evaluate(async () => {
    if (document.fonts) await document.fonts.ready;
    history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
  });
  const heroImage = page.locator("[data-unified-section-hero-media] img").first();
  if (await heroImage.count()) {
    await heroImage.evaluate(async (image) => {
      const element = image as HTMLImageElement;
      if (!element.complete) {
        await new Promise<void>((resolve) => {
          element.addEventListener("load", () => resolve(), { once: true });
          element.addEventListener("error", () => resolve(), { once: true });
        });
      }
      try { await element.decode(); } catch {}
    });
  }
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await page.evaluate(() => window.scrollY), label + ": starts at page top").toBe(0);
}

function expectedLandingGap(width: number) {
  if (width <= 620) return 46;
  if (width <= 820) return 64;
  return 72;
}

function expectedColumns(width: number) {
  if (width <= 620) return 1;
  if (width <= 900) return 2;
  return 3;
}

async function box(page: Page, selector: string): Promise<Box | null> {
  return page.locator(selector).first().boundingBox();
}

async function categoryGeometry(page: Page, gridSelector: string) {
  return page.evaluate((gridSelectorValue) => {
    const get = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const style = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return null;
      const computed = getComputedStyle(element);
      return {
        fontSize: computed.fontSize,
        fontWeight: computed.fontWeight,
        letterSpacing: computed.letterSpacing,
        lineHeight: computed.lineHeight,
        marginTop: computed.marginTop,
      };
    };
    const grid = document.querySelector<HTMLElement>(gridSelectorValue);
    return {
      heroShell: get("[data-unified-section-hero-shell]"),
      tools: get("[data-unified-section-hero-tools]"),
      content: get('[data-public-content-variant="landing"]'),
      heading: get("[data-public-landing-section-heading]"),
      eyebrow: get("[data-public-landing-eyebrow]"),
      h2: get("[data-public-landing-heading]"),
      description: get("[data-public-landing-description]"),
      grid: grid ? (() => {
        const rect = grid.getBoundingClientRect();
        const columns = getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length;
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, columns };
      })() : null,
      eyebrowStyle: style("[data-public-landing-eyebrow]"),
      h2Style: style("[data-public-landing-heading]"),
      descriptionStyle: style("[data-public-landing-description]"),
    };
  }, gridSelector);
}

test("PUBLIC-LANDING-ALIGNMENT keeps canonical geometry and screenshot coverage across required routes", async ({ browser }) => {
  test.setTimeout(25 * 60 * 1000);
  expect(PREVIEW_URL).toMatch(/^https:\/\//);
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  for (const viewport of VIEWPORTS) {
    const opened = await makePage(browser, viewport);
    let referenceHeading: Awaited<ReturnType<typeof categoryGeometry>> | null = null;

    try {
      for (const route of ROUTES) {
        const label = viewport.label + " " + route.path;
        await settle(opened.page, route.path, label);

        const overflow = await opened.page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(overflow.scrollWidth, label + ": no horizontal overflow").toBeLessThanOrEqual(overflow.clientWidth + 1);

        if ("categoryGrid" in route && route.categoryGrid) {
          const geometry = await categoryGeometry(opened.page, route.categoryGrid);
          for (const [name, value] of Object.entries({
            heroShell: geometry.heroShell,
            tools: geometry.tools,
            content: geometry.content,
            heading: geometry.heading,
            eyebrow: geometry.eyebrow,
            h2: geometry.h2,
            grid: geometry.grid,
          })) {
            expect(value, label + ": " + name + " geometry").not.toBeNull();
          }

          const heroShell = geometry.heroShell!;
          const content = geometry.content!;
          const tools = geometry.tools!;
          const eyebrow = geometry.eyebrow!;
          const h2 = geometry.h2!;
          const heading = geometry.heading!;
          const grid = geometry.grid!;

          expect(Math.abs(content.x - heroShell.x), label + ": content left follows hero shell").toBeLessThanOrEqual(2);
          expect(Math.abs((content.x + content.width) - (heroShell.x + heroShell.width)), label + ": content right follows hero shell").toBeLessThanOrEqual(2);
          expect(Math.abs(h2.x - content.x), label + ": H2 left follows canonical axis").toBeLessThanOrEqual(2);
          expect(Math.abs(grid.x - content.x), label + ": grid left follows canonical axis").toBeLessThanOrEqual(2);
          expect(Math.abs((grid.x + grid.width) - (content.x + content.width)), label + ": grid right follows canonical axis").toBeLessThanOrEqual(2);

          const toolsToEyebrow = eyebrow.y - (tools.y + tools.height);
          expect(Math.abs(toolsToEyebrow - expectedLandingGap(viewport.width)), label + ": canonical tools-to-eyebrow rhythm").toBeLessThanOrEqual(2);

          const eyebrowToH2 = h2.y - (eyebrow.y + eyebrow.height);
          expect(Math.abs(eyebrowToH2 - 5), label + ": canonical eyebrow-to-H2 gap").toBeLessThanOrEqual(2);

          const headingToGrid = grid.y - (heading.y + heading.height);
          expect(Math.abs(headingToGrid - 16), label + ": canonical heading-to-content gap").toBeLessThanOrEqual(2);
          expect(grid.columns, label + ": category-grid columns").toBe(expectedColumns(viewport.width));

          if (!referenceHeading) {
            referenceHeading = geometry;
          } else {
            expect(geometry.eyebrowStyle, label + ": eyebrow typography").toEqual(referenceHeading.eyebrowStyle);
            expect(geometry.h2Style, label + ": H2 typography").toEqual(referenceHeading.h2Style);
            if (geometry.descriptionStyle && referenceHeading.descriptionStyle) {
              expect(geometry.descriptionStyle, label + ": description typography").toEqual(referenceHeading.descriptionStyle);
            }
          }
        }

        await opened.page.screenshot({
          path: join(ARTIFACT_DIR, viewport.label + "-" + route.slug + ".png"),
          fullPage: false,
        });
      }
    } finally {
      await opened.context.close();
    }
  }
});

test("PUBLIC-LANDING-ALIGNMENT listing shells retain the PageContainer axis", async ({ browser }) => {
  const listingRoutes = [
    "/clanky",
    "/plemena",
    "/adresar/veterinari",
    "/podujatia/vystavy",
    "/pomoc-psom/adopcia",
    "/pomoc-psom/utulky",
    "/pomoc-psom/stratene-a-najdene",
  ];

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    const opened = await makePage(browser, viewport);
    try {
      for (const path of listingRoutes) {
        const label = viewport.width + " " + path;
        await settle(opened.page, path, label);
        const heroShell = await box(opened.page, "[data-unified-section-hero-shell]");
        const listing = await box(opened.page, '[data-public-content-variant="listing"]');
        expect(heroShell, label + ": hero shell").not.toBeNull();
        expect(listing, label + ": listing shell").not.toBeNull();
        expect(Math.abs(listing!.x - heroShell!.x), label + ": listing left axis").toBeLessThanOrEqual(2);
        expect(Math.abs((listing!.x + listing!.width) - (heroShell!.x + heroShell!.width)), label + ": listing right axis").toBeLessThanOrEqual(2);
      }
    } finally {
      await opened.context.close();
    }
  }
});
