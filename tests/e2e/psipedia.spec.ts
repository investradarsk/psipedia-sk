import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const CONSENT_KEY = "psipedia-cookie-consent";
const NO_CONSENT_TEST = "@production cookie banner is operable and navigation works before consent";

async function useNecessaryCookies(page: Page) {
  await page.addInitScript(([key]) => localStorage.setItem(key, "necessary"), [CONSENT_KEY]);
}

async function gotoProductionPage(page: Page, path: string) {
  // Production edge/network latency can occasionally exceed one navigation window.
  // Retry only navigation timeouts; HTTP and render failures remain strict and fail immediately.
  let response = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      response = await page.goto(path, { waitUntil: "commit", timeout: 30_000 });
      break;
    } catch (error) {
      const isNavigationTimeout = error instanceof Error && error.name === "TimeoutError";
      if (!isNavigationTimeout || attempt === 2) throw error;
      console.warn(`Production navigation timeout for ${path}; retrying once`);
    }
  }

  expect(response, `No navigation response for ${path}`).not.toBeNull();
  expect(response?.status(), `${path} returned HTTP ${response?.status()}`).toBeLessThan(400);
  await expect(page.locator("main"), `${path} did not render public content`).toBeVisible();
  return response;
}

async function expectHealthyPage(page: Page, path: string) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/Failed to load resource|googletagmanager|Google Analytics/i.test(text)) return;
    consoleErrors.push(text);
  });
  const response = await page.goto(path, { waitUntil: "commit" });
  expect(response, `No navigation response for ${path}`).not.toBeNull();
  expect(response?.status(), `${path} returned HTTP ${response?.status()}`).toBeLessThan(400);
  await expect(page.locator("body"), `${path} rendered an empty document`).not.toBeEmpty();
  await page.waitForTimeout(150);
  expect(pageErrors, `JavaScript errors on ${path}:\n${pageErrors.join("\n")}`).toEqual([]);
  expect(consoleErrors, `Console errors on ${path}:\n${consoleErrors.join("\n")}`).toEqual([]);
}

async function firstPublicLink(page: Page, container: string, pattern: RegExp) {
  const links = page.locator(`${container} a[href]`);
  for (let index = 0; index < await links.count(); index += 1) {
    const href = await links.nth(index).getAttribute("href");
    if (href && pattern.test(href)) return href;
  }
  throw new Error(`No public detail link matching ${pattern} found in ${container}`);
}

async function expectAxeClean(page: Page, label: string) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  const details = violations.map((item) =>
    `${item.id} (${item.impact}): ${item.help}\n${item.nodes.slice(0, 5).map((node) => `  ${node.target.join(" ")} – ${node.failureSummary ?? "failed"}`).join("\n")}`
  ).join("\n\n");
  expect(violations, `${label} accessibility violations:\n${details}`).toEqual([]);
}

async function readSubcategoryLinks(page: Page, path: string, mode: "landing" | "compact") {
  await page.goto(path);
  return page.locator(`[data-public-subcategory-navigator][data-public-subcategory-mode="${mode}"] [data-public-subcategory-item]`).evaluateAll((links) => links.map((link) => ({
    label: link.textContent?.trim().replace(/\s+/g, " ") ?? "",
    href: link.getAttribute("href") ?? "",
  })));
}

