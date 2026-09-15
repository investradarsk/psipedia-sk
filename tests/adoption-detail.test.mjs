import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  adoptionDetailStatusLabels,
  asPublicAdoptionDetail,
  buildAdoptionDetailSections,
  buildAdoptionDetailSeo,
  buildAdoptionDetailStructuredData,
  isLegacyAdoptionFallbackCandidate,
  resolveAdoptionDetailSource,
} from "../lib/adoption-detail.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

function dog(status = "ACTIVE", overrides = {}) {
  return {
    id: 1,
    name: "Ben",
    slug: "ben",
    status,
    sex: "MALE",
    birthDate: null,
    approximateAgeMonths: 30,
    size: "LARGE",
    weight: 28,
    breedId: 42,
    breedName: "Labradorský retriever",
    breedSlug: "labradorsky-retriever",
    breedMix: false,
    color: "čierna",
    region: "Nitriansky kraj",
    district: "Nitra",
    city: "Nitra",
    organizationId: null,
    organizationName: "OZ Test",
    organizationSlug: null,
    mainImage: "/images/ben.webp",
    gallery: [],
    shortDescription: "Priateľský labrador hľadá zodpovedný a trvalý domov.",
    description: "Ben je priateľský a aktívny pes, ktorý hľadá zodpovedný domov. Má rád ľudí, prechádzky a pravidelný kontakt so svojou rodinou.",
    temperament: "priateľský a aktívny",
    activityLevel: "HIGH",
    suitableForChildren: "YES",
    suitableForDogs: "YES",
    suitableForCats: "UNKNOWN",
    suitableForOtherAnimals: "UNKNOWN",
    apartmentSuitable: null,
    beginnerSuitable: true,
    needsExperiencedOwner: false,
    vaccinationStatus: "UP_TO_DATE",
    chipped: true,
    neutered: null,
    healthNotes: "",
    specialNeeds: "",
    adoptionRequirements: "Stabilný domov a pravidelný pohyb.",
    externalSourceUrl: "https://example.com/ben",
    contactEmail: "adopcia@example.com",
    contactPhone: null,
    contactUrl: null,
    publishedAt: "2026-09-01T08:00:00.000Z",
    lastVerifiedAt: "2026-09-10T08:00:00.000Z",
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-10T08:00:00.000Z",
    createdBy: "editor@psipedia.sk",
    updatedBy: "editor@psipedia.sk",
    ...overrides,
  };
}

test("ACTIVE and RESERVED details are public; private lifecycle states are not", () => {
  assert.equal(asPublicAdoptionDetail(dog("ACTIVE"))?.status, "ACTIVE");
  assert.equal(asPublicAdoptionDetail(dog("RESERVED"))?.status, "RESERVED");
  for (const status of ["DRAFT", "ADOPTED", "ARCHIVED"]) assert.equal(asPublicAdoptionDetail(dog(status)), null);
});

test("RESERVED detail has an explicit public label", () => {
  assert.equal(adoptionDetailStatusLabels.RESERVED, "Rezervovaný");
  const component = read("../components/adoption-detail.tsx");
  assert.match(component, /Tento pes je momentálne rezervovaný/);
  assert.match(component, /dog\.status === "RESERVED"/);
});

test("detail SEO follows active quality and stale/indexability rules", () => {
  const now = new Date("2026-09-14T12:00:00.000Z");
  assert.equal(buildAdoptionDetailSeo(asPublicAdoptionDetail(dog("ACTIVE")), now).indexable, true);
  assert.equal(buildAdoptionDetailSeo(asPublicAdoptionDetail(dog("RESERVED")), now).indexable, false);
  assert.equal(buildAdoptionDetailSeo(asPublicAdoptionDetail(dog("ACTIVE", { lastVerifiedAt: "2026-06-01T08:00:00.000Z" })), now).indexable, false);
  assert.equal(buildAdoptionDetailSeo(asPublicAdoptionDetail(dog("ACTIVE", { mainImage: null })), now).indexable, false);
  const seo = buildAdoptionDetailSeo(asPublicAdoptionDetail(dog("ACTIVE")), now);
  assert.equal(seo.path, "/pomoc-psom/adopcia/ben");
  assert.match(seo.description, /Priateľský labrador/);
});

test("structured data uses only WebPage and BreadcrumbList with real optional values", () => {
  const minimal = asPublicAdoptionDetail(dog("ACTIVE", { shortDescription: "", mainImage: null, publishedAt: null }));
  const schema = buildAdoptionDetailStructuredData(minimal, "https://psipedia.sk");
  assert.deepEqual(schema["@graph"].map((item) => item["@type"]), ["WebPage", "BreadcrumbList"]);
  const page = schema["@graph"][0];
  assert.equal(page.description, undefined);
  assert.equal(page.primaryImageOfPage, undefined);
  assert.equal(page.datePublished, minimal.createdAt);
  assert.equal(schema["@graph"][1].itemListElement.at(-1).name, "Ben");
});

test("missing optional data does not create empty information sections", () => {
  const sections = buildAdoptionDetailSections(dog("ACTIVE", {
    breedName: "",
    temperament: "",
    vaccinationStatus: "UNKNOWN",
    chipped: null,
    neutered: null,
    healthNotes: "",
    specialNeeds: "",
    suitableForChildren: "UNKNOWN",
    suitableForDogs: "UNKNOWN",
    suitableForCats: "UNKNOWN",
    suitableForOtherAnimals: "UNKNOWN",
    apartmentSuitable: null,
    beginnerSuitable: null,
    needsExperiencedOwner: false,
    adoptionRequirements: "",
    gallery: [],
  }));
  assert.equal(sections.breed, false);
  assert.equal(sections.temperament, false);
  assert.equal(sections.health, false);
  assert.equal(sections.compatibility, false);
  assert.equal(sections.requirements, false);
  assert.equal(sections.gallery, false);
});

test("legacy fallback accepts only a published Help adoption", () => {
  const legacy = { category: "adopcia", status: "published" };
  assert.equal(isLegacyAdoptionFallbackCandidate(legacy), true);
  assert.equal(isLegacyAdoptionFallbackCandidate({ category: "adopcia", status: "draft" }), false);
  assert.equal(isLegacyAdoptionFallbackCandidate({ category: "zbierky", status: "published" }), false);
  const route = read("../app/pomoc-psom/adopcia/[slug]/page.tsx");
  assert.match(route, /getPublishedHelpCase\("adopcia", slug\)/);
  assert.ok(route.indexOf("getAdoptionBySlug(slug)") < route.indexOf("getLegacyAdoption(slug)"));
});

test("a DRAFT canonical row cannot shadow a published legacy adoption", () => {
  const legacy = { category: "adopcia", status: "published", slug: "ben" };
  const selected = resolveAdoptionDetailSource(dog("DRAFT"), legacy);
  assert.equal(selected?.kind, "legacy");
  assert.equal(selected?.item, legacy);
  assert.equal(resolveAdoptionDetailSource(dog("ACTIVE"), legacy)?.kind, "canonical");
});

test("catalog cards link to the new detail route", () => {
  const catalog = read("../components/adoption-catalog.tsx");
  assert.match(catalog, /adoptionDetailPath\(dog\.slug\)/);
  assert.match(catalog, /Zobraziť profil/);
});
