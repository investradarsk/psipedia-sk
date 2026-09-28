import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { filterIndexableAdoptionsForSitemap } from "../lib/adoption-sitemap.ts";

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
  assert.match(sitemap, /getPublishedHelpCases\(\)/);
  assert.equal((sitemap.match(/getPublishedHelpCases\(\)/g) ?? []).length, 1);
  assert.match(sitemap, /item\.category !== "adopcia"/);
  assert.match(sitemap, /item\.category !== "utulky"/);
  assert.match(sitemap, /new Map\(entries\.map\(\(entry\) => \[entry\.url, entry\]\)\)/);
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
  assert.match(helpRoot, /return <HelpOverview sections=\{sections\} totalActive=\{totalActive\} \/>/);
  assert.match(portalSearch, /listAllPublicAdoptions\(\)/);
  assert.match(portalSearch, /adoptionDetailPath\(dog\.slug\)/);
});
