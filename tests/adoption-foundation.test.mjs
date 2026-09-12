import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  adoptionAgeCategory,
  adoptionHref,
  adoptionIsIndexable,
  adoptionIsStale,
  formatAdoptionAge,
} from "../lib/adoption.ts";

const dog = (overrides = {}) => ({
  slug: "testovaci-ben",
  status: "ACTIVE",
  birthDate: null,
  approximateAgeMonths: 30,
  mainImage: "/images/test-dog.webp",
  description: "Toto je dostatočne dlhý testovací opis adopčného psa, ktorý obsahuje viac než osemdesiat znakov pre indexačné pravidlo profilu.",
  lastVerifiedAt: "2026-09-10T10:00:00.000Z",
  ...overrides,
});

test("adoption age categories are deterministic", () => {
  assert.equal(adoptionAgeCategory(dog({ approximateAgeMonths: 6 })), "PUPPY");
  assert.equal(adoptionAgeCategory(dog({ approximateAgeMonths: 18 })), "YOUNG");
  assert.equal(adoptionAgeCategory(dog({ approximateAgeMonths: 60 })), "ADULT");
  assert.equal(adoptionAgeCategory(dog({ approximateAgeMonths: 120 })), "SENIOR");
  assert.match(formatAdoptionAge(dog({ approximateAgeMonths: 30 })), /3 roky/);
});

test("stale and indexability rules keep thin or old profiles out of search", () => {
  const now = new Date("2026-09-12T12:00:00.000Z");
  assert.equal(adoptionIsStale("2026-09-10T10:00:00.000Z", now), false);
  assert.equal(adoptionIsStale("2026-07-01T10:00:00.000Z", now), true);
  assert.equal(adoptionIsIndexable(dog(), now), true);
  assert.equal(adoptionIsIndexable(dog({ status: "ADOPTED" }), now), false);
  assert.equal(adoptionIsIndexable(dog({ mainImage: null }), now), false);
  assert.equal(adoptionIsIndexable(dog({ lastVerifiedAt: "2026-07-01T10:00:00.000Z" }), now), false);
});

test("adoption routes and storage are isolated from legacy help cases", () => {
  assert.equal(adoptionHref(dog()), "/pomoc-psom/adopcia/testovaci-ben");
  const migration = readFileSync(new URL("../drizzle/0029_adoption_dogs.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS adoption_dogs/);
  assert.match(migration, /organization_id INTEGER,/);
  assert.doesNotMatch(migration, /organization_id INTEGER REFERENCES/);
  assert.match(migration, /breed_id INTEGER REFERENCES managed_breeds/);
});

test("public adoption pages preserve legacy fallback and faceted noindex", () => {
  const listing = readFileSync(new URL("../app/pomoc-psom/adopcia/page.tsx", import.meta.url), "utf8");
  const detail = readFileSync(new URL("../app/pomoc-psom/adopcia/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(listing, /getPublishedHelpCases\("adopcia"\)/);
  assert.match(listing, /index: false, follow: true/);
  assert.match(detail, /getPublishedHelpCase\("adopcia", slug\)/);
  assert.match(detail, /adoptionIsIndexable\(dog\)/);
});

test("admin adoption listing is paginated instead of capped at 100", () => {
  const source = readFileSync(new URL("../lib/adoption-store.ts", import.meta.url), "utf8");
  assert.match(source, /ADOPTION_ADMIN_PAGE_SIZE/);
  assert.match(source, /LIMIT \? OFFSET \?/);
  assert.doesNotMatch(source, /listManagedAdoptions\([^)]*limit\s*=\s*100/);
});
