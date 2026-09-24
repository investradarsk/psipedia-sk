import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

const serviceItem = {
  id: "service:1",
  entityType: "service",
  entityId: 1,
  name: "Veterina Alfa",
  category: "services",
  subcategory: "veterinari",
  href: "/adresar/veterinari/veterina-alfa",
  latitude: 48.306,
  longitude: 18.086,
  precision: "EXACT",
  displayLocation: "Verejná 1 · Nitra · Nitriansky kraj",
  city: "Nitra",
  district: "Nitra",
  region: "Nitriansky kraj",
  verified: true,
  featured: false,
};

const organizationItem = {
  id: "organization:2:location:20",
  entityType: "organization",
  entityId: 2,
  name: "Pomoc labkám",
  category: "organizations",
  subcategory: "RESCUE_ORGANIZATION",
  href: "/organizacie/pomoc-labkam",
  latitude: 48.377,
  longitude: 17.588,
  precision: "SERVICE_AREA",
  displayLocation: "Trnava · Trnavský kraj",
  city: "Trnava",
  district: "Trnava",
  region: "Trnavský kraj",
  locationRole: "SERVICE_AREA",
};

const eventItem = {
  id: "event:3",
  entityType: "event",
  entityId: 3,
  name: "Psia výstava Nitra",
  category: "events",
  subcategory: "Výstava",
  href: "/podujatia/psia-vystava-nitra",
  latitude: 48.31,
  longitude: 18.1,
  precision: "EXACT",
  displayLocation: "Nitra · Nitriansky kraj",
  city: "Nitra",
  region: "Nitriansky kraj",
  eventStart: "2030-10-01T09:00:00+02:00",
  eventEnd: "2030-10-01T16:00:00+02:00",
};

const allItems = [serviceItem, organizationItem, eventItem];

function responseMeta(url: URL, count: number, options: { matched?: number; truncated?: boolean } = {}) {
  return {
    count,
    matched: options.matched ?? count,
    truncated: options.truncated ?? false,
    bbox: {
      north: Number(url.searchParams.get("north") ?? 50),
      south: Number(url.searchParams.get("south") ?? 47),
      east: Number(url.searchParams.get("east") ?? 23),
      west: Number(url.searchParams.get("west") ?? 16),
    },
    zoom: Number(url.searchParams.get("zoom") ?? 7),
    cacheTtlSeconds: 30,
    attribution: [{ label: "Geoapify", url: "https://www.geoapify.com/" }],
  };
}