async function expectSectionTabsClear(page: Page, path: string, minimumGap = 0) {
  await page.goto(path);
  const tabs = page.locator(".portal-section-tabs");
  const following = page.locator(".portal-section-tabs + .shell");
  await expect(tabs, `${path}: section tabs missing`).toBeVisible();
  await expect(following, `${path}: content after section tabs missing`).toBeVisible();

  const active = tabs.locator('.section-tab[aria-current="page"]');
  await expect(active, `${path}: active section tab missing`).toHaveCount(1);
  await active.scrollIntoViewIfNeeded();
  await expect(active, `${path}: active section tab is not visible`).toBeVisible();

  const [tabsBox, followingBox, activeBox] = await Promise.all([
    tabs.boundingBox(),
    following.boundingBox(),
    active.boundingBox(),
  ]);
  expect(tabsBox, `${path}: cannot measure section tabs`).not.toBeNull();
  expect(followingBox, `${path}: cannot measure following content`).not.toBeNull();
  expect(activeBox, `${path}: cannot measure active tab`).not.toBeNull();
  expect(
    followingBox!.y - (tabsBox!.y + tabsBox!.height),
    `${path}: following content overlaps SectionTabs`,
  ).toBeGreaterThanOrEqual(minimumGap);

  const hit = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return Boolean(element?.closest(".section-tab"));
  }, {
    x: activeBox!.x + activeBox!.width / 2,
    y: activeBox!.y + activeBox!.height / 2,
  });
  expect(hit, `${path}: active tab is covered by another layer`).toBe(true);
}

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title.includes("@production")) testInfo.setTimeout(90_000);
  if (testInfo.title !== NO_CONSENT_TEST) await useNecessaryCookies(page);
});

test("desktop and mobile menus expose the same primary destinations without hidden focus targets", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/");
  const desktopHrefs = await page.locator(".desktop-nav > a, .desktop-nav > .nav-group > a").evaluateAll((links) => links.map((link) => link.getAttribute("href")));

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMenu = page.locator("#mobile-menu");
  await expect(mobileMenu).toHaveAttribute("inert", "");
  await expect(mobileMenu).toHaveAttribute("aria-hidden", "true");
  await page.getByRole("button", { name: "Otvoriť menu" }).click();
  await expect(mobileMenu).not.toHaveAttribute("inert", "");
  await expect(mobileMenu).toHaveAttribute("aria-hidden", "false");
  const mobileHrefs = await mobileMenu.locator(".mobile-nav-group > a").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(mobileHrefs).toEqual(desktopHrefs);
});

test("event category and time filters keep a shareable URL across reload", async ({ page }) => {
  await page.goto("/podujatia?termin=ukoncene");
  const typeFilters = page.getByRole("group", { name: "Typ podujatia" });
  await typeFilters.getByRole("link", { name: "Výstava", exact: true }).click();
  await expect(page).toHaveURL(/\/podujatia\/vystavy\?termin=ukoncene$/);

  for (const [path, label] of [
    ["/podujatia/vystavy?termin=ukoncene", "Výstava"],
    ["/podujatia/preteky?termin=ukoncene", "Preteky"],
    ["/podujatia/seminare?termin=ukoncene", "Seminár"],
  ] as const) {
    await page.goto(path);
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\\?")}$`));
    await expect(page.getByRole("group", { name: "Typ podujatia" }).getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("group", { name: "Obdobie podujatia" }).getByRole("button", { name: "Ukončené", exact: true })).toHaveAttribute("aria-pressed", "true");
  }
});

test("managed portal landing subcategory navigation contains valid labels and slugs", async ({ page }) => {
  const technicalLabels = ["adresa url", "názov sekcie", "slug"];
  for (const section of ["steniatka", "starostlivost", "aktivity"]) {
    const path = `/${section}`;
    const links = await readSubcategoryLinks(page, path, "landing");
    expect(links.length, `${path}: landing subcategory navigation is empty`).toBeGreaterThan(0);
    await expect(page.locator(".portal-section-tabs"), `${path}: obsolete compact SectionTabs returned on landing hub`).toHaveCount(0);

    const labels = links.map((item) => item.label);
    const hrefs = links.map((item) => item.href);
    expect(labels.every(Boolean), `${path}: empty subcategory label; ${JSON.stringify(links)}`).toBe(true);
    expect(labels.some((label) => technicalLabels.some((technical) => label.toLocaleLowerCase("sk-SK").includes(technical))), `${path}: technical/admin label leaked into subcategory navigation; ${JSON.stringify(links)}`).toBe(false);
    expect(new Set(labels).size, `${path}: duplicate subcategory label; ${JSON.stringify(links)}`).toBe(labels.length);
    expect(new Set(hrefs).size, `${path}: duplicate subcategory href; ${JSON.stringify(links)}`).toBe(hrefs.length);
    expect(hrefs.every((href) => new RegExp(`^/${section}/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`).test(href)), `${path}: invalid subcategory href; ${JSON.stringify(links)}`).toBe(true);
  }
});

