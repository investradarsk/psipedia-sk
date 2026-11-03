import { expect, test } from "@playwright/test";
const fixture = "/tests/e2e/fixtures/public-fallbacks/index.html";

test("event errors before hydration recover in crop, natural and blur renderers", async ({
  page,
}) => {
  await page.goto(fixture + "?view=hydrate");
  const photos = page.locator('[data-cached] img:not([aria-hidden="true"])');
  await expect(photos).toHaveCount(3);
  await expect
    .poll(() =>
      photos.evaluateAll((images) =>
        images.every(
          (img) =>
            (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth === 0,
        ),
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Hydratovať", exact: true }).click();
  await expect(page.locator('[data-cached] img[data-event-image-source="fallback"]')).toHaveCount(
    3,
  );
  await expect
    .poll(() =>
      page
        .locator("[data-cached] img")
        .evaluateAll((images) =>
          images.every(
            (img) =>
              (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
});

test("runtime errors, shared help media and genuine monetary progress", async ({ page }, info) => {
  await page.goto(fixture);
  await page.getByRole("button", { name: "Pokaziť fotografiu po načítaní" }).click();
  await expect(page.locator("[data-runtime-image] img")).toHaveAttribute(
    "data-event-image-source",
    "fallback",
  );
  const cards = page.locator("[data-help-profile-card]");
  await expect(cards).toHaveCount(7);
  await expect(page.getByRole("progressbar")).toHaveCount(1);
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  for (const i of [0, 1, 2, 3]) await expect(cards.nth(i)).not.toContainText("Vyzbierané");
  const broken = cards.filter({ hasText: "Zlyhaná fotografia" });
  await expect(broken.locator("[data-public-media-fallback]")).toBeVisible();
  const missingStyle = await cards
    .nth(0)
    .locator("[data-public-media-fallback]")
    .evaluate((el) => ({
      background: getComputedStyle(el).background,
      color: getComputedStyle(el).color,
    }));
  const failedStyle = await broken
    .locator("[data-public-media-fallback]")
    .evaluate((el) => ({
      background: getComputedStyle(el).background,
      color: getComputedStyle(el).color,
    }));
  expect(failedStyle).toEqual(missingStyle);
  await expect(
    cards.filter({ hasText: "Platná fotografia" }).locator("[data-public-media-fallback]"),
  ).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const card of [cards.nth(0), cards.nth(1), cards.nth(3), broken]) {
      const media = await card.locator("[data-help-profile-media]").boundingBox();
      const paw = await card.locator("[data-public-media-fallback] svg").boundingBox();
      expect(Math.abs(media!.x + media!.width / 2 - (paw!.x + paw!.width / 2))).toBeLessThan(2);
      expect(Math.abs(media!.y + media!.height / 2 - (paw!.y + paw!.height / 2))).toBeLessThan(2);
    }
    await page.screenshot({
      path: `test-results/public-fallbacks/help-${width}.png`,
      fullPage: true,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

test("text area reaches real profile links without Google consent or requests", async ({
  page,
}) => {
  const googleRequests: string[] = [];
  const localRequests: URL[] = [];
  page.on("request", (request) => {
    if (request.url().includes("maps.googleapis.com")) googleRequests.push(request.url());
  });
  await page.route("**/api/map?**", async (route) => {
    const url = new URL(route.request().url());
    localRequests.push(url);
    const zoom = Number(url.searchParams.get("zoom"));
    const meta = {
      count: zoom <= 10 ? 1 : 1,
      matched: 5,
      truncated: false,
      bbox: { north: 50, south: 47, east: 23, west: 16 },
      zoom,
      cacheTtlSeconds: 30,
    };
    const item = {
      id: "service:1",
      entityType: "service",
      entityId: 1,
      name: "Veterina Nitra",
      category: "services",
      href: "/adresar/veterinari/fixture",
      latitude: 48.31,
      longitude: 18.08,
      precision: "EXACT",
      city: "Nitra",
    };
    const response =
      zoom <= 10
        ? {
            mode: "clusters",
            clusters: [
              {
                id: "nitra",
                label: "Nitra",
                latitude: 48.31,
                longitude: 18.08,
                count: 5,
                categoryCounts: { services: 5, organizations: 0, events: 0 },
              },
            ],
            meta,
          }
        : { mode: "items", items: [item], meta };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
  await page.goto(fixture + "?view=map");
  await expect(page.getByTestId("map-consent-gate")).toBeVisible();
  await page.getByRole("button", { name: "Nitra 5 výsledkov · Zobraziť zoznam" }).click();
  await expect(
    page.getByTestId("map-card-service:1").getByRole("link", { name: "Zobraziť profil" }),
  ).toHaveAttribute("href", "/adresar/veterinari/fixture");
  expect(Number(localRequests.at(-1)!.searchParams.get("zoom"))).toBeGreaterThan(10);
  expect(googleRequests).toEqual([]);
  await page.screenshot({
    path: "test-results/public-fallbacks/map-no-consent.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Všetky oblasti Slovenska" }).click();
  await expect(page.getByTestId("map-text-areas")).toBeVisible();
});

test("event return link shares the content container", async ({ page }) => {
  await page.goto(fixture + "?view=event");
  const title = await page
    .getByRole("heading", { name: "Ďalšie podujatia", exact: true })
    .boundingBox();
  const back = await page.getByRole("link", { name: /Späť na výsledky/ }).boundingBox();
  expect(Math.abs(title!.x - back!.x)).toBeLessThanOrEqual(2);
  await expect(page.locator('[data-event-image-source="fallback"]')).toHaveCount(2);
  await page.screenshot({ path: "test-results/public-fallbacks/event-detail.png", fullPage: true });
});
