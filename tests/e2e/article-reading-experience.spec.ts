import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const cases = [
  {
    id: "bikejoring",
    path: "/aktivity/bikejoring-so-psom-kompletny-sprievodca-od-prveho-treningu-az-po-preteky-na-slovensku",
    title: "Bikejoring so psom: kompletný sprievodca od prvého tréningu až po preteky na Slovensku",
    toc: true,
    updated: false,
  },
  {
    id: "stimulus-control",
    path: "/aktivity/stimulus-control-u-psa",
    title: "Stimulus control: kedy pes povel naozaj ovláda",
    toc: false,
    updated: false,
  },
  {
    id: "granule",
    path: "/starostlivost/ako-vybrat-granule-bez-marketingovych-mytov",
    title: "Ako vybrať granule bez marketingových mýtov",
    toc: false,
    updated: true,
  },
] as const;

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .include("main#obsah")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

async function captureProductionBaseline(page: Page, path: string, output: string) {
  if (process.env.ARTICLE_UX_CAPTURE_PRODUCTION !== "1") return;
  await page.goto(`https://psipedia.sk${path}`, { waitUntil: "domcontentloaded" });
  await page.screenshot({ path: output });
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
    await expect(page.locator(".article-hero-image")).toBeVisible();
    await expect(page.locator(".article-intro")).toBeVisible();
    await expect(page.getByText("To najdôležitejšie", { exact: true })).toBeVisible();
    await expect(page.locator(".article-aside")).toHaveCount(0);

    const metrics = await page.evaluate(() => {
      const h1 = document.querySelector<HTMLElement>("h1")!;
      const image = document.querySelector<HTMLElement>(".article-hero-image")!;
      const prose = document.querySelector<HTMLElement>(".article-prose")!;
      const intro = document.querySelector<HTMLElement>(".article-intro")!;
      const takeaway = document.querySelector<HTMLElement>(".takeaway-box")!;
      const imageRect = image.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        h1Size: Number.parseFloat(getComputedStyle(h1).fontSize),
        imageRatio: imageRect.width / imageRect.height,
        proseWidth: prose.getBoundingClientRect().width,
        proseSize: Number.parseFloat(getComputedStyle(prose).fontSize),
        proseLineHeight: Number.parseFloat(getComputedStyle(prose).lineHeight),
        introTop: intro.getBoundingClientRect().top,
        introBottom: intro.getBoundingClientRect().bottom,
        takeawayTop: takeaway.getBoundingClientRect().top,
      };
    });

    expect(metrics.overflow).toBeLessThanOrEqual(1);
    expect(metrics.h1Size).toBeGreaterThanOrEqual(34);
    expect(metrics.h1Size).toBeLessThanOrEqual(39);
    expect(metrics.imageRatio).toBeGreaterThan(1.56);
    expect(metrics.imageRatio).toBeLessThan(1.64);
    expect(metrics.proseWidth).toBeLessThanOrEqual(390 - 32 + 1);
    expect(metrics.proseSize).toBeGreaterThanOrEqual(16.9);
    expect(metrics.proseSize).toBeLessThanOrEqual(17.1);
    expect(metrics.proseLineHeight / metrics.proseSize).toBeGreaterThanOrEqual(1.69);
    expect(metrics.proseLineHeight / metrics.proseSize).toBeLessThanOrEqual(1.75);
    expect(metrics.introTop).toBeLessThan(metrics.takeawayTop);

    if (articleCase.id === "bikejoring") {
      expect(metrics.introTop, "Bikejoring prose must start inside the first 390x844 viewport").toBeLessThan(844);
    }

    const toc = page.locator("details").filter({ has: page.getByText("Obsah článku", { exact: true }) });
    if (articleCase.toc) {
      await expect(toc).toHaveCount(1);
      await expect(toc).not.toHaveAttribute("open");
      const summary = toc.locator("summary");
      await summary.focus();
      await expect(summary).toBeFocused();
      await summary.press("Enter");
      await expect(toc).toHaveAttribute("open", "");
      await expect(toc.locator("a[href^='#']").first()).toBeVisible();
    } else {
      await expect(toc).toHaveCount(0);
    }

    if (articleCase.updated) {
      await expect(page.getByText(/Aktualizované/)).toBeVisible();
    }

    await expectSemanticArticleHeadings(page);
    if (articleCase.id === "bikejoring") await expectNoSeriousAccessibilityViolations(page);
    await page.screenshot({ path: `.e2e-artifacts/article-ux-1/${articleCase.id}-after-local-mobile-390x844.png` });
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
    await expect(page.locator(".article-hero-image")).toBeVisible();
    await expect(page.locator(".article-prose")).toBeVisible();
    await expect(page.locator(".article-aside")).toHaveCount(0);

    const metrics = await page.evaluate(() => {
      const heading = document.querySelector<HTMLElement>("h1")!;
      const image = document.querySelector<HTMLElement>(".article-hero-image")!;
      const prose = document.querySelector<HTMLElement>(".article-prose")!;
      const imageRect = image.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        h1Size: Number.parseFloat(getComputedStyle(heading).fontSize),
        imageHeight: imageRect.height,
        imageRatio: imageRect.width / imageRect.height,
        proseWidth: prose.getBoundingClientRect().width,
        proseSize: Number.parseFloat(getComputedStyle(prose).fontSize),
        proseLineHeight: Number.parseFloat(getComputedStyle(prose).lineHeight),
      };
    });

    expect(metrics.overflow).toBeLessThanOrEqual(1);
    expect(metrics.h1Size).toBeLessThanOrEqual(58);
    expect(metrics.imageHeight).toBeLessThanOrEqual(420.5);
    expect(metrics.imageRatio).toBeGreaterThan(1.56);
    expect(metrics.imageRatio).toBeLessThan(1.64);
    expect(metrics.proseWidth).toBeGreaterThanOrEqual(680);
    expect(metrics.proseWidth).toBeLessThanOrEqual(701);
    expect(metrics.proseSize).toBeGreaterThanOrEqual(17.9);
    expect(metrics.proseSize).toBeLessThanOrEqual(18.1);
    expect(metrics.proseLineHeight / metrics.proseSize).toBeGreaterThanOrEqual(1.7);
    expect(metrics.proseLineHeight / metrics.proseSize).toBeLessThanOrEqual(1.75);

    const toc = page.locator("details").filter({ has: page.getByText("Obsah článku", { exact: true }) });
    await expect(toc).toHaveCount(articleCase.toc ? 1 : 0);
    await expectSemanticArticleHeadings(page);

    const sources = page.locator(".article-block-sources");
    if (await sources.count()) {
      const sourceBottom = await sources.last().evaluate((node) => node.getBoundingClientRect().bottom + window.scrollY);
      const relatedTop = await page.locator(".related-section").evaluate((node) => node.getBoundingClientRect().top + window.scrollY);
      expect(sourceBottom).toBeLessThan(relatedTop);
    }

    if (articleCase.id === "bikejoring") await expectNoSeriousAccessibilityViolations(page);
    await page.screenshot({ path: `.e2e-artifacts/article-ux-1/${articleCase.id}-after-local-desktop-1440x900.png` });
  });
}
