import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { assertValidSitemap, isSelfCanonical, latestModified, sitemapEntry, SITEMAP_REDIRECT_SOURCES } from "../lib/sitemap-seo.ts";

test("lastModified uses the latest real timestamp and omits unknown dates", () => {
  assert.equal(latestModified(["2026-08-17", "2026-09-07T12:30:00Z"])?.toISOString(), "2026-09-07T12:30:00.000Z");
  assert.equal(latestModified([undefined, "", "not-a-date"]), undefined);
  assert.equal("lastModified" in sitemapEntry("/sukromie", { changeFrequency: "monthly", priority: 0.5 }), false);
});

test("only indexable self-canonical content is eligible for sitemap", () => {
  assert.equal(isSelfCanonical(undefined, "/plemena/labradorsky-retriever"), true);
  assert.equal(isSelfCanonical({ canonicalUrl: "https://psipedia.sk/plemena/labradorsky-retriever" }, "/plemena/labradorsky-retriever"), true);
  assert.equal(isSelfCanonical({ noindex: true }, "/plemena/labradorsky-retriever"), false);
  assert.equal(isSelfCanonical({ canonicalUrl: "https://psipedia.sk/plemena/labrador" }, "/plemena/labradorsky-retriever"), false);
});

test("sitemap QA rejects duplicates, parameters, internal paths and redirect sources", () => {
  const entry = (path) => ({ url: `https://psipedia.sk${path}` });
  assert.throws(() => assertValidSitemap([entry("/plemena"), entry("/plemena")]), /sitemap-duplicate-url/);
  assert.throws(() => assertValidSitemap([entry("/plemena?fciGroup=1")]), /sitemap-parametric-url/);
  assert.throws(() => assertValidSitemap([entry("/admin")]), /sitemap-internal-url/);
  assert.throws(() => assertValidSitemap([entry("/adresar/psie-skoly")]), /sitemap-redirect-source/);
});

test("legacy activity training URL redirects directly to the canonical managed topic", () => {
  const legacyPath = "/aktivity/-vycvik-a-aktivity-trening";
  const targetPath = "/aktivity/trening";
  const route = fs.readFileSync(new URL("../app/aktivity/-vycvik-a-aktivity-trening/route.ts", import.meta.url), "utf8");
  const portal = fs.readFileSync(new URL("../lib/portal.ts", import.meta.url), "utf8");
  const portalPage = fs.readFileSync(new URL("../app/[section]/[slug]/page.tsx", import.meta.url), "utf8");

  assert.match(route, /NextResponse\.redirect\(new URL\("\/aktivity\/trening", request\.url\), 301\)/);
  assert.equal(SITEMAP_REDIRECT_SOURCES.has(legacyPath), true);
  assert.equal(SITEMAP_REDIRECT_SOURCES.has(targetPath), false);
  assert.match(portal, /slug:\s*"trening",\s*label:\s*"Tréning"/);
  assert.doesNotMatch(portal, /-vycvik-a-aktivity-trening/);
  assert.match(portalPage, /path:\s*`\/\$\{portalTopic\.section\.slug\}\/\$\{portalTopic\.subpage\.slug\}`/);
  assert.match(portalPage, /if \(portalTopic\) return <PortalTopic/);
});

test("generated sitemap uses canonical public sources and no hardcoded fake dates", () => {
  const source = fs.readFileSync(new URL("../app/sitemap.ts", import.meta.url), "utf8");
  assert.match(source, /listPublishedCanonicalBreedIndex/);
  assert.match(source, /isSelfCanonical/);
  assert.match(source, /assertValidSitemap/);
  assert.doesNotMatch(source, /new Date\(["']2026-08-(?:17|29)["']\)/);
  assert.doesNotMatch(source, /resolvedCanonical/);
});

test("filtered listings keep a clean base canonical", () => {
  const breeds = fs.readFileSync(new URL("../app/plemena/page.tsx", import.meta.url), "utf8");
  const directory = fs.readFileSync(new URL("../app/adresar/page.tsx", import.meta.url), "utf8");
  const directoryCategory = fs.readFileSync(new URL("../app/adresar/[category]/page.tsx", import.meta.url), "utf8");
  assert.match(breeds, /path:\s*["']\/plemena["']/);
  assert.match(directory, /path:\s*["']\/adresar["']/);
  assert.match(directoryCategory, /path:\s*`\/adresar\/\$\{category\.slug\}`/);
});

test("canonical repair migration fixes only the confirmed broken canonical targets and is idempotent", () => {
  const database = new DatabaseSync(":memory:");
  database.exec("CREATE TABLE managed_articles (slug TEXT PRIMARY KEY, canonical_url TEXT NOT NULL, updated_at TEXT, updated_by TEXT); CREATE TABLE managed_events (slug TEXT PRIMARY KEY, seo_json TEXT NOT NULL, updated_at TEXT, updated_by TEXT);");
  const articles = [
    ["prosba-aby-dal-psa-na-vodzku-mala-skoncit-bitkou-incident-v", "https://psipedia.sk/novinky/spor-pes-vodzka-mala-fatra-pravidla"],
    ["zakladny-vycvik-psat", "https://psipedia.sk/aktivity/zakladny-vycvik-psa"],
    ["banska-bystrica-riesi-nove-pravidla-pre-psov-majitelia-sa-py", "https://psipedia.sk/novinky/banska-bystrica-nove-pravidla-psy-vencoviska"],
    ["psi-talent-2026-galanta", "https://psipedia.sk/novinky/psi-talent-2026-galanta"],
  ];
  const events = [
    ["psi-talent-2026", "https://psipedia.sk/podujatia/psi-talent-2026-galanta-hody"],
    ["specialna-vystava-slovenskeho-novofundlandskeho-klubu-2026-cac", "https://psipedia.sk/podujatia/specialna-vystava-slovenskeho-novofundlandskeho-klubu-2026"],
  ];
  for (const [slug, canonicalUrl] of articles) database.prepare("INSERT INTO managed_articles VALUES (?, ?, NULL, NULL)").run(slug, canonicalUrl);
  for (const [slug, canonicalUrl] of events) database.prepare("INSERT INTO managed_events VALUES (?, ?, NULL, NULL)").run(slug, JSON.stringify({ canonicalUrl }));
  database.prepare("INSERT INTO managed_articles VALUES (?, ?, NULL, NULL)").run("untouched", "https://psipedia.sk/clanky/untouched");
  const migrations = ["0025_repair_broken_content_canonicals.sql", "0026_repair_article_canonical_columns.sql", "0027_repair_event_cross_canonical.sql", "0028_repair_article_event_canonical.sql"]
    .map((name) => fs.readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8"));
  for (const migration of migrations) database.exec(migration);
  for (const migration of migrations) database.exec(migration);
  const repairedArticles = database.prepare("SELECT slug, canonical_url canonical FROM managed_articles ORDER BY slug").all();
  const repairedEvents = database.prepare("SELECT slug, json_extract(seo_json, '$.canonicalUrl') canonical FROM managed_events ORDER BY slug").all();
  assert.equal(repairedArticles.find((row) => row.slug === "untouched").canonical, "https://psipedia.sk/clanky/untouched");
  for (const row of repairedArticles.filter((item) => item.slug !== "untouched")) {
    assert.ok(row.canonical.endsWith(`/${row.slug}`));
  }
  for (const row of repairedEvents) assert.ok(row.canonical.endsWith(`/${row.slug}`));
  database.close();
});
