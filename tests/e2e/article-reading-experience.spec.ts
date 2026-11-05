import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const cases = [
  {
    id: "bikejoring",
    path: "/aktivity/bikejoring-so-psom-kompletny-sprievodca-od-prveho-treningu-az-po-preteky-na-slovensku",
    title: "Bikejoring so psom: kompletný sprievodca od prvého tréningu až po preteky na Slovensku",
    toc: true,
    updated: false,
    hasImage: true,
  },
  {
    id: "stimulus-control",
    path: "/aktivity/stimulus-control-u-psa",
    title: "Stimulus control: kedy pes povel naozaj ovláda",
    toc: true,
    updated: false,
    hasImage: true,
  },
  {
    id: "granule",
    path: "/starostlivost/ako-vybrat-granule-bez-marketingovych-mytov",
    title: "Ako vybrať granule bez marketingových mýtov",
    toc: true,
    updated: true,
    hasImage: true,
  },
  {
    id: "no-image",
    path: "/starostlivost/e2e-clanok-bez-obrazka",
    title: "E2E článok bez hero obrázka",
    toc: false,
    updated: false,
    hasImage: false,
  },
] as const;

const productionReferenceCases = [
  { id: "zubna-hygiena", path: "/starostlivost/ako-cistit-psovi-zuby" },
  { id: "nosework", path: "/aktivity/nosework" },
  { id: "prvy-den-steniatka", path: "/steniatka/prvy-den-so-steniatkom-doma" },
] as const;

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .include("main#obsah")
    // Third-party YouTube/Vimeo player DOM is outside Psipedia's control.
    // The host iframe contract is covered separately below.
    .exclude(".article-block-embed iframe")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

// A production screenshot is optional evidence, not a reliable required-PR check.
// External production navigation can hang the Playwright browser despite the
// per-navigation timeout; local article assertions remain mandatory on PRs.
function shouldCaptureProductionBaseline() {
  return process.env.ARTICLE_UX_CAPTURE_PRODUCTION === "1" && process.env.GITHUB_EVENT_NAME !== "pull_request";
}

