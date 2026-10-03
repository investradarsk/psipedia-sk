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

const ROOT_ROUTE_SLUGS = new Set(["steniatka", "starostlivost", "aktivity", "novinky", "plemena", "adresar", "podujatia", "pomoc", "recenzie"]);

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
  await page.evaluate(() => {
    history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
  });
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  expect(await page.evaluate(() => window.scrollY), label + ": audit starts at page top").toBe(0);

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
    let referenceRootHeroOffsetFromHeader: number | null = null;
    let referenceRootHeroWidth: number | null = null;
    try {
      for (const route of ROUTES) {
        const label = viewport.label + " " + route.path;
        const hero = await openHero(opened.page, route.path, route.visualKey, label);

        const overflow = await opened.page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(overflow.scrollWidth, label + ": horizontal overflow").toBeLessThanOrEqual(overflow.clientWidth + 1);

        const shell = opened.page.locator("[data-unified-section-hero-shell]").first();
        await expect(shell, label + ": canonical hero shell").toBeVisible();
        const media = hero.locator("[data-unified-section-hero-media]");
        const visual = hero.locator("[data-unified-section-hero-visual]");
        const copy = hero.locator("[data-unified-section-hero-copy]");
        const tools = hero.locator("[data-unified-section-hero-tools]");
        const shellBox = await shell.boundingBox();
        const heroBox = await hero.boundingBox();
        const visualBox = await visual.boundingBox();
        expect(shellBox, label + ": shell box").not.toBeNull();
        expect(heroBox, label + ": hero box").not.toBeNull();
        expect(visualBox, label + ": visual box").not.toBeNull();
        expect(Math.abs(heroBox!.x - shellBox!.x), label + ": hero aligns to canonical shell left edge").toBeLessThanOrEqual(1);
        expect(Math.abs(heroBox!.width - shellBox!.width), label + ": hero matches canonical shell width").toBeLessThanOrEqual(1);

        if (ROOT_ROUTE_SLUGS.has(route.slug)) {
          const rootGeometry = await opened.page.evaluate(() => {
            const heroElement = document.querySelector<HTMLElement>("[data-unified-section-hero]");
            const headerElement = document.querySelector<HTMLElement>(".site-header");
            if (!heroElement || !headerElement) return null;
            const heroRect = heroElement.getBoundingClientRect();
            const headerRect = headerElement.getBoundingClientRect();
            return {
              heroOffsetFromHeader: heroRect.y - (headerRect.y + headerRect.height),
              heroWidth: heroRect.width,
            };
          });
          expect(rootGeometry, label + ": root hero/header geometry").not.toBeNull();
          if (referenceRootHeroOffsetFromHeader === null) referenceRootHeroOffsetFromHeader = rootGeometry!.heroOffsetFromHeader;
          if (referenceRootHeroWidth === null) referenceRootHeroWidth = rootGeometry!.heroWidth;
          expect(
            Math.abs(rootGeometry!.heroOffsetFromHeader - referenceRootHeroOffsetFromHeader),
            label + ": canonical root hero offset below shared header",
          ).toBeLessThanOrEqual(2);
          expect(Math.abs(rootGeometry!.heroWidth - referenceRootHeroWidth), label + ": canonical root hero width").toBeLessThanOrEqual(2);
        }

        const sideInset = (overflow.clientWidth - heroBox!.width) / 2;
        if (referenceSideInset === null) referenceSideInset = sideInset;
        expect(Math.abs(sideInset - referenceSideInset), label + ": canonical hero side inset").toBeLessThanOrEqual(1);

        if (viewport.width >= 768) {
          if (referenceVisualHeight === null) referenceVisualHeight = visualBox!.height;
          expect(Math.abs(visualBox!.height - referenceVisualHeight), label + ": canonical desktop visual height").toBeLessThanOrEqual(2);
        }

        const breadcrumbs = hero.locator("[data-section-hero-breadcrumbs]");
        const eyebrow = hero.locator("[data-section-hero-eyebrow]");
        const title = hero.locator("[data-section-hero-title]");
        const intro = hero.locator("[data-section-hero-intro]");
        const copyGeometry = await hero.evaluate((root) => {
          const box = (selector: string) => {
            const element = root.querySelector<HTMLElement>(selector);
            if (!element) return null;
            const rect = element.getBoundingClientRect();
            return { y: rect.y, height: rect.height };
          };
          return {
            breadcrumbs: box("[data-section-hero-breadcrumbs]"),
            eyebrow: box("[data-section-hero-eyebrow]"),
            title: box("[data-section-hero-title]"),
            intro: box("[data-section-hero-intro]"),
          };
        });

        if (copyGeometry.breadcrumbs && copyGeometry.eyebrow) {
          const expectedGap = viewport.width <= 767 ? 10 : 12;
          expect(
            Math.abs(copyGeometry.eyebrow.y - (copyGeometry.breadcrumbs.y + copyGeometry.breadcrumbs.height) - expectedGap),
            label + ": breadcrumb→eyebrow gap",
          ).toBeLessThanOrEqual(2);
        }
        if (copyGeometry.eyebrow && copyGeometry.title) {
          const expectedGap = viewport.width <= 767 ? 7 : 8;
          expect(
            Math.abs(copyGeometry.title.y - (copyGeometry.eyebrow.y + copyGeometry.eyebrow.height) - expectedGap),
            label + ": eyebrow→H1 gap",
          ).toBeLessThanOrEqual(2);
        }
        if (copyGeometry.title && copyGeometry.intro) {
          const expectedGap = viewport.width <= 767 ? 9 : 12;
          expect(
            Math.abs(copyGeometry.intro.y - (copyGeometry.title.y + copyGeometry.title.height) - expectedGap),
            label + ": H1→intro gap",
          ).toBeLessThanOrEqual(2);
        }

        if (viewport.width <= 430) {
          await expect.poll(async () => hero.evaluate((root) => {
            const mediaElement = root.querySelector<HTMLElement>("[data-unified-section-hero-media]");
            const copyElement = root.querySelector<HTMLElement>("[data-unified-section-hero-copy]");
            if (!mediaElement || !copyElement) return -999;
            const mediaRect = mediaElement.getBoundingClientRect();
            const copyRect = copyElement.getBoundingClientRect();
            return mediaRect.y - (copyRect.y + copyRect.height);
          }), { message: label + ": copy must end before image", timeout: 5000 }).toBeGreaterThanOrEqual(-1);

          const mediaBox = await media.boundingBox();
          expect(mediaBox, label + ": media box").not.toBeNull();
          expect(Math.abs(mediaBox!.x), label + ": mobile media left edge").toBeLessThanOrEqual(1);
          expect(Math.abs((mediaBox!.x + mediaBox!.width) - overflow.clientWidth), label + ": mobile media right edge").toBeLessThanOrEqual(1);
          const mediaRadius = await media.evaluate((element) => getComputedStyle(element).borderTopLeftRadius);
          expect(mediaRadius, label + ": mobile media radius").toBe("0px");
          const ratio = mediaBox!.width / mediaBox!.height;
          expect(ratio, label + ": mobile media should be low 16:6").toBeGreaterThan(2.62);
          expect(ratio, label + ": mobile media should be low 16:6").toBeLessThan(2.72);

          if (await intro.count()) {
            const introMediaGap = await hero.evaluate((root) => {
              const mediaElement = root.querySelector<HTMLElement>("[data-unified-section-hero-media]");
              const introElement = root.querySelector<HTMLElement>("[data-section-hero-intro]");
              if (!mediaElement || !introElement) return null;
              const mediaRect = mediaElement.getBoundingClientRect();
              const introRect = introElement.getBoundingClientRect();
              return mediaRect.y - (introRect.y + introRect.height);
            });
            expect(introMediaGap, label + ": intro/image geometry").not.toBeNull();
            expect(Math.abs(introMediaGap! - 16), label + ": intro→image gap").toBeLessThanOrEqual(2);
          }

          if (await tools.count()) {
            await expect.poll(async () => hero.evaluate((root) => {
              const mediaElement = root.querySelector<HTMLElement>("[data-unified-section-hero-media]");
              const toolsElement = root.querySelector<HTMLElement>("[data-unified-section-hero-tools]");
              if (!mediaElement || !toolsElement) return -999;
              const mediaRect = mediaElement.getBoundingClientRect();
              const toolsRect = toolsElement.getBoundingClientRect();
              return toolsRect.y - (mediaRect.y + mediaRect.height);
            }), { message: label + ": image must end before tools", timeout: 5000 }).toBeGreaterThanOrEqual(-1);
          }
        } else {
          const desktopGeometry = await hero.evaluate((root) => {
            const mediaElement = root.querySelector<HTMLElement>("[data-unified-section-hero-media]");
            const copyElement = root.querySelector<HTMLElement>("[data-unified-section-hero-copy]");
            if (!mediaElement || !copyElement) return null;
            const mediaRect = mediaElement.getBoundingClientRect();
            const copyRect = copyElement.getBoundingClientRect();
            return {
              media: { x: mediaRect.x, y: mediaRect.y },
              copy: { x: copyRect.x, y: copyRect.y },
            };
          });
          expect(desktopGeometry, label + ": desktop media/copy geometry").not.toBeNull();
          expect(desktopGeometry!.copy.x, label + ": desktop copy overlays image-led hero").toBeGreaterThanOrEqual(desktopGeometry!.media.x - 1);
          expect(desktopGeometry!.copy.y, label + ": desktop copy overlays image-led hero").toBeGreaterThanOrEqual(desktopGeometry!.media.y - 1);
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

test("UNIFIED-SECTION-HERO intro paragraphs use only canonical margins", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/steniatka", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const intro = page.locator("[data-section-hero-intro]").first();
  await expect(intro).toBeVisible();
  const margins = await intro.evaluate((node) => {
    const first = document.createElement("p");
    const second = document.createElement("p");
    first.textContent = "Canonical intro paragraph one";
    second.textContent = "Canonical intro paragraph two";
    node.append(first, second);
    const firstStyle = getComputedStyle(first);
    const secondStyle = getComputedStyle(second);
    const result = {
      firstTop: firstStyle.marginTop,
      firstBottom: firstStyle.marginBottom,
      secondTop: secondStyle.marginTop,
      secondBottom: secondStyle.marginBottom,
    };
    first.remove();
    second.remove();
    return result;
  });
  expect(margins).toEqual({
    firstTop: "0px",
    firstBottom: "0px",
    secondTop: "8px",
    secondBottom: "0px",
  });
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
