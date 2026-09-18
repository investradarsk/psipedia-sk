import test from "node:test";
import assert from "node:assert/strict";
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
