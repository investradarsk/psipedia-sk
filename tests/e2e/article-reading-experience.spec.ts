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
    await expect(page.getByRole("navigation", { name: "Navigácia v článku" })).toBeVisible();
    await expect(page.locator(".article-hero-image")).toBeVisible();
    await expect(page.locator(".article-intro")).toBeVisible();
    await expect(page.getByText("To najdôležitejšie", { exact: true })).toBeVisible();
    await expect(page.locator(".article-aside")).toHaveCount(0);

    const metrics = await page.evaluate(() => {
      const h1 = document.querySelector<HTMLElement>("h1")!;
      const excerpt = document.querySelector<HTMLElement>("main#obsah header h1 + p")!;
      const image = document.querySelector<HTMLElement>(".article-hero-image")!;
      const prose = document.querySelector<HTMLElement>(".article-prose")!;
      const intro = document.querySelector<HTMLElement>(".article-intro")!;
      const takeaway = document.querySelector<HTMLElement>(".takeaway-box")!;
      const imageRect = image.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        h1Size: Number.parseFloat(getComputedStyle(h1).fontSize),
        excerptClipping: excerpt.scrollHeight - excerpt.clientHeight,
        imageRatio: imageRect.width / imageRect.height,
        proseWidth: prose.getBoundingClientRect().width,
        proseSize: Number.parseFloat(getComputedStyle(prose).fontSize),
        proseLineHeight: Number.parseFloat(getComputedStyle(prose).lineHeight),
        introTop: intro.getBoundingClientRect().top,
        introBottom: intro.getBoundingClientRect().bottom,
        takeawayTop: takeaway.getBoundingClientRect().top,
      };
    });

    console.log(`[article-ux] ${articleCase.id} mobile metrics ${JSON.stringify(metrics)}`);
    await page.screenshot({ path: `.e2e-artifacts/article-ux-1/${articleCase.id}-after-local-mobile-390x844.png` });

    expect(metrics.overflow).toBeLessThanOrEqual(1);
    expect(metrics.h1Size).toBeGreaterThanOrEqual(30);
    expect(metrics.h1Size).toBeLessThanOrEqual(35);
    expect(metrics.excerptClipping, "The mobile perex must be fully visible").toBeLessThanOrEqual(1);
    expect(metrics.imageRatio).toBeGreaterThan(1.74);
    expect(metrics.imageRatio).toBeLessThan(1.81);
    expect(metrics.proseWidth).toBeLessThanOrEqual(390 - 32 + 1);
    expect(metrics.proseSize).toBeGreaterThanOrEqual(15.9);
    expect(metrics.proseSize).toBeLessThanOrEqual(16.1);
    expect(metrics.proseLineHeight / metrics.proseSize).toBeGreaterThanOrEqual(1.62);
    expect(metrics.proseLineHeight / metrics.proseSize).toBeLessThanOrEqual(1.69);
    expect(metrics.introTop).toBeLessThan(metrics.takeawayTop);

    if (articleCase.id === "bikejoring") {
      expect(
        metrics.introTop,
        "Bikejoring prose must be visible or directly adjacent to the first 390x844 viewport",
      ).toBeLessThanOrEqual(944);
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
    expect(metrics.h1Size).toBeLessThanOrEqual(49);
    expect(metrics.imageHeight).toBeLessThanOrEqual(301);
    expect(metrics.imageRatio).toBeGreaterThan(1.56);
    expect(metrics.imageRatio).toBeLessThan(1.64);
    expect(metrics.proseWidth).toBeGreaterThanOrEqual(660);
    expect(metrics.proseWidth).toBeLessThanOrEqual(681);
    expect(metrics.proseSize).toBeGreaterThanOrEqual(15.9);
    expect(metrics.proseSize).toBeLessThanOrEqual(16.1);
    expect(metrics.proseLineHeight / metrics.proseSize).toBeGreaterThanOrEqual(1.65);
    expect(metrics.proseLineHeight / metrics.proseSize).toBeLessThanOrEqual(1.71);

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


test("ARTICLE-PUBLIC canonical rich text, author, safe video and share actions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/aktivity/bikejoring-so-psom-kompletny-sprievodca-od-prveho-treningu-az-po-preteky-na-slovensku");

  await expect(page.getByText("Redakcia Psipedia", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".article-prose strong").filter({ hasText: "Bikejoring je tímový šport" })).toBeVisible();
  await expect(page.locator(".article-prose em").filter({ hasText: "Bezpečný začiatok je dôležitejší než rýchlosť." })).toBeVisible();

  const safeVideo = page.locator('iframe[src^="https://www.youtube-nocookie.com/embed/"]');
  await expect(safeVideo).toHaveCount(1);
  await expect(safeVideo).toHaveAttribute("allowfullscreen", "");

  const sharing = page.getByRole("group", { name: "Zdieľať článok" });
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

test("ARTICLE-PUBLIC Novinky exposes complete archive and category filters", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/novinky");

  const archive = page.getByRole("list", { name: "Všetky novinky" });
  await expect(archive.getByText("E2E výskum psov 2026")).toBeVisible();
  await expect(archive.getByText("E2E zaujímavosť zo sveta psov")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Filtrovať novinky podľa kategórie" }).getByRole("link", { name: "Všetky" })).toHaveAttribute("aria-current", "page");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

  await page.getByRole("link", { name: "Veda", exact: true }).click();
  await expect(page).toHaveURL(/\/novinky\/veda-a-zdravie$/);
  await expect(page.getByRole("list", { name: "Novinky: Veda a zdravie" }).getByText("E2E výskum psov 2026")).toBeVisible();
  await expect(page.getByText("E2E zaujímavosť zo sveta psov")).toHaveCount(0);
  await expectNoSeriousAccessibilityViolations(page);
});

test("ARTICLE-PUBLIC unknown article remains a real 404", async ({ page }) => {
  const response = await page.goto("/clanky/article-public-neexistuje");
  expect(response?.status()).toBe(404);
});
