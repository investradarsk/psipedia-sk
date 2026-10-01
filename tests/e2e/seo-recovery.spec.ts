import { expect, test, type Page } from "@playwright/test";

const PROD_ORIGIN = "https://psipedia.sk";
const CONSENT_KEY = "psipedia-cookie-consent";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(([key]) => localStorage.setItem(key, "necessary"), [CONSENT_KEY]);
});

async function readSeo(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response, `No response for ${path}`).not.toBeNull();
  expect(response?.status(), `${path} returned HTTP ${response?.status()}`).toBeLessThan(400);
  return {
    canonical: await page.locator('link[rel="canonical"]').getAttribute("href"),
    robots: (await page.locator('meta[name="robots"]').getAttribute("content")) ?? "",
  };
}

async function expectQueryNoindex(page: Page, path: string, cleanCanonical: string) {
  const seo = await readSeo(page, path);
  expect(seo.canonical).toBe(`${PROD_ORIGIN}${cleanCanonical}`);
  expect(seo.robots.toLocaleLowerCase()).toContain("noindex");
  expect(seo.robots.toLocaleLowerCase()).toContain("follow");
}

test("clean listing and directory pagination preserve indexable canonical discovery", async ({ page }) => {
  const clean = await readSeo(page, "/adresar/veterinari");
  expect(clean.canonical).toBe(`${PROD_ORIGIN}/adresar/veterinari`);
  expect(clean.robots.toLocaleLowerCase()).not.toContain("noindex");
  expect(clean.robots.toLocaleLowerCase()).toContain("follow");

  const paginated = await readSeo(page, "/adresar/veterinari?page=2");
  expect(paginated.canonical).toBe(`${PROD_ORIGIN}/adresar/veterinari?page=2`);
  expect(paginated.robots.toLocaleLowerCase()).not.toContain("noindex");
  expect(paginated.robots.toLocaleLowerCase()).toContain("follow");
});

test("filter, search and sort state is noindex/follow with a clean canonical", async ({ page }) => {
  await expectQueryNoindex(page, "/adresar/veterinari?region=Nitriansky+kraj", "/adresar/veterinari");
  await expectQueryNoindex(page, "/adresar/veterinari?page=2&sort=name-asc", "/adresar/veterinari");
  await expectQueryNoindex(page, "/clanky?hladat=labrador", "/clanky");
  await expectQueryNoindex(page, "/podujatia?termin=vsetky", "/podujatia");
  await expectQueryNoindex(page, "/plemena?fciGroup=8", "/plemena");
  await expectQueryNoindex(page, "/recenzie?typ=produkty", "/recenzie");
  await expectQueryNoindex(page, "/pomoc-psom/adopcia?kraj=Nitriansky+kraj", "/pomoc-psom/adopcia");
  await expectQueryNoindex(page, "/pomoc-psom/stratene-psy?region=Nitriansky+kraj", "/pomoc-psom/stratene-psy");
  await expectQueryNoindex(page, "/pomoc-psom/najdene-psy?q=labrador", "/pomoc-psom/najdene-psy");
  await expectQueryNoindex(page, "/mapa?category=services&region=Nitriansky+kraj", "/mapa");
});

test("event type landing has canonical listing schema and filtered variant does not", async ({ page }) => {
  const clean = await readSeo(page, "/podujatia/vystavy");
  expect(clean.canonical).toBe(`${PROD_ORIGIN}/podujatia/vystavy`);
  expect(clean.robots.toLocaleLowerCase()).not.toContain("noindex");

  const graphTypes = await page.locator('script[type="application/ld+json"]').evaluateAll((scripts) =>
    scripts.flatMap((script) => {
      try {
        const parsed = JSON.parse(script.textContent || "{}");
        const graph = Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed];
        return graph.map((item: { "@type"?: string }) => item?.["@type"]).filter(Boolean);
      } catch {
        return [];
      }
    }),
  );
  expect(graphTypes).toContain("CollectionPage");
  expect(graphTypes).toContain("ItemList");
  expect(graphTypes).toContain("BreadcrumbList");
  expect(graphTypes).not.toContain("Event");

  await expectQueryNoindex(page, "/podujatia/vystavy?termin=vsetky", "/podujatia/vystavy");
  const filteredTypes = await page.locator('script[type="application/ld+json"]').evaluateAll((scripts) =>
    scripts.flatMap((script) => {
      try {
        const parsed = JSON.parse(script.textContent || "{}");
        const graph = Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed];
        return graph.map((item: { "@type"?: string }) => item?.["@type"]).filter(Boolean);
      } catch {
        return [];
      }
    }),
  );
  expect(filteredTypes).not.toContain("CollectionPage");
});

test("topic landing uses canonical social metadata contract", async ({ page }) => {
  const seo = await readSeo(page, "/tema/vycvik");
  expect(seo.canonical).toBe(`${PROD_ORIGIN}/tema/vycvik`);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", `${PROD_ORIGIN}/tema/vycvik`);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
});

test("sitemap is production-shaped and contains only clean unique canonical URLs", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"] ?? "").toContain("xml");
  const xml = await response.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  expect(urls.length).toBeGreaterThan(1000);
  expect(new Set(urls).size).toBe(urls.length);
  for (const url of urls) {
    expect(url).not.toContain("?");
    expect(url).not.toContain("#");
    const parsed = new URL(url);
    expect(parsed.origin).toBe(PROD_ORIGIN);
    expect(parsed.pathname).not.toMatch(/^\/(?:admin|api|hladat|oblubene)(?:\/|$)/);
  }
  for (const redirectSource of [
    `${PROD_ORIGIN}/novinky`,
    `${PROD_ORIGIN}/adresar/psie-skoly`,
    `${PROD_ORIGIN}/podujatia/kalendar`,
    `${PROD_ORIGIN}/recenzie/vybava`,
  ]) {
    expect(urls).not.toContain(redirectSource);
  }
});
