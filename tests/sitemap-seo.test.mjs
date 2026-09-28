import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { eventDateTimeIso } from "../lib/events.ts";
import {
  buildPublishedDirectorySitemapPageQuery,
  listPublishedDirectorySitemapRecords,
} from "../lib/directory-sitemap.ts";
import {
  buildPublishedArticleSitemapPageQuery,
  buildPublishedEventSitemapPageQuery,
  buildPublishedHelpSitemapPageQuery,
  listPublishedArticleSitemapRecords,
  listPublishedEventSitemapRecords,
  listPublishedHelpSitemapRecords,
} from "../lib/entity-sitemap.ts";
import { articleAuthorJsonLd, serializeJsonLd } from "../lib/seo.ts";
import { assertSitemapEntityParity, inspectSitemapEntityParity } from "../lib/sitemap-parity.ts";
import {
  assertValidSitemap,
  isNewsSitemapEligibleDate,
  isSelfCanonical,
  latestModified,
  NEWS_SITEMAP_WINDOW_MS,
  sitemapEntry,
  SITEMAP_REDIRECT_SOURCES,
} from "../lib/sitemap-seo.ts";
import {
  loadSitemapStages,
  SITEMAP_MAX_D1_CONCURRENCY,
  SitemapStageError,
} from "../lib/sitemap-runtime.ts";
import { withAvailableBreedImages } from "../lib/breed-image.ts";

test("lastModified uses the latest real timestamp and omits unknown dates", () => {
  assert.equal(latestModified(["2026-08-17", "2026-09-07T12:30:00Z"])?.toISOString(), "2026-09-07T12:30:00.000Z");
  assert.equal(latestModified([undefined, "", "not-a-date"]), undefined);
  assert.equal("lastModified" in sitemapEntry("/sukromie", { changeFrequency: "monthly", priority: 0.5 }), false);
});

