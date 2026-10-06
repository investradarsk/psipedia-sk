import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  DIRECTORY_LOCATION_CATEGORY_ALIASES,
  DIRECTORY_LOCATION_LANDING_REGISTRY,
  buildDirectoryLocationLandingBreadcrumbs,
  buildDirectoryLocationLandingQuery,
  canonicalDirectoryLocationLandingCategory,
  directoryLocationLandingIndexable,
  directoryLocationLandingPath,
  directoryLocationLandingSupportsDimension,
  getDirectoryLocationLanding,
} from "../lib/directory-location-landings.ts";
import {
  getSlovakLandingLocationByRawValue,
  getSlovakLandingLocationBySlug,
  slovakLocationSlug,
} from "../lib/slovak-location-landings.ts";
import {
  buildDirectoryLocationLandingSitemapQueries,
  listIndexableDirectoryLocationLandingSitemapRecords,
} from "../lib/directory-location-sitemap.ts";
import { buildCollectionPageJsonLd, resolveListingIndexPolicy } from "../lib/listing-seo.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function landingRow(overrides = {}) {
  return {
    id: 1,
    slug: "profil-1",
    name: "Profil 1",
    category: "veterinari",
    excerpt: "Verejný profil.",
    services_json: JSON.stringify(["Preventívna starostlivosť"]),
    city: "Nitra",
    district: "Nitra",
    region: "Nitriansky kraj",
    price_note: "",
    image_url: null,
    featured: 0,
    updated_at: "2026-10-06T12:00:00.000Z",
    ...overrides,
  };
}

function landingDatabase(rows) {
  let calls = 0;
  let lastSql = "";
  let lastBindings = [];
  return {
    get calls() { return calls; },
    get lastSql() { return lastSql; },
    get lastBindings() { return lastBindings; },
    prepare(sql) {
      calls += 1;
      lastSql = sql;
      return {
        bind(...bindings) {
          lastBindings = bindings;
          return {
            async all() {
              return { results: rows };
            },
          };
        },
      };
    },
  };
}

test("registry is explicit, canonical and conservative by category", () => {
  assert.deepEqual(DIRECTORY_LOCATION_LANDING_REGISTRY.veterinari.dimensions, ["region", "district", "city"]);
  assert.deepEqual(DIRECTORY_LOCATION_LANDING_REGISTRY.treneri.dimensions, ["region", "district", "city"]);
  assert.deepEqual(DIRECTORY_LOCATION_LANDING_REGISTRY["kynologicke-kluby"].dimensions, ["region", "district"]);
  assert.deepEqual(DIRECTORY_LOCATION_LANDING_REGISTRY["chovatelske-kluby"].dimensions, ["region", "district"]);
  assert.deepEqual(DIRECTORY_LOCATION_LANDING_REGISTRY["salony-a-sluzby"].dimensions, ["region", "district", "city"]);
  assert.deepEqual(DIRECTORY_LOCATION_LANDING_REGISTRY["hotely-a-opatrovanie"].dimensions, ["region", "district", "city"]);
  assert.deepEqual(DIRECTORY_LOCATION_LANDING_REGISTRY.vencenie.dimensions, ["region", "city"]);
  assert.deepEqual(DIRECTORY_LOCATION_LANDING_REGISTRY.fyzioterapia.dimensions, ["region", "city"]);
  assert.deepEqual(DIRECTORY_LOCATION_LANDING_REGISTRY["dalsie-sluzby"].dimensions, ["region"]);
  for (const config of Object.values(DIRECTORY_LOCATION_LANDING_REGISTRY)) {
    assert.equal(config.indexThreshold, 2);
  }
  assert.equal("chovatelske-stanice" in DIRECTORY_LOCATION_LANDING_REGISTRY, false);
});

test("canonical category alias never becomes its own clean landing", () => {
  assert.equal(DIRECTORY_LOCATION_CATEGORY_ALIASES["psie-skoly"], "treneri");
  assert.equal(canonicalDirectoryLocationLandingCategory("psie-skoly"), "treneri");
  assert.equal(canonicalDirectoryLocationLandingCategory("treneri"), "treneri");
  assert.equal(canonicalDirectoryLocationLandingCategory("neexistuje"), null);
  assert.equal(
    buildDirectoryLocationLandingQuery({ category: "psie-skoly", dimension: "region", locationSlug: "bratislavsky" }),
    null,
  );
});