async function captureProductionBaseline(page: Page, path: string, output: string) {
  if (!shouldCaptureProductionBaseline()) return;
  try {
    const response = await page.goto(`https://psipedia.sk${path}`, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });
    if (!response?.ok()) {
      console.warn(`[article-ux] production baseline unavailable for ${path}: HTTP ${response?.status() ?? "unknown"}`);
      return;
    }
    await page.waitForLoadState("load", { timeout: 5_000 }).catch(() => undefined);
    // Production can keep loading external images indefinitely. Baseline capture
    // is best-effort evidence, not an assertion about the local article UX.
    // Bound each screenshot so six captures cannot exhaust the test budget.
    await page.screenshot({ path: output, timeout: 8_000, animations: "disabled" });
  } catch (error) {
    console.warn(
      `[article-ux] production baseline unavailable for ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function expectAnchorClearsStickyHeader(page: Page, href: string) {
  const id = decodeURIComponent(href.replace(/^#/, ""));
  const target = page.locator(`#${id}`);
  await target.waitFor({ state: "visible" });
  const metrics = await target.evaluate((node) => {
    const header = document.querySelector<HTMLElement>(".site-header");
    return {
      top: node.getBoundingClientRect().top,
      headerHeight: header?.getBoundingClientRect().height ?? 0,
    };
  });
  expect(metrics.top).toBeGreaterThanOrEqual(metrics.headerHeight + 8);
}

async function expectSemanticArticleHeadings(page: Page) {
  const levels = await page.locator(".article-prose h2, .article-prose h3").evaluateAll((headings) =>
    headings.map((heading) => Number(heading.tagName.slice(1))),
  );
  let previous = 1;
  for (const level of levels) {
    expect(level).toBeGreaterThanOrEqual(2);
    expect(level).toBeLessThanOrEqual(3);
    expect(level - previous).toBeLessThanOrEqual(1);
    previous = level;
  }
}

test.beforeEach(async ({ page, baseURL }) => {
  expect(new URL(baseURL!).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("ARTICLE-VISUAL-1 captures requested production references on desktop and mobile", async ({ page }, testInfo) => {
  // Six external production navigations can each consume the bounded 15s timeout.
  // Keep a separate budget for evidence collection without relaxing local UX assertions.
  test.setTimeout(240_000);
  test.skip(!shouldCaptureProductionBaseline(), "External production screenshot capture is opt-in outside required PR CI; local article UX checks still run.");
  test.skip(testInfo.project.name !== "desktop-chromium", "Captured once with explicit desktop and mobile viewports.");
  for (const reference of productionReferenceCases) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await captureProductionBaseline(
      page,
      reference.path,
      `.e2e-artifacts/article-ux-1/${reference.id}-before-production-desktop-1440x900.png`,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await captureProductionBaseline(
      page,
      reference.path,
      `.e2e-artifacts/article-ux-1/${reference.id}-before-production-mobile-390x844.png`,
    );
  }
});

// The article page now uses the same HERO as the homepage. Keep all editorial,
// link, accessibility, image-editor and responsive contracts while testing the
// canonical visual rather than the removed article-specific .article-hero-image.
for (const articleCase of cases) {
  for (const viewport of [
    { width: 390, height: 844, name: "mobile" },
    { width: 1440, height: 900, name: "desktop" },
  ]) {
    test(articleCase.id + " " + viewport.name + " article composition", async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await captureProductionBaseline(page, articleCase.path,
        ".e2e-artifacts/article-ux-1/" + articleCase.id + "-before-production-" + viewport.name + ".png");
      await page.goto(articleCase.path);
      const main = page.locator("main#obsah");
      const hero = main.locator("[data-unified-section-hero]");
      const visual = hero.locator("[data-unified-section-hero-visual]");
      const media = hero.locator("[data-unified-section-hero-media]");
      const configured = hero.locator("[data-public-hero-configured-media]");
      const prose = main.locator(".article-prose");
      await expect(hero).toHaveCount(1);
      await expect(hero.getByRole("heading", { level: 1, name: articleCase.title })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Navigácia v článku" })).toBeVisible();
      await expect(media).toBeVisible();
      if (articleCase.hasImage) {
        await expect(configured).toHaveCount(1);
        const photo = configured.locator("img:not([aria-hidden='true'])").first();
        await expect(photo).toBeVisible();
        await expect(photo).toHaveAttribute("src", /.+/);
        await expect(configured.locator("[data-image-display]")).toHaveCount(1);
      } else {
        await expect(configured).toHaveCount(0);
        await expect(media.locator("img")).toHaveAttribute("src", /hero-labrador\.webp/);
      }
      await expect(prose).toBeVisible();
      await expect(prose.locator("[data-article-standfirst]")).toBeVisible();
      await expect(prose.locator(".article-intro")).toBeVisible();
      await expect(prose.getByText("To najdôležitejšie", { exact: true })).toBeVisible();
      await expect(page.locator(".article-aside")).toHaveCount(0);
      await expect(page.locator("[data-article-reading-progress]")).toHaveCount(1);
      await expect(page.locator("[data-article-reading-progress]")).toHaveAttribute("aria-hidden", "true");
      const sidebar = page.locator("[data-article-discovery-sidebar]");
      if (viewport.width < 768) {
        await expect(sidebar).toBeHidden();
      } else {
        await expect(sidebar).toBeVisible();
        await expect(sidebar.getByRole("heading", { name: "Najčítanejšie" })).toBeVisible();
        await expect(sidebar.locator('[data-popularity-window="24h"] li')).toHaveCount(5);
        const tab = sidebar.getByRole("tab", { name: "7 dní" });
        await expect(sidebar.locator("[data-popularity-hydrated]")).toHaveAttribute("data-popularity-hydrated", "true");
        await tab.click();
        await expect(tab).toHaveAttribute("aria-selected", "true");
        await expect(sidebar.locator('[data-popularity-window="7d"] li')).toHaveCount(5);
      }
      const geometry = await main.evaluate((node) => {
        const heading = node.querySelector("h1");
        const hero = node.querySelector("[data-unified-section-hero-visual]");
        const prose = node.querySelector(".article-prose");
        const excerpt = node.querySelector("[data-article-standfirst]");
        const r = hero.getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          heroWidth: r.width,
          heroHeight: r.height,
          proseWidth: prose.getBoundingClientRect().width,
          headingSize: Number.parseFloat(getComputedStyle(heading).fontSize),
          excerptClipping: excerpt.scrollHeight - excerpt.clientHeight,
        };
      });
      expect(geometry.overflow).toBeLessThanOrEqual(1);
      expect(geometry.heroWidth).toBeGreaterThan(0);
      expect(geometry.heroWidth).toBeLessThanOrEqual(viewport.width + 1);
      expect(geometry.heroHeight).toBeGreaterThanOrEqual(250);
      expect(geometry.headingSize).toBeGreaterThanOrEqual(26);
      expect(geometry.proseWidth).toBeGreaterThan(250);
      expect(geometry.proseWidth).toBeLessThanOrEqual(viewport.width);
      expect(geometry.excerptClipping).toBeLessThanOrEqual(1);
      const save = page.getByRole("button", { name: /Uložiť medzi obľúbené|Odstrániť z obľúbených/ });
      await expect(save).toBeVisible();
      await save.focus();
      await expect(save).toBeFocused();
      const sharing = page.getByRole("group", { name: /Zdieľať/ }).last();
      await expect(sharing.locator("a, button").first()).toBeVisible();
      await expect(prose.locator(".article-feedback")).toBeVisible();
      await expectSemanticArticleHeadings(page);
      const toc = page.getByRole("navigation", { name: "Obsah článku" });
      if (articleCase.toc) {
        await expect(toc).toHaveCount(1);
        await expect(toc.locator("a[href^='#']").first()).toBeVisible();
      } else {
        await expect(toc).toHaveCount(0);
      }
      if (articleCase.updated) await expect(page.getByText(/Aktualizované/)).toBeVisible();
      if (articleCase.id === "no-image") {
        await expect(page.locator('.article-prose [data-promo-key="veterinari"]')).toBeVisible();
      }
      await expect(main).not.toContainText(/\b\d+\s*min\s+čítania\b/i);
      await expectNoSeriousAccessibilityViolations(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: ".e2e-artifacts/article-ux-1/" + articleCase.id + "-after-local-" + viewport.name + ".png",
      });
    });
  }
}

test("ARTICLE-ALIGNMENT-PROGRESS-1 shared HERO, reading axis, sidebar and progress have no responsive overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One browser verifies the viewport matrix.");
  for (const viewport of [
    { width: 1920, height: 1080 }, { width: 1440, height: 900 },
    { width: 1280, height: 800 }, { width: 1024, height: 768 },
    { width: 768, height: 1024 }, { width: 430, height: 932 },
    { width: 390, height: 844 }, { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(cases[0].path);
    await expect(page.locator("main h1")).toHaveCount(1);
    const measurements = await page.evaluate(() => {
      const hero = document.querySelector("[data-unified-section-hero-visual]");
      const prose = document.querySelector(".article-prose");
      const sidebar = document.querySelector("[data-article-discovery-sidebar]");
      const progress = document.querySelector("[data-article-reading-progress]");
      const heroRect = hero.getBoundingClientRect();
      const proseRect = prose.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        heroWidth: heroRect.width, proseWidth: proseRect.width,
        proseLeft: proseRect.left, sidebarLeft: sidebar.getBoundingClientRect().left,
        sidebarDisplay: getComputedStyle(sidebar).display,
        progressHeight: progress.getBoundingClientRect().height,
      };
    });
    expect(measurements.overflow, "document overflow at " + viewport.width).toBeLessThanOrEqual(1);
    expect(measurements.heroWidth).toBeLessThanOrEqual(viewport.width + 1);
    expect(measurements.proseWidth).toBeGreaterThan(250);
    if (viewport.width >= 1200) {
      expect(measurements.sidebarLeft).toBeGreaterThan(measurements.proseLeft + measurements.proseWidth);
    } else if (viewport.width < 768) {
      expect(measurements.sidebarDisplay).toBe("none");
    }
    expect(measurements.progressHeight).toBeGreaterThanOrEqual(2);
    expect(measurements.progressHeight).toBeLessThanOrEqual(3);
  }
});

test("ARTICLE-READING-UX-2 manual related stays editorial while automatic related moves to end recommendations", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const bikePath = "/aktivity/bikejoring-so-psom-kompletny-sprievodca-od-prveho-treningu-az-po-preteky-na-slovensku";
  const stimulusPath = "/aktivity/stimulus-control-u-psa";

  await page.goto(bikePath);
  const manualRelated = page.locator(".article-block-related");
  await expect(manualRelated).toHaveCount(1);
  await expect(manualRelated.getByText("Súvisiaci článok", { exact: true })).toBeVisible();
  await expect(manualRelated.getByRole("link")).toHaveAttribute("href", stimulusPath);
  await expect(page.locator('aside[aria-label="Súvisiaci článok"]')).toHaveCount(0);
  await expect(page.getByText("E2E nepublikovaný related kandidát", { exact: true })).toHaveCount(0);

  const endLinks = page.locator(".related-section [data-article-list-item]");
  expect(await endLinks.count()).toBeGreaterThan(0);
  expect(await endLinks.count()).toBeLessThanOrEqual(3);
  await expect(page.locator("[data-article-discovery-sidebar] [data-popularity-window] li")).toHaveCount(5);

  const recommendationHrefs = await page
    .locator('.article-block-related a, .related-section [data-article-list-item]')
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")).filter((href): href is string => Boolean(href)));
  expect(recommendationHrefs).not.toContain(bikePath);
  expect(new Set(recommendationHrefs).size, "Duplicate recommendation hrefs: " + JSON.stringify(recommendationHrefs)).toBe(recommendationHrefs.length);

  await page.goto(stimulusPath);
  await expect(page.locator(".article-block-related")).toHaveCount(0);
  await expect(page.locator('aside[aria-label="Súvisiaci článok"]')).toHaveCount(0);
  await expect(page.locator('.related-section [data-article-list-item][href="' + bikePath + '"]')).toHaveCount(1);
  await expect(page.getByText("E2E nepublikovaný related kandidát", { exact: true })).toHaveCount(0);

  await page.goto("/starostlivost/e2e-clanok-bez-obrazka");
  await expect(page.locator(".article-hero-image, .article-hero-placeholder")).toHaveCount(0);
  await expect(page.locator('aside[aria-label="Súvisiaci článok"]')).toHaveCount(0);
  const discoverySidebar = page.locator("[data-article-discovery-sidebar]");
  await expect(discoverySidebar.locator("[data-popularity-window] li")).toHaveCount(5);
  await expect(page.locator('.article-prose [data-promo-key="veterinari"]')).toHaveCount(1);
  await expect(discoverySidebar.locator('[data-automatic-article-promo] [data-promo-key="fyzioterapia"]')).toHaveCount(1);
});
test("ARTICLE-2 preserves canonical Article schema, dates, author and image metadata", async ({ page }) => {
  const path = "/aktivity/bikejoring-so-psom-kompletny-sprievodca-od-prveho-treningu-az-po-preteky-na-slovensku";
  await page.goto(path);

  const canonical = page.locator('link[rel="canonical"]');
  await expect(canonical).toHaveAttribute("href", "https://psipedia.sk" + path);

  type SchemaNode = {
    "@type"?: string;
    "@id"?: string;
    datePublished?: string;
    dateModified?: string;
    author?: { "@id"?: string; name?: string };
    publisher?: { "@id"?: string };
    image?: unknown[];
    logo?: { url?: string };
  };
  const graph = await page.locator('script[type="application/ld+json"]').evaluateAll((nodes) =>
    nodes.flatMap((node) => {
      const parsed = JSON.parse(node.textContent || "{}");
      return Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed];
    }),
  ) as SchemaNode[];
  const articleSchema = graph.find((item) => item["@type"] === "Article");
  const publisher = graph.find((item) => item["@id"] === "https://psipedia.sk/#organization");
  const webPage = graph.find((item) => item["@type"] === "WebPage" && item["@id"] === "https://psipedia.sk" + path);
  expect(articleSchema).toBeTruthy();
  expect(articleSchema?.datePublished).toBe("2026-08-17");
  expect(articleSchema?.dateModified).toBeTruthy();
  expect(articleSchema?.author?.["@id"]).toBe("https://psipedia.sk/#organization");
  expect(articleSchema?.publisher?.["@id"]).toBe("https://psipedia.sk/#organization");
  expect(Array.isArray(articleSchema?.image)).toBe(true);
  expect(articleSchema?.image?.length).toBeGreaterThan(0);
  expect(publisher?.["@type"]).toBe("Organization");
  expect(publisher?.logo?.url).toBe("https://psipedia.sk/pwa/icon-512.png");
  expect(webPage?.publisher?.["@id"]).toBe("https://psipedia.sk/#organization");
});


