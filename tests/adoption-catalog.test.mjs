import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  adoptionCatalogHasFacet,
  adoptionCatalogHref,
  adoptionCatalogStatusLabels,
  buildAdoptionCatalogView,
  parseAdoptionCatalogFilters,
} from "../lib/adoption-catalog.ts";
import { buildPublicAdoptionQuery } from "../lib/adoption-store.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

function dog(id, status) {
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
    breedId: 42,
    breedName: "Labradorský retriever",
    breedSlug: "labradorsky-retriever",
    breedMix: false,
    color: "",
    region: "Nitriansky kraj",
    district: "",
    city: "Nitra",
    organizationId: null,
    organizationName: "OZ Test",
    organizationSlug: null,
    mainImage: null,
    gallery: [],
    shortDescription: "",
    description: "",
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
    publishedAt: null,
    lastVerifiedAt: null,
    createdAt: "",
    updatedAt: "",
    createdBy: "",
    updatedBy: "",
  };
}

test("catalog view exposes ACTIVE and RESERVED only, with a reserved label", () => {
  const result = buildAdoptionCatalogView([
    dog(1, "ACTIVE"),
    dog(2, "RESERVED"),
    dog(3, "DRAFT"),
    dog(4, "ADOPTED"),
    dog(5, "ARCHIVED"),
  ]);
  assert.deepEqual(result.items.map((item) => item.status), ["ACTIVE", "RESERVED"]);
  assert.equal(result.isEmpty, false);
  assert.equal(adoptionCatalogStatusLabels.RESERVED, "Rezervovaný");
});

test("catalog has a normal empty state", () => {
  assert.deepEqual(buildAdoptionCatalogView([]), { items: [], isEmpty: true });
  const component = read("../components/adoption-catalog.tsx");
  assert.match(component, /Momentálne nemáme publikovaný profil pre tieto filtre\./);
  assert.match(component, /Zobraziť všetky aktuálne adopcie/);
});

test("catalog parsing and links preserve search filters and pagination", () => {
  const filters = parseAdoptionCatalogFilters({
    q: " Ben ",
    plemeno: "42",
    kraj: "Nitriansky kraj",
    pohlavie: "MALE",
    vek: "YOUNG",
    velkost: "LARGE",
    stav: "RESERVED",
    deti: "1",
    radenie: "verified",
    strana: "3",
  });
  assert.equal(filters.q, "Ben");
  assert.equal(filters.breedId, 42);
  assert.equal(filters.status, "RESERVED");
  assert.equal(filters.page, 3);
  const href = adoptionCatalogHref(filters, { page: 4 });
  assert.match(href, /q=Ben/);
  assert.match(href, /plemeno=42/);
  assert.match(href, /stav=RESERVED/);
  assert.match(href, /strana=4/);
});

test("public store query applies breed/status/search filters and pagination without private lifecycle states", () => {
  const query = buildPublicAdoptionQuery({
    q: "Žltý Ben",
    breedId: 42,
    region: "Nitriansky kraj",
    status: "RESERVED",
    page: 2,
  });
  assert.match(query.where, /d\.status = \?/);
  assert.match(query.where, /d\.breed_id = \?/);
  assert.doesNotMatch(query.where, /DRAFT|ADOPTED|ARCHIVED/);
  assert.deepEqual(query.bindings, ["RESERVED", "%zlty ben%", 42, "Nitriansky kraj"]);
  assert.equal(query.pageSize, 24);
  assert.equal(query.offset, 24);
});

test("facet URLs are noindex candidates and route uses only the adoption store", () => {
  assert.equal(adoptionCatalogHasFacet({}), false);
  assert.equal(adoptionCatalogHasFacet({ kraj: "Nitriansky kraj" }), true);
  const route = read("../app/pomoc-psom/adopcia/page.tsx");
  assert.match(route, /index: false, follow: true/);
  assert.match(route, /path: "\/pomoc-psom\/adopcia"/);
  assert.match(route, /getPublicAdoptions/);
  assert.match(route, /listPublishedAdoptionBreedOptions/);
  assert.doesNotMatch(route, /help-store|help_cases/);
});