test("canonical Slovak slugs are deterministic and diacritic-safe", () => {
  assert.equal(slovakLocationSlug("Žiar nad Hronom"), "ziar-nad-hronom");
  assert.equal(slovakLocationSlug("Košice"), "kosice");
  assert.equal(getSlovakLandingLocationBySlug("region", "nitriansky")?.name, "Nitriansky kraj");
  assert.equal(getSlovakLandingLocationBySlug("district", "nitra")?.name, "Nitra");
  assert.equal(getSlovakLandingLocationBySlug("city", "trnava")?.name, "Trnava");
  assert.equal(getSlovakLandingLocationBySlug("region", "neexistuje"), null);
  assert.equal(getSlovakLandingLocationBySlug("district", "neexistuje"), null);
  assert.equal(getSlovakLandingLocationBySlug("city", "neexistuje"), null);
});

test("ambiguous city names fail closed while Bratislava and Košice aggregate deterministically", () => {
  assert.equal(getSlovakLandingLocationBySlug("city", "porubka"), null);
  assert.equal(getSlovakLandingLocationByRawValue("city", "Bratislava - Petržalka")?.slug, "bratislava");
  assert.equal(getSlovakLandingLocationByRawValue("city", "Bratislava")?.slug, "bratislava");
  assert.equal(getSlovakLandingLocationByRawValue("city", "Košice - Staré Mesto")?.slug, "kosice");
});

test("clean route builders use only explicit kraj/okres/mesto segments", () => {
  assert.equal(directoryLocationLandingPath("veterinari", "region", "nitriansky"), "/adresar/veterinari/kraj/nitriansky");
  assert.equal(directoryLocationLandingPath("veterinari", "district", "nitra"), "/adresar/veterinari/okres/nitra");
  assert.equal(directoryLocationLandingPath("veterinari", "city", "nitra"), "/adresar/veterinari/mesto/nitra");
  assert.doesNotMatch(directoryLocationLandingPath("salony-a-sluzby", "city", "trnava"), /\?/);
});

test("required category/dimension combinations build selective server-side SQL", () => {
  const cases = [
    ["veterinari", "region", "nitriansky", /TRIM\(d\.region\) = \?/],
    ["veterinari", "district", "nitra", /TRIM\(d\.district\) = \?/],
    ["veterinari", "city", "nitra", /TRIM\(d\.city\) = \?/],
    ["treneri", "region", "bratislavsky", /TRIM\(d\.region\) = \?/],
    ["kynologicke-kluby", "district", "nitra", /TRIM\(d\.district\) = \?/],
    ["salony-a-sluzby", "city", "trnava", /TRIM\(d\.city\) = \?/],
  ];
  for (const [category, dimension, locationSlug, locationPattern] of cases) {
    const query = buildDirectoryLocationLandingQuery({ category, dimension, locationSlug });
    assert.ok(query, `${category}/${dimension}/${locationSlug}`);
    assert.match(query.sql, /FROM directory_profiles d/);
    assert.match(query.sql, /d\.category = \?/);
    assert.match(query.sql, locationPattern);
    assert.match(query.sql, /d\.status = 'published'/);
    assert.match(query.sql, /d\.archived_at IS NULL/);
    assert.match(query.sql, /canonicalUrl/);
    assert.doesNotMatch(query.sql, /SELECT \*/);
    assert.doesNotMatch(query.sql, /source_data_json/);
  }
});

test("veterinary region query reuses canonical region variants and category binding", () => {
  const query = buildDirectoryLocationLandingQuery({
    category: "veterinari",
    dimension: "region",
    locationSlug: "nitriansky",
  });
  assert.ok(query);
  assert.deepEqual(query.bindings, ["veterinari", "Nitriansky kraj", "Nitriansky"]);
});

test("unsupported dimensions and invalid categories fail before database access", () => {
  assert.equal(directoryLocationLandingSupportsDimension("kynologicke-kluby", "city"), false);
  assert.equal(directoryLocationLandingSupportsDimension("fyzioterapia", "district"), false);
  assert.equal(directoryLocationLandingSupportsDimension("veterinari", "city"), true);
  assert.equal(buildDirectoryLocationLandingQuery({ category: "kynologicke-kluby", dimension: "city", locationSlug: "nitra" }), null);
  assert.equal(buildDirectoryLocationLandingQuery({ category: "neexistuje", dimension: "region", locationSlug: "nitriansky" }), null);
});

test("zero results resolve to the 404 state with one selective DB read", async () => {
  const database = landingDatabase([]);
  const landing = await getDirectoryLocationLanding(
    { category: "veterinari", dimension: "city", locationSlug: "nitra" },
    database,
  );
  assert.equal(landing, null);
  assert.equal(database.calls, 1);
  assert.match(database.lastSql, /TRIM\(d\.city\) = \?/);
  assert.deepEqual(database.lastBindings, ["veterinari", "Nitra"]);
});

