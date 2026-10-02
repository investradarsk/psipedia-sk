import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const PREVIEW_URL = process.env.E2E_BASE_URL ?? "";
const ARTIFACT_DIR = process.env.UNIFIED_SECTION_HERO_ARTIFACT_DIR ?? ".e2e-artifacts/unified-section-hero";
const CONSENT_KEY = "psipedia-cookie-consent";

const ROUTES = [
  { slug: "steniatka", path: "/steniatka", visualKey: "section.steniatka" },
  { slug: "steniatka-socializacia", path: "/steniatka/socializacia", visualKey: "subsection.steniatka.socializacia" },
  { slug: "starostlivost", path: "/starostlivost", visualKey: "section.starostlivost" },
  { slug: "aktivity", path: "/aktivity", visualKey: "section.aktivity" },
  { slug: "novinky", path: "/clanky", visualKey: "section.novinky" },
  { slug: "plemena", path: "/plemena", visualKey: "section.plemena" },
  { slug: "adresar", path: "/adresar", visualKey: "section.adresar" },
  { slug: "veterinari", path: "/adresar/veterinari", visualKey: "directory.veterinari" },
  { slug: "podujatia", path: "/podujatia", visualKey: "section.podujatia" },
  { slug: "vystavy", path: "/podujatia/vystavy", visualKey: "events.vystavy" },
  { slug: "pomoc", path: "/pomoc-psom", visualKey: "section.pomoc-psom" },
  { slug: "adopcia", path: "/pomoc-psom/adopcia", visualKey: "help.adopcia" },
  { slug: "stratene", path: "/pomoc-psom/stratene-psy", visualKey: "help.stratene-a-najdene" },
  { slug: "recenzie", path: "/recenzie", visualKey: "section.recenzie" },
  { slug: "recenzie-krmiva", path: "/recenzie/krmiva", visualKey: "reviews.krmiva" },
] as const;

const VIEWPORTS = [
  { label: "mobile-390", width: 390, height: 844 },
  { label: "mobile-430", width: 430, height: 932 },
  { label: "tablet-768", width: 768, height: 1024 },
  { label: "desktop-1280", width: 1280, height: 800 },
  { label: "desktop-1440", width: 1440, height: 900 },
  { label: "desktop-1920", width: 1920, height: 1080 },
] as const;

async function makePage(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ baseURL: PREVIEW_URL, viewport });
  await context.addInitScript(([key]) => localStorage.setItem(key, "necessary"), [CONSENT_KEY]);
  return { context, page: await context.newPage() };
}

async function openHero(page: Page, path: string, visualKey: string, label: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status(), label + ": " + path).toBe(200);
  const hero = page.locator("[data-unified-section-hero]").first();
  await expect(hero, label + ": " + path + " unified hero").toBeVisible();
  await expect(hero).toHaveAttribute("data-section-visual-key", visualKey);
  await expect(hero.locator("h1")).toHaveCount(1);

  await page.evaluate(async () => {
    if (document.fonts) await document.fonts.ready;
  });
  const heroImage = hero.locator("[data-unified-section-hero-media] img");
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
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));

  return hero;
}

