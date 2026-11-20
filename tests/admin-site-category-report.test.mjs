import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  summarizeSiteCategoryPageviews,
  emptySiteCategoryReport,
} from "../lib/admin-site-category-report.ts";
import { isSafeSiteAnalyticsPath } from "../lib/site-analytics-public.ts";

const pages = [
  { path: "/novinky/novy-vyskum", views: 8 },
  { path: "/novinky/veda-a-zdravie", views: 4 },
  { path: "/starostlivost/trening", views: 5 },
  { path: "/adresar/veterinari/klinika", views: 6 },
  { path: "/adresar/veterinari", views: 2 },
  { path: "/adresar/veterinari/zmazany-profil", views: 16 },
  { path: "/podujatia/skuska", views: 3 },
  { path: "/podujatia/seminare", views: 2 },
  { path: "/pomoc-psom/adopcia/neo", views: 7 },
  { path: "/pomoc-psom/adopcia/neexistujuci-pes", views: 20 },
  { path: "/pomoc-psom/stratene-psy/ben", views: 4 },
  { path: "/organizacie/utulok", views: 5 },
  { path: "/plemena/retrievery-sliedice-vodne/labradorsky-retriever", views: 11 },
  { path: "/plemena/retrievery-sliedice-vodne/neexistujuce-plemeno-e2e", views: 30 },
  { path: "/plemena", views: 3 },
  { path: "/som-na-stranke-404", views: 9 },
  { path: "/", views: 100 },
];

function report() {
  return summarizeSiteCategoryPageviews({
    window: "7d",
    pages,
    articles: [
      { slug: "novy-vyskum", title: "Nový výskum", portal_section: "novinky", news_category: "veda-a-zdravie" },
      { slug: "trening", title: "Tréning", portal_section: "starostlivost", news_category: null },
    ],
    profiles: [
      { slug: "klinika", name: "Klinika", category: "veterinari" },
    ],
    events: [{ slug: "skuska", title: "Skúška", event_type: "Seminár" }],
    breeds: [
      { slug: "labradorsky-retriever", name: "Labradorský retriever", fci_group: 8 },
      { slug: "boston-terier", name: "Bostonský teriér", fci_group: 9 },
    ],
    helpPaths: [
      "/pomoc-psom/adopcia/neo",
      "/pomoc-psom/stratene-psy/ben",
      "/organizacie/utulok",
    ],
  });
}

test("canonical category totals count only published detail paths, never listings or 404s", () => {
  const result = report();
  assert.equal(result.available, true);
  assert.equal(result.totalArticles, 13);
  assert.equal(result.totalProfiles, 6);
  assert.equal(result.totalEvents, 3);
  assert.equal(result.totalHelp, 16);
  assert.equal(result.totalBreeds, 11);
  assert.equal(result.breedAtlasViews, 3);
  assert.equal(result.directory.find((row) => row.key === "veterinari")?.landingViews, 2);
  assert.equal(result.events.find((row) => row.key === "Seminár")?.landingViews, 2);
  assert.equal(result.news.find((row) => row.key === "veda-a-zdravie")?.views, 8);
  assert.equal(result.news.find((row) => row.key === "veda-a-zdravie")?.landingViews, 4);
});

test("profiles show openings even without 10-second consent-based qualified reads", () => {
  const result = report();
  assert.deepEqual(result.profileTop.map(({ name, views }) => [name, views]), [["Klinika", 6]]);
  assert.equal(result.articles.find((item) => item.key === "novinky")?.views, 8);
  assert.equal(result.help.find((item) => item.key === "stratene-a-najdene")?.views, 4);
  assert.equal(result.help.find((item) => item.key === "utulky")?.views, 5);
});

test("all published canonical breed entries appear including the zero-view ones", () => {
  const result = report();
  assert.equal(result.breeds.length, 2);
  assert.deepEqual(result.breeds.map(({ name, views }) => [name, views]), [
    ["Labradorský retriever", 11],
    ["Bostonský teriér", 0],
  ]);
  assert.ok(result.breeds[0].href.startsWith("/plemena/retrievery-sliedice-vodne/"));
  assert.equal(result.breeds.some(({ href }) => href.includes("e2e")), false);
});

test("invalid analytics input remains unavailable, never an invented zero", () => {
  const empty = emptySiteCategoryReport("30d");
  assert.equal(empty.available, false);
  assert.equal(empty.totalProfiles, null);
  assert.deepEqual(empty.breeds, []);
});

test("E2E URL fixtures are rejected by the existing server path guard", () => {
  assert.equal(isSafeSiteAnalyticsPath("/plemena/retrievery-sliedice-vodne/neexistujuce-plemeno-e2e"), false);
  assert.equal(isSafeSiteAnalyticsPath("/podujatia/skuska-e2e"), false);
  assert.equal(isSafeSiteAnalyticsPath("/plemena/retrievery-sliedice-vodne/labradorsky-retriever"), true);
});

test("tracker does not issue pageview requests on site 404s or webdriver-based E2E", () => {
  const tracker = readFileSync("components/site-analytics-tracker.tsx", "utf8");
  const notFound = readFileSync("app/not-found.tsx", "utf8");
  assert.match(tracker, /navigator\.webdriver === true/);
  assert.match(tracker, /document\.querySelector\("\[data-psipedia-not-found\]"\)/);
  assert.match(notFound, /data-psipedia-not-found/);
  assert.match(tracker, /JSON\.stringify\(\{ path: pathname \}\)/);
  assert.doesNotMatch(tracker, /localStorage|sessionStorage|document\.cookie|document\.referrer/);
});

test("categorical analytics is read-only and does not add migrations, tokens or visitor tracking", () => {
  const sql = readFileSync("lib/admin-site-category-report.ts", "utf8");
  const ui = readFileSync("components/admin-site-category-panel.tsx", "utf8");
  assert.match(sql, /site_analytics_pages_hourly/);
  assert.match(sql, /canonicalBreedIdsForRead/);
  assert.match(sql, /status = 'published'/);
  assert.match(sql, /helpPaths/);
  assert.doesNotMatch(sql, /INSERT INTO|UPDATE site_analytics|DELETE FROM|cookie|uniqueVisitors|sessionId/);
  assert.match(ui, /Otvorenia obsahu podľa kategórií/);
  assert.match(ui, /AdminBreedViewsTable/);
});
