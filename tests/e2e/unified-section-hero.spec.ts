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
  return hero;
}

test("UNIFIED-SECTION-HERO visual audit covers required breakpoints without mobile overlay or horizontal overflow", async ({ browser }) => {
  test.setTimeout(15 * 60 * 1000);
  expect(PREVIEW_URL).toMatch(/^https:\/\//);
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  for (const viewport of VIEWPORTS) {
    const opened = await makePage(browser, viewport);
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
        const copy = hero.locator("[data-unified-section-hero-copy]");
        const tools = hero.locator("[data-unified-section-hero-tools]");

        if (viewport.width <= 430) {
          const mediaBox = await media.boundingBox();
          const copyBox = await copy.boundingBox();
          expect(mediaBox, label + ": media box").not.toBeNull();
          expect(copyBox, label + ": copy box").not.toBeNull();
          expect(copyBox!.y + copyBox!.height, label + ": copy must end before image").toBeLessThanOrEqual(mediaBox!.y + 1);

          const ratio = mediaBox!.width / mediaBox!.height;
          expect(ratio, label + ": mobile media should be 4:3").toBeGreaterThan(1.31);
          expect(ratio, label + ": mobile media should be 4:3").toBeLessThan(1.36);

          if (await tools.count()) {
            const toolsBox = await tools.boundingBox();
            expect(toolsBox, label + ": tools box").not.toBeNull();
            expect(mediaBox!.y + mediaBox!.height, label + ": image must end before tools").toBeLessThanOrEqual(toolsBox!.y + 1);
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

test("UNIFIED-SECTION-HERO scoped searches retain their canonical area", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/adresar/veterinari");
  await page.locator("[data-unified-section-hero] input[name=q]").fill("Nitra");
  await page.locator("[data-unified-section-hero] button[type=submit]").click();
  await expect(page).toHaveURL(/\/adresar\/veterinari\?q=Nitra/);

  await page.goto("/pomoc-psom/adopcia");
  await page.locator("[data-unified-section-hero] input[name=q]").fill("Labrador");
  await page.locator("[data-unified-section-hero] button[type=submit]").click();
  await expect(page).toHaveURL(/\/pomoc-psom\/adopcia\?q=Labrador/);

  await page.goto("/steniatka/socializacia");
  await page.locator("[data-unified-section-hero] input[name=q]").fill("strach");
  await page.locator("[data-unified-section-hero] button[type=submit]").click();
  await expect(page).toHaveURL(/sekcia=steniatka/);
  await expect(page).toHaveURL(/podsekcia=socializacia/);
  await expect(page).toHaveURL(/q=strach/);

  await page.goto("/recenzie/krmiva");
  await page.locator("[data-unified-section-hero] input[name=q]").fill("jahňacie");
  await page.locator("[data-unified-section-hero] button[type=submit]").click();
  await expect(page).toHaveURL(/sekcia=recenzie/);
  await expect(page).toHaveURL(/podsekcia=krmiva/);
});