test("UNIFIED-SECTION-HERO visual audit covers required breakpoints without mobile overlay or horizontal overflow", async ({ browser }) => {
  test.setTimeout(15 * 60 * 1000);
  expect(PREVIEW_URL).toMatch(/^https:\/\//);
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  for (const viewport of VIEWPORTS) {
    const opened = await makePage(browser, viewport);
    let referenceSideInset: number | null = null;
    let referenceVisualHeight: number | null = null;
    try {
      for (const route of ROUTES) {
        const label = viewport.label + " " + route.path;
        const hero = await openHero(opened.page, route.path, route.visualKey, label);

        const overflow = await opened.page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(overflow.scrollWidth, label + ": horizontal overflow").toBeLessThanOrEqual(overflow.clientWidth + 1);

        const media = hero.locator("[data-unified-section-hero-media]");
        const visual = hero.locator("[data-unified-section-hero-visual]");
        const copy = hero.locator("[data-unified-section-hero-copy]");
        const tools = hero.locator("[data-unified-section-hero-tools]");
        const heroBox = await hero.boundingBox();
        const visualBox = await visual.boundingBox();
        expect(heroBox, label + ": hero box").not.toBeNull();
        expect(visualBox, label + ": visual box").not.toBeNull();

        const sideInset = (overflow.clientWidth - heroBox!.width) / 2;
        if (referenceSideInset === null) referenceSideInset = sideInset;
        expect(Math.abs(sideInset - referenceSideInset), label + ": canonical hero side inset").toBeLessThanOrEqual(1);

        if (viewport.width >= 768) {
          if (referenceVisualHeight === null) referenceVisualHeight = visualBox!.height;
          expect(Math.abs(visualBox!.height - referenceVisualHeight), label + ": canonical desktop visual height").toBeLessThanOrEqual(2);
        }

        if (viewport.width <= 430) {
          await expect.poll(async () => {
            const mediaBox = await media.boundingBox();
            const copyBox = await copy.boundingBox();
            if (!mediaBox || !copyBox) return -999;
            return mediaBox.y - (copyBox.y + copyBox.height);
          }, { message: label + ": copy must end before image", timeout: 5000 }).toBeGreaterThanOrEqual(-1);

          const mediaBox = await media.boundingBox();
          expect(mediaBox, label + ": media box").not.toBeNull();
          const ratio = mediaBox!.width / mediaBox!.height;
          expect(ratio, label + ": mobile media should be low 16:6").toBeGreaterThan(2.62);
          expect(ratio, label + ": mobile media should be low 16:6").toBeLessThan(2.72);

          if (await tools.count()) {
            await expect.poll(async () => {
              const currentMediaBox = await media.boundingBox();
              const toolsBox = await tools.boundingBox();
              if (!currentMediaBox || !toolsBox) return -999;
              return toolsBox.y - (currentMediaBox.y + currentMediaBox.height);
            }, { message: label + ": image must end before tools", timeout: 5000 }).toBeGreaterThanOrEqual(-1);
          }
        } else {
          const mediaBox = await media.boundingBox();
          const copyBox = await copy.boundingBox();
          expect(mediaBox, label + ": desktop media box").not.toBeNull();
          expect(copyBox, label + ": desktop copy box").not.toBeNull();
          expect(copyBox!.x, label + ": desktop copy overlays image-led hero").toBeGreaterThanOrEqual(mediaBox!.x - 1);
          expect(copyBox!.y, label + ": desktop copy overlays image-led hero").toBeGreaterThanOrEqual(mediaBox!.y - 1);
        }

        const serious = (await new AxeBuilder({ page: opened.page })
          .include("[data-unified-section-hero]")
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze()).violations.filter((item) => item.impact === "critical" || item.impact === "serious");
        expect(serious, label + ": serious hero accessibility violations").toEqual([]);

        await hero.screenshot({
          path: join(ARTIFACT_DIR, viewport.label + "-" + route.slug + ".png"),
        });
      }
    } finally {
      await opened.context.close();
    }
  }
});

test("SECTION-HERO-V2 keeps homepage as a separate visual reference", async ({ browser }) => {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  for (const viewport of [
    { label: "home-mobile-390", width: 390, height: 844 },
    { label: "home-desktop-1440", width: 1440, height: 900 },
    { label: "home-desktop-1920", width: 1920, height: 1080 },
  ]) {
    const opened = await makePage(browser, viewport);
    try {
      const response = await opened.page.goto("/", { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(200);
      const homeHero = opened.page.locator("[data-home-hero]");
      await expect(homeHero).toBeVisible();
      await expect(opened.page.locator("[data-unified-section-hero]")).toHaveCount(0);
      await homeHero.screenshot({ path: join(ARTIFACT_DIR, viewport.label + ".png") });
    } finally {
      await opened.context.close();
    }
  }
});

test("UNIFIED-SECTION-HERO scoped searches retain their canonical area", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });

  async function serializedHeroTarget(path: string, query: string) {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status(), path).toBe(200);
    const hero = page.locator("[data-unified-section-hero]");
    await hero.locator("input[name=q]").fill(query);
    return hero.locator("form").evaluate((form) => {
      const element = form as HTMLFormElement;
      const target = new URL(element.action || window.location.pathname, window.location.origin);
      const data = new FormData(element);
      for (const [name, value] of data.entries()) {
        if (typeof value === "string" && value) target.searchParams.append(name, value);
      }
      return target.pathname + target.search;
    });
  }

  const directoryTarget = await serializedHeroTarget("/adresar/veterinari", "Nitra");
  expect(directoryTarget).toMatch(/^\/adresar\/veterinari\?/);
  expect(directoryTarget).toContain("q=Nitra");

  const adoptionTarget = await serializedHeroTarget("/pomoc-psom/adopcia", "Labrador");
  expect(adoptionTarget).toMatch(/^\/pomoc-psom\/adopcia\?/);
  expect(adoptionTarget).toContain("q=Labrador");

  const puppyTarget = await serializedHeroTarget("/steniatka/socializacia", "strach");
  expect(puppyTarget).toMatch(/^\/hladat\?/);
  expect(puppyTarget).toContain("sekcia=steniatka");
  expect(puppyTarget).toContain("podsekcia=socializacia");
  expect(puppyTarget).toContain("q=strach");

  const reviewsTarget = await serializedHeroTarget("/recenzie/krmiva", "jahňacie");
  expect(reviewsTarget).toMatch(/^\/hladat\?/);
  expect(reviewsTarget).toContain("sekcia=recenzie");
  expect(reviewsTarget).toContain("podsekcia=krmiva");
});
