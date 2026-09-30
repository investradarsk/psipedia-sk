import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("NEWS-LANDING-1 keeps /clanky as the single public news landing", () => {
  const landing = read("app/clanky/page.tsx");
  const sectionRoot = read("app/[section]/page.tsx");
  const navigation = read("lib/navigation.ts");
  const navigationStore = read("lib/navigation-store.ts");
  const header = read("components/site-header.tsx");
  const footer = read("components/site-footer.tsx");

  assert.match(landing, /title: "Novinky zo sveta psov"/);
  assert.match(landing, /<h1>Novinky zo sveta psov<\/h1>/);
  assert.match(sectionRoot, /if \(slug === "novinky"\) permanentRedirect\("\/clanky"\)/);
  assert.match(navigation, /id: "novinky", label: "Novinky", href: "\/clanky"/);
  assert.match(navigationStore, /item\.href === "\/novinky"/);
  assert.match(navigationStore, /href: "\/clanky"/);
  assert.doesNotMatch(navigationStore, /Novinky zo sveta psov/);
  assert.match(header, /item\.id === "novinky" && slug === "clanky" \? "novinky" : slug/);
  assert.match(footer, /href="\/clanky">Novinky<\/Link>/);
  assert.doesNotMatch(footer, /href="\/novinky">Novinky/);
});

test("NEWS-LANDING-1 excludes only the legacy root from the sitemap", () => {
  const sitemapSeo = read("lib/sitemap-seo.ts");
  const sitemap = read("app/sitemap.ts");

  assert.match(sitemapSeo, /"\/novinky"/);
  assert.match(sitemap, /const sectionPath = `\/\$\{section\.slug\}`/);
  assert.match(sitemap, /SITEMAP_REDIRECT_SOURCES\.has\(sectionPath\)/);
  assert.match(sitemap, /portalSubpageHref\(section, subpage\)/);
});
