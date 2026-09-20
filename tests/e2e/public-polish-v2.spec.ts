import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const CONSENT_KEY = "psipedia-cookie-consent";

async function gotoPublic(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response, `No response for ${path}`).not.toBeNull();
  expect(response?.status(), `${path} returned HTTP ${response?.status()}`).toBeLessThan(400);
  await expect(page.locator("main#obsah")).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document, `${label}: document overflow`).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body, `${label}: body overflow`).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function expectAxeSeriousCriticalClean(page: Page, label: string) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.filter(
    (item) => item.impact === "critical" || item.impact === "serious",
  );
  expect(violations, `${label}: serious/critical Axe violations\n${JSON.stringify(violations, null, 2)}`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(([key]) => localStorage.setItem(key, "necessary"), [CONSENT_KEY]);
});

test("homepage section CTAs follow their content and photo surfaces stay square", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoPublic(page, "/");

  for (const key of ["latest", "steniatka", "veterinari", "starostlivost", "aktivity", "pomoc"]) {
    const section = key === "latest"
      ? page.locator("[data-home-latest]")
      : key === "veterinari"
        ? page.locator("[data-home-veterinarians]")
        : key === "pomoc"
          ? page.locator("[data-home-help]")
          : page.locator(`[data-home-editorial="${key}"]`);
    const cta = section.locator(`[data-home-section-cta="${key}"]`);
    await expect(cta).toBeVisible();
    expect(await section.evaluate((node, ctaKey) => {
      const ctaNode = node.querySelector(`[data-home-section-cta="${ctaKey}"]`);
      const candidates = Array.from(node.children).filter((child) => child !== ctaNode);
      const content = candidates.at(-1);
      return Boolean(content && ctaNode && (content.compareDocumentPosition(ctaNode) & Node.DOCUMENT_POSITION_FOLLOWING));
    }, key)).toBe(true);
  }

  const hero = page.locator("[data-home-hero] .hero-card");
  await expect(hero.locator("img.hero-image")).toBeVisible();
  expect(await hero.evaluate((node) => getComputedStyle(node).borderRadius)).toBe("0px");
  expect(await hero.locator("img.hero-image").evaluate((node) => getComputedStyle(node).borderRadius)).toBe("0px");
  await page.screenshot({ path: ".e2e-artifacts/public-polish-v2/home-1440.png", fullPage: true });
});

test("desktop header is balanced and overflow-free at required widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Explicit desktop viewport matrix runs once.");

  for (const width of [1280, 1366, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await gotoPublic(page, "/");
    await expectNoHorizontalOverflow(page, `header ${width}`);

    const geometry = await page.locator(".header-inner").evaluate((header) => {
      const brand = header.querySelector("[data-header-brand]")?.getBoundingClientRect();
      const nav = header.querySelector(".desktop-nav")?.getBoundingClientRect();
      const actions = header.querySelector(".header-actions")?.getBoundingClientRect();
      return brand && nav && actions ? {
        brandRight: brand.right,
        navLeft: nav.left,
        navRight: nav.right,
        actionsLeft: actions.left,
        headerRight: header.getBoundingClientRect().right,
      } : null;
    });
    expect(geometry, `header geometry missing at ${width}`).not.toBeNull();
    expect(geometry!.navLeft).toBeGreaterThanOrEqual(geometry!.brandRight - 1);
    expect(geometry!.navLeft - geometry!.brandRight, `navigation detached from brand at ${width}`).toBeLessThanOrEqual(24);
    expect(geometry!.navRight).toBeLessThanOrEqual(geometry!.actionsLeft + 1);
    expect(geometry!.actionsLeft).toBeLessThanOrEqual(geometry!.headerRight);
    await page.locator(".site-header").screenshot({ path: `.e2e-artifacts/public-polish-v2/header-${width}.png` });
  }
});

test("representative public routes fit 390px, preserve images, and are Axe-clean", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Exact 390px matrix runs once.");
  await page.setViewportSize({ width: 390, height: 844 });

  const routes = [
    { path: "/", label: "home" },
    { path: "/clanky", label: "articles" },
    { path: "/podujatia", label: "events" },
    { path: "/pomoc-psom", label: "help" },
    { path: "/adresar", label: "directory" },
  ];
  for (const route of routes) {
    await gotoPublic(page, route.path);
    await expectNoHorizontalOverflow(page, `${route.path} at 390px`);
    await expectAxeSeriousCriticalClean(page, `${route.path} at 390px`);
    await page.screenshot({ path: `.e2e-artifacts/public-polish-v2/${route.label}-390.png`, fullPage: true });
  }

  await gotoPublic(page, "/clanky");
  const firstArticle = page.locator("[data-article-list-item]").first();
  if (await firstArticle.count()) {
    const href = await firstArticle.getAttribute("href");
    expect(href).toBeTruthy();
    if (await firstArticle.locator("[data-article-image] img").count()) {
      expect(await firstArticle.locator("[data-article-image]").evaluate((node) => getComputedStyle(node).borderRadius)).toBe("0px");
    }
    await gotoPublic(page, href!);
    const heroImage = page.locator(".article-hero-image");
    if (await heroImage.count()) {
      expect(await heroImage.evaluate((node) => getComputedStyle(node).borderRadius)).toBe("0px");
      expect(await heroImage.locator("xpath=..").evaluate((node) => getComputedStyle(node).borderRadius)).toBe("0px");
    }
    await expectNoHorizontalOverflow(page, `${href} at 390px`);
    await expectAxeSeriousCriticalClean(page, `${href} at 390px`);
  }

  await gotoPublic(page, "/podujatia");
  const imageEvent = page.locator('[data-event-card][data-event-has-image="true"]').first();
  if (await imageEvent.count()) {
    await expect(imageEvent.locator("img")).toBeVisible();
    expect(await imageEvent.locator("img").evaluate((node) => getComputedStyle(node).borderRadius)).toBe("0px");
    expect(await imageEvent.locator("img").locator("xpath=..").evaluate((node) => getComputedStyle(node).borderRadius)).toBe("0px");
  }
});
