import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  adoptionFreshness,
  adoptionIsIndexable,
  assertAdoptionStatusTransition,
  normalizeAdoptionInput,
  normalizeAdoptionSearchText,
  normalizeAdoptionStatus,
  normalizeOptionalPositiveId,
  slugifyAdoptionSlug,
} from "../lib/adoption.ts";
import {
  buildAdminAdoptionQuery,
  buildPublicAdoptionQuery,
  getPublicAdoptionBySlug,
  getPublicAdoptionOrganizationById,
  prepareAdoptionWritePayload,
  resolveBreed,
  resolveOrganization,
} from "../lib/adoption-store.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

function relationDatabase() {
  return {
    prepare(query) {
      return {
        bind(id) {
          return {
            async first() {
              if (/managed_breeds/.test(query) && id === 42) return { id: 42, name: "Labradorský retriever", slug: "labradorsky-retriever" };
              if (/help_organizations/.test(query) && id === 7) return { id: 7, name: "Canonical OZ", slug: "canonical-oz" };
              return null;
            },
            async all() { return { results: [] }; },
            async run() { return {}; },
            bind() { return this; },
          };
        },
        async first() { return null; },
        async all() { return { results: [] }; },
        async run() { return {}; },
      };
    },
  };
}

const validPublicPayload = (overrides = {}) => ({
  name: " Ben ",
  slug: "",
  status: "ACTIVE",
  sex: "MALE",
  approximateAgeMonths: 30,
  size: "LARGE",
  breedId: 42,
  breedName: "stary nazov",
  region: "Nitriansky kraj",
  city: "Zlaté Moravce",
  organizationId: 7,
  organizationName: "Nedôveryhodný vstup",
  organizationSlug: "iny-slug",
  mainImage: "/images/ben.webp",
  shortDescription: "Priateľský labrador hľadá zodpovedný a trvalý domov.",
  description: "Ben je priateľský a aktívny pes, ktorý hľadá zodpovedný domov. Má rád ľudí, prechádzky a pravidelný kontakt so svojou rodinou.",
  temperament: "priateľský aktívny",
  lastVerifiedAt: "2026-09-14T10:00:00.000Z",
  ...overrides,
});