test("one result remains public but noindex/follow eligible", async () => {
  const database = landingDatabase([landingRow()]);
  const landing = await getDirectoryLocationLanding(
    { category: "veterinari", dimension: "city", locationSlug: "nitra" },
    database,
  );
  assert.ok(landing);
  assert.equal(landing.total, 1);
  assert.equal(landing.indexable, false);
  assert.equal(landing.indexThreshold, 2);
  assert.equal(landing.path, "/adresar/veterinari/mesto/nitra");
});

test("two or more canonical profiles become indexable", async () => {
  const database = landingDatabase([
    landingRow(),
    landingRow({ id: 2, slug: "profil-2", name: "Profil 2" }),
  ]);
  const landing = await getDirectoryLocationLanding(
    { category: "veterinari", dimension: "city", locationSlug: "nitra" },
    database,
  );
  assert.ok(landing);
  assert.equal(landing.total, 2);
  assert.equal(landing.indexable, true);
  assert.equal(directoryLocationLandingIndexable("veterinari", 1), false);
  assert.equal(directoryLocationLandingIndexable("veterinari", 2), true);
});

test("clean and query-string policies preserve self canonical and noindex/follow filters", () => {
  const path = "/adresar/veterinari/mesto/nitra";
  const clean = resolveListingIndexPolicy(path, {});
  assert.equal(clean.kind, "clean");
  assert.equal(clean.index, true);
  assert.equal(clean.follow, true);
  assert.equal(clean.canonicalPath, path);

  const query = resolveListingIndexPolicy(path, { sort: "name-asc", page: "2" });
  assert.equal(query.kind, "query");
  assert.equal(query.index, false);
  assert.equal(query.follow, true);
  assert.equal(query.canonicalPath, path);
});

test("CollectionPage graph contains only visible ItemList profiles and BreadcrumbList", async () => {
  const database = landingDatabase([
    landingRow(),
    landingRow({ id: 2, slug: "profil-2", name: "Profil 2" }),
  ]);
  const landing = await getDirectoryLocationLanding(
    { category: "veterinari", dimension: "city", locationSlug: "nitra" },
    database,
  );
  assert.ok(landing);
  const schema = buildCollectionPageJsonLd({
    name: landing.h1,
    description: landing.description,
    path: landing.path,
    breadcrumbs: buildDirectoryLocationLandingBreadcrumbs(landing),
    items: landing.profiles.map((profile) => ({
      name: profile.name,
      path: `/adresar/${profile.category}/${profile.slug}`,
    })),
  });
  const graph = schema["@graph"];
  assert.deepEqual(graph.map((node) => node["@type"]), ["CollectionPage", "ItemList", "BreadcrumbList"]);
  assert.equal(graph[1].numberOfItems, 2);
  assert.match(graph[1].itemListElement[0].item, /\/adresar\/veterinari\/profil-1$/);
  assert.equal(graph.filter((node) => ["Organization", "LocalBusiness", "VeterinaryCare"].includes(node["@type"])).length, 0);
});

