import { expect, test, type Locator, type Page } from "@playwright/test";

const MAP_API = "/api/map?north=50&south=47&east=23&west=16&zoom=12&limit=100";

type LiveMapBody = {
  mode: "items" | "clusters";
  items?: Array<{ id: string; name: string; category: string }>;
  clusters?: Array<{ id: string; count: number; singletonItem?: { id: string; name: string; category: string } }>;
  meta?: { count?: number; matched?: number; attribution?: Array<{ label: string; url: string }> };
};

async function swipe(locator: Locator, deltaY: number) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + Math.min(box!.width / 2, 120);
  const y = box!.y + Math.min(24, Math.max(8, box!.height / 2));
  await locator.page().mouse.move(x, y);
  await locator.page().mouse.down();
  await locator.page().mouse.move(x, y + deltaY, { steps: 10 });
  await locator.page().mouse.up();
  await locator.page().waitForTimeout(320);
}

async function dismissAnalyticsBanner(page: Page) {
  const decline = page.getByRole("button", { name: "Odmietnuť analytiku" });
  if (await decline.isVisible().catch(() => false)) {
    await decline.click();
    await expect(decline).toHaveCount(0);
  }
}

async function mapCanvas(page: Page) {
  return page.getByTestId("google-map-renderer").locator('[aria-label="Interaktívna mapa Psipedie"]');
}

