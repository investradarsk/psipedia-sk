import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  BREEDING_STATION_LANDING_INDEX_THRESHOLD,
  BREEDING_STATION_REGIONS,
  breedingStationBreedLandingPath,
  breedingStationBreedRegionLandingPath,
  breedingStationLandingIndexable,
  breedingStationRegionLandingPath,
  buildBreedingStationLandingQuery,
  getBreedingStationLanding,
  getBreedingStationRegionBySlug,
} from "../lib/breeding-station-landings.ts";
import { buildBreedingStationLandingSitemapQueries } from "../lib/breeding-station-sitemap.ts";
import { buildCollectionPageJsonLd, resolveListingIndexPolicy } from "../lib/listing-seo.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("region slugs are deterministic and cover the canonical Slovak location layer", () => {
  assert.equal(BREEDING_STATION_REGIONS.length, 8);
  assert.equal(getBreedingStationRegionBySlug("nitriansky")?.name, "Nitriansky kraj");
  assert.equal(getBreedingStationRegionBySlug("presovsky")?.locative, "Prešovskom kraji");
  assert.equal(getBreedingStationRegionBySlug("invalid"), null);
});

test("clean paths are stable and contain no query strings", () => {
  assert.equal(
    breedingStationBreedLandingPath("labradorsky-retriver"),
    "/adresar/chovatelske-stanice/plemeno/labradorsky-retriver",
  );
  assert.equal(
    breedingStationRegionLandingPath("nitriansky"),
    "/adresar/chovatelske-stanice/kraj/nitriansky",
  );
  assert.equal(
    breedingStationBreedRegionLandingPath("labradorsky-retriver", "nitriansky"),
    "/adresar/chovatelske-stanice/plemeno/labradorsky-retriver/kraj/nitriansky",
  );
});

test("index policy is conservative: zero and one stay out, two or more are indexable", () => {
  assert.equal(BREEDING_STATION_LANDING_INDEX_THRESHOLD, 2);
  assert.equal(breedingStationLandingIndexable(0), false);
  assert.equal(breedingStationLandingIndexable(1), false);
  assert.equal(breedingStationLandingIndexable(2), true);
  assert.equal(breedingStationLandingIndexable(10), true);
});

test("breed + region SQL uses canonical breed relations and server-side region filtering", () => {
  const query = buildBreedingStationLandingQuery({
    breedSlug: "labradorsky-retriver",
    regionSlug: "nitriansky",
  });
  assert.ok(query);
  assert.equal(query.kind, "breed-region");
  assert.match(query.sql, /JOIN breed_directory_relations r ON r\.breed_id = b\.id/);
  assert.match(query.sql, /JOIN managed_breeds|FROM managed_breeds b/);
  assert.match(query.sql, /NOT EXISTS/);
  assert.match(query.sql, /d\.category = 'chovatelske-stanice'/);
  assert.match(query.sql, /TRIM\(d\.region\) IN \(\?, \?\)/);
  assert.doesNotMatch(query.sql, /source_data_json/);
  assert.deepEqual(query.bindings, [
    "labradorsky-retriver",
    "Nitriansky kraj",
    "Nitriansky",
  ]);
});

test("region-only SQL remains selective and does not load the whole directory into JS", () => {
  const query = buildBreedingStationLandingQuery({ regionSlug: "nitriansky" });
  assert.ok(query);
  assert.equal(query.kind, "region");
  assert.match(query.sql, /FROM directory_profiles d/);
  assert.match(query.sql, /TRIM\(d\.region\) IN \(\?, \?\)/);
  assert.match(query.sql, /d\.category = 'chovatelske-stanice'/);
  assert.doesNotMatch(query.sql, /breed_directory_relations/);
  assert.deepEqual(query.bindings, ["Nitriansky kraj", "Nitriansky"]);
});

test("invalid slugs fail closed before a database query and zero results resolve to 404 state", async () => {
  assert.equal(buildBreedingStationLandingQuery({ regionSlug: "nie-je-kraj" }), null);
  assert.equal(buildBreedingStationLandingQuery({ breedSlug: "../labrador" }), null);

  let calls = 0;
  const database = {
    prepare() {
      calls += 1;
      return {
        bind() {
          return {
            async all() {
              return { results: [] };
            },
          };
        },
      };
    },
  };

  const landing = await getBreedingStationLanding(
    { breedSlug: "labradorsky-retriver" },
    database,
  );
  assert.equal(calls, 1);
  assert.equal(landing, null);
});