test("portal subcategory navigation follows landing and compact modes without overlap", async ({ page }) => {
  for (const path of ["/steniatka", "/starostlivost", "/aktivity"]) {
    await page.goto(path);
    const directory = page.locator("[data-section-subcategories]").first();
    const landing = directory.locator('[data-public-subcategory-navigator][data-public-subcategory-mode="landing"]');
    const following = page.locator("[data-section-public-callout]").first();

    await expect(directory, `${path}: landing subcategory section missing`).toBeVisible();
    await expect(landing, `${path}: landing subcategory navigator missing`).toBeVisible();
    await expect(page.locator(".portal-section-tabs"), `${path}: obsolete compact SectionTabs returned on landing hub`).toHaveCount(0);
    await expect(following, `${path}: content after landing subcategories missing`).toBeVisible();

    const [directoryBox, followingBox] = await Promise.all([
      directory.boundingBox(),
      following.boundingBox(),
    ]);
    expect(directoryBox, `${path}: cannot measure landing subcategories`).not.toBeNull();
    expect(followingBox, `${path}: cannot measure content after landing subcategories`).not.toBeNull();
    expect(
      followingBox!.y - (directoryBox!.y + directoryBox!.height),
      `${path}: landing subcategories overlap following content`,
    ).toBeGreaterThanOrEqual(0);
  }

  for (const path of ["/steniatka/prve-dni", "/starostlivost/vyziva", "/aktivity/psie-sporty"]) {
    await expectSectionTabsClear(page, path);
  }
});

test("article magazine detail is accessible and overflow-safe on desktop and 390px mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoProductionPage(page, "/clanky");
  const articleHref = await firstPublicLink(
    page,
    "main",
    /^\/(?:clanky|steniatka|starostlivost|aktivity|novinky|recenzie)\/[^/?#]+$/,
  );

  await gotoProductionPage(page, articleHref);
  const main = page.locator("main");
  const headline = main.locator("h1");
  await expect(headline).toBeVisible();
  await expect(main).not.toContainText("Najčítanejšie");
  await expect(main.locator(".article-hero-image, .article-hero-placeholder")).toBeVisible();
  await expect(page.getByRole("button", { name: /Uložiť medzi obľúbené|Odstrániť z obľúbených/ })).toBeVisible();
  await expect(page.getByRole("group", { name: /Zdieľať/ }).first()).toBeVisible();

  const desktopSidebar = page.getByRole("complementary", { name: "Najnovšie články" });
  if (await desktopSidebar.count()) {
    await expect(desktopSidebar).toBeVisible();
    const sidebarCount = await desktopSidebar.locator("li").count();
    expect(sidebarCount).toBeGreaterThan(0);
    expect(sidebarCount).toBeLessThanOrEqual(5);
  }

  const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(desktopOverflow, "Article detail overflows horizontally on desktop").toBeLessThanOrEqual(1);
  await expectAxeClean(page, "Article magazine detail");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "commit" });
  await expect(headline).toBeVisible();

  const headlineSize = await headline.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(headlineSize, "Mobile headline is too large").toBeLessThanOrEqual(35);

  const heroBox = await main.locator(".article-hero-image, .article-hero-placeholder").boundingBox();
  expect(heroBox, "Mobile article hero is missing").not.toBeNull();
  expect(heroBox!.width, "Mobile article hero exceeds viewport").toBeLessThanOrEqual(390);

  const saveButton = page.getByRole("button", { name: /Uložiť medzi obľúbené|Odstrániť z obľúbených/ });
  const compactShareButton = page.getByRole("group", { name: /Zdieľať/ }).first().getByRole("button").first();
  for (const control of [saveButton, compactShareButton]) {
    const box = await control.boundingBox();
    expect(box, "Article utility control is missing").not.toBeNull();
    expect(box!.height, "Article utility touch target is under 44px").toBeGreaterThanOrEqual(44);
  }

  await saveButton.focus();
  await expect(saveButton).toBeFocused();

  const mobileSidebar = page.getByRole("complementary", { name: "Najnovšie články" });
  if (await mobileSidebar.count()) {
    const [articleBox, sidebarBox] = await Promise.all([
      main.locator(".article-prose").boundingBox(),
      mobileSidebar.boundingBox(),
    ]);
    expect(articleBox).not.toBeNull();
    expect(sidebarBox).not.toBeNull();
    expect(sidebarBox!.y, "Mobile sidebar must stack below article content").toBeGreaterThanOrEqual(articleBox!.y + articleBox!.height - 1);
  }

  const midRelated = main.locator('aside[aria-label="Súvisiaci článok"]');
  if (await midRelated.count()) await expect(midRelated.getByRole("link")).toBeVisible();

  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(mobileOverflow, "Article detail overflows horizontally at 390px").toBeLessThanOrEqual(1);
});