test("ARTICLE-PUBLIC canonical rich text, author, safe video and share actions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/aktivity/bikejoring-so-psom-kompletny-sprievodca-od-prveho-treningu-az-po-preteky-na-slovensku");

  await expect(page.getByText("Redakcia Psipedia", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".article-prose strong").filter({ hasText: "Bikejoring je tímový šport" })).toBeVisible();
  await expect(page.locator(".article-prose em").filter({ hasText: "Bezpečný začiatok je dôležitejší než rýchlosť." })).toBeVisible();

  const safeVideo = page.locator('iframe[src^="https://www.youtube-nocookie.com/embed/"]');
  await expect(safeVideo).toHaveCount(1);
  await expect(safeVideo).toHaveAttribute("allowfullscreen", "");

  const sharing = page.getByRole("group", { name: "Zdieľať článok" }).last();
  await expect(sharing.getByRole("link", { name: "Facebook" })).toHaveAttribute("href", /facebook\.com\/sharer\/sharer\.php/);
  await expect(sharing.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", /wa\.me/);
  await sharing.getByRole("button", { name: "Kopírovať odkaz" }).click();
  await expect(sharing.getByRole("button", { name: "Odkaz skopírovaný" })).toBeVisible();

  await expectNoSeriousAccessibilityViolations(page);
});

