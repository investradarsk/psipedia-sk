import test from "node:test";
import assert from "node:assert/strict";
import { mergeManagedBreedEdit, mergeNotionBreedInput } from "../lib/breed-sync-preservation.ts";
import {
  adminBreedCounts,
  breedCompletenessIssues,
  defaultAdminBreedFilters,
  filterAdminBreeds,
  normalizeAdminBreedSearch,
  validateBulkBreedStatus,
} from "../lib/admin-breeds.ts";

const complete = {
  id: 1,
  slug: "biely-svajciarsky-ovciak",
  name: "Biely švajčiarsky ovčiak",
  status: "published",
  fciGroup: 1,
  fciSection: "Ovčiarske psy",
  origin: "Švajčiarsko",
  group: "Ovčiarske a pastierske psy",
  officialFciName: "WHITE SWISS SHEPHERD DOG",
  completenessIssues: [],
};

const sparse = {
  id: 2,
  slug: "burgosky-stavac",
  name: "Burgoský stavač",
  status: "draft",
  fciGroup: 7,
  fciSection: "Kontinentálne stavače",
  origin: "Španielsko",
  group: "Stavače",
  officialFciName: "PERDIGUERO DE BURGOS",
  completenessIssues: ["Chýba prehľad", "Bez športov"],
};

test("admin breed search is diacritic-insensitive and combines filters", () => {
  assert.equal(normalizeAdminBreedSearch("Švajčiarsko"), "svajciarsko");
  const bySearch = filterAdminBreeds([complete, sparse], { ...defaultAdminBreedFilters, query: "svajciarsky" });
  assert.deepEqual(bySearch.map((breed) => breed.id), [1]);
  const byGroupStatus = filterAdminBreeds([complete, sparse], { ...defaultAdminBreedFilters, fciGroup: "7", status: "draft" });
  assert.deepEqual(byGroupStatus.map((breed) => breed.id), [2]);
  const bySectionOrigin = filterAdminBreeds([complete, sparse], { ...defaultAdminBreedFilters, fciSection: "Ovčiarske psy", origin: "Švajčiarsko" });
  assert.deepEqual(bySectionOrigin.map((breed) => breed.id), [1]);
});

test("completeness uses only deterministically available fields and never invents a score", () => {
  assert.deepEqual(breedCompletenessIssues({
    image: "",
    overview: "",
    needs: "",
    exercise: "",
    training: "",
    health: "",
    fciNumber: null,
    hasFciReference: false,
    sportsCount: 0,
    articleRelationCount: 0,
    directoryRelationCount: 0,
  }), [
    "Chýba obrázok",
    "Chýba prehľad",
    "Chýba praktický obsah",
    "Chýba FCI referencia",
    "Bez športov",
    "Bez prepojení",
  ]);
  assert.deepEqual(breedCompletenessIssues({
    image: "/media/breed.webp",
    overview: "Overený prehľad",
    needs: "Denné potreby",
    exercise: "",
    training: "",
    health: "",
    fciNumber: 347,
    hasFciReference: true,
    sportsCount: 1,
    articleRelationCount: 1,
    directoryRelationCount: 0,
  }), []);
});

test("counts and incomplete filter reflect issue presence rather than percentages", () => {
  assert.deepEqual(adminBreedCounts([complete, sparse]), { all: 2, published: 1, draft: 1, incomplete: 1 });
  assert.deepEqual(
    filterAdminBreeds([complete, sparse], { ...defaultAdminBreedFilters, completeness: "incomplete" }).map((breed) => breed.id),
    [2],
  );
  assert.deepEqual(
    filterAdminBreeds([complete, sparse], { ...defaultAdminBreedFilters, completeness: "complete" }).map((breed) => breed.id),
    [1],
  );
});

test("bulk publication accepts explicit fresh snapshots only", () => {
  const payload = validateBulkBreedStatus({
    status: "published",
    confirmedCount: 2,
    breeds: [
      { id: 2, status: "draft", updatedAt: "2026-09-18T20:00:00.000Z" },
      { id: 3, status: "draft", updatedAt: "2026-09-18T21:00:00.000Z" },
    ],
  });
  assert.equal(payload.status, "published");
  assert.deepEqual(payload.breeds.map((breed) => breed.id), [2, 3]);
  assert.throws(() => validateBulkBreedStatus({
    status: "published",
    confirmedCount: 1,
    breeds: [{ id: 2, status: "published", updatedAt: "2026-09-18T20:00:00.000Z" }],
  }), /požadovaný stav/);
  assert.throws(() => validateBulkBreedStatus({
    status: "draft",
    confirmedCount: 2,
    breeds: [
      { id: 2, status: "published", updatedAt: "2026-09-18T20:00:00.000Z" },
      { id: 2, status: "published", updatedAt: "2026-09-18T20:00:00.000Z" },
    ],
  }), /neplatný/);
});


