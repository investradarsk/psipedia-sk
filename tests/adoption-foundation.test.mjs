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
  prepareAdoptionWritePayload,
  resolveBreed,
} from "../lib/adoption-store.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

function breedDatabase() {
  return {
    prepare(query) {
      return {
        bind(id) {
          return {
            async first() {
              if (/managed_breeds/.test(query) && id === 42) return { id: 42, name: "Labradorský retriever", slug: "labradorsky-retriever" };
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
  organizationId: null,
  organizationName: "OZ Test",
  mainImage: "/images/ben.webp",
  shortDescription: "Priateľský labrador hľadá zodpovedný a trvalý domov.",
  description: "Ben je priateľský a aktívny pes, ktorý hľadá zodpovedný domov. Má rád ľudí, prechádzky a pravidelný kontakt so svojou rodinou.",
  temperament: "priateľský aktívny",
  lastVerifiedAt: "2026-09-14T10:00:00.000Z",
  ...overrides,
});

test("adoption schema keeps organization optional and links breeds to managed_breeds", () => {
  const schema = read("../db/adoption-schema.ts");
  const migration = read("../drizzle/0034_adoption_dogs_foundation.sql");
  assert.match(schema, /organizationId: integer\("organization_id"\),/);
  assert.match(schema, /breedId: integer\("breed_id"\)\.references\(\(\) => managedBreeds\.id/);
  assert.match(migration, /organization_id INTEGER,/);
  assert.doesNotMatch(migration, /organization_id INTEGER REFERENCES/);
  assert.match(migration, /breed_id INTEGER REFERENCES managed_breeds\(id\) ON DELETE SET NULL/);
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
  const db = breedDatabase();
  assert.deepEqual(await resolveBreed(db, null), { breedId: null, breedName: "", breedSlug: null });
  assert.deepEqual(await resolveBreed(db, 42), { breedId: 42, breedName: "Labradorský retriever", breedSlug: "labradorsky-retriever" });
  await assert.rejects(() => resolveBreed(db, 999), /managed_breeds/);
});

test("create payload resolves breed, refreshes search text and sets first published_at", async () => {
  const prepared = await prepareAdoptionWritePayload(
    breedDatabase(),
    validPublicPayload(),
    " Editor@Psipedia.sk ",
    null,
    new Date("2026-09-14T12:00:00.000Z"),
  );
  assert.equal(prepared.slug, "ben");
  assert.equal(prepared.breedName, "Labradorský retriever");
  assert.equal(prepared.organizationId, null);
  assert.match(prepared.searchText, /labradorsky retriever/);
  assert.match(prepared.searchText, /zlate moravce/);
  assert.equal(prepared.publishedAt, "2026-09-14T12:00:00.000Z");
  assert.equal(prepared.updatedBy, "editor@psipedia.sk");
});

test("update payload preserves original published_at and refreshes search text", async () => {
  const normalized = normalizeAdoptionInput(validPublicPayload());
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
    breedDatabase(),
    { status: "RESERVED", name: "Ben II" },
    "editor@psipedia.sk",
    existing,
    new Date("2026-09-14T13:00:00.000Z"),
  );
  assert.equal(prepared.status, "RESERVED");
  assert.equal(prepared.name, "Ben II");
  assert.equal(prepared.publishedAt, "2026-09-01T08:00:00.000Z");
  assert.match(prepared.searchText, /^ben ii /);
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