test("sitemap query model is bounded to three GROUP BY reads with no Cartesian product", () => {
  const queries = buildDirectoryLocationLandingSitemapQueries();
  assert.equal(queries.length, 3);
  assert.deepEqual(queries.map((query) => query.dimension), ["region", "district", "city"]);
  for (const query of queries) {
    assert.match(query.sql, /GROUP BY d\.category, TRIM\(/);
    assert.match(query.sql, /COUNT\(DISTINCT d\.id\)/);
    assert.doesNotMatch(query.sql, /CROSS JOIN/i);
    assert.doesNotMatch(query.sql, /\?[^\n]*region[^\n]*district[^\n]*city/i);
    assert.ok(query.bindings.length > 0);
  }
});

test("sitemap folds only real aggregate rows, applies threshold, and excludes thin/empty/query URLs", async () => {
  const database = {
    prepare(sql) {
      return { bind(...bindings) { return { sql, bindings }; } };
    },
    async batch() {
      return [
        {
          results: [
            { category: "veterinari", location_value: "Nitriansky kraj", profile_count: 2, profile_updated_at: "2026-10-05T10:00:00Z" },
            { category: "treneri", location_value: "Bratislavský kraj", profile_count: 1, profile_updated_at: "2026-10-05T11:00:00Z" },
          ],
        },
        {
          results: [
            { category: "kynologicke-kluby", location_value: "Nitra", profile_count: 2, profile_updated_at: "2026-10-05T12:00:00Z" },
            { category: "chovatelske-kluby", location_value: "Levice", profile_count: 1, profile_updated_at: "2026-10-05T13:00:00Z" },
          ],
        },
        {
          results: [
            { category: "salony-a-sluzby", location_value: "Trnava", profile_count: 2, profile_updated_at: "2026-10-05T14:00:00Z" },
            { category: "fyzioterapia", location_value: "Bratislava", profile_count: 1, profile_updated_at: "2026-10-05T15:00:00Z" },
            { category: "fyzioterapia", location_value: "Bratislava - Petržalka", profile_count: 1, profile_updated_at: "2026-10-06T15:00:00Z" },
            { category: "vencenie", location_value: "Nitra", profile_count: 1, profile_updated_at: "2026-10-05T16:00:00Z" },
          ],
        },
      ];
    },
  };

  const records = await listIndexableDirectoryLocationLandingSitemapRecords(database);
  assert.deepEqual(records.map((record) => record.path), [
    "/adresar/fyzioterapia/mesto/bratislava",
    "/adresar/kynologicke-kluby/okres/nitra",
    "/adresar/salony-a-sluzby/mesto/trnava",
    "/adresar/veterinari/kraj/nitriansky",
  ]);
  assert.equal(records.find((record) => record.path.endsWith("/mesto/bratislava"))?.profileCount, 2);
  assert.ok(records.every((record) => record.profileCount >= 2));
  assert.ok(records.every((record) => !record.path.includes("?")));
  assert.ok(records.every((record) => !record.path.includes("psie-skoly")));
});

test("fixture audit yields eight real mapped combinations and four indexable landings", async () => {
  const raw = [
    ["veterinari", "region", "Nitriansky kraj", 2],
    ["treneri", "region", "Bratislavský kraj", 1],
    ["kynologicke-kluby", "district", "Nitra", 2],
    ["chovatelske-kluby", "district", "Levice", 1],
    ["salony-a-sluzby", "city", "Trnava", 2],
    ["fyzioterapia", "city", "Bratislava", 1],
    ["fyzioterapia", "city", "Bratislava - Petržalka", 1],
    ["vencenie", "city", "Nitra", 1],
  ];
  const mapped = new Map();
  for (const [category, dimension, value, count] of raw) {
    const location = getSlovakLandingLocationByRawValue(dimension, value);
    assert.ok(location);
    const key = directoryLocationLandingPath(category, dimension, location.slug);
    mapped.set(key, (mapped.get(key) ?? 0) + count);
  }
  assert.equal(raw.length, 8);
  assert.equal(mapped.size, 7);
  assert.equal([...mapped.values()].filter((count) => count >= 2).length, 4);
});

test("static route segments coexist with profile detail and routes use SSR data/schema", async () => {
  const files = [
    "app/adresar/[category]/kraj/[locationSlug]/page.tsx",
    "app/adresar/[category]/okres/[locationSlug]/page.tsx",
    "app/adresar/[category]/mesto/[locationSlug]/page.tsx",
    "app/adresar/[category]/[slug]/page.tsx",
  ];
  const sources = await Promise.all(files.map((file) => readFile(path.join(repoRoot, file), "utf8")));
  for (const source of sources.slice(0, 3)) {
    assert.match(source, /getDirectoryLocationLanding/);
    assert.match(source, /buildCollectionPageJsonLd/);
    assert.match(source, /canonical: landing\.path/);
    assert.match(source, /NOINDEX_FOLLOW_ROBOTS/);
  }
  assert.match(sources[0], /const DIMENSION = "region"/);
  assert.match(sources[1], /const DIMENSION = "district"/);
  assert.match(sources[2], /const DIMENSION = "city"/);
  assert.match(sources[3], /getPublishedDirectoryProfile/);
});

test("landing UI reuses DirectoryCard, PublicContentShell and map CTA without Overené", async () => {
  const source = await readFile(path.join(repoRoot, "components/directory-location-landing.tsx"), "utf8");
  assert.match(source, /<DirectoryCard profile=\{profile\}/);
  assert.match(source, /PublicContentShell/);
  assert.match(source, /ctaHref="\/mapa"/);
  assert.doesNotMatch(source, /Overené/);
});

test("sitemap integration includes clean directory location records and no query URL builder", async () => {
  const source = await readFile(path.join(repoRoot, "app/sitemap.ts"), "utf8");
  assert.match(source, /listIndexableDirectoryLocationLandingSitemapRecords/);
  assert.match(source, /load-directory-location-landings/);
  assert.match(source, /build-directory-location-landing-entries/);
  assert.match(source, /\.\.\.directoryLocationLandingEntries/);
  assert.doesNotMatch(source, /directoryLocationLandingEntries[\s\S]{0,500}searchParams/);
});