async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installMapApiMock(page: Page) {
  const requests: string[] = [];
  let unavailableAttempts = 0;

  await page.route("**/api/map?**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.toString());
    const search = (url.searchParams.get("search") ?? "").toLowerCase();
    const category = url.searchParams.get("category") ?? "";
    const zoom = Number(url.searchParams.get("zoom") ?? 7);

    if (search === "bad400") {
      await json(route, 400, { error: { code: "MAP_INVALID_QUERY", message: "Invalid query." } });
      return;
    }
    if (search === "slow429") {
      await json(route, 429, { error: { code: "MAP_RATE_LIMITED", message: "Too many map requests." } });
      return;
    }
    if (search === "network") {
      await route.abort("failed");
      return;
    }
    if (search === "unavailable503" && unavailableAttempts++ === 0) {
      await json(route, 503, { error: { code: "MAP_GEO_UNAVAILABLE", message: "Unavailable." } });
      return;
    }
    if (search === "ziadne") {
      await json(route, 200, { mode: "items", items: [], meta: responseMeta(url, 0) });
      return;
    }
    if (search === "truncated") {
      await json(route, 200, {
        mode: "items",
        items: allItems.slice(0, 2),
        meta: responseMeta(url, 2, { matched: 84, truncated: true }),
      });
      return;
    }
    if (search === "cluster" && zoom < 9) {
      const clusters = [
        {
          id: "cluster:nitra",
          latitude: 48.31,
          longitude: 18.1,
          count: 2,
          categoryCounts: { services: 1, organizations: 1, events: 0 },
        },
        {
          id: "cluster:trnava",
          latitude: 48.377,
          longitude: 17.588,
          count: 2,
          categoryCounts: { services: 1, organizations: 1, events: 0 },
        },
        {
          id: "cluster:bratislava",
          latitude: 48.1486,
          longitude: 17.1077,
          count: 2,
          categoryCounts: { services: 1, organizations: 0, events: 1 },
        },
        {
          id: "cluster:singleton-event",
          latitude: eventItem.latitude,
          longitude: eventItem.longitude,
          count: 1,
          categoryCounts: { services: 0, organizations: 0, events: 1 },
          singletonItem: eventItem,
        },
      ];
      await json(route, 200, {
        mode: "clusters",
        clusters,
        meta: responseMeta(url, clusters.length, { matched: 7 }),
      });
      return;
    }
    if (search === "singleton" && zoom < 9) {
      const clusters = [{
        id: "cluster:singleton-event",
        latitude: eventItem.latitude,
        longitude: eventItem.longitude,
        count: 1,
        categoryCounts: { services: 0, organizations: 0, events: 1 },
        singletonItem: eventItem,
      }];
      await json(route, 200, {
        mode: "clusters",
        clusters,
        meta: responseMeta(url, clusters.length, { matched: 1 }),
      });
      return;
    }
    if (search === "many") {
      const items = Array.from({ length: 12 }, (_, index) => ({
        ...serviceItem,
        id: `service:${index + 10}`,
        entityId: index + 10,
        name: `Veterina ${index + 1}`,
        href: `/adresar/veterinari/veterina-${index + 1}`,
      }));
      await json(route, 200, {
        mode: "items",
        items,
        meta: responseMeta(url, items.length),
      });
      return;
    }

    let items = allItems;
    if (category) items = items.filter((item) => item.category === category);
    if (url.searchParams.get("subcategory")) {
      items = items.filter((item) => item.subcategory === url.searchParams.get("subcategory"));
    }
    if (url.searchParams.get("region")) {
      items = items.filter((item) => item.region === url.searchParams.get("region"));
    }
    if (url.searchParams.get("district")) {
      items = items.filter((item) => item.district === url.searchParams.get("district"));
    }
    if (url.searchParams.get("city")) {
      items = items.filter((item) => item.city === url.searchParams.get("city"));
    }
    if (url.searchParams.get("eventType")) {
      items = items.filter((item) => item.entityType === "event" && item.subcategory === url.searchParams.get("eventType"));
    }

    await json(route, 200, {
      mode: "items",
      items,
      meta: responseMeta(url, items.length),
    });
  });

  return { requests };
}

async function swipePointer(locator: Locator, deltaY: number, startOffsetY = 24) {
  await locator.scrollIntoViewIfNeeded();
  const initialBox = await locator.boundingBox();
  expect(initialBox).not.toBeNull();

  const offsetX = Math.min(initialBox!.width / 2, 120);
  const offsetY = Math.min(startOffsetY, Math.max(8, initialBox!.height / 2));
  await locator.hover({ position: { x: offsetX, y: offsetY } });

  const box = await locator.boundingBox();
  expect(box).not.toBeNull();

  const page = locator.page();
  const startX = box!.x + offsetX;
  const startY = box!.y + offsetY;

  await page.mouse.down();
  await page.mouse.move(startX, startY + deltaY, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(260);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(overflow.document, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport + 1);
  expect(overflow.body, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport + 1);
}

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title.includes("Google renderer is blocked before service-specific consent")) return;
  await page.addInitScript(() => {
    window.localStorage.setItem("psipedia-google-maps-consent", "granted");
  });
});

