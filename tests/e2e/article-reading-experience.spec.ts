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

async function captureProductionBaseline(page: Page, path: string, output: string) {
  if (process.env.ARTICLE_UX_CAPTURE_PRODUCTION !== "1") return;
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
    await page.screenshot({ path: output });
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
  test.skip(process.env.ARTICLE_UX_CAPTURE_PRODUCTION !== "1", "Production capture is CI-only.");
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

for (const articleCase of cases) {
  test(`${articleCase.id} mobile 390x844 article composition`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await captureProductionBaseline(
      page,
      articleCase.path,
      `.e2e-artifacts/article-ux-1/${articleCase.id}-before-production-mobile-390x844.png`,
    );

    await page.goto(articleCase.path);
    await expect(page.getByRole("heading", { level: 1, name: articleCase.title })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navigácia v článku" })).toBeVisible();
    if (articleCase.hasImage) {
      await expect(page.locator(".article-hero-image")).toBeVisible();
    } else {
      await expect(page.locator(".article-hero-image, .article-hero-placeholder")).toHaveCount(0);
    }
    await expect(page.locator(".article-intro")).toBeVisible();
    await expect(page.getByText("To najdôležitejšie", { exact: true })).toBeVisible();
    await expect(page.locator(".article-aside")).toHaveCount(0);
    const mobileSidebar = page.locator("[data-article-discovery-sidebar]");
    await expect(mobileSidebar).toBeHidden();
    await expect(mobileSidebar.locator("[data-automatic-article-promo]")).toBeHidden();
    if (articleCase.id === "no-image") {
      await expect(page.locator('.article-prose [data-promo-key="veterinari"]')).toBeVisible();
    }

    const saveButton = page.getByRole("button", { name: /Uložiť medzi obľúbené|Odstrániť z obľúbených/ });
    const compactShare = page.getByRole("group", { name: /Zdieľať/ }).first().getByRole("button").first();
    for (const control of [saveButton, compactShare]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await saveButton.focus();
    await expect(saveButton).toBeFocused();

    const metrics = await page.evaluate(() => {
      const h1 = document.querySelector<HTMLElement>("h1")!;
      const excerpt = document.querySelector<HTMLElement>("main#obsah header h1 + p")!;
      const image = document.querySelector<HTMLElement>(".article-hero-image");
      const prose = document.querySelector<HTMLElement>(".article-prose")!;
      const intro = document.querySelector<HTMLElement>(".article-intro")!;
      const takeaway = document.querySelector<HTMLElement>(".takeaway-box")!;
      const header = document.querySelector<HTMLElement>("main#obsah > header")!;
      const imageRect = image?.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        h1Size: Number.parseFloat(getComputedStyle(h1).fontSize),
        excerptClipping: excerpt.scrollHeight - excerpt.clientHeight,
        imageRatio: imageRect ? imageRect.width / imageRect.height : null,
        proseWidth: prose.getBoundingClientRect().width,
        proseSize: Number.parseFloat(getComputedStyle(prose).fontSize),
        proseLineHeight: Number.parseFloat(getComputedStyle(prose).lineHeight),
        introTop: intro.getBoundingClientRect().top,
        introBottom: intro.getBoundingClientRect().bottom,
        takeawayTop: takeaway.getBoundingClientRect().top,
        noImageGap: prose.getBoundingClientRect().top - header.getBoundingClientRect().bottom,
      };
    });

    console.log(`[article-ux] ${articleCase.id} mobile metrics ${JSON.stringify(metrics)}`);
    await page.screenshot({ path: `.e2e-artifacts/article-ux-1/${articleCase.id}-after-local-mobile-390x844.png` });

    expect(metrics.overflow).toBeLessThanOrEqual(1);
    expect(metrics.h1Size).toBeGreaterThanOrEqual(26);
    expect(metrics.h1Size).toBeLessThanOrEqual(31.5);
    expect(metrics.excerptClipping, "The mobile perex must be fully visible").toBeLessThanOrEqual(1);
    if (articleCase.hasImage) {
      expect(metrics.imageRatio).not.toBeNull();
      expect(metrics.imageRatio!).toBeGreaterThan(1.74);
      expect(metrics.imageRatio!).toBeLessThan(1.81);
    } else {
      expect(metrics.imageRatio).toBeNull();
      expect(metrics.noImageGap).toBeLessThanOrEqual(32);
    }
    expect(metrics.proseWidth).toBeLessThanOrEqual(390 - 32 + 1);
    expect(metrics.proseSize).toBeGreaterThanOrEqual(14.8);
    expect(metrics.proseSize).toBeLessThanOrEqual(15.2);
    expect(metrics.proseLineHeight / metrics.proseSize).toBeGreaterThanOrEqual(1.68);
    expect(metrics.proseLineHeight / metrics.proseSize).toBeLessThanOrEqual(1.76);
    expect(metrics.introTop).toBeLessThan(metrics.takeawayTop);

    if (articleCase.id === "bikejoring") {
      expect(
        metrics.introTop,
        "Bikejoring prose must be visible or directly adjacent to the first 390x844 viewport",
      ).toBeLessThanOrEqual(944);
    }

    const endSharing = page.getByRole("group", { name: /Zdieľať/ }).last();
    const endShareControls = endSharing.locator("a, button");
    expect(await endShareControls.count()).toBeGreaterThanOrEqual(3);
    const firstShareBox = await endShareControls.nth(0).boundingBox();
    const secondShareBox = await endShareControls.nth(1).boundingBox();
    expect(firstShareBox).not.toBeNull();
    expect(secondShareBox).not.toBeNull();
    expect(Math.abs(firstShareBox!.y - secondShareBox!.y)).toBeLessThanOrEqual(2);
    expect(firstShareBox!.height).toBeLessThanOrEqual(42);

    const feedback = page.locator(".article-feedback");
    await expect(feedback.getByRole("button", { name: "Áno", exact: true })).toBeVisible();
    await expect(feedback.getByRole("button", { name: "Nie", exact: true })).toBeVisible();
    await expect(feedback).not.toContainText(/🐾|👍|👎/);

    const sources = page.locator(".article-block-sources");
    if (await sources.count()) {
      const sourceSize = await sources.first().evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
      expect(sourceSize).toBeLessThanOrEqual(14.5);
    }

    const mobileUtilityStrip = page.locator("[data-mobile-name-day]");
    await page.evaluate(() => window.scrollTo(0, 560));
    const stickyHeader = page.locator(".site-header");
    await expect(stickyHeader).toBeVisible();
    const stickyHeaderBox = await stickyHeader.boundingBox();
    expect(stickyHeaderBox).not.toBeNull();
    expect(Math.abs(stickyHeaderBox!.y)).toBeLessThanOrEqual(2);
    if (await mobileUtilityStrip.count()) {
      const stripBox = await mobileUtilityStrip.boundingBox();
      expect(stripBox).not.toBeNull();
      expect(stripBox!.y + stripBox!.height).toBeLessThanOrEqual(1);
    }

    const backToTop = page.getByRole("button", { name: "Späť hore" });
    await expect(backToTop).toBeVisible();
    const backToTopBox = await backToTop.boundingBox();
    expect(backToTopBox).not.toBeNull();
    expect(backToTopBox!.width).toBeGreaterThanOrEqual(44);
    expect(backToTopBox!.width).toBeLessThanOrEqual(46);
    expect(backToTopBox!.height).toBeGreaterThanOrEqual(44);
    expect(backToTopBox!.height).toBeLessThanOrEqual(46);
    await page.evaluate(() => window.scrollTo(0, 0));

    const toc = page.locator("details").filter({ has: page.getByText("Obsah článku", { exact: true }) });
    if (articleCase.toc) {
      await expect(toc).toHaveCount(1);
      await expect(toc).not.toHaveAttribute("open");
      const summary = toc.locator("summary");
      await summary.focus();
      await expect(summary).toBeFocused();
      await summary.press("Enter");
      await expect(toc).toHaveAttribute("open", "");
      const firstAnchor = toc.locator("a[href^='#']").first();
      await expect(firstAnchor).toBeVisible();
      const href = await firstAnchor.getAttribute("href");
      expect(href).toBeTruthy();
      if (articleCase.id === "bikejoring") {
        await expect(toc).not.toContainText("Smer a zastavenie");
      }
      await firstAnchor.click();
      await expectAnchorClearsStickyHeader(page, href!);

      await page.goto("about:blank");
      await page.goto(`${articleCase.path}${href}`);
      await expectAnchorClearsStickyHeader(page, href!);
      const directToc = page.locator("details").filter({ has: page.getByText("Obsah článku", { exact: true }) });
      await expect(directToc).not.toHaveAttribute("open");
    } else {
      await expect(toc).toHaveCount(0);
    }

    await expect(page.locator("main#obsah")).not.toContainText(/\b\d+\s*min\s+čítania\b/i);

    if (articleCase.updated) {
      await expect(page.getByText(/Aktualizované/)).toBeVisible();
    }

    await expectSemanticArticleHeadings(page);
    if (articleCase.id === "bikejoring") await expectNoSeriousAccessibilityViolations(page);
  });

  test(`${articleCase.id} desktop 1440x900 article composition`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await captureProductionBaseline(
      page,
      articleCase.path,
      `.e2e-artifacts/article-ux-1/${articleCase.id}-before-production-desktop-1440x900.png`,
    );

    await page.goto(articleCase.path);
    const h1 = page.getByRole("heading", { level: 1, name: articleCase.title });
    await expect(h1).toBeVisible();
    if (articleCase.hasImage) {
      await expect(page.locator(".article-hero-image")).toBeVisible();
    } else {
      await expect(page.locator(".article-hero-image, .article-hero-placeholder")).toHaveCount(0);
    }
    await expect(page.locator(".article-prose")).toBeVisible();
    await expect(page.locator(".article-aside")).toHaveCount(0);
    const desktopSidebar = page.locator("[data-article-discovery-sidebar]");
    await expect(desktopSidebar).toBeVisible();
    await expect(desktopSidebar.getByRole("heading", { name: "Najčítanejšie" })).toBeVisible();
    const tab24h = desktopSidebar.getByRole("tab", { name: "24 hodín" });
    const tab7d = desktopSidebar.getByRole("tab", { name: "7 dní" });
    await expect(tab24h).toHaveAttribute("aria-selected", "true");
    await expect(desktopSidebar.locator('[data-popularity-window="24h"] li')).toHaveCount(5);
    const popularityHrefs24h = await desktopSidebar.locator('[data-popularity-window="24h"] li a')
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(popularityHrefs24h).not.toContain(articleCase.path);
    await tab7d.click();
    await expect(tab7d).toHaveAttribute("aria-selected", "true");
    await expect(desktopSidebar.locator('[data-popularity-window="7d"] li')).toHaveCount(5);
    await expect(desktopSidebar.locator("[data-automatic-article-promo] [data-promo-key]")).toHaveCount(1);
    await expect(page.getByText("Najnovšie články", { exact: true })).toHaveCount(0);

    const metrics = await page.evaluate(() => {
      const heading = document.querySelector<HTMLElement>("h1")!;
      const image = document.querySelector<HTMLElement>(".article-hero-image");
      const prose = document.querySelector<HTMLElement>(".article-prose")!;
      const header = document.querySelector<HTMLElement>("main#obsah > header")!;
      const imageRect = image?.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        h1Size: Number.parseFloat(getComputedStyle(heading).fontSize),
        imageHeight: imageRect?.height ?? null,
        imageWidth: imageRect?.width ?? null,
        imageRatio: imageRect ? imageRect.width / imageRect.height : null,
        headingLeft: heading.getBoundingClientRect().left,
        proseLeft: prose.getBoundingClientRect().left,
        proseWidth: prose.getBoundingClientRect().width,
        proseSize: Number.parseFloat(getComputedStyle(prose).fontSize),
        proseLineHeight: Number.parseFloat(getComputedStyle(prose).lineHeight),
        noImageGap: prose.getBoundingClientRect().top - header.getBoundingClientRect().bottom,
      };
    });

    await page.screenshot({ path: `.e2e-artifacts/article-ux-1/${articleCase.id}-after-local-desktop-1440x900.png` });

    expect(metrics.overflow).toBeLessThanOrEqual(1);
    expect(metrics.h1Size).toBeLessThanOrEqual(44.5);
    if (articleCase.hasImage) {
      expect(metrics.imageHeight).not.toBeNull();
      expect(metrics.imageHeight!).toBeGreaterThanOrEqual(425);
      expect(metrics.imageHeight!).toBeLessThanOrEqual(430);
      expect(metrics.imageWidth).toBeGreaterThanOrEqual(758);
      expect(metrics.imageWidth).toBeLessThanOrEqual(762);
      expect(metrics.imageRatio).not.toBeNull();
      expect(metrics.imageRatio!).toBeGreaterThan(1.74);
      expect(metrics.imageRatio!).toBeLessThan(1.81);
    } else {
      expect(metrics.imageHeight).toBeNull();
      expect(metrics.imageRatio).toBeNull();
      expect(metrics.noImageGap).toBeLessThanOrEqual(40);
    }
    expect(metrics.proseWidth).toBeGreaterThanOrEqual(739);
    expect(metrics.proseWidth).toBeLessThanOrEqual(761);
    expect(metrics.proseSize).toBeGreaterThanOrEqual(16.9);
    expect(metrics.proseSize).toBeLessThanOrEqual(17.1);
    expect(metrics.proseLineHeight / metrics.proseSize).toBeGreaterThanOrEqual(1.67);
    expect(metrics.proseLineHeight / metrics.proseSize).toBeLessThanOrEqual(1.73);
    expect(Math.abs(metrics.headingLeft - metrics.proseLeft)).toBeLessThanOrEqual(2);
    if (articleCase.hasImage) expect(Math.abs(metrics.imageWidth! - metrics.proseWidth)).toBeLessThanOrEqual(2);

    const readingProgress = page.locator("[data-article-reading-progress]");
    await expect(readingProgress).toHaveCount(1);
    await expect(readingProgress).toHaveAttribute("aria-hidden", "true");
    const progressFill = readingProgress.locator("span");
    const progressAtTop = await progressFill.evaluate((node) => Number.parseFloat(getComputedStyle(node).getPropertyValue("--article-reading-progress")) || 0);
    expect(progressAtTop).toBeGreaterThanOrEqual(0);
    expect(progressAtTop).toBeLessThanOrEqual(0.05);
    const articleEnd = page.locator("[data-article-reading-end]");
    await articleEnd.evaluate((node) => window.scrollTo(0, Math.max(0, node.getBoundingClientRect().bottom + window.scrollY - window.innerHeight)));
    await page.waitForFunction(() => {
      const fill = document.querySelector<HTMLElement>("[data-article-reading-progress] span");
      return Number.parseFloat(fill?.style.getPropertyValue("--article-reading-progress") || "0") >= 0.99;
    });
    const progressAtEnd = await progressFill.evaluate((node) => Number.parseFloat(node.style.getPropertyValue("--article-reading-progress")) || 0);
    expect(progressAtEnd).toBeGreaterThanOrEqual(0.99);
    await page.locator(".related-section").first().scrollIntoViewIfNeeded();
    const progressInRelated = await progressFill.evaluate((node) => Number.parseFloat(node.style.getPropertyValue("--article-reading-progress")) || 0);
    expect(progressInRelated).toBeLessThanOrEqual(1);

    const [desktopProseBox, desktopSidebarBox] = await Promise.all([
      page.locator(".article-prose").boundingBox(),
      desktopSidebar.boundingBox(),
    ]);
    expect(desktopProseBox).not.toBeNull();
    expect(desktopSidebarBox).not.toBeNull();
    expect(desktopSidebarBox!.x).toBeGreaterThan(desktopProseBox!.x + desktopProseBox!.width);

    const toc = page.locator("details").filter({ has: page.getByText("Obsah článku", { exact: true }) });
    await expect(toc).toHaveCount(articleCase.toc ? 1 : 0);
    if (articleCase.toc) {
      await expect(toc).not.toHaveAttribute("open");
      const firstAnchor = toc.locator("a[href^='#']").first();
      await toc.locator("summary").click();
      await expect(toc).toHaveAttribute("open", "");
      const href = await firstAnchor.getAttribute("href");
      expect(href).toBeTruthy();
      await firstAnchor.click();
      await expectAnchorClearsStickyHeader(page, href!);

      await page.goto("about:blank");
      await page.goto(`${articleCase.path}${href}`);
      await expectAnchorClearsStickyHeader(page, href!);
      const directToc = page.locator("details").filter({ has: page.getByText("Obsah článku", { exact: true }) });
      await expect(directToc).not.toHaveAttribute("open");
    }
    await expect(page.locator("main#obsah")).not.toContainText(/\b\d+\s*min\s+čítania\b/i);
    await expectSemanticArticleHeadings(page);

    const sources = page.locator(".article-block-sources");
    if (await sources.count()) {
      const sourceBottom = await sources.last().evaluate((node) => node.getBoundingClientRect().bottom + window.scrollY);
      const relatedTop = await page.locator(".related-section").evaluate((node) => node.getBoundingClientRect().top + window.scrollY);
      expect(sourceBottom).toBeLessThan(relatedTop);
    }

    if (articleCase.id === "bikejoring") await expectNoSeriousAccessibilityViolations(page);
  });
}



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

  const graph = await page.locator('script[type="application/ld+json"]').first().evaluate((node) => JSON.parse(node.textContent || "{}")["@graph"] ?? []);
  const articleSchema = graph.find((item: { "@type"?: string }) => item["@type"] === "Article");
  expect(articleSchema).toBeTruthy();
  expect(articleSchema.datePublished).toBe("2026-08-17");
  expect(articleSchema.dateModified).toBeTruthy();
  expect(articleSchema.author?.name).toBe("Redakcia Psipedia");
  expect(Array.isArray(articleSchema.image)).toBe(true);
  expect(articleSchema.image.length).toBeGreaterThan(0);
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
  await expect(page.locator("[data-article-card]").first()).toBeVisible();
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


