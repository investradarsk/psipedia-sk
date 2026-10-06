import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const routes = [
  { area: "breed", path: "/plemena/biely-svajciarsky-ovciak" },
  { area: "breeder breed", path: "/adresar/chovatelske-stanice/plemeno/biely-svajciarsky-ovciak" },
  { area: "breeder region", path: "/adresar/chovatelske-stanice/kraj/nitriansky" },
  { area: "breeder breed+region", path: "/adresar/chovatelske-stanice/plemeno/biely-svajciarsky-ovciak/kraj/nitriansky" },
  { area: "directory region", path: "/adresar/treneri/kraj/nitriansky" },
  { area: "directory district", path: "/adresar/treneri/okres/nitra" },
  { area: "directory city", path: "/adresar/treneri/mesto/nitra" },
  { area: "directory profile", path: "/adresar/treneri/e2e-services-detail-long" },
  { area: "event", path: "/podujatia/e2e-admin-event-2" },
  { area: "organization", path: "/organizacie/org-3b-e2e-kanonicka-organizacia" },
  { area: "adoption", path: "/pomoc-psom/adopcia/e2e-adoption-rex-active" },
  { area: "lost dog", path: "/pomoc-psom/stratene-psy/strateny-e2e-rex-nitra" },
  { area: "found dog", path: "/pomoc-psom/najdene-psy/najdeny-e2e-pes-nitra" },
  { area: "help", path: "/pomoc-psom/docasna-opatera/e2e-docasna-opatera" },
  { area: "article", path: "/clanky/e2e-discovery-article" },
] as const;

async function assertNoOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
}

async function assertA11y(page: Page, area: string) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = result.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
  expect(serious, `${area}: ${JSON.stringify(serious, null, 2)}`).toEqual([]);
}

for (const route of routes) {
  test(`${route.area}: canonical SSR route stays indexable, structured and accessible`, async ({ page }, testInfo) => {
    await page.setViewportSize(
      testInfo.project.name.includes("mobile") ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    );
    const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });
    expect(response?.status(), route.path).toBe(200);
    await expect(page.locator("h1").first(), route.path).toBeVisible();

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical, route.path).toHaveAttribute("href", `https://psipedia.sk${route.path}`);

    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots ?? "", route.path).not.toMatch(/noindex/i);

    const schemas = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(schemas.length, `${route.path}: missing JSON-LD`).toBeGreaterThan(0);
    for (const schema of schemas) expect(() => JSON.parse(schema), route.path).not.toThrow();

    const discovery = page.locator("[data-internal-discovery]");
    if (await discovery.count()) {
      await expect(discovery.locator('a[href*="?"]'), route.path).toHaveCount(0);
    }

    await assertNoOverflow(page);
    await assertA11y(page, route.area);
  });
}

test("legacy directory alias redirects directly to canonical category", async ({ request }) => {
  const response = await request.get("/adresar/psie-skoly", { maxRedirects: 0 });
  expect([301, 308]).toContain(response.status());
  expect(response.headers().location).toBe("/adresar/treneri");
});