test("@production homepage search, CTA and Plemeno dňa work without JS errors", async ({ page }) => {
  await expectHealthyPage(page, "/");
  await expect(page.locator("main#obsah h1")).toBeVisible();
  await expect(page.locator("[data-home-hero]")).toBeVisible();

  // PR #815 displays a real empty state until image-backed articles exist.
  // Every editorial section must render exactly one of its article layout or empty state.
  const homepageSections = [
    { root: "[data-home-latest]", id: "latest", title: "Novinky zo sveta psov", cta: "Archív noviniek", href: "/clanky", empty: "[data-home-latest-empty]", emptyLabel: "Nové správy pripravujeme" },
    { root: '[data-home-editorial="steniatka"]', id: "steniatka", title: "Šteniatka", cta: "Všetko o šteniatkach", href: "/steniatka", empty: '[data-home-editorial-empty="steniatka"]', emptyLabel: "Ďalší obsah pripravujeme" },
    { root: '[data-home-editorial="starostlivost"]', id: "starostlivost", title: "Zdravie a starostlivosť", cta: "Všetko o zdraví", href: "/starostlivost", empty: '[data-home-editorial-empty="starostlivost"]', emptyLabel: "Ďalší obsah pripravujeme" },
    { root: '[data-home-editorial="aktivity"]', id: "aktivity", title: "Výcvik a aktivity", cta: "Výcvik a aktivity", href: "/aktivity", empty: '[data-home-editorial-empty="aktivity"]', emptyLabel: "Ďalší obsah pripravujeme" },
  ] as const;

  for (const item of homepageSections) {
    const root = page.locator(item.root);
    await expect(root, "Homepage section " + item.id + " is missing").toBeVisible();
    await expect(root.getByRole("heading", { name: item.title, exact: true })).toBeVisible();
    const action = root.locator('[data-home-section-cta="' + item.id + '"]').getByRole("link", { name: item.cta, exact: true });
    await expect(action, item.id + ": section CTA is missing or mislabelled").toHaveAttribute("href", item.href);

    const layout = root.locator('[data-home-article-layout="' + item.id + '"]');
    const empty = root.locator(item.empty);
    const layoutCount = await layout.count();
    const emptyCount = await empty.count();
    expect(layoutCount + emptyCount, item.id + ": expected exactly one article layout or empty state").toBe(1);
    if (!layoutCount) {
      await expect(empty, item.id + ": empty state is not visible").toBeVisible();
      await expect(empty).toContainText(item.emptyLabel);
      continue;
    }

    const lead = layout.locator("[data-home-article-lead]");
    await expect(lead, item.id + ": featured article is missing").toHaveCount(1);
    const featured = lead.locator('[data-article-card][data-article-variant="featured"]');
    await expect(featured).toHaveCount(1);
    const leadMeta = featured.locator(".article-card-meta");
    await expect(leadMeta).toBeVisible();
    await expect(leadMeta).not.toContainText(/\b\d+\s*min(?:\s+čítania)?\b/i);
    await expect(featured.locator(".article-card-title a[href]")).toHaveCount(1);
    await expect(featured.locator('.article-card-media img:not([aria-hidden="true"])')).toHaveCount(1);

    const secondary = layout.locator("[data-home-article-secondary]");
    await expect(secondary, item.id + ": compact-article container is missing").toHaveCount(1);
    const articleRows = secondary.locator(".home-latest-item");
    const rowCount = await articleRows.count();
    expect(rowCount, item.id + ": more than four secondary articles rendered").toBeLessThanOrEqual(4);
    const compactRows = articleRows.locator("[data-article-list-item]");
    await expect(compactRows, item.id + ": secondary articles must use the compact list design").toHaveCount(rowCount);
    const media = compactRows.locator("[data-article-image]");
    await expect(media, item.id + ": every compact article needs a photograph").toHaveCount(rowCount);

    if (rowCount) {
      const first = compactRows.first();
      await expect(first.locator("[data-article-title]")).toBeVisible();
      await expect(first.locator("[data-article-topic]")).toBeVisible();
      await expect(first.locator("[data-article-date]")).toBeVisible();
      await expect(first.locator("p")).toHaveCount(0);

      const imagedRows = compactRows.filter({ visible: true }).filter({ has: page.locator("[data-article-image]") });
      for (let index = 0; index < await imagedRows.count(); index += 1) {
        const image = imagedRows.nth(index).locator('[data-article-image] img:not([aria-hidden="true"])');
        await expect(image, item.id + ": compact thumbnail must have exactly one content image").toHaveCount(1);
        await image.scrollIntoViewIfNeeded();
        await expect(image).toBeVisible();
        await expect.poll(
          async () => image.evaluate((element) => {
            const img = element as HTMLImageElement;
            return img.complete ? img.naturalWidth : 0;
          }),
          { message: item.id + ": compact thumbnail failed to load" },
        ).toBeGreaterThan(0);
      }

      const sizes = await media.evaluateAll((elements) => elements.map((element) => {
        const { width, height } = element.getBoundingClientRect();
        return { width, height };
      }));
      expect(sizes.every(({ width, height }) => width >= 60 && height >= 50), item.id + ": collapsed article thumbnails: " + JSON.stringify(sizes)).toBe(true);
      const heights = await compactRows.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
      expect(heights.every((height) => height < 220), item.id + ": oversized compact rows: " + JSON.stringify(heights)).toBe(true);
    }
  }

  for (const id of ["steniatka", "starostlivost", "aktivity"]) {
    await expect(page.locator('[data-home-editorial="' + id + '"] .home-editorial-grid')).toHaveCount(0);
  }

  // Newly added partner banners must remain actionable navigation links, not inert marketing.
  await expect(page.locator('[data-home-banner="profil"]').getByRole("link", { name: "Pridať profil" }))
    .toHaveAttribute("href", "/partner/profily/novy");
  await expect(page.locator('[data-home-banner="podujatie"]').getByRole("link", { name: "Pridať podujatie" }))
    .toHaveAttribute("href", "/partner/podujatia/nove");

  const search = page.getByRole("search").filter({ has: page.locator("#home-search") });
  await search.locator("input[name=q]").fill("labrador");
  await Promise.all([
    page.waitForURL(/\/hladat\?q=labrador/, { waitUntil: "commit" }),
    search.getByRole("button", { name: "Nájsť všetko" }).click(),
  ]);
  await expect(page.locator("h1")).toContainText(/Čo hľadáš\?|Hľadať|Výsledky/i);
  await gotoProductionPage(page, "/");

  // Breed of the day is now in the Šteniatka sidebar, with a valid atlas fallback.
  const breedSidebar = page.locator('[data-home-editorial="steniatka"] .home-magazine-sidebar-block');
  await expect(breedSidebar).toBeVisible();
  const breedLink = breedSidebar.locator("[data-home-breed]");
  if (await breedLink.count()) {
    await expect(breedSidebar.getByRole("heading", { name: "Plemeno dňa" })).toBeVisible();
    await expect(breedLink).toHaveAttribute("href", /^\/plemena\/[^/?#]+$/);
    await expect(breedLink.locator("strong")).not.toHaveText("");
    await expect(breedLink.locator('img:not([aria-hidden="true"])')).toHaveCount(1);
  } else {
    await expect(breedSidebar.getByRole("heading", { name: "Atlas plemien" })).toBeVisible();
    await expect(breedSidebar).toContainText("Spoznaj atlas publikovaných plemien");
  }
  await expect(breedSidebar.getByRole("link", { name: "Prejsť do atlasu" })).toHaveAttribute("href", "/plemena");
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(horizontalOverflow, "Homepage overflows horizontally on " + (await page.evaluate(() => innerWidth)) + "px viewport").toBeLessThanOrEqual(1);
});

test("@production breed listing filters, detail, 404 and comparison work", async ({ page }) => {
  await gotoProductionPage(page, "/plemena");
  await expect(page.locator("h1")).toBeVisible();
  await page.getByPlaceholder("Hľadať plemeno, krajinu alebo FCI skupinu").fill("labrador");
  await expect(page.locator(".breed-card")).toHaveCount(1);
  const detailHref = await firstPublicLink(page, ".breed-grid", /^\/plemena\/(?!vyber-plemena$)[^/?#]+$/);
  await gotoProductionPage(page, detailHref);
  await expect(page.locator("h1")).toBeVisible();
  const missing = await page.goto("/plemena/neexistujuce-plemeno-e2e", { waitUntil: "commit" });
  expect(missing?.status(), "Unknown breed must return HTTP 404").toBe(404);
  await gotoProductionPage(page, "/porovnat-plemena");
  await expect(page.locator("h1")).toContainText(/Dve plemená|Porovnanie plemien/i);
});

test("@production directory listing, veterinarians, profile and filters work", async ({ page }) => {
  await gotoProductionPage(page, "/adresar");
  await expect(page.locator("h1")).toBeVisible();
  await gotoProductionPage(page, "/adresar/veterinari");
  await expect(page.locator("h1")).toContainText("Veterinári");
  const filter = page.locator('form[data-public-search-form="services"]');
  await expect(filter).toBeVisible();
  await filter.locator('input[name="q"]').fill("Nitra");
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/adresar/veterinari" && url.searchParams.get("q") === "Nitra", { waitUntil: "commit" }),
    filter.getByRole("button", { name: "Hľadať", exact: true }).click(),
  ]);
  await expect(page).toHaveURL((url) => url.pathname === "/adresar/veterinari" && url.searchParams.get("q") === "Nitra");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator(".directory-results")).toBeVisible();
  await expect(page.locator('form[data-public-search-form="services"] input[name="q"]')).toHaveValue("Nitra");
  await expect(page.locator(".directory-results [data-directory-card]").first()).toBeVisible();
  await gotoProductionPage(page, "/adresar/veterinari");
  const detailHref = await firstPublicLink(page, ".directory-grid", /^\/adresar\/veterinari\/[^/?#]+$/);
  await gotoProductionPage(page, detailHref);
  await expect(page.locator("h1")).toBeVisible();
});

test("@production events listing, detail and past/upcoming separation work", async ({ page }) => {
  await gotoProductionPage(page, "/podujatia");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator("[data-event-list], [data-event-category-overview]")).toBeVisible();

  // Grid cards wrap their heading inside the detail link, whereas list cards
  // link from the heading. Use the shared card hook and exclude calendar links.
  const eventCards = page.locator("[data-event-list] [data-event-card]");
  const eventLinks = async () => {
    await expect(eventCards.first(), "Event results have no visible cards").toBeVisible();
    return eventCards.locator('a[href^="/podujatia/"]').evaluateAll((links) => [
      ...new Set(links
        .filter((link) => Boolean(link.getClientRects().length))
        .map((link) => link.getAttribute("href"))
        .filter((href): href is string => href !== null && /^\/podujatia\/[^/?#]+$/.test(href))),
    ]);
  };

  const upcomingLinks = await eventLinks();
  expect(upcomingLinks.length, "Upcoming event listing is empty despite the rendered listing").toBeGreaterThan(0);

  const pastFilter = page.getByRole("link", { name: "Ukončené", exact: true }).first();
  await pastFilter.click();
  await expect(page).toHaveURL(/termin=ukoncene/);
  await expect(page.locator("h1")).toBeVisible();

  const pastLinks = await eventLinks();
  expect(pastLinks.length, "Past event listing is empty").toBeGreaterThan(0);
  expect(upcomingLinks.filter((href) => pastLinks.includes(href)).length, "A past event also appears among upcoming events").toBe(0);

  await gotoProductionPage(page, upcomingLinks[0]!);
  await expect(page.locator("h1")).toBeVisible();
});

test("@production help landing and canonical adoption detail work", async ({ page }) => {
  await gotoProductionPage(page, "/pomoc-psom");
  await expect(page.getByRole("heading", { level: 1, name: "Pomoc psom" })).toBeVisible();
  await expect(page.locator("[data-help-category-nav]")).toBeVisible();

  await gotoProductionPage(page, "/pomoc-psom/adopcia");
  await expect(page.getByRole("heading", { level: 1, name: "Psy na adopciu" })).toBeVisible();
  const detailHref = await firstPublicLink(page, "main", /^\/pomoc-psom\/adopcia\/[^/?#]+$/);
  await gotoProductionPage(page, detailHref);
  await expect(page.locator("h1")).toBeVisible();
});

test("@production reviewer auth renders content in repeated fresh contexts and is never shared-cacheable", async ({ browser }, testInfo) => {
  const baseURL = process.env.E2E_BASE_URL ?? "https://psipedia.sk";
  const path = "/recenzia/prihlasenie?returnTo=" + encodeURIComponent(
    "/recenzia/napisat?resourceId=production-reviewer-auth-smoke",
  );

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const context = await browser.newContext({
      baseURL,
      viewport: testInfo.project.name === "mobile-chromium"
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 },
    });
    const freshPage = await context.newPage();
    const response = await freshPage.goto(path, { waitUntil: "commit" });

    expect(response, `reviewer auth attempt ${attempt + 1} has no response`).not.toBeNull();
    expect(response?.status(), `reviewer auth attempt ${attempt + 1}`).toBe(200);
    await expect(freshPage.getByRole("heading", { name: "Najprv overíme váš e-mail" })).toBeVisible();
    await expect(freshPage.getByLabel("E-mail")).toBeVisible();
    await expect(freshPage.locator("form.review-auth-form")).toBeVisible();

    const headers = response!.headers();
    expect(headers["cache-control"] ?? "").toMatch(/private/i);
    expect(headers["cache-control"] ?? "").toMatch(/no-store/i);
    expect(headers["cdn-cache-control"] ?? "no-store").not.toMatch(/public/i);
    expect(headers["cloudflare-cdn-cache-control"] ?? "no-store").not.toMatch(/public/i);
    expect(headers["referrer-policy"] ?? "").toBe("no-referrer");
    expect(headers["x-psipedia-cache"] ?? "").not.toBe("HIT");

    const overflow = await freshPage.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `reviewer auth attempt ${attempt + 1} horizontal overflow`).toBeLessThanOrEqual(1);

    await context.close();
  }
});

test("@production robots and sitemaps are available and valid", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status(), `/robots.txt returned HTTP ${robots.status()}`).toBe(200);
  const robotsText = await robots.text();
  expect(robotsText).toMatch(/User-agent:/i);
  expect(robotsText).toMatch(/Sitemap:\s*https:\/\/psipedia\.sk\/sitemap\.xml/i);

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status(), `/sitemap.xml returned HTTP ${sitemap.status()}`).toBe(200);
  const sitemapText = await sitemap.text();
  expect(sitemapText).toMatch(/<urlset|<sitemapindex/i);

  const locations = [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/gi)]
    .map((match) => match[1]!.replaceAll("&amp;", "&"));
  const uniqueLocations = new Set(locations);
  expect(locations.length, "Production sitemap is empty").toBeGreaterThan(0);
  expect(uniqueLocations.size, "Production sitemap contains duplicate <loc> URLs").toBe(locations.length);
  expect(locations.some((url) => /[?#]/.test(url)), "Production sitemap contains query/hash URLs").toBe(false);
  expect(
    locations.some((url) => /^https:\/\/psipedia\.sk\/(?:admin|api|hladat|oblubene)(?:\/|$)/i.test(url)),
    "Production sitemap contains an internal or noindex route",
  ).toBe(false);

  const pathname = (url: string) => new URL(url).pathname;
  const counts = {
    total: locations.length,
    directoryDetails: locations.filter((url) => /^\/adresar\/[^/]+\/[^/]+$/.test(pathname(url))).length,
    breeds: locations.filter((url) => /^\/plemena\/[^/]+$/.test(pathname(url)) && pathname(url) !== "/plemena/vyber-plemena").length,
    events: locations.filter((url) => /^\/podujatia\/[^/]+$/.test(pathname(url)) && pathname(url) !== "/podujatia/kalendar").length,
    organizations: locations.filter((url) => /^\/organizacie\/[^/]+$/.test(pathname(url))).length,
    adoptions: locations.filter((url) => /^\/pomoc-psom\/adopcia\/[^/]+$/.test(pathname(url))).length,
    lostFound: locations.filter((url) => /^\/pomoc-psom\/(?:stratene-psy|najdene-psy)\/[^/]+$/.test(pathname(url))).length,
  };
  console.log("SEO-2 production sitemap counts", JSON.stringify(counts));

  const news = await request.get("/news-sitemap.xml");
  expect(news.status(), `/news-sitemap.xml returned HTTP ${news.status()}`).toBe(200);
  expect(await news.text(), "/news-sitemap.xml has unexpected content").toMatch(/<urlset/i);
});

test(NO_CONSENT_TEST, async ({ page }) => {
  await page.addInitScript(([key]) => localStorage.removeItem(key), [CONSENT_KEY]);
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Tvoje súkromie na Psipedii" });
  await expect(dialog).toBeVisible();
  await expect(page.locator('script[src*="googletagmanager.com"]')).toHaveCount(0);
  await Promise.all([
    page.waitForURL(/\/plemena$/, { waitUntil: "commit" }),
    page.locator(".home-search-shortcuts").getByRole("link", { name: "Plemená", exact: true }).click(),
  ]);
  await expect(page.locator("h1")).toBeVisible();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Odmietnuť analytiku" }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(([key]) => localStorage.getItem(key), [CONSENT_KEY])).toBe("necessary");
});

test("@production key public pages have no serious axe violations", async ({ page }) => {
  await gotoProductionPage(page, "/");
  await expectAxeClean(page, "Homepage");
  await gotoProductionPage(page, "/plemena");
  await gotoProductionPage(page, await firstPublicLink(page, ".breed-grid", /^\/plemena\/(?!vyber-plemena$)[^/?#]+$/));
  await expectAxeClean(page, "Breed detail");
  await gotoProductionPage(page, "/adresar/veterinari");
  await gotoProductionPage(page, await firstPublicLink(page, ".directory-grid", /^\/adresar\/veterinari\/[^/?#]+$/));
  await expectAxeClean(page, "Directory detail");
  await gotoProductionPage(page, "/podujatia");
  await expectAxeClean(page, "Event listing");
});