test("sparse Notion resync preserves rich FCI, cover, gallery, SEO/OG and unedited relationships", () => {
  const existing = {
    id: 12, name: "Labrador", slug: "labrador", status: "draft", importKey: "fci-122", fciNumber: 122,
    image: "/media/breeds/cover.webp", imageKey: "breeds/cover.webp",
    gallery: [{ imageUrl: "/media/breeds/gallery.webp", imageKey: "breeds/gallery.webp", alt: "Pri vode" }],
    fciStandard: { oci: "Oči podľa normy", fci_standard_pdf: "https://fci.be/standard.pdf" },
    editorial: { overview: "Odborný opis", heroTraits: [{ label: "Pokoj", rating: 4 }] },
    sports: [{ key: "nosework", label: "Nosework", rating: 5 }],
    relatedBreedIds: [11], relatedArticleIds: [10], directoryProfileIds: [9],
    sources: [{ label: "FCI", url: "https://www.fci.be/" }],
    accent: "gold", editorialComplete: true, health: "Pôvodný zdravotný text",
    seo: { title: "Starý názov", description: "Overený popis", canonicalUrl: "https://psipedia.sk/plemena/labrador", ogTitle: "Ručné OG", ogDescription: "Ručný OG popis", ogImage: "/media/breeds/custom-og.webp", focusKeyword: "retriever", noindex: true },
  };
  const fromNotion = {
    name: "Labrador retriever", slug: "labrador", status: "draft", fciNumber: 122,
    image: "", gallery: [], importKey: null, fciStandard: undefined, sports: [],
    health: "", editorialComplete: undefined, relatedArticleIds: [],
    seo: { title: "Nový názov", description: "", ogTitle: "Automatický OG", ogDescription: "" },
  };
  const merged = mergeNotionBreedInput(existing, fromNotion);
  assert.equal(merged.name, "Labrador retriever");
  assert.equal(merged.status, "draft");
  assert.equal(merged.importKey, "fci-122");
  for (const field of ["gallery", "fciStandard", "editorial", "sports", "relatedBreedIds", "relatedArticleIds", "directoryProfileIds", "sources"]) {
    assert.deepEqual(merged[field], existing[field], `notion erased ${field}`);
  }
  assert.equal(merged.image, existing.image);
  assert.equal(merged.imageKey, existing.imageKey);
  assert.equal(merged.health, existing.health);
  assert.equal(merged.editorialComplete, true);
  assert.equal(merged.seo.title, "Nový názov");
  for (const field of ["description", "canonicalUrl", "ogTitle", "ogDescription", "ogImage", "focusKeyword", "noindex"]) {
    assert.equal(merged.seo[field], existing.seo[field], `notion erased seo.${field}`);
  }
  assert.throws(() => mergeNotionBreedInput(existing, {slug: "different"}), /kanonickou identitou/);
  assert.throws(() => mergeNotionBreedInput(existing, {fciNumber: 999}), /kanonickou identitou/);
  assert.throws(() => mergeNotionBreedInput(existing, {importKey: "other"}), /kanonickou identitou/);
});

test("partial admin edits preserve untouched FCI/SEO/media; explicit clears remain possible", () => {
  const existing = {
    slug: "labrador", name: "Labrador", status: "draft",
    fciStandard: { oci: "Hnedé", telo: "Pevné" },
    editorial: { overview: "Odborný text", healthTip: "Kontrola" },
    gallery: [{ imageUrl: "/media/breeds/one.webp" }],
    image: "/media/breeds/cover.webp",
    sports: [{ key: "agility", label: "Agility", rating: 4 }],
    seo: { title: "FCI plemeno", canonicalUrl: "https://psipedia.sk/plemena/labrador", ogImage: "/media/breeds/og.webp", noindex: true },
    relatedArticleIds: [5], relatedBreedIds: [6],
  };
  const edited = mergeManagedBreedEdit(existing, {
    character: "Zmenená povaha",
    fciStandard: { oci: "Jantárové" },
    editorial: { healthTip: "Nová kontrola" },
    seo: { description: "Nový meta popis" },
  });
  assert.deepEqual(edited.fciStandard, { oci: "Jantárové", telo: "Pevné" });
  assert.deepEqual(edited.editorial, { overview: "Odborný text", healthTip: "Nová kontrola" });
  assert.deepEqual(edited.seo, { ...existing.seo, description: "Nový meta popis" });
  for (const field of ["gallery", "image", "sports", "relatedArticleIds", "relatedBreedIds"]) {
    assert.deepEqual(edited[field], existing[field], `editor erased ${field}`);
  }
  const cleared = mergeManagedBreedEdit(existing, { gallery: [], seo: { ogImage: "" }, fciStandard: { oci: "" } });
  assert.deepEqual(cleared.gallery, []);
  assert.equal(cleared.seo.ogImage, "");
  assert.equal(cleared.fciStandard.oci, "");
  assert.equal(cleared.fciStandard.telo, "Pevné");
});
