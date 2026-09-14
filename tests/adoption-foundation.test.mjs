import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizeAdoptionStatus,
  normalizeOptionalPositiveId,
  resolveBreed,
} from "../lib/adoption-store.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

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
  assert.match(migration, /adoption_dogs_verified_idx ON adoption_dogs\(status, last_verified_at\)/);
});

test("drizzle config keeps existing schemas and adds adoption schema", () => {
  const config = read("../drizzle.config.ts");

  for (const schema of [
    "./db/schema.ts",
    "./db/foundation-schema.ts",
    "./db/lost-found-dogs-schema.ts",
    "./db/adoption-schema.ts",
  ]) {
    assert.match(config, new RegExp(schema.replaceAll(".", "\\.")));
  }
});

test("minimal foundation validation accepts lifecycle states and rejects invalid ids", () => {
  assert.equal(normalizeAdoptionStatus("active"), "ACTIVE");
  assert.equal(normalizeAdoptionStatus(""), "DRAFT");
  assert.throws(() => normalizeAdoptionStatus("deleted"), /Neplatný stav/);
  assert.equal(normalizeOptionalPositiveId("17", "Plemeno"), 17);
  assert.equal(normalizeOptionalPositiveId(null, "Plemeno"), null);
  assert.throws(() => normalizeOptionalPositiveId(0, "Plemeno"), /kladné ID/);
});

test("resolveBreed validates breed ids against managed_breeds", async () => {
  const seen = [];
  const database = {
    prepare(query) {
      seen.push(query);
      return {
        bind(id) {
          seen.push(id);
          return {
            async first() {
              return id === 42 ? { id: 42, name: "Labradorský retriever", slug: "labradorsky-retriever" } : null;
            },
          };
        },
      };
    },
  };

  assert.deepEqual(await resolveBreed(database, null), { breedId: null, breedName: "", breedSlug: null });
  assert.deepEqual(await resolveBreed(database, 42), {
    breedId: 42,
    breedName: "Labradorský retriever",
    breedSlug: "labradorsky-retriever",
  });
  await assert.rejects(() => resolveBreed(database, 999), /managed_breeds/);
  assert.match(seen[0], /FROM managed_breeds WHERE id = \?/);
});