test("ARTICLE-PUBLIC legacy author fallback and malicious embed fail closed", async ({ page }) => {
  await page.goto("/aktivity/stimulus-control-u-psa");
  await expect(page.getByText("Martin", { exact: true }).first()).toBeVisible();
  await expect(page.locator('iframe[src^="javascript:"]')).toHaveCount(0);
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
});

test("ARTICLE-PUBLIC canonical news landing redirects and topic URLs stay available", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/novinky");
  await expect(page).toHaveURL(/\/clanky$/);
  await expect(page.getByRole("heading", { level: 1, name: "Novinky zo sveta psov" })).toBeVisible();
  await expect(page.locator(".article-browser a[role='listitem']").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

  await page.goto("/novinky/veda-a-zdravie");
  await expect(page).toHaveURL(/\/novinky\/veda-a-zdravie$/);
  await expect(page.getByRole("list", { name: "Novinky: Veda a zdravie" }).getByText("E2E výskum psov 2026")).toBeVisible();
  await expect(page.getByText("E2E zaujímavosť zo sveta psov")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Filtrovať novinky podľa kategórie" }).getByRole("link", { name: "Všetky" })).toHaveAttribute("href", "/clanky");
  await expectNoSeriousAccessibilityViolations(page);
});

test("PUBLIC-GLOBAL search keeps article results compact while retaining full-text matching", async ({ page }) => {
  await page.goto("/hladat?q=E2E%20výskum");
  const row = page.locator('[data-article-list-item][href*="/novinky/"]').first();
  await expect(row).toBeVisible();
  await expect(row.locator("[data-article-title]")).toBeVisible();
  await expect(row.locator("[data-article-topic]")).toBeVisible();
  await expect(row.locator("[data-article-date]")).toBeVisible();
  await expect(row.locator("p, small")).toHaveCount(0);
  await expect(row.locator("[data-article-image] img")).toBeVisible();
  await expect(row).not.toContainText(/\b\d+\s*min(?:\s+čítania)?\b|Čítať novinku|Čítať článok|Prečítať|Zistiť viac/i);
});

test("ARTICLE-PUBLIC unknown article remains a real 404", async ({ page }) => {
  const response = await page.goto("/clanky/article-public-neexistuje");
  expect(response?.status()).toBe(404);
});


test("ARTICLE-CARDS-1 approved magazine rows and homepage feature remain responsive and keyboard-usable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Viewport matrix is captured once from the desktop Chromium project.");

  const surfaces = [
    { id: "magazine-cards", path: "/clanky", selector: ".article-browser a[role='listitem']", emptySelector: null },
    { id: "homepage-cards", path: "/", selector: "[data-home-latest] [data-article-card]", emptySelector: "[data-home-latest-empty]" },
  ] as const;
  const viewports = [
    { width: 360, height: 800, label: "mobile-360x800" },
    { width: 390, height: 844, label: "mobile-390x844" },
    { width: 768, height: 1024, label: "tablet-768x1024" },
    { width: 1440, height: 900, label: "desktop-1440x900" },
  ] as const;

  for (const surface of surfaces) {
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      if (viewport.width === 390 || viewport.width === 1440) {
        await captureProductionBaseline(page, surface.path,
          `.e2e-artifacts/article-ux-1/${surface.id}-before-production-${viewport.label}.png`);
      }
      await page.goto(surface.path);
      const cards = page.locator(surface.selector);
      if ((await cards.count()) === 0 && surface.emptySelector) {
        await expect(page.locator(surface.emptySelector)).toBeVisible();
      } else {
        await expect(cards.first()).toBeVisible();
        const metrics = await page.evaluate(({ selector, magazine }) => {
          const card = document.querySelector<HTMLElement>(selector);
          const title = magazine ? card?.querySelector<HTMLElement>("strong") : card?.querySelector<HTMLElement>(".article-card-title");
          const media = magazine ? card?.querySelector<HTMLElement>("img") : card?.querySelector<HTMLElement>(".article-card-media");
          const rect = media?.getBoundingClientRect();
          return {
            overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
            width: card?.getBoundingClientRect().width ?? 0,
            ratio: rect && rect.height ? rect.width / rect.height : 0,
            hasMedia: Boolean(media),
            clipping: title ? title.scrollHeight - title.clientHeight : 0,
          };
        }, { selector: surface.selector, magazine: surface.id === "magazine-cards" });
        expect(metrics.overflow, `${surface.id} ${viewport.label}: horizontal overflow`).toBeLessThanOrEqual(1);
        expect(metrics.width).toBeGreaterThan(0);
        if (metrics.hasMedia) {
          // Compact magazine thumbnails may be portrait; require valid, visible media geometry.
          expect(metrics.ratio).toBeGreaterThan(0);
          expect(metrics.ratio).toBeLessThan(5);
        }
        expect(metrics.clipping, "Article titles must not be clipped").toBeLessThanOrEqual(1);
        const primaryLink = surface.id === "magazine-cards"
          ? cards.first()
          : cards.first().locator(".article-card-title a");
        await primaryLink.focus();
        await expect(primaryLink).toBeFocused();
      }
      await expect(page.locator("main#obsah")).not.toContainText(/\b\d+\s*min\s+čítania\b/i);
      expect(await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))).toBeLessThanOrEqual(1);
      if (viewport.width === 390 || viewport.width === 1440) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `.e2e-artifacts/article-ux-1/${surface.id}-after-local-${viewport.label}.png` });
        await expectNoSeriousAccessibilityViolations(page);
      }
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/clanky");
  const noImage = page.locator(".article-browser a[role='listitem']").filter({ hasText: "E2E článok bez hero obrázka" });
  if (await noImage.count()) {
    await expect(noImage.locator("img")).toHaveCount(0);
    await expect(noImage.getByText("E2E článok bez hero obrázka")).toBeVisible();
    expect(await noImage.getAttribute("href")).toMatch(/^\//);
  }
  await page.getByPlaceholder("Hľadať v magazíne").fill("article-cards-empty-state-no-match");
  await expect(page.getByRole("heading", { name: "Na túto stopu sme ešte nenarazili" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