test("adoption schema keeps organization nullable but hardens it to help_organizations", () => {
  const schema = read("../db/adoption-schema.ts");
  const foundation = read("../drizzle/0034_adoption_dogs_foundation.sql");
  const hardening = read("../drizzle/0042_adoption_organization_relation_hardening.sql");
  assert.match(schema, /organizationId: integer\("organization_id"\)\.references\(\(\) => helpOrganizations\.id, \{ onDelete: "restrict" \}\)/);
  assert.doesNotMatch(schema, /organizationId: integer\("organization_id"\)\.notNull/);
  assert.match(schema, /breedId: integer\("breed_id"\)\.references\(\(\) => managedBreeds\.id/);
  assert.match(foundation, /organization_id INTEGER,/);
  assert.doesNotMatch(foundation, /organization_id INTEGER REFERENCES/);
  assert.match(hardening, /organization_id INTEGER REFERENCES help_organizations\(id\) ON DELETE RESTRICT/);
  assert.doesNotMatch(hardening, /organization_id INTEGER NOT NULL/);
});

test("adoption foundation preserves lifecycle, search and stale-verification fields", () => {
  const migration = read("../drizzle/0034_adoption_dogs_foundation.sql");
  assert.match(migration, /'DRAFT', 'ACTIVE', 'RESERVED', 'ADOPTED', 'ARCHIVED'/);
  assert.match(migration, /search_text TEXT NOT NULL DEFAULT ''/);
  assert.match(migration, /published_at TEXT/);
  assert.match(migration, /last_verified_at TEXT/);
});

test("drizzle config keeps existing schemas and adoption schema", () => {
  const config = read("../drizzle.config.ts");
  for (const schema of ["./db/schema.ts", "./db/foundation-schema.ts", "./db/lost-found-dogs-schema.ts", "./db/adoption-schema.ts"]) {
    assert.match(config, new RegExp(schema.replaceAll(".", "\\.")));
  }
});

test("lifecycle validation accepts known states and rejects unsafe transitions", () => {
  assert.equal(normalizeAdoptionStatus("active"), "ACTIVE");
  assert.equal(normalizeAdoptionStatus(""), "DRAFT");
  assert.throws(() => normalizeAdoptionStatus("deleted"), /neplatnú hodnotu/);
  assert.doesNotThrow(() => assertAdoptionStatusTransition("ACTIVE", "RESERVED"));
  assert.doesNotThrow(() => assertAdoptionStatusTransition("ARCHIVED", "DRAFT"));
  assert.throws(() => assertAdoptionStatusTransition("ARCHIVED", "ACTIVE"), /Nepovolený prechod/);
  assert.equal(normalizeOptionalPositiveId("17", "Plemeno"), 17);
  assert.throws(() => normalizeOptionalPositiveId(0, "Plemeno"), /kladné ID/);
});

test("stale/fresh and indexability are deterministic", () => {
  const now = new Date("2026-09-14T12:00:00.000Z");
  assert.equal(adoptionFreshness("2026-09-10T10:00:00.000Z", now), "fresh");
  assert.equal(adoptionFreshness("2026-07-01T10:00:00.000Z", now), "stale");
  const base = { status: "ACTIVE", mainImage: "/images/ben.webp", description: "x".repeat(100), lastVerifiedAt: "2026-09-10T10:00:00.000Z" };
  assert.equal(adoptionIsIndexable(base, now), true);
  assert.equal(adoptionIsIndexable({ ...base, status: "RESERVED" }, now), false);
  assert.equal(adoptionIsIndexable({ ...base, lastVerifiedAt: "2026-07-01T10:00:00.000Z" }, now), false);
});

test("search text and slug normalization are diacritic-insensitive", () => {
  assert.equal(normalizeAdoptionSearchText([" Žltý  Labrador ", "Zlaté Moravce"]), "zlty labrador zlate moravce");
  assert.equal(slugifyAdoptionSlug("Žltý Labrador Ben"), "zlty-labrador-ben");
});

test("resolveBreed validates breed ids against managed_breeds", async () => {
  const db = relationDatabase();
  assert.deepEqual(await resolveBreed(db, null), { breedId: null, breedName: "", breedSlug: null });
  assert.deepEqual(await resolveBreed(db, 42), { breedId: 42, breedName: "Labradorský retriever", breedSlug: "labradorsky-retriever" });
  await assert.rejects(() => resolveBreed(db, 999), /managed_breeds/);
});

test("resolveOrganization rejects nonexistent ids and loads canonical identity", async () => {
  const db = relationDatabase();
  assert.deepEqual(await resolveOrganization(db, null), { organizationId: null, organizationName: "", organizationSlug: null });
  assert.deepEqual(await resolveOrganization(db, 7), { organizationId: 7, organizationName: "Canonical OZ", organizationSlug: "canonical-oz" });
  await assert.rejects(() => resolveOrganization(db, 999), /help_organizations/);
});

test("public adoption organization link is canonical-id based and fail-closed to published profiles", async () => {
  const queries = [];
  const db = {
    prepare(query) {
      queries.push(query);
      return {
        bind(id) {
          return {
            async first() {
              return id === 7 ? { id: 7, name: "Canonical OZ", slug: "canonical-oz" } : null;
            },
          };
        },
      };
    },
  };
  assert.equal(await getPublicAdoptionOrganizationById(null, db), null);
  assert.deepEqual(await getPublicAdoptionOrganizationById(7, db), { id: 7, name: "Canonical OZ", slug: "canonical-oz" });
  assert.equal(await getPublicAdoptionOrganizationById(999, db), null);
  assert.equal(queries.length, 2);
  assert.match(queries[0], /WHERE id = \? AND status = 'PUBLISHED' AND published_at IS NOT NULL AND archived_at IS NULL/);
  assert.doesNotMatch(queries[0], /organization_name|organization_slug/i);
});

test("create payload derives organization snapshots from canonical organization_id", async () => {
  const prepared = await prepareAdoptionWritePayload(
    relationDatabase(),
    validPublicPayload(),
    " Editor@Psipedia.sk ",
    null,
    new Date("2026-09-14T12:00:00.000Z"),
  );
  assert.equal(prepared.slug, "ben");
  assert.equal(prepared.breedName, "Labradorský retriever");
  assert.equal(prepared.organizationId, 7);
  assert.equal(prepared.organizationName, "Canonical OZ");
  assert.equal(prepared.organizationSlug, "canonical-oz");
  assert.doesNotMatch(prepared.searchText, /nedôveryhodný|iny-slug/i);
  assert.match(prepared.searchText, /canonical oz/);
  assert.match(prepared.searchText, /labradorsky retriever/);
  assert.match(prepared.searchText, /zlate moravce/);
  assert.equal(prepared.publishedAt, "2026-09-14T12:00:00.000Z");
  assert.equal(prepared.updatedBy, "editor@psipedia.sk");
});

test("mismatched supplied organization name and slug cannot create an inconsistent snapshot", async () => {
  const prepared = await prepareAdoptionWritePayload(
    relationDatabase(),
    validPublicPayload({ organizationName: "Organizácia B", organizationSlug: "organizacia-b" }),
    "editor@psipedia.sk",
  );
  assert.equal(prepared.organizationId, 7);
  assert.equal(prepared.organizationName, "Canonical OZ");
  assert.equal(prepared.organizationSlug, "canonical-oz");
});

test("public adoption lifecycle rejects a missing canonical organization relation while draft stays nullable", async () => {
  await assert.rejects(
    () => prepareAdoptionWritePayload(relationDatabase(), validPublicPayload({ organizationId: null }), "editor@psipedia.sk"),
    /canonical organization_id/,
  );
  const draft = await prepareAdoptionWritePayload(
    relationDatabase(),
    validPublicPayload({ status: "DRAFT", organizationId: null, organizationName: "Legacy zodpovedná osoba", organizationSlug: null }),
    "editor@psipedia.sk",
  );
  assert.equal(draft.organizationId, null);
  assert.equal(draft.organizationName, "Legacy zodpovedná osoba");
  assert.equal(draft.organizationSlug, null);
});

test("update refreshes linked snapshots from the current canonical organization identity", async () => {
  const normalized = normalizeAdoptionInput(validPublicPayload({ organizationName: "Historický snapshot", organizationSlug: "historicky-slug" }));
  const existing = {
    id: 5,
    ...normalized,
    breedSlug: "labradorsky-retriever",
    publishedAt: "2026-09-01T08:00:00.000Z",
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-10T08:00:00.000Z",
    createdBy: "a@b.sk",
    updatedBy: "a@b.sk",
  };
  const prepared = await prepareAdoptionWritePayload(
    relationDatabase(),
    { status: "RESERVED", name: "Ben II" },
    "editor@psipedia.sk",
    existing,
    new Date("2026-09-14T13:00:00.000Z"),
  );
  assert.equal(prepared.status, "RESERVED");
  assert.equal(prepared.name, "Ben II");
  assert.equal(prepared.organizationName, "Canonical OZ");
  assert.equal(prepared.organizationSlug, "canonical-oz");
  assert.equal(prepared.publishedAt, "2026-09-01T08:00:00.000Z");
  assert.match(prepared.searchText, /^ben ii /);
});

test("public adoption read uses canonical organization join without snapshot fallback for linked rows", async () => {
  const queries = [];
  const db = {
    prepare(query) {
      queries.push(query);
      return {
        bind() {
          return {
            async first() {
              return {
                id: 11, name: "Ben", slug: "ben", status: "ACTIVE", sex: "MALE", birth_date: null,
                approximate_age_months: 30, size: "LARGE", weight: null, breed_id: null, breed_name: "", breed_slug: null,
                breed_profile_name: null, breed_mix: 0, color: "", region: "Nitriansky kraj", district: "", city: "Nitra",
                organization_id: 7, organization_name: "Starý snapshot", organization_slug: "stary-slug",
                canonical_organization_name: "Canonical OZ Renamed", canonical_organization_slug: "canonical-oz-renamed",
                main_image: null, gallery_json: "[]", short_description: "x".repeat(40), description: "", temperament: "",
                activity_level: "UNKNOWN", suitable_for_children: "UNKNOWN", suitable_for_dogs: "UNKNOWN",
                suitable_for_cats: "UNKNOWN", suitable_for_other_animals: "UNKNOWN", apartment_suitable: null,
                beginner_suitable: null, needs_experienced_owner: 0, vaccination_status: "UNKNOWN", chipped: null, neutered: null,
                health_notes: "", special_needs: "", adoption_requirements: "", external_source_url: null, contact_email: null,
                contact_phone: null, contact_url: null, search_text: "", published_at: "2026-09-01T00:00:00.000Z",
                last_verified_at: "2026-09-01T00:00:00.000Z", created_at: "2026-09-01T00:00:00.000Z",
                updated_at: "2026-09-01T00:00:00.000Z", created_by: "test", updated_by: "test",
              };
            },
          };
        },
      };
    },
  };
  const dog = await getPublicAdoptionBySlug("ben", db);
  assert.equal(dog.organizationId, 7);
  assert.equal(dog.organizationName, "Canonical OZ Renamed");
  assert.equal(dog.organizationSlug, "canonical-oz-renamed");
  assert.match(queries[0], /LEFT JOIN help_organizations o ON o\.id = d\.organization_id/);
  assert.doesNotMatch(queries[0], /organization_name\s*=|organization_slug\s*=/i);
});

test("public query is limited to ACTIVE/RESERVED and applies search/pagination", () => {
  const query = buildPublicAdoptionQuery({ q: "Žltý Ben", page: 3, size: "LARGE" });
  assert.match(query.where, /d\.status IN \('ACTIVE','RESERVED'\)/);
  assert.doesNotMatch(query.where, /DRAFT|ADOPTED|ARCHIVED/);
  assert.deepEqual(query.bindings, ["%zlty ben%", "LARGE"]);
  assert.equal(query.pageSize, 24);
  assert.equal(query.offset, 48);
});

test("admin query supports lifecycle, stale filtering, search and pagination", () => {
  const query = buildAdminAdoptionQuery(
    { q: "Zlaté Moravce", status: "ACTIVE", stale: "stale", page: 2 },
    new Date("2026-09-14T12:00:00.000Z"),
  );
  assert.match(query.where, /search_text LIKE \?/);
  assert.match(query.where, /status = \?/);
  assert.match(query.where, /last_verified_at IS NULL OR last_verified_at < \?/);
  assert.equal(query.bindings[0], "%zlate moravce%");
  assert.equal(query.bindings[1], "ACTIVE");
  assert.equal(query.pageSize, 40);
  assert.equal(query.offset, 40);
});
