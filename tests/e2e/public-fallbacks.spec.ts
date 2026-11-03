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
  const failedStyle = await broken.locator("[data-public-media-fallback]").evaluate((el) => ({
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
      subcategory: "veterinari",
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
  await expect(page.locator("[data-public-map-consent]")).toHaveCount(1);
  await expect(page.getByTestId("map-renderer-status")).toHaveCount(0);
  await expect(page.getByTestId("map-provider-disclosure")).toHaveCount(0);
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

test("compact event calendar stays left and results begin alongside it", async ({ page }) => {
  await page.goto(fixture + "?view=calendar");
  await expect(page.locator("[data-events-month-calendar]")).toBeVisible();
  await expect(page.locator("[data-public-filter-panel]")).toBeVisible();

  const calendar = await page.locator("[data-events-month-calendar]").boundingBox();
  const results = await page.locator("#events-list").boundingBox();
  expect(results!.x).toBeGreaterThan(calendar!.x + calendar!.width);
  expect(results!.y).toBeLessThan(700);
  await expect(page.locator("#events-list")).toContainText("1 podujatie");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: "test-results/public-fallbacks/compact-calendar.png",
    fullPage: true,
  });
});
test("banners share text and CTA structure; missing direct contact is explicit", async ({
  page,
}) => {
  await page.goto(fixture + "?view=banners");
  await expect(page.locator("[data-public-banner-content]")).toHaveCount(3);
  await expect(page.locator("[data-public-contact-empty]")).toHaveText(
    "Priamy kontakt zatiaľ nie je uvedený.",
  );
  await expect(page.locator("[data-public-fact-list] a")).toHaveAttribute(
    "href",
    "tel:+421900000000",
  );
  for (const heading of await page.locator("[data-public-banner-content] h2").all())
    expect(
      await heading.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeLessThanOrEqual(26);
  await page.screenshot({
    path: "test-results/public-fallbacks/shared-banners.png",
    fullPage: true,
  });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
test("closed fundraiser cannot be urgent or invite a new donation", async ({ page }) => {
  await page.goto(fixture + "?view=closed");
  await expect(page.getByText("Urgentné", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Ukončené / vyriešené", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Pozrieť ukončenú výzvu/ })).toHaveAttribute(
    "href",
    "https://example.org/archive",
  );
  await page.goto(fixture + "?view=help-filters");
  const panel = await page.locator("[data-public-filter-panel]").boundingBox();
  const results = await page.locator("[data-public-filter-results]").boundingBox();
  expect(results!.x).toBeGreaterThan(panel!.x + panel!.width);
  await expect(page.locator("[data-help-profile-card]")).toHaveCount(1);
});

for (const view of ["adoption", "directory"]) {
  test(`${view}: real listing uses left filter, compact hero and operable mobile disclosure`, async ({
    page,
  }) => {
    await page.goto(fixture + "?view=" + view);
    const panel = await page.locator("[data-public-filter-panel]").boundingBox();
    const results = await page
      .locator(view === "adoption" ? "[data-public-filter-results]" : "[data-directory-results]")
      .boundingBox();
    expect(results!.x).toBeGreaterThan(panel!.x + panel!.width);
    expect(results!.y).toBeLessThan(700);
    if (view === "directory")
      await expect(
        page.getByText("Nájdi fyzioterapiu vo svojom okolí", { exact: true }),
      ).toBeVisible();
    await page.screenshot({
      path: `test-results/public-fallbacks/${view}-sidebar.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const button = page
      .getByRole("button", { name: view === "adoption" ? /Filtrovať psy/ : /^Filtre/ })
      .first();
    if (await button.isVisible()) await button.click();
  });
}

test("article variants share recovered media and row adapters; callouts have one label", async ({
  page,
}) => {
  await page.goto(fixture + "?view=articles");
  await expect(page.locator('[data-article-variant="featured"]')).toBeVisible();
  await expect(
    page.locator('[data-article-variant="grid"] [data-public-media-fallback]'),
  ).toBeVisible();
  await expect(page.locator('[data-article-variant="row"]')).toHaveCount(3);
  const pair = page.locator('[data-row-adapters] > [data-article-variant="row"]');
  const dimensions = await pair.evaluateAll((els) =>
    els.map((el) => ({
      height: el.getBoundingClientRect().height,
      columns: getComputedStyle(el).gridTemplateColumns,
    })),
  );
  expect(dimensions[0]).toEqual(dimensions[1]);
  const feature = page.locator('[data-article-variant="featured"]');
  const frames = await feature.evaluate((el) => {
    const img = el.querySelector(".article-card-media")!.getBoundingClientRect();
    const copy = el.querySelector(".article-card-body")!.getBoundingClientRect();
    return { imgLeft: img.left, imgRight: img.right, copyLeft: copy.left, copyRight: copy.right };
  });
  expect(Math.abs(frames.imgLeft - frames.copyLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(frames.imgRight - frames.copyRight)).toBeLessThanOrEqual(1);
  for (const label of ["Tip z praxe", "Dôležité upozornenie"]) {
    const callout = page.locator(".article-block-callout").filter({ hasText: label });
    const text = await callout.innerText();
    expect(text.split(label).length - 1).toBe(1);
  }
  await page.screenshot({
    path: "test-results/public-fallbacks/article-variants.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("help pagination renders twelve records, preserves filters and browser back/forward", async ({
  page,
}) => {
  await page.route("**/pomoc-psom/dobrovolnictvo?**", async (route) => {
    const url = new URL(route.request().url());
    url.pathname = fixture;
    url.searchParams.set("view", "help-pages");
    await route.fulfill({ status: 302, headers: { location: url.toString() }, body: "" });
  });
  await page.goto(fixture + "?view=help-pages");
  const cards = page.locator("[data-help-card]");
  await expect(cards).toHaveCount(12);
  const next = page.getByRole("link", { name: "Ďalšia →", exact: true });
  const href = await next.getAttribute("href");
  expect(href).toContain("page=2");
  expect(href).toContain("region=Nitriansky");
  expect(href).toContain("q=Pomoc");
  await next.click();
  await expect(page.locator("[data-public-pagination]")).toContainText("Strana 2 z 3");
  await expect(cards.first()).toContainText("Pomoc 13");
  await page.goBack();
  await expect(cards.first()).toContainText("Pomoc 1");
  await page.goForward();
  await expect(cards.first()).toContainText("Pomoc 13");
  await page.screenshot({
    path: "test-results/public-fallbacks/help-pagination.png",
    fullPage: true,
  });
});

test("directory offers only one catalogue selector with readable options; old URL restrictions remain removable", async ({
  page,
}) => {
  await page.goto(fixture + "?view=directory&service=Legacy&type=Grooming");
  const sidebar = page.locator("[data-directory-filter-disclosure]");
  await expect(sidebar.locator('select[name="service"],select[name="type"]')).toHaveCount(0);
  const select = sidebar.locator('select[name="svc"]');
  await expect(select).toHaveCount(1);
  await select.selectOption("svc.physio.hydrotherapy");
  await expect(select.locator("option:checked")).toHaveText("Hydroterapia");
  for (const name of ["service", "type"])
    await expect(sidebar.locator(`input[name="${name}"]`)).toHaveValue("");
  const colors = await select.evaluate((el) => ({
    color: getComputedStyle(el).color,
    background: getComputedStyle(el).backgroundColor,
    fill: getComputedStyle(el).getPropertyValue("-webkit-text-fill-color"),
  }));
  expect(colors.color).not.toBe(colors.background);
  expect(colors.fill).not.toBe("rgba(0, 0, 0, 0)");
  await select.focus();
  await select.press("ArrowUp");
  await page.screenshot({
    path: "test-results/public-fallbacks/directory-single-service.png",
    fullPage: true,
  });
});

test("detail map has one consent prompt with address and external alternative", async ({
  page,
}) => {
  const googleRequests: string[] = [];
  page.on("request", (r) => {
    if (/maps\.googleapis|maps\.gstatic/.test(r.url())) googleRequests.push(r.url());
  });
  await page.goto(fixture + "?view=detail-map");
  await expect(page.locator("[data-public-map-consent]")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Povoliť Google Maps" })).toHaveCount(1);
  await expect(page.getByText("Nitra", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Otvoriť v Google Maps", exact: true }),
  ).toBeVisible();
  expect(googleRequests).toEqual([]);
  await page.screenshot({
    path: "test-results/public-fallbacks/detail-map-consent.png",
    fullPage: true,
  });
});

test("comparison exposes source explanation and does not show a mid-word summary", async ({
  page,
}) => {
  await page.goto(fixture + "?view=comparison");
  const row = page.locator(".comparison-row").filter({ hasText: "Dĺžka života" });
  await expect(row).toContainText("Orientačne 12–16 rokov");
  const details = row.locator("details");
  await expect(details).not.toHaveAttribute("open", "");
  await details.locator("summary").click();
  await expect(details.locator("p")).toContainText("viacerých okolností.");
  await expect(details.getByRole("link")).toHaveAttribute("href", "/plemena/plemeno-b");
  await page.screenshot({
    path: "test-results/public-fallbacks/comparison-explanation.png",
    fullPage: true,
  });
});

test("partner login aligns its copy to the top through error, pending and e-mail success states", async ({
  page,
}) => {
  let release: () => void = () => {};
  const pending = new Promise<void>((r) => {
    release = r;
  });
  const blocked: string[] = [];
  await page.route("**/api/partner/**", async (route) => {
    if (route.request().url().endsWith("/request-link")) {
      await route.fulfill({ status: 200, json: { message: "Izolovaný test: odkaz pripravený." } });
    } else {
      await pending;
      await route.fulfill({
        status: 401,
        json: { error: "Izolovaný test: nesprávne prihlasovacie údaje." },
      });
    }
  });
  page.on("request", (r) => {
    if (r.url().startsWith("https://") && r.isNavigationRequest()) blocked.push(r.url());
  });
  await page.goto(fixture + "?view=partner&google=unlinked");
  const copy = await page.locator(".partner-auth-copy").boundingBox();
  const card = await page.locator(".partner-auth-card").boundingBox();
  expect(Math.abs(copy!.y - card!.y)).toBeLessThanOrEqual(2);
  await expect(
    page.getByText("Google účet zatiaľ nie je prepojený", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("E-mail", { exact: true }).fill("fixture@example.invalid");
  await page.getByLabel("Heslo", { exact: true }).fill("isolated-fixture-password");
  await page.getByRole("button", { name: "Prihlásiť sa", exact: true }).click();
  await expect(page.getByRole("button", { name: "Spracúvam…" })).toBeDisabled();
  release();
  await expect(page.getByText("Izolovaný test: nesprávne prihlasovacie údaje.")).toBeVisible();
  await page.getByLabel("Pracovný e-mail").fill("fixture@example.invalid");
  await page.locator('.partner-auth-alternative button[type="submit"]').click();
  await expect(page.getByText("Izolovaný test: odkaz pripravený.")).toBeVisible();
  expect(blocked).toEqual([]);
  await page.screenshot({
    path: "test-results/public-fallbacks/partner-login.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("homepage consumes canonical featured media frame with five row cards", async ({ page }) => {
  await page.goto(fixture + "?view=home-articles");
  await expect(page.locator('[data-article-variant="row"]')).toHaveCount(5);
  const frame = await page.locator('[data-article-variant="featured"]').evaluate((el) => {
    const card = el.getBoundingClientRect(),
      media = el.querySelector(".article-card-media")!.getBoundingClientRect();
    return {
      width: card.width,
      mediaWidth: media.width,
      height: card.height,
      mediaHeight: media.height,
    };
  });
  expect(Math.abs(frame.width - frame.mediaWidth)).toBeLessThanOrEqual(2);
  expect(Math.abs(frame.height - frame.mediaHeight)).toBeLessThanOrEqual(2);
  await page.screenshot({
    path: "test-results/public-fallbacks/home-article-family.png",
    fullPage: true,
  });
});
