import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  CANONICAL_BREED_OPTION_LIMIT,
  readCanonicalBreedOptions,
} from "../lib/breed-options.ts";
import { listPublishedAdoptionBreedOptions } from "../lib/adoption-store.ts";
import { listAdoptionAdminBreedOptions } from "../lib/adoption-admin-write.ts";

function breedDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE managed_breeds (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'published',
      fci_number INTEGER,
      import_key TEXT,
      seo_json TEXT NOT NULL DEFAULT '{}',
      fci_group INTEGER NOT NULL DEFAULT 8
    )
  `);

  const prepare = (sql, values = []) => ({
    bind(...next) { return prepare(sql, next); },
    async all() { return { results: sqlite.prepare(sql).all(...values) }; },
    async first() { return sqlite.prepare(sql).get(...values) ?? null; },
    async run() { return sqlite.prepare(sql).run(...values); },
  });

  return {
    sqlite,
    prepare,
    add({ id, slug, name, fciNumber = id, importKey = `fci-${id}`, status = "published", seoJson = "{}", fciGroup = 8 }) {
      sqlite.prepare(`INSERT INTO managed_breeds
        (id, slug, name, status, fci_number, import_key, seo_json, fci_group)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, slug, name, status, fciNumber, importKey, seoJson, fciGroup);
    },
  };
}

test("canonical adoption breed options have no hidden 500/1000 cap", async () => {
  const db = breedDatabase();
  try {
    db.sqlite.exec("BEGIN");
    for (let id = 1; id <= 1205; id += 1) {
      db.add({
        id,
        slug: `plemeno-${String(id).padStart(4, "0")}`,
        name: `Plemeno ${String(id).padStart(4, "0")}`,
      });
    }
    db.sqlite.exec("COMMIT");

    const shared = await readCanonicalBreedOptions(db);
    const publicOptions = await listPublishedAdoptionBreedOptions(db);
    const adminOptions = await listAdoptionAdminBreedOptions(db);

    assert.equal(CANONICAL_BREED_OPTION_LIMIT, 2000);
    assert.equal(shared.available, true);
    assert.equal(shared.options.length, 1205);
    assert.equal(publicOptions.available, true);
    assert.equal(publicOptions.options.length, 1205);
    assert.equal(adminOptions.available, true);
    assert.equal(adminOptions.options.length, 1205);
    assert.deepEqual(publicOptions.options, shared.options);
    assert.deepEqual(adminOptions.options, shared.options);
  } finally {
    db.sqlite.close();
  }
});

test("options deduplicate canonical identity, not duplicate display labels", async () => {
  const db = breedDatabase();
  try {
    db.add({ id: 1, slug: "rovnake-meno-a", name: "Rovnaké meno", fciNumber: 1, importKey: "fci-1" });
    db.add({ id: 2, slug: "rovnake-meno-b", name: "Rovnaké meno", fciNumber: 2, importKey: "fci-2" });
    db.add({ id: 3, slug: "konflikt-identity", name: "Iný názov", fciNumber: 1, importKey: "fci-3" });

    const result = await readCanonicalBreedOptions(db);

    assert.equal(result.available, true);
    assert.deepEqual(result.options.map((option) => option.id), [1, 2]);
    assert.deepEqual(result.options.map((option) => option.name), ["Rovnaké meno", "Rovnaké meno"]);
  } finally {
    db.sqlite.close();
  }
});

test("Slovak names keep diacritics and deterministic Slovak ordering", async () => {
  const db = breedDatabase();
  try {
    db.add({ id: 10, slug: "zlty-pes", name: "Žltý pes" });
    db.add({ id: 11, slug: "abel", name: "Ábel" });
    db.add({ id: 12, slug: "cesky-fuzac", name: "Český fúzač" });

    const first = await readCanonicalBreedOptions(db);
    const second = await readCanonicalBreedOptions(db);

    assert.deepEqual(first.options.map((option) => option.name), ["Ábel", "Český fúzač", "Žltý pes"]);
    assert.deepEqual(second.options, first.options);
  } finally {
    db.sqlite.close();
  }
});

test("edit options retain an existing breed even after it is no longer published", async () => {
  const db = breedDatabase();
  try {
    db.add({ id: 1, slug: "labradorsky-retriever", name: "Labradorský retriever" });
    db.add({ id: 99, slug: "stare-plemeno", name: "Staré plemeno", status: "draft" });

    const withoutLegacy = await listAdoptionAdminBreedOptions(db);
    const withLegacy = await listAdoptionAdminBreedOptions(
      db,
      { id: 99, name: "Staré plemeno" },
      99,
    );

    assert.deepEqual(withoutLegacy.options.map((option) => option.id), [1]);
    assert.deepEqual(withLegacy.options.map((option) => option.id), [1, 99]);
    assert.equal(withLegacy.options.find((option) => option.id === 99)?.name, "Staré plemeno");
  } finally {
    db.sqlite.close();
  }
});

test("unavailable source never fabricates canonical options and only carries persisted selection", async () => {
  const unavailable = await readCanonicalBreedOptions(null);
  assert.deepEqual(unavailable, { available: false, options: [] });

  const outageDb = {
    prepare() {
      throw new Error("database unavailable");
    },
  };
  const selected = { id: 77, name: "Uložené legacy plemeno" };
  const duringOutage = await readCanonicalBreedOptions(outageDb, { selected, selectedId: 77 });

  assert.equal(duringOutage.available, false);
  assert.deepEqual(duringOutage.options, [selected]);
});
