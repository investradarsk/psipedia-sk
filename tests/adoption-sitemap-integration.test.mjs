import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  buildIndexableAdoptionSitemapPageQuery,
  filterIndexableAdoptionsForSitemap,
  listIndexableAdoptionSitemapRecords,
} from "../lib/adoption-sitemap.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

function dog(id, status, overrides = {}) {
  return {
    id,
    name: `Pes ${id}`,
    slug: `pes-${id}`,
    status,
    sex: "MALE",
    birthDate: null,
    approximateAgeMonths: 24,
    size: "MEDIUM",
    weight: null,
    breedId: null,
    breedName: "",
    breedSlug: null,
    breedMix: false,
    color: "",
    region: "Nitriansky kraj",
    district: "",
    city: "Nitra",
    organizationId: null,
    organizationName: "OZ Test",
    organizationSlug: null,
    mainImage: "/images/pes.webp",
    gallery: [],
    shortDescription: "Priateľský pes hľadá nový domov.",
    description: "Dostatočne dlhý overený opis psa na adopciu, ktorý obsahuje reálne informácie o profile a spĺňa podmienku kvality pre indexáciu.",
    temperament: "",
    activityLevel: "UNKNOWN",
    suitableForChildren: "UNKNOWN",
    suitableForDogs: "UNKNOWN",
    suitableForCats: "UNKNOWN",
    suitableForOtherAnimals: "UNKNOWN",
    apartmentSuitable: null,
    beginnerSuitable: null,
    needsExperiencedOwner: false,
    vaccinationStatus: "UNKNOWN",
    chipped: null,
    neutered: null,
    healthNotes: "",
    specialNeeds: "",
    adoptionRequirements: "",
    externalSourceUrl: null,
    contactEmail: null,
    contactPhone: null,
    contactUrl: null,
    publishedAt: "2026-09-01T08:00:00.000Z",
    lastVerifiedAt: "2026-09-10T08:00:00.000Z",
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-12T08:00:00.000Z",
    createdBy: "editor@psipedia.sk",
    updatedBy: "editor@psipedia.sk",
    ...overrides,
  };
}

test("Pomoc psom keeps the existing adoption category entry pointed at the new catalog", () => {
  const help = read("../lib/help.ts");
  const page = read("../components/help-page.tsx");
  assert.match(help, /slug: "adopcia"/);
  assert.match(help, /label: "Psy na adopciu"/);
  assert.match(help, /return `\/pomoc-psom\/\$\{category\.slug\}`/);
  assert.match(page, /helpCategories\.map/);
  assert.match(page, /category === "adopcia"\) return "\/pomoc-psom\/adopcia"/);
  assert.match(page, /href=\{categoryDestination\(category\.slug\)\}/);
});

test("sitemap adoption filter includes fresh described ACTIVE profiles even without an optional image", () => {
  const now = new Date("2026-09-14T12:00:00.000Z");
  const items = filterIndexableAdoptionsForSitemap([
    dog(1, "ACTIVE"),
    dog(2, "ACTIVE", { lastVerifiedAt: "2026-06-01T08:00:00.000Z" }),
    dog(3, "ACTIVE", { mainImage: null }),
    dog(4, "ACTIVE", { description: "príliš krátke" }),
    dog(5, "RESERVED"),
    dog(6, "DRAFT"),
    dog(7, "ADOPTED"),
    dog(8, "ARCHIVED"),
  ], now);
  assert.deepEqual(items.map((item) => item.slug), ["pes-1", "pes-3"]);
});

