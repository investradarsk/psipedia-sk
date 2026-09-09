import { expect, test } from "@playwright/test";

const CONSENT_KEY = "psipedia-cookie-consent";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(([key]) => localStorage.setItem(key, "necessary"), [CONSENT_KEY]);
});

test("Phase 5 reviews hub exposes all managed category tabs and direct review content", async ({ page }) => {
  await page.goto("/recenzie");

  await expect(page.getByRole("heading", { level: 1, name: "Recenzie a testy" })).toBeVisible();
  const tabs = page.locator(".portal-section-tabs");
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Prehľad" })).toHaveAttribute("aria-current", "page");

  const categoryLinks = tabs.locator('a[href^="/recenzie/"]');
  await expect(categoryLinks).toHaveCount(8);
  const hrefs = await categoryLinks.evaluateAll((links) => links.map((link) => link.getAttribute("href")).filter((href): href is string => Boolean(href)));
  expect(new Set(hrefs).size).toBe(8);

  await expect(page.locator(".portal-hub-content")).toBeVisible();
  await expect(page.locator(".portal-directory")).toHaveCount(0);

  const reviewCards = page.locator(".portal-hub-content .article-card");
  for (let index = 0; index < await reviewCards.count(); index += 1) {
    await expect(reviewCards.nth(index).locator(".article-card-meta .eyebrow")).toHaveAttribute("href", /^\/recenzie(?:\/|$)/);
    await expect(reviewCards.nth(index).getByRole("link", { name: /Čítať recenziu/ })).toHaveAttribute("href", /^\/recenzie\//);
  }

  const metrics = await tabs.locator(".section-tabs-inner").evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(metrics.scrollWidth).toBeGreaterThanOrEqual(metrics.clientWidth);
});

test("Phase 5 all eight review categories are direct filtered canonical listings", async ({ page }) => {
  await page.goto("/recenzie");
  const categoryLinks = page.locator('.portal-section-tabs a[href^="/recenzie/"]');
  const hrefs = await categoryLinks.evaluateAll((links) => links.map((link) => link.getAttribute("href")).filter((href): href is string => Boolean(href)));
  expect(hrefs).toHaveLength(8);

  for (const href of hrefs) {
    await page.goto(href);
    await expect(page.locator(`.portal-section-tabs a[aria-current='page'][href='${href}']`)).toBeVisible();
    await expect(page.getByText("Recenzie v kategórii", { exact: true })).toBeVisible();

    const cards = page.locator(".article-grid .article-card");
    for (let index = 0; index < await cards.count(); index += 1) {
      await expect(cards.nth(index).locator(".article-card-meta .eyebrow")).toHaveAttribute("href", href);
      await expect(cards.nth(index).getByRole("link", { name: /Čítať recenziu/ })).toHaveAttribute("href", /^\/recenzie\//);
    }

    const hasGuide = await page.locator(".review-topic-guide").count();
    if (!hasGuide && await cards.count() === 0) {
      const robots = page.locator('meta[name="robots"]');
      await expect(robots).toHaveAttribute("content", /noindex/i);
      await expect(robots).toHaveAttribute("content", /follow/i);
    }
  }
});

test("Phase 5 review detail breadcrumb points to its managed product category when a review exists", async ({ page }) => {
  await page.goto("/recenzie");
  const reviewLink = page.locator('.portal-hub-content .article-card h3 a[href^="/recenzie/"]').first();
  const href = await reviewLink.getAttribute("href");
  test.skip(!href, "The local data source has no published review detail to inspect.");

  await page.goto(href!);
  const breadcrumbs = page.locator(".article-hero .page-breadcrumbs");
  const categoryLink = breadcrumbs.locator('a[href^="/recenzie/"]').last();
  await expect(categoryLink).toBeVisible();
  await expect(categoryLink).not.toHaveAttribute("href", /^\/tema\//);

  const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(jsonLd).toContain('"BreadcrumbList"');
  expect(jsonLd).toContain(await categoryLink.getAttribute("href") ?? "__missing_category__");
});