test("ARTICLE-CARDS-1 article listings are responsive, keyboard-usable and visually stable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Viewport matrix is captured once from the desktop Chromium project.");

  const surfaces = [
    { id: "magazine-cards", path: "/clanky", selector: "[data-article-card]", emptySelector: null },
    {
      id: "homepage-cards",
      path: "/",
      selector: "[data-home-latest] [data-article-card]",
      emptySelector: "[data-home-latest-empty]",
    },
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
        await captureProductionBaseline(
          page,
          surface.path,
          `.e2e-artifacts/article-ux-1/${surface.id}-before-production-${viewport.label}.png`,
        );
      }

      await page.goto(surface.path);
      const cards = page.locator(surface.selector);
      const cardCount = await cards.count();

      if (cardCount === 0 && surface.emptySelector) {
        await expect(page.locator(surface.emptySelector)).toBeVisible();
        expect(
          await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)),
          `${surface.id} ${viewport.label}: empty state horizontal overflow`,
        ).toBeLessThanOrEqual(1);
        await expect(page.locator("main#obsah")).not.toContainText(/\b\d+\s*min\s+čítania\b/i);

        if (viewport.width === 390 || viewport.width === 1440) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({
            path: `.e2e-artifacts/article-ux-1/${surface.id}-after-local-${viewport.label}.png`,
          });
          await expectNoSeriousAccessibilityViolations(page);
        }
        continue;
      }

      expect(cardCount, `${surface.id} should expose article cards or its canonical empty state`).toBeGreaterThan(0);
      await expect(cards.first()).toBeVisible();

      const metrics = await page.evaluate((selector) => {
        const card = document.querySelector<HTMLElement>(selector);
        const media = card?.querySelector<HTMLElement>(".article-card-media");
        const title = card?.querySelector<HTMLElement>(".article-card-title");
        const mediaRect = media?.getBoundingClientRect();
        return {
          overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
          cardWidth: card?.getBoundingClientRect().width ?? 0,
          mediaRatio: mediaRect && mediaRect.height ? mediaRect.width / mediaRect.height : 0,
          titleClipping: title ? title.scrollHeight - title.clientHeight : 0,
        };
      }, surface.selector);

      expect(metrics.overflow, `${surface.id} ${viewport.label}: horizontal overflow`).toBeLessThanOrEqual(1);
      expect(metrics.cardWidth).toBeGreaterThan(0);
      expect(metrics.mediaRatio).toBeGreaterThan(1.45);
      expect(metrics.titleClipping, `${surface.id} ${viewport.label}: article title must not be line-clamped`).toBeLessThanOrEqual(1);
      await expect(page.locator("main#obsah")).not.toContainText(/\b\d+\s*min\s+čítania\b/i);

      const primaryLink = cards.first().locator(".article-card-title a");
      await primaryLink.focus();
      await expect(primaryLink).toBeFocused();

      if (viewport.width === 390 || viewport.width === 1440) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: `.e2e-artifacts/article-ux-1/${surface.id}-after-local-${viewport.label}.png`,
        });
        await expectNoSeriousAccessibilityViolations(page);
      }
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/clanky");

  const longTitle = page.getByRole("heading", {
    level: 2,
    name: "Bikejoring so psom: kompletný sprievodca od prvého tréningu až po preteky na Slovensku",
  });
  if (await longTitle.count()) {
    const clipping = await longTitle.evaluate((node) => node.scrollHeight - node.clientHeight);
    expect(clipping, "Long Slovak titles must remain fully readable").toBeLessThanOrEqual(1);
  }

  const noImageCard = page.locator("[data-article-card]").filter({ hasText: "E2E článok bez hero obrázka" });
  if (await noImageCard.count()) {
    await expect(noImageCard.locator(".article-placeholder")).toBeVisible();
    const mediaRatio = await noImageCard.locator(".article-card-media").evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width / rect.height;
    });
    expect(mediaRatio).toBeGreaterThan(1.45);
  }

  const magazineSearch = page.getByPlaceholder("Hľadať v magazíne");
  await magazineSearch.fill("article-cards-empty-state-no-match");
  await expect(page.getByRole("heading", { name: "Na túto stopu sme ešte nenarazili" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