async function clickRenderedMarker(page: Page, selector: string) {
  const marker = page.locator(selector).filter({ visible: true }).first();
  await expect(marker).toBeVisible({ timeout: 15000 });
  const box = await marker.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

async function expectNoHorizontalOverflow(page: Page) {
  const m = await page.evaluate(() => ({
    viewport: window.innerWidth,
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(m.doc, JSON.stringify(m)).toBeLessThanOrEqual(m.viewport + 1);
  expect(m.body, JSON.stringify(m)).toBeLessThanOrEqual(m.viewport + 1);
}

function isRelevantConsoleError(text: string) {
  return /Google Maps JavaScript API error|InvalidKeyMapError|ApiNotActivatedMapError|RefererNotAllowedMapError|BillingNotEnabledMapError|content security policy|refused to (load|connect|execute)|maps\.googleapis\.com.*(403|denied|error)/i.test(text);
}

test.describe("MAP V1 live production launch audit", () => {
  test.beforeEach(async ({ page, isMobile }) => {
    if (isMobile) await page.setViewportSize({ width: 390, height: 844 });
  });

  test("@map-production-live API, consent, real Google renderer, attribution, singleton and revoke", async ({ page, request }) => {
    const api = await request.get(MAP_API);
    expect(api.status()).toBe(200);
    const apiBody = await api.json() as LiveMapBody;
    expect(["items", "clusters"]).toContain(apiBody.mode);
    expect(Number(apiBody.meta?.matched ?? 0)).toBeGreaterThan(0);

    const serialized = JSON.stringify(apiBody);
    for (const forbidden of [
      "source_fingerprint",
      "resolved_source_fingerprint",
      "normalized_query",
      "query_fingerprint",
      "last_error_code",
      "manual_updated_by",
    ]) expect(serialized).not.toContain(forbidden);

    const attributionLabels = (apiBody.meta?.attribution ?? []).map((x) => x.label);
    expect(attributionLabels).toContain("Powered by Geoapify");
    expect(attributionLabels).toContain("© OpenStreetMap contributors");

    const itemResponse = apiBody.mode === "items"
      ? apiBody.items ?? []
      : (apiBody.clusters ?? []).flatMap((c) => c.singletonItem ? [c.singletonItem] : []);
    expect(itemResponse.length).toBeGreaterThan(0);
    const singletonTarget = itemResponse[0];

    const googleJsRequests: string[] = [];
    const relevantConsoleErrors: string[] = [];
    page.on("request", (req) => {
      if (/maps\.googleapis\.com\/maps\/api\/js/i.test(req.url())) googleJsRequests.push(req.url());
    });
    page.on("console", (msg) => {
      if (msg.type() === "error" && isRelevantConsoleError(msg.text())) relevantConsoleErrors.push(msg.text());
    });

    await page.addInitScript(() => localStorage.removeItem("psipedia-google-maps-consent"));
    await page.goto("/mapa", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsBanner(page);
    await expect(page.getByRole("heading", { level: 1, name: "Mapa Psipedie" })).toBeVisible();
    await expect(page.getByTestId("map-consent-gate")).toBeVisible();
    await expect(page.getByTestId("map-provider-disclosure")).toBeVisible();
    await expect(page.locator("script[data-psipedia-google-maps]")).toHaveCount(0);
    expect(googleJsRequests).toHaveLength(0);

    const attribution = page.getByLabel("Zdroj lokalizačných údajov");
    await expect(attribution).toContainText("Powered by Geoapify");
    await expect(attribution).toContainText("© OpenStreetMap contributors");

    await page.getByTestId("map-consent-gate").getByRole("button", { name: "Povoliť Google Maps" }).click();
    await expect(page.getByTestId("map-renderer-status")).toHaveText(/Mapa pripravená/, { timeout: 30000 });
    await expect(page.locator("script[data-psipedia-google-maps]")).toHaveCount(1);
    await expect(await mapCanvas(page)).toBeVisible();
    await expect(page.getByTestId("map-provider-disclosure")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (window as Window & { __PSIPEDIA_MAP_INIT_COUNT__?: number }).__PSIPEDIA_MAP_INIT_COUNT__)).toBe(1);
    expect(googleJsRequests.length).toBeGreaterThanOrEqual(1);

    await expect.poll(() => page.locator("gmp-advanced-marker").count(), { timeout: 20000 }).toBeGreaterThan(0);

    // Exact-name search should collapse the live dataset to a singleton result.
    await page.getByLabel("Vyhľadávanie v mape").fill(singletonTarget.name);
    await expect(page.getByText(singletonTarget.name, { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("map-cluster-summary")).toHaveCount(0);
    const requestsBeforeSingletonClick = await page.locator("body").evaluate(() => performance.getEntriesByType("resource").filter((entry) => entry.name.includes("/api/map?")).length);
    await clickRenderedMarker(page, "[data-map-marker]");
    await expect(page.locator('[data-selected="true"]')).toContainText(singletonTarget.name);
    await page.waitForTimeout(500);
    const requestsAfterSingletonClick = await page.locator("body").evaluate(() => performance.getEntriesByType("resource").filter((entry) => entry.name.includes("/api/map?")).length);
    expect(requestsAfterSingletonClick).toBe(requestsBeforeSingletonClick);
    expect(new URL(page.url()).pathname).toBe("/mapa");

    // Filter/search must not recreate the Google map.
    await page.getByRole("button", { name: "Podujatia", exact: true }).click();
    await page.getByLabel("Vyhľadávanie v mape").fill("");
    await page.waitForTimeout(800);
    await expect.poll(() => page.evaluate(() => (window as Window & { __PSIPEDIA_MAP_INIT_COUNT__?: number }).__PSIPEDIA_MAP_INIT_COUNT__)).toBe(1);

    expect(relevantConsoleErrors, relevantConsoleErrors.join("\n")).toEqual([]);

    // Canonical revoke path.
    const googleCountBeforeRevoke = googleJsRequests.length;
    await page.goto("/cookies", { waitUntil: "domcontentloaded" });
    const controls = page.locator(".privacy-controls").filter({ hasText: "Google Maps:" });
    await expect(controls.locator("strong")).toHaveText("povolené");
    await controls.getByRole("button", { name: "Vypnúť Google Maps" }).click();
    await page.waitForLoadState("domcontentloaded");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("psipedia-google-maps-consent"))).toBeNull();

    await page.goto("/mapa", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("map-consent-gate")).toBeVisible();
    await expect(page.locator("script[data-psipedia-google-maps]")).toHaveCount(0);
    await page.waitForTimeout(800);
    expect(googleJsRequests.length).toBe(googleCountBeforeRevoke);
    expect(relevantConsoleErrors, relevantConsoleErrors.join("\n")).toEqual([]);
    await expectNoHorizontalOverflow(page);
  });

  test("@map-production-live real cluster zoom and one-map lifecycle", async ({ page, request }) => {
    const clustersResponse = await request.get("/api/map?north=50&south=47&east=23&west=16&zoom=7&limit=100");
    expect(clustersResponse.status()).toBe(200);
    const clustersBody = await clustersResponse.json() as LiveMapBody;
    expect(clustersBody.mode).toBe("clusters");
    expect((clustersBody.clusters ?? []).some((c) => c.count >= 2)).toBe(true);

    await page.addInitScript(() => localStorage.setItem("psipedia-google-maps-consent", "granted"));
    await page.goto("/mapa", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsBanner(page);
    await expect(page.getByTestId("map-renderer-status")).toHaveText(/Mapa pripravená/, { timeout: 30000 });
    await expect.poll(() => page.evaluate(() => (window as Window & { __PSIPEDIA_MAP_INIT_COUNT__?: number }).__PSIPEDIA_MAP_INIT_COUNT__)).toBe(1);

    const beforeUrl = page.url();
    const beforeApiCount = await page.locator("body").evaluate(() => performance.getEntriesByType("resource").filter((entry) => entry.name.includes("/api/map?")).length);
    await clickRenderedMarker(page, '[data-map-cluster="true"]');
    await expect.poll(async () => page.locator("body").evaluate(() => performance.getEntriesByType("resource").filter((entry) => entry.name.includes("/api/map?")).length), { timeout: 12000 }).toBeGreaterThan(beforeApiCount);
    expect(new URL(page.url()).pathname).toBe(new URL(beforeUrl).pathname);
    await expect.poll(() => page.evaluate(() => (window as Window & { __PSIPEDIA_MAP_INIT_COUNT__?: number }).__PSIPEDIA_MAP_INIT_COUNT__)).toBe(1);

    // A real drag on the Google canvas must pan the map rather than move the results sheet.
    const canvas = await mapCanvas(page);
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width * 0.65, box!.y + box!.height * 0.45);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width * 0.45, box!.y + box!.height * 0.45, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(900);
    await expect.poll(() => page.evaluate(() => (window as Window & { __PSIPEDIA_MAP_INIT_COUNT__?: number }).__PSIPEDIA_MAP_INIT_COUNT__)).toBe(1);
  });

  test("@map-production-live mobile 390x844 bottom sheet gestures and scrolling", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only production interaction audit");
    await page.addInitScript(() => localStorage.setItem("psipedia-google-maps-consent", "granted"));
    await page.goto("/mapa", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsBanner(page);
    await expect(page.getByTestId("map-renderer-status")).toHaveText(/Mapa pripravená/, { timeout: 30000 });

    const panel = page.getByTestId("map-results-panel");
    const header = page.getByTestId("map-sheet-header");
    const scroll = page.getByTestId("map-results-scroll");
    await expect(panel).toHaveAttribute("data-sheet-state", "peek");

    await swipe(header, -130);
    await expect(panel).toHaveAttribute("data-sheet-state", "expanded");
    await swipe(header, 130);
    await expect(panel).toHaveAttribute("data-sheet-state", "peek");

    await page.getByRole("button", { name: "Výsledky" }).click();
    await expect(panel).toHaveAttribute("data-sheet-state", "expanded");

    // Walk into a populated cluster if necessary until the list is actually scrollable.
    for (let i = 0; i < 4; i++) {
      const metrics = await scroll.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
      if (metrics.scrollHeight > metrics.clientHeight + 8) break;
      const clusters = page.locator('[data-map-cluster="true"]');
      if (await clusters.count() === 0) break;
      await clickRenderedMarker(page, '[data-map-cluster="true"]');
      await page.waitForTimeout(1000);
    }

    const metrics = await scroll.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    expect(metrics.scrollHeight, JSON.stringify(metrics)).toBeGreaterThan(metrics.clientHeight + 8);
    await scroll.hover();
    await page.mouse.wheel(0, 420);
    await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

    await scroll.evaluate((el) => { el.scrollTop = 0; });
    await swipe(scroll, 130);
    await expect(panel).toHaveAttribute("data-sheet-state", "peek");

    const canvas = await mapCanvas(page);
    await swipe(canvas, -100);
    await expect(panel).toHaveAttribute("data-sheet-state", "peek");

    await expectNoHorizontalOverflow(page);
    await expect.poll(() => page.evaluate(() => (window as Window & { __PSIPEDIA_MAP_INIT_COUNT__?: number }).__PSIPEDIA_MAP_INIT_COUNT__)).toBe(1);
  });
});