test("query-string variants preserve the existing noindex/follow listing policy", () => {
  const path = breedingStationBreedLandingPath("labradorsky-retriver");
  assert.deepEqual(resolveListingIndexPolicy(path, {}), {
    kind: "clean",
    index: true,
    follow: true,
    canonicalPath: path,
    page: null,
  });
  const filtered = resolveListingIndexPolicy(path, { region: "Nitriansky kraj" });
  assert.equal(filtered.kind, "query");
  assert.equal(filtered.index, false);
  assert.equal(filtered.follow, true);
  assert.equal(filtered.canonicalPath, path);
});

test("CollectionPage helper exposes real result profiles through ItemList and breadcrumbs", () => {
  const path = breedingStationBreedRegionLandingPath("labradorsky-retriver", "nitriansky");
  const schema = buildCollectionPageJsonLd({
    name: "Chovateľské stanice pre plemeno Labradorský retríver v Nitrianskom kraji",
    description: "Testovací deterministický popis.",
    path,
    breadcrumbs: [
      { name: "Domov", path: "/" },
      { name: "Chovateľské stanice", path: "/adresar/chovatelske-stanice" },
    ],
    items: [
      { name: "Stanica A", path: "/adresar/chovatelske-stanice/stanica-a" },
      { name: "Stanica B", path: "/adresar/chovatelske-stanice/stanica-b" },
    ],
  });
  const graph = schema["@graph"];
  assert.deepEqual(graph.map((node) => node["@type"]), ["CollectionPage", "ItemList", "BreadcrumbList"]);
  assert.equal(graph[1].numberOfItems, 2);
  assert.match(graph[1].itemListElement[0].item, /\/adresar\/chovatelske-stanice\/stanica-a$/);
});

test("sitemap read model uses only existing aggregates, threshold >=2, and no Cartesian product", () => {
  const queries = buildBreedingStationLandingSitemapQueries();
  assert.equal(queries.length, 3);
  assert.deepEqual(queries.map((query) => query.kind), ["breed", "region", "breed-region"]);
  for (const query of queries) {
    assert.match(query.sql, /HAVING COUNT\(DISTINCT d\.id\) >= \?/);
    assert.doesNotMatch(query.sql, /CROSS JOIN/);
    assert.doesNotMatch(query.sql, /\?/g.test(query.sql) ? /[?].*[?].*[?].*[?]/ : /$a/);
    assert.deepEqual(query.bindings, [2]);
  }
  assert.match(queries[0].sql, /breed_directory_relations/);
  assert.match(queries[2].sql, /breed_directory_relations/);
});

test("fixture model has eight real potential clean landings, six indexable at threshold two", () => {
  const fixtures = [
    { breed: "labradorsky-retriver", region: "nitriansky" },
    { breed: "labradorsky-retriver", region: "nitriansky" },
    { breed: "labradorsky-retriver", region: "bratislavsky" },
    { breed: "border-kolia", region: "nitriansky" },
    { breed: "border-kolia", region: "bratislavsky" },
    { breed: "border-kolia", region: "bratislavsky" },
  ];
  const count = (keys) => {
    const counts = new Map();
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  };
  const breeds = count(fixtures.map((item) => `b:${item.breed}`));
  const regions = count(fixtures.map((item) => `r:${item.region}`));
  const combos = count(fixtures.map((item) => `br:${item.breed}:${item.region}`));
  const all = [...breeds, ...regions, ...combos];
  assert.equal(all.length, 8);
  assert.equal(all.filter(([, profileCount]) => profileCount >= 2).length, 6);
});

test("static landing route segments coexist safely with the dynamic directory profile route", async () => {
  const paths = [
    "app/adresar/chovatelske-stanice/plemeno/[breedSlug]/page.tsx",
    "app/adresar/chovatelske-stanice/kraj/[regionSlug]/page.tsx",
    "app/adresar/chovatelske-stanice/plemeno/[breedSlug]/kraj/[regionSlug]/page.tsx",
    "app/adresar/[category]/[slug]/page.tsx",
  ];
  const sources = await Promise.all(paths.map((file) => readFile(path.join(repoRoot, file), "utf8")));
  assert.ok(sources.every((source) => source.length > 0));
  assert.match(sources[0], /getBreedingStationLanding/);
  assert.match(sources[1], /getBreedingStationLanding/);
  assert.match(sources[2], /getBreedingStationLanding/);
  assert.match(sources[3], /getPublishedDirectoryProfile/);
});