test("sitemap source contains the catalog and indexable new details without duplicating legacy adoption loading", () => {
  const sitemap = read("../app/sitemap.ts");
  assert.match(sitemap, /listIndexableAdoptionsForSitemap/);
  assert.match(sitemap, /sitemapEntry\("\/pomoc-psom\/adopcia"/);
  assert.match(sitemap, /adoptionDetailPath\(item\.slug\)/);
  assert.match(sitemap, /getPublishedHelpSitemapRecords\(\)/);
  assert.equal((sitemap.match(/getPublishedHelpSitemapRecords\(\)/g) ?? []).length, 1);
  assert.doesNotMatch(sitemap, /getPublishedHelpCases\(\)/);
  assert.match(sitemap, /const representedElsewhere = item\.category === "adopcia" \|\| item\.category === "utulky"/);
  assert.match(sitemap, /exclusionReason: representedElsewhere/);
  assert.match(sitemap, /runSitemapStageSync\("global-validation", \(\) => assertValidSitemap\(entries\)\)/);
});

test("public help, homepage and portal search no longer source legacy adoption rows", () => {
  const helpStore = read("../lib/help-store.ts");
  const helpRoot = read("../app/pomoc-psom/page.tsx");
  const portalSearch = read("../lib/portal-search.ts");
  assert.match(helpStore, /status = 'published' AND category NOT IN \('adopcia', 'utulky'\)/);
  assert.match(helpStore, /category === "adopcia"\) return \[\]/);
  assert.match(helpStore, /category NOT IN \('adopcia', 'utulky'\) AND resolved = 0/);
  assert.match(helpRoot, /getPublicAdoptions\(\{ page: 1 \}\)/);
  assert.match(helpRoot, /adopcia: adoptions\.pagination\.total/);
  assert.match(helpRoot, /adoptions\.items\.slice\(0, 6\)\.map\(adoptionPreview\)/);
  assert.match(helpRoot, /<StructuredData value=\{schema\}/);
  assert.match(helpRoot, /<HelpOverview sections=\{sections\} totalActive=\{totalActive\}/);

  // SEARCH-1 intentionally removed the old in-memory adoption index. Public
  // adoption results are now queried directly from canonical adoption_dogs.
  assert.match(portalSearch, /function adoptionQuery\(/);
  assert.match(portalSearch, /"d\.status IN \('ACTIVE','RESERVED'\)"/);
  assert.match(portalSearch, /"d\.search_text"/);
  assert.match(portalSearch, /"adoption_dogs d"/);
  assert.match(portalSearch, /'\/pomoc-psom\/adopcia\/' \|\| d\.slug AS href/);
  assert.doesNotMatch(portalSearch, /listAllPublicAdoptions\(\)/);
});


test("adoption sitemap uses lightweight keyset pagination without page fan-out or a corpus cap", async () => {
  const query = buildIndexableAdoptionSitemapPageQuery(0, 500);
  assert.equal(query.batchSize, 500);
  assert.match(query.sql, /id > \?/);
  assert.match(query.sql, /ORDER BY id ASC/);
  assert.match(query.sql, /status = 'ACTIVE'/);
  assert.doesNotMatch(query.sql, /COUNT\(\*\)|OFFSET|organization_name|contact_email|gallery_json/i);

  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE adoption_dogs (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL,
      status TEXT NOT NULL,
      description TEXT NOT NULL,
      last_verified_at TEXT,
      updated_at TEXT NOT NULL,
      main_image TEXT
    );
    BEGIN;
  `);
  const insert = sqlite.prepare(
    "INSERT INTO adoption_dogs (id,slug,status,description,last_verified_at,updated_at,main_image) VALUES (?,?,?,?,?,?,?)",
  );
  for (let id = 1; id <= 1205; id += 1) {
    insert.run(
      id,
      `pes-${id}`,
      "ACTIVE",
      "Dostatočne dlhý overený opis psa na adopciu, ktorý spĺňa pravidlá indexácie a má viac než osemdesiat znakov.",
      "2026-09-20T08:00:00.000Z",
      "2026-09-25T08:00:00.000Z",
      null,
    );
  }
  insert.run(1206, "reserved", "RESERVED", "x".repeat(120), "2026-09-20T08:00:00.000Z", "2026-09-25T08:00:00.000Z", null);
  sqlite.exec("COMMIT;");

  let active = 0;
  let maxActive = 0;
  let queryCount = 0;
  const d1 = {
    prepare(sql) {
      return {
        bind(...bindings) {
          return {
            async all() {
              queryCount += 1;
              active += 1;
              maxActive = Math.max(maxActive, active);
              await new Promise((resolve) => setImmediate(resolve));
              const rows = sqlite.prepare(sql).all(...bindings);
              active -= 1;
              return { results: rows };
            },
          };
        },
      };
    },
  };

  const records = await listIndexableAdoptionSitemapRecords(d1, {
    batchSize: 500,
    now: new Date("2026-09-28T12:00:00.000Z"),
  });
  assert.equal(records.length, 1205);
  assert.equal(queryCount, 3);
  assert.equal(maxActive, 1);
  assert.equal(records[0].id, 1);
  assert.equal(records.at(-1).id, 1205);
  assert.equal(records.some((item) => item.slug === "reserved"), false);
});

test("adoption sitemap fails when a keyset cursor does not advance", async () => {
  let call = 0;
  const d1 = {
    prepare() {
      return {
        bind() {
          return {
            async all() {
              call += 1;
              if (call === 1) {
                return { results: [
                  { id: 1, slug: "a", status: "ACTIVE", description: "x".repeat(100), last_verified_at: "2026-09-20T00:00:00Z", updated_at: "2026-09-20T00:00:00Z", main_image: null },
                  { id: 2, slug: "b", status: "ACTIVE", description: "x".repeat(100), last_verified_at: "2026-09-20T00:00:00Z", updated_at: "2026-09-20T00:00:00Z", main_image: null },
                ] };
              }
              return { results: [
                { id: 2, slug: "b", status: "ACTIVE", description: "x".repeat(100), last_verified_at: "2026-09-20T00:00:00Z", updated_at: "2026-09-20T00:00:00Z", main_image: null },
              ] };
            },
          };
        },
      };
    },
  };

  await assert.rejects(
    listIndexableAdoptionSitemapRecords(d1, {
      batchSize: 2,
      now: new Date("2026-09-28T12:00:00.000Z"),
    }),
    /adoption-sitemap-cursor-did-not-advance/,
  );
});