test("article JSON-LD distinguishes a named person from the Psipedia editorial organization", () => {
  assert.deepEqual(articleAuthorJsonLd("Martin"), { "@type": "Person", name: "Martin" });
  assert.deepEqual(articleAuthorJsonLd("Redakcia Psipedia"), {
    "@type": "Organization",
    "@id": "https://psipedia.sk/#organization",
    name: "Redakcia Psipedia",
    url: "https://psipedia.sk",
  });
  assert.deepEqual(JSON.parse(serializeJsonLd({ author: articleAuthorJsonLd("Martin") })), {
    author: { "@type": "Person", name: "Martin" },
  });

  const detail = fs.readFileSync(new URL("../components/article-detail.tsx", import.meta.url), "utf8");
  assert.match(detail, /const authorName = authorProfile\?\.displayName \|\| article\.author/);
  assert.match(detail, /author:\s*articleAuthorJsonLd\(authorName\)/);
  assert.doesNotMatch(detail, /author:\s*\{\s*"@type":\s*"Organization",\s*name:\s*article\.author/s);
  assert.equal((detail.match(/application\/ld\+json/g) ?? []).length, 1);
});

test("Event JSON-LD keeps a known Bratislava time and DST offset", () => {
  assert.equal(eventDateTimeIso("2026-09-16", "18:00"), "2026-09-16T18:00:00+02:00");
  const eventPage = fs.readFileSync(new URL("../app/[section]/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(eventPage, /startDate:\s*eventDateTimeIso\(event\.startDate, event\.startTime\)/);
  assert.match(eventPage, /endDate:\s*event\.endDate\s*\?\s*eventDateTimeIso\(event\.endDate, event\.endTime\)/);
});

test("News sitemap admits only publication dates from the last two days", () => {
  const now = Date.parse("2026-09-16T12:00:00.000Z");
  assert.equal(isNewsSitemapEligibleDate(new Date(now - NEWS_SITEMAP_WINDOW_MS), now), true);
  assert.equal(isNewsSitemapEligibleDate(new Date(now - NEWS_SITEMAP_WINDOW_MS - 1), now), false);
  assert.equal(isNewsSitemapEligibleDate(new Date(now + 1), now), false);
  assert.equal(isNewsSitemapEligibleDate("not-a-date", now), false);

  const route = fs.readFileSync(new URL("../app/news-sitemap.xml/route.ts", import.meta.url), "utf8");
  assert.match(route, /isNewsSitemapEligibleDate\(published, now\)/);
  for (const requiredTag of ["<news:news>", "<news:publication>", "<news:name>", "<news:language>sk</news:language>", "<news:publication_date>", "<news:title>"]) {
    assert.ok(route.includes(requiredTag), `News sitemap musí obsahovať ${requiredTag}`);
  }
  assert.doesNotMatch(route, /newsMetadata\s*=|:\s*"";\s*\n\s*return `\n\s*<url>/s);
});

test("only indexable self-canonical content is eligible for sitemap", () => {
  assert.equal(isSelfCanonical(undefined, "/plemena/labradorsky-retriever"), true);
  assert.equal(isSelfCanonical({ canonicalUrl: "https://psipedia.sk/plemena/labradorsky-retriever" }, "/plemena/labradorsky-retriever"), true);
  assert.equal(isSelfCanonical({ noindex: true }, "/plemena/labradorsky-retriever"), false);
  assert.equal(isSelfCanonical({ canonicalUrl: "https://psipedia.sk/plemena/labrador" }, "/plemena/labradorsky-retriever"), false);
});

test("invalid and external canonical URLs are not self-canonical", () => {
  const path = "/starostlivost/test-canonical";
  assert.equal(isSelfCanonical({ canonicalUrl: "not a valid absolute canonical" }, path), false);
  assert.equal(isSelfCanonical({ canonicalUrl: "https://example.com/starostlivost/test-canonical" }, path), false);
  assert.equal(isSelfCanonical({ canonicalUrl: "http://psipedia.sk/starostlivost/test-canonical" }, path), false);
});

test("global sitemap validation catches a cross-entity URL collision", () => {
  const landingEntry = { url: "https://psipedia.sk/podujatia/example" };
  const entityEntry = { url: "https://psipedia.sk/podujatia/example" };
  assert.throws(
    () => assertValidSitemap([landingEntry, entityEntry]),
    /sitemap-duplicate-url:https:\/\/psipedia\.sk\/podujatia\/example/,
  );
});

test("sitemap QA rejects duplicates, parameters, internal paths and redirect sources", () => {
  const entry = (path) => ({ url: `https://psipedia.sk${path}` });
  assert.throws(() => assertValidSitemap([entry("/plemena"), entry("/plemena")]), /sitemap-duplicate-url/);
  assert.throws(() => assertValidSitemap([entry("/plemena?fciGroup=1")]), /sitemap-parametric-url/);
  assert.throws(() => assertValidSitemap([entry("/admin")]), /sitemap-internal-url/);
  assert.throws(() => assertValidSitemap([entry("/adresar/psie-skoly")]), /sitemap-redirect-source/);
});

test("redirect-source ownership wins over implicit self-canonical sitemap eligibility", () => {
  const altheaPath = "/adresar/veterinari/veterinarna-poliklinka-althea";
  assert.equal(isSelfCanonical(undefined, altheaPath), true);
  assert.equal(SITEMAP_REDIRECT_SOURCES.has(altheaPath), true);
  assert.throws(
    () => assertValidSitemap([{ url: `https://psipedia.sk${altheaPath}` }]),
    /sitemap-redirect-source/,
  );
});

test("sitemap builders exclude redirect-source details before parity and global validation", () => {
  const source = fs.readFileSync(new URL("../app/sitemap.ts", import.meta.url), "utf8");
  const articleStart = source.indexOf('const articleEntries');
  const eventStart = source.indexOf('const eventEntries');
  const directoryStart = source.indexOf('const directoryCandidates');
  const helpStart = source.indexOf('const helpCandidates');
  const articleBlock = source.slice(articleStart, eventStart);
  const eventBlock = source.slice(eventStart, directoryStart);
  const directoryBlock = source.slice(directoryStart, helpStart);

  assert.match(articleBlock, /!SITEMAP_REDIRECT_SOURCES\.has\(path\)/);
  assert.match(articleBlock, /redirectSource \? "redirect-source"/);
  assert.match(eventBlock, /!SITEMAP_REDIRECT_SOURCES\.has\(path\)/);
  assert.match(eventBlock, /redirectSource \? "redirect-source"/);
  assert.match(directoryBlock, /SITEMAP_REDIRECT_SOURCES\.has\(path!\)/);
  assert.match(directoryBlock, /!legacyRedirect && !redirectSource/);
  assert.match(directoryBlock, /legacyRedirect \|\| redirectSource/);
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

test("directory sitemap reader is lightweight, cursor-batched and not capped at 500 or 1000", async () => {
  const query = buildPublishedDirectorySitemapPageQuery(0, 500);
  assert.equal(query.batchSize, 500);
  assert.match(query.sql, /id > \?/);
  assert.match(query.sql, /ORDER BY id ASC/);
  assert.match(query.sql, /status = 'published'/);
  assert.match(query.sql, /archived_at IS NULL/);
  assert.doesNotMatch(query.sql, /description|services_json|qualifications_json|source_data_json|verified|featured/i);

  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE directory_profiles (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT,
      seo_json TEXT NOT NULL DEFAULT '{}',
      archived_at TEXT
    );
    BEGIN;
  `);
  const insert = database.prepare(
    "INSERT INTO directory_profiles (id,slug,category,status,updated_at,seo_json,archived_at) VALUES (?,?,?,?,?,?,?)",
  );
  for (let id = 1; id <= 1205; id += 1) {
    insert.run(
      id,
      `profil-${id}`,
      "veterinari",
      "published",
      `2026-09-${String((id % 27) + 1).padStart(2, "0")}T10:00:00.000Z`,
      id === 1205
        ? JSON.stringify({ canonicalUrl: "https://psipedia.sk/adresar/veterinari/profil-1205", noindex: false })
        : "{}",
      null,
    );
  }
  insert.run(1206, "draft", "veterinari", "draft", "2026-09-28T10:00:00.000Z", "{}", null);
  insert.run(1207, "archived", "veterinari", "published", "2026-09-28T10:00:00.000Z", "{}", "2026-09-28T11:00:00.000Z");
  database.exec("COMMIT;");

  let queryCount = 0;
  const d1 = {
    prepare(sql) {
      queryCount += 1;
      return {
        bind(...bindings) {
          return {
            async all() {
              return { results: database.prepare(sql).all(...bindings) };
            },
          };
        },
      };
    },
  };

  const records = await listPublishedDirectorySitemapRecords(d1, { batchSize: 500 });
  assert.equal(records.length, 1205);
  assert.equal(queryCount, 3);
  assert.deepEqual(records.slice(0, 2).map((item) => item.id), [1, 2]);
  assert.equal(records.at(-1).id, 1205);
  assert.equal(records.some((item) => item.slug === "draft"), false);
  assert.equal(records.some((item) => item.slug === "archived"), false);
  assert.equal(records.at(-1).seo.canonicalUrl, "https://psipedia.sk/adresar/veterinari/profil-1205");
});

test("article, event and Help sitemap readers remain complete beyond 1000 rows", async () => {
  const articleQuery = buildPublishedArticleSitemapPageQuery(0, 500, "2026-09-28T12:00:00.000Z");
  const eventQuery = buildPublishedEventSitemapPageQuery(0, 500);
  const helpQuery = buildPublishedHelpSitemapPageQuery(0, 500);
  for (const query of [articleQuery, eventQuery, helpQuery]) {
    assert.match(query.sql, /id > \?/);
    assert.match(query.sql, /ORDER BY id ASC/);
    assert.doesNotMatch(query.sql, /description|excerpt|services_json|practical_info|source_data_json/i);
  }

  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE managed_articles (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL,
      portal_section TEXT NOT NULL,
      portal_subpage TEXT,
      category TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT,
      published_at TEXT,
      image_url TEXT,
      canonical_url TEXT NOT NULL DEFAULT '',
      noindex INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE managed_events (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT,
      image_url TEXT,
      seo_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE help_cases (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT,
      image_url TEXT,
      seo_json TEXT NOT NULL DEFAULT '{}'
    );
    BEGIN;
  `);
  const articleInsert = database.prepare(
    "INSERT INTO managed_articles (id,slug,portal_section,portal_subpage,category,status,updated_at,published_at,image_url,canonical_url,noindex) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
  );
  const eventInsert = database.prepare(
    "INSERT INTO managed_events (id,slug,status,updated_at,image_url,seo_json) VALUES (?,?,?,?,?,?)",
  );
  const helpInsert = database.prepare(
    "INSERT INTO help_cases (id,slug,category,status,updated_at,image_url,seo_json) VALUES (?,?,?,?,?,?,?)",
  );
  for (let id = 1; id <= 1205; id += 1) {
    const updated = `2026-09-${String((id % 27) + 1).padStart(2, "0")}T10:00:00.000Z`;
    articleInsert.run(id, `article-${id}`, "starostlivost", "zdravie", "Zdravie", "published", updated, updated, null, "", 0);
    eventInsert.run(id, `event-${id}`, "published", updated, null, "{}");
    helpInsert.run(id, `help-${id}`, "docasna-opatera", "published", updated, null, "{}");
  }
  articleInsert.run(1206, "draft-article", "clanky", null, "Výcvik", "draft", null, null, null, "", 0);
  eventInsert.run(1206, "draft-event", "draft", null, null, "{}");
  helpInsert.run(1206, "draft-help", "zbierky", "draft", null, null, "{}");
  database.exec("COMMIT;");

  let queryCount = 0;
  const d1 = {
    prepare(sql) {
      queryCount += 1;
      return {
        bind(...bindings) {
          return { async all() { return { results: database.prepare(sql).all(...bindings) }; } };
        },
      };
    },
  };

  const [articles, events, help] = await Promise.all([
    listPublishedArticleSitemapRecords(d1, { batchSize: 500, nowIso: "2026-09-28T12:00:00.000Z" }),
    listPublishedEventSitemapRecords(d1, { batchSize: 500 }),
    listPublishedHelpSitemapRecords(d1, { batchSize: 500 }),
  ]);
  assert.equal(articles.length, 1205);
  assert.equal(events.length, 1205);
  assert.equal(help.length, 1205);
  assert.equal(queryCount, 9);
  assert.equal(articles.at(-1).portalSubpage, "zdravie");
  assert.equal(articles.at(-1).category, "Zdravie");
  assert.equal(help.at(-1).category, "docasna-opatera");
  assert.equal(articles.some((item) => item.slug === "draft-article"), false);
  assert.equal(events.some((item) => item.slug === "draft-event"), false);
  assert.equal(help.some((item) => item.slug === "draft-help"), false);
  database.close();
});

test("sitemap entity parity exposes duplicates, missing slugs and invalid statuses", () => {
  const clean = [
    { slug: "a", url: "https://psipedia.sk/a", indexable: true, validStatus: true },
    { slug: "legacy", url: "https://psipedia.sk/legacy", indexable: false, validStatus: true, exclusionReason: "redirect-source" },
  ];
  const report = inspectSitemapEntityParity("test", clean, ["https://psipedia.sk/a"]);
  assert.equal(report.indexableCanonicalCount, 1);
  assert.equal(report.sitemapUrlCount, 1);
  assert.equal(report.unexplainedExclusionCount, 0);
  assert.doesNotThrow(() => assertSitemapEntityParity("test", clean, ["https://psipedia.sk/a"]));

  assert.throws(
    () => assertSitemapEntityParity("duplicates", [
      { slug: "a", url: "https://psipedia.sk/a", indexable: true, validStatus: true },
      { slug: "b", url: "https://psipedia.sk/b", indexable: true, validStatus: true },
    ], ["https://psipedia.sk/a", "https://psipedia.sk/a"]),
    /sitemap-parity:duplicates/,
  );
  assert.throws(
    () => assertSitemapEntityParity("missing-slug", [
      { slug: "", url: null, indexable: true, validStatus: true },
    ], []),
    /missingSlugCount/,
  );
  assert.throws(
    () => assertSitemapEntityParity("invalid-status", [
      { slug: "draft", url: "https://psipedia.sk/draft", indexable: true, validStatus: false },
    ], []),
    /invalidStatusCount/,
  );
  assert.throws(
    () => assertSitemapEntityParity("unexplained", [
      { slug: "hidden", url: "https://psipedia.sk/hidden", indexable: false, validStatus: true },
    ], []),
    /unexplainedExclusionCount/,
  );
});

test("internal and utility routes keep explicit noindex contracts", () => {
  const admin = fs.readFileSync(new URL("../app/admin/layout.tsx", import.meta.url), "utf8");
  const partner = fs.readFileSync(new URL("../app/partner/layout.tsx", import.meta.url), "utf8");
  const reviewer = fs.readFileSync(new URL("../app/recenzia/layout.tsx", import.meta.url), "utf8");
  const search = fs.readFileSync(new URL("../app/hladat/page.tsx", import.meta.url), "utf8");
  const favorites = fs.readFileSync(new URL("../app/oblubene/page.tsx", import.meta.url), "utf8");

  for (const source of [admin, partner, reviewer]) {
    assert.match(source, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false/);
  }
  for (const source of [search, favorites]) {
    assert.match(source, /robots:\s*\{\s*index:\s*false,\s*follow:\s*true/);
  }
});

test("generated sitemap uses canonical public sources and no hardcoded fake dates", () => {
  const source = fs.readFileSync(new URL("../app/sitemap.ts", import.meta.url), "utf8");
  assert.match(source, /listPublishedCanonicalBreedSitemapIndex/);
  assert.match(source, /getPublishedDirectorySitemapRecords/);
  assert.match(source, /getPublishedArticleSitemapRecords/);
  assert.match(source, /getPublishedEventSitemapRecords/);
  assert.match(source, /getPublishedHelpSitemapRecords/);
  assert.doesNotMatch(source, /getPublishedDirectoryProfiles|getPublishedArticleIndex|getPublishedEvents|getPublishedHelpCases/);
  assert.match(source, /assertSitemapEntityParity/);
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


test("sitemap orchestrator bounds D1 fan-out independently of the confirmed asset-probe root cause", async () => {
  const connectionLimit = 6;

  const makeProbe = () => {
    let active = 0;
    let maxActive = 0;
    return {
      get maxActive() { return maxActive; },
      async query() {
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (active > connectionLimit) {
          active -= 1;
          throw new Error("simulated-cloudflare-connection-limit");
        }
        await new Promise((resolve) => setImmediate(resolve));
        active -= 1;
        return true;
      },
    };
  };

  const oldProbe = makeProbe();
  await assert.rejects(
    Promise.all(Array.from({ length: 9 }, () => oldProbe.query())),
    /simulated-cloudflare-connection-limit/,
  );
  assert.ok(oldProbe.maxActive > connectionLimit);

  const fixedProbe = makeProbe();
  const stages = Array.from({ length: 9 }, (_, index) => ({
    key: `dataset${index}`,
    stage: `load-dataset-${index}`,
    load: () => fixedProbe.query(),
  }));
  const datasets = await loadSitemapStages(stages);
  assert.equal(Object.keys(datasets).length, 9);
  assert.equal(SITEMAP_MAX_D1_CONCURRENCY, 1);
  assert.equal(fixedProbe.maxActive, 1);
});

test("sitemap stage errors expose a safe stage code and preserve the original cause", async () => {
  const cause = new Error("private-runtime-detail");
  await assert.rejects(
    loadSitemapStages([
      { key: "organizations", stage: "load-organizations", load: async () => { throw cause; } },
    ]),
    (error) => {
      assert.ok(error instanceof SitemapStageError);
      assert.equal(error.message, "sitemap-stage-failed:load-organizations");
      assert.equal(error.stage, "load-organizations");
      assert.equal(error.cause, cause);
      assert.doesNotMatch(error.message, /private-runtime-detail/);
      return true;
    },
  );
});

test("sitemap application source has no top-level loader fan-out or required-dataset fail-soft", () => {
  const source = fs.readFileSync(new URL("../app/sitemap.ts", import.meta.url), "utf8");
  const loadStart = source.indexOf("async function loadSitemapDatasets");
  const buildStart = source.indexOf("function buildSitemapEntries");
  const loadSource = source.slice(loadStart, buildStart);
  assert.match(loadSource, /loadSitemapStages/);
  assert.doesNotMatch(loadSource, /Promise\.all/);
  assert.doesNotMatch(loadSource, /\.catch\(\(\) => \[\]\)/);
  assert.match(loadSource, /stage: "load-organizations"/);
  assert.match(source, /listManagedPortalSectionsForSitemap/);
  assert.match(source, /listPublishedCanonicalBreedSitemapIndex/);
  assert.doesNotMatch(source, /listPublishedCanonicalBreedIndex/);
  assert.match(source, /runSitemapStageSync\("global-validation"/);
});

test("old breed image availability path can exceed Cloudflare's six waiting connections", async () => {
  let active = 0;
  let maxActive = 0;
  const bindings = {
    ASSETS: {
      async fetch() {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setImmediate(resolve));
        active -= 1;
        return new Response("", { status: 200, headers: { "content-type": "image/webp" } });
      },
    },
  };
  const items = Array.from({ length: 8 }, (_, index) => ({
    image: `/images/breeds/root-cause-${index}.webp`,
  }));
  await withAvailableBreedImages(items, bindings);
  assert.equal(maxActive, 8);
  assert.ok(maxActive > 6);
});

test("breed sitemap DTO stays lightweight and never probes R2 or static assets", () => {
  const source = fs.readFileSync(new URL("../lib/breed-store.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function listPublishedCanonicalBreedSitemapIndex");
  const end = source.indexOf("export async function listPublishedBreedsForComparison", start);
  const sitemapReader = source.slice(start, end);
  assert.match(sitemapReader, /SELECT slug,image_url,seo_json,updated_at/);
  assert.doesNotMatch(sitemapReader, /withAvailableBreedImages|BUCKET|ASSETS|HEAD|fci_standard_json/);
});