test.describe("MAP-1D desktop", () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test("SSR shell, item results, marker-card sync, filters and canonical detail href", async ({ page }) => {
    const mock = await installMapApiMock(page);
    await page.goto("/mapa");

    await expect(page.getByRole("heading", { level: 1, name: "Mapa Psipedie" })).toBeVisible();
    await expect(page.getByTestId("map-test-renderer")).toBeVisible();
    await expect(page.getByTestId("map-card-service:1")).toBeVisible();
    await expect(page.getByTestId("map-results-guidance")).toHaveText("Vyber výsledok na mape alebo v zozname.");
    await expect(page.getByTestId("map-cluster-summary")).toHaveCount(0);
    await expect(page.getByTestId("map-provider-disclosure")).toHaveCount(0);
    await expect(page.getByLabel("Zdroj lokalizačných údajov")).toContainText("Geoapify");
    await expect(page.getByTestId("map-card-organization:2:location:20")).toContainText("Približná poloha");
    await expect(page.getByTestId("map-card-organization:2:location:20")).not.toContainText("Súkromná");
    await expect(page.getByRole("link", { name: "Zobraziť profil" }).first()).toHaveAttribute(
      "href",
      "/adresar/veterinari/veterina-alfa",
    );
    await expect(page.getByTestId("map-test-renderer")).toHaveAttribute("data-map-init-count", "1");
    expect(mock.requests.length).toBeGreaterThanOrEqual(1);

    await page.getByTestId("marker-service:1").click();
    await expect(page.getByTestId("map-card-service:1")).toHaveAttribute("data-selected", "true");

    await page.getByTestId("map-card-organization:2:location:20")
      .getByRole("button", { name: /Zobraziť Pomoc labkám na mape/ })
      .click();
    await expect(page.getByTestId("marker-organization:2:location:20")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("map-test-renderer")).toHaveAttribute("data-map-init-count", "1");

    await page.getByRole("button", { name: "Služby", exact: true }).click();
    await expect(page).toHaveURL(/category=services/);
    await expect(page.getByTestId("map-card-service:1")).toBeVisible();
    await expect(page.getByTestId("map-card-event:3")).toHaveCount(0);

    await page.getByLabel("Typ služby").selectOption("veterinari");
    await page.getByLabel("Kraj").selectOption("Nitriansky kraj");
    await page.getByLabel("Okres").fill("Nitra");
    await page.getByLabel("Mesto / obec").fill("Nitra");
    await expect(page).toHaveURL(/subcategory=veterinari/);
    await expect.poll(() => new URL(page.url()).searchParams.get("region")).toBe("Nitriansky kraj");
    await expect(page.getByTestId("map-card-service:1")).toBeVisible();
    await expect(page.getByTestId("map-test-renderer")).toHaveAttribute("data-map-init-count", "1");
    await expect.poll(() => page.evaluate(() => (
      window as Window & { __PSIPEDIA_MAP_INIT_COUNT__?: number }
    ).__PSIPEDIA_MAP_INIT_COUNT__)).toBe(1);

    await page.screenshot({ path: ".e2e-artifacts/map-1d/desktop-items-selected.png", fullPage: true });
    await expectNoHorizontalOverflow(page);

    const axe = await new AxeBuilder({ page }).include("main").analyze();
    expect(axe.violations).toEqual([]);
  });

  test("server clusters zoom to item mode without a second hidden endpoint", async ({ page }) => {
    const mock = await installMapApiMock(page);
    await page.goto("/mapa");
    await expect(page.getByTestId("map-test-renderer")).toBeVisible();
    await expect(page.getByTestId("map-card-service:1")).toBeVisible();

    await page.getByLabel("Vyhľadávanie v mape").fill("cluster");
    await expect(page.getByRole("heading", { level: 2, name: "4 oblasti · 7 výsledkov" })).toBeVisible();
    await expect(page.getByTestId("map-results-guidance")).toContainText("Priblíž mapu alebo vyber zhluk");
    await expect(page.getByTestId("map-cluster-summary")).toContainText("Mapa je zatiaľ v súhrnnom pohľade.");
    await expect(page.getByTestId("map-cluster-summary")).toContainText("7 výsledkov je zoskupených do 4 oblastí");
    const groupedCluster = page.getByRole("button", { name: "Priblížiť oblasť s 2 záznamami" }).first();
    await expect(groupedCluster).toBeVisible();
    await page.screenshot({ path: ".e2e-artifacts/map-1d/desktop-clusters.png", fullPage: true });

    const requestsBeforeZoom = mock.requests.length;
    await groupedCluster.click();
    await expect(page.getByTestId("map-card-service:1")).toBeVisible();
    await expect(page.getByTestId("map-cluster-summary")).toHaveCount(0);
    const zoomRequestDelta = mock.requests.length - requestsBeforeZoom;
    console.log(`MAP_UI_REQUESTS cluster_zoom_delta=${zoomRequestDelta}`);
    expect(zoomRequestDelta).toBe(1);
  });

  test("singleton cluster is exposed as an item marker and selects without zoom-only navigation", async ({ page }) => {
    const mock = await installMapApiMock(page);
    await page.goto("/mapa");
    await expect(page.getByTestId("map-test-renderer")).toBeVisible();

    await page.getByLabel("Vyhľadávanie v mape").fill("singleton");
    await expect(page.getByRole("heading", { level: 2, name: "1 oblasť · 1 výsledok" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Priblížiť oblasť s 1 záznamami" })).toHaveCount(0);
    await expect(page.getByTestId("map-results-guidance")).toHaveText("Vyber výsledok na mape alebo v zozname.");
    await expect(page.getByTestId("map-cluster-summary")).toHaveCount(0);
    await expect(page.getByTestId("map-empty-state")).toHaveCount(0);
    await expect(page.getByTestId("marker-event:3")).toBeVisible();
    await expect(page.getByTestId("map-card-event:3")).toBeVisible();

    const requestsBeforeSelect = mock.requests.length;
    await page.getByTestId("marker-event:3").click();
    await expect(page.getByTestId("map-card-event:3")).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("map-results-guidance")).toHaveText("Vybraný výsledok nájdeš nižšie.");
    await expect(page.getByTestId("map-cluster-summary")).toHaveCount(0);
    await expect(page.getByTestId("map-card-event:3")).toContainText("Psia výstava Nitra");
    await expect(page.getByTestId("map-card-event:3")).toContainText("Nitra");
    await expect(page.getByTestId("map-card-event:3")).toContainText("1. októbra 2030");
    expect(new URL(page.url()).pathname).toBe("/mapa");
    expect(mock.requests.length - requestsBeforeSelect).toBe(0);
    await expect.poll(() => page.evaluate(() => (
      window as Window & { __PSIPEDIA_MAP_INIT_COUNT__?: number }
    ).__PSIPEDIA_MAP_INIT_COUNT__)).toBe(1);
  });

  test("empty, truncated and API failure states remain distinct and retryable", async ({ page }) => {
    await installMapApiMock(page);
    await page.goto("/mapa");
    await expect(page.getByTestId("map-test-renderer")).toBeVisible();
    await expect(page.getByTestId("map-card-service:1")).toBeVisible();

    const search = page.getByLabel("Vyhľadávanie v mape");

    await search.fill("ziadne");
    await expect(page.getByTestId("map-empty-state")).toContainText("V tejto oblasti sme nenašli záznamy");

    await search.fill("truncated");
    await expect(page.getByTestId("map-truncated-state")).toContainText("Zobrazuje sa iba časť výsledkov");
    await expect(page.getByLabel("Zdroj lokalizačných údajov")).toContainText("Geoapify");

    await search.fill("bad400");
    await expect(page.getByTestId("map-api-error")).toContainText("Filtre sa nepodarilo spracovať");

    await search.fill("slow429");
    await expect(page.getByTestId("map-api-error")).toContainText("priveľa požiadaviek");

    await search.fill("network");
    await expect(page.getByTestId("map-api-error")).toContainText("Spojenie s mapou sa prerušilo");

    await search.fill("unavailable503");
    await expect(page.getByTestId("map-api-error")).toContainText("Mapové dáta sú dočasne nedostupné");
    await page.getByRole("button", { name: "Skúsiť znova" }).click();
    await expect(page.getByTestId("map-card-service:1")).toBeVisible();

    await page.screenshot({ path: ".e2e-artifacts/map-1d/desktop-recovered.png", fullPage: true });
  });

  test("Google renderer is blocked before service-specific consent", async ({ page }) => {
    await installMapApiMock(page);
    await page.goto("/mapa?__mapRenderer=real");

    await expect(page.getByTestId("map-consent-gate")).toContainText("Načítať interaktívnu Google mapu?");
    await expect(page.getByTestId("map-provider-disclosure")).toContainText("načíta sa až po tvojom výslovnom povolení");
    await expect(page.getByTestId("map-provider-disclosure").getByRole("link", { name: "podmienkam Google Maps" })).toBeVisible();
    await expect(page.getByTestId("map-card-service:1")).toBeVisible();
    await expect(page.locator("script[data-psipedia-google-maps]")).toHaveCount(0);

  });

  test("missing Google config fails closed while SSR and text results remain available", async ({ page }) => {
    await installMapApiMock(page);
    await page.goto("/mapa?__mapRenderer=real&__mapConfig=missing");

    await expect(page.getByRole("heading", { level: 1, name: "Mapa Psipedie" })).toBeVisible();
    await expect(page.getByTestId("map-renderer-status")).toContainText("Google Maps nie je nakonfigurovaný");
    await expect(page.getByTestId("map-card-service:1")).toBeVisible();
    await expect(page.locator("script[data-psipedia-google-maps]")).toHaveCount(0);
    await page.screenshot({ path: ".e2e-artifacts/map-1d/desktop-config-missing.png", fullPage: true });
  });
});

test.describe("MAP-1D mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("bottom sheet gestures, mobile filters, marker selection and no horizontal overflow", async ({ page }) => {
    await installMapApiMock(page);
    await page.goto("/mapa");
    await expect(page.getByTestId("map-test-renderer")).toBeVisible();

    const results = page.getByTestId("map-results-panel");
    const header = page.getByTestId("map-sheet-header");
    const resultScroll = page.getByTestId("map-results-scroll");
    await expect(results).toHaveAttribute("data-sheet-state", "peek");
    await page.screenshot({ path: ".e2e-artifacts/map-1d/mobile-initial.png", fullPage: true });

    await swipePointer(header, -120);
    await expect(results).toHaveAttribute("data-sheet-state", "expanded");

    await swipePointer(header, 120);
    await expect(results).toHaveAttribute("data-sheet-state", "peek");

    await page.getByRole("button", { name: "Výsledky" }).click();
    await expect(results).toHaveAttribute("data-sheet-state", "expanded");
    await page.screenshot({ path: ".e2e-artifacts/map-1d/mobile-sheet-expanded.png", fullPage: true });

    await page.getByLabel("Vyhľadávanie v mape").fill("many");
    await expect(page.getByTestId("map-card-service:10")).toBeVisible();
    await resultScroll.hover();
    await page.mouse.wheel(0, 420);
    await expect.poll(() => resultScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await resultScroll.evaluate((element) => { element.scrollTop = 0; });
    await swipePointer(resultScroll, 120);
    await expect(results).toHaveAttribute("data-sheet-state", "peek");

    const map = page.getByTestId("map-test-renderer");
    await swipePointer(map, -90);
    await expect(results).toHaveAttribute("data-sheet-state", "peek");

    await page.getByRole("button", { name: "Výsledky" }).click();
    await expect(results).toHaveAttribute("data-sheet-state", "expanded");

    await page.getByRole("button", { name: /Filtre/ }).click();
    const dialog = page.getByTestId("map-filter-dialog");
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: ".e2e-artifacts/map-1d/mobile-filters.png", fullPage: true });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Filtre/ })).toBeFocused();

    await page.getByLabel("Vyhľadávanie v mape").fill("");
    await expect(page.getByTestId("marker-service:1")).toBeVisible();
    await page.getByRole("button", { name: "Zmenšiť" }).click();
    await expect(results).toHaveAttribute("data-sheet-state", "peek");
    await page.getByTestId("marker-service:1").click();
    await expect(results).toHaveAttribute("data-sheet-state", "expanded");
    await expect(page.getByTestId("map-card-service:1")).toHaveAttribute("data-selected", "true");
    await page.screenshot({ path: ".e2e-artifacts/map-1d/mobile-selected.png", fullPage: true });

    await expectNoHorizontalOverflow(page);
    await expect.poll(() => page.evaluate(() => (
      window as Window & { __PSIPEDIA_MAP_INIT_COUNT__?: number }
    ).__PSIPEDIA_MAP_INIT_COUNT__)).toBe(1);
    const axe = await new AxeBuilder({ page }).include("main").analyze();
    expect(axe.violations).toEqual([]);
  });

  test("singleton marker selects and exposes its result without automatic detail navigation", async ({ page }) => {
    await installMapApiMock(page);
    await page.goto("/mapa");
    const results = page.getByTestId("map-results-panel");

    await page.getByLabel("Vyhľadávanie v mape").fill("singleton");
    await expect(results).toHaveAttribute("data-sheet-state", "peek");
    await expect(page.getByTestId("map-results-guidance")).toHaveText("Vyber výsledok na mape alebo v zozname.");
    await expect(page.getByTestId("map-cluster-summary")).toHaveCount(0);
    await expect(page.getByTestId("map-empty-state")).toHaveCount(0);
    await expect(page.getByTestId("marker-event:3")).toBeVisible();

    await page.getByTestId("marker-event:3").click();
    await expect(results).toHaveAttribute("data-sheet-state", "expanded");
    await expect(page.getByTestId("map-card-event:3")).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("map-results-guidance")).toHaveText("Vybraný výsledok nájdeš nižšie.");
    await expect(page.getByTestId("map-cluster-summary")).toHaveCount(0);
    await expect(page.getByTestId("map-card-event:3")).toBeVisible();
    await expect(page.getByTestId("map-card-event:3").getByRole("link", { name: "Detail podujatia" }))
      .toHaveAttribute("href", "/podujatia/psia-vystava-nitra");
    expect(new URL(page.url()).pathname).toBe("/mapa");
    await expect.poll(() => page.evaluate(() => (
      window as Window & { __PSIPEDIA_MAP_INIT_COUNT__?: number }
    ).__PSIPEDIA_MAP_INIT_COUNT__)).toBe(1);
    await expectNoHorizontalOverflow(page);
  });
});
