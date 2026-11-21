import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  getBreederRelationSelection,
  listBreederRelationOptions,
  listPublicBreederBreedLinks,
  saveBreederRelationSelection,
} from "../lib/breeder-profile-relations.ts";
import { attachBreederCardBreeds } from "../lib/directory-breeder-card.ts";
import { formatBreederRelationText, resolveBreederRelationText } from "../lib/breeder-relation-text.ts";

const removedColumns = /\b(?:fci_standard_json|editorial_json|related_breeds_json|seo_json)\b/;

function fixtureWithoutLegacyBreedJson() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE managed_breeds (
      id INTEGER PRIMARY KEY, name TEXT, slug TEXT, status TEXT,
      fci_number INTEGER, fci_group INTEGER, import_key TEXT,
      seo_noindex INTEGER, seo_canonical_url TEXT, image_url TEXT
    );
    CREATE TABLE directory_profiles (
      id INTEGER PRIMARY KEY, name TEXT, slug TEXT, city TEXT,
      category TEXT, status TEXT, archived_at TEXT,
      updated_at TEXT, updated_by TEXT
    );
    CREATE TABLE breed_directory_relations (
      breed_id INTEGER, profile_id INTEGER, relation_type TEXT,
      source TEXT, created_at TEXT, created_by TEXT,
      UNIQUE (breed_id, profile_id)
    );
    CREATE TABLE directory_breeder_club_relations (
      station_profile_id INTEGER, club_profile_id INTEGER,
      created_at TEXT, created_by TEXT,
      UNIQUE (station_profile_id, club_profile_id)
    );
    INSERT INTO managed_breeds VALUES
      (1,'Labrador','labrador','published',122,8,'fci-122',NULL,NULL,'/labrador.jpg'),
      (2,'Bígl','bigl','published',161,6,'fci-161',0,NULL,NULL),
      (3,'Duplicitný labrador','duplikat','published',122,8,'fci-122-extra',0,NULL,NULL),
      (4,'Skryté plemeno','skryte','published',33,1,'fci-33',1,NULL,NULL),
      (5,'Koncept','koncept','draft',34,1,'fci-34',0,NULL,NULL),
      (6,'Iná kanonická URL','ina-url','published',35,1,'fci-35',0,'/plemena/ine',NULL);
    INSERT INTO directory_profiles VALUES
      (10,'Chovateľská stanica','stanica','Nitra','chovatelske-stanice','published',NULL,NULL,NULL),
      (20,'Chovateľský klub','klub','Bratislava','chovatelske-kluby','published',NULL,NULL,NULL),
      (30,'Veterinár','veterinar','Nitra','veterinari','published',NULL,NULL,NULL);
    INSERT INTO breed_directory_relations VALUES
      (1,10,'breeding-station','fixture','now','test'),
      (3,10,'breeding-station','fixture','now','test'),
      (2,20,'breed-club','fixture','now','test');
    INSERT INTO directory_breeder_club_relations VALUES (10,20,'now','test');
  `);
  const columns = sqlite.prepare("PRAGMA table_info(managed_breeds)").all().map(row => row.name);
  assert.deepEqual(columns.filter(column => removedColumns.test(column)), []);

  const wrap = (sql, values = []) => {
    assert.doesNotMatch(sql, removedColumns, "Breeder read must not query removed breed JSON columns");
    return {
      bind: (...args) => wrap(sql, args),
      first: async () => sqlite.prepare(sql).get(...values) ?? null,
      all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
      execute: () => sqlite.prepare(sql).all(...values),
    };
  };
  const database = {
    prepare: sql => wrap(sql),
    batch: async statements => {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map(statement => ({ results: statement.execute() }));
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { sqlite, database };
}

test("station and club public details use canonical SQL-only breeds without four deleted JSON columns", async () => {
  const { sqlite, database } = fixtureWithoutLegacyBreedJson();
  try {
    const station = await listPublicBreederBreedLinks(database, 10);
    const club = await listPublicBreederBreedLinks(database, 20);
    assert.deepEqual(station.map(breed => [breed.id, breed.href]), [
      [1, "/plemena/retrievery-sliedice-vodne/labrador"],
    ]);
    assert.deepEqual(club.map(breed => [breed.id, breed.href]), [
      [2, "/plemena/durice/bigl"],
    ]);
    assert.deepEqual(await listPublicBreederBreedLinks(database, 30), []);
  } finally {
    sqlite.close();
  }
});

test("breeder cards load SQL-only canonical breed IDs even without a preloaded projection", async () => {
  const { sqlite, database } = fixtureWithoutLegacyBreedJson();
  try {
    const profiles = [
      { id: 10, category: "chovatelske-stanice", breedSummary: "Starší text" },
      { id: 20, category: "chovatelske-kluby", breedSummary: "" },
      { id: 30, category: "veterinari", breedSummary: "" },
    ];
    const updated = await attachBreederCardBreeds(database, profiles);
    assert.equal(updated[0].breedSummary, "Labrador");
    assert.equal(updated[1], profiles[1]);
    assert.equal(updated[2], profiles[2]);
  } finally {
    sqlite.close();
  }
});

test("Admin selection and Notion name reconciliation use the same SQL-only options in both directions", async () => {
  const { sqlite, database } = fixtureWithoutLegacyBreedJson();
  try {
    const options = await listBreederRelationOptions(database);
    assert.deepEqual(options.breeds.map(breed => breed.id).sort((a, b) => a - b), [1, 2]);
    assert.deepEqual(options.clubs.map(club => club.id), [20]);

    // Notion -> Admin: resolve Notion's human-readable name against canonical SQL options.
    const notionChoice = resolveBreederRelationText("Bígl", options.breeds);
    assert.deepEqual(notionChoice, { status: "resolved", ids: [2], unmatched: [] });
    const saved = await saveBreederRelationSelection(
      database, 10, { breedIds: notionChoice.ids, clubIds: [20] }, "notion-sync",
    );
    assert.deepEqual(saved, { breedIds: [2], clubIds: [20] });
    assert.deepEqual(await getBreederRelationSelection(database, 10), saved);

    // Admin -> Notion: format the updated SQL relation using exactly the same choices.
    const adminSaved = await saveBreederRelationSelection(
      database, 10, { breedIds: [1], clubIds: [20] }, "admin",
    );
    assert.equal(formatBreederRelationText(adminSaved.breedIds, options.breeds), "Labrador");
    assert.deepEqual((await listPublicBreederBreedLinks(database, 10)).map(breed => breed.id), [1]);

    const route = readFileSync("app/api/admin/directory/[id]/breeder-relations/route.ts", "utf8");
    const sync = readFileSync("lib/notion-directory-sync.ts", "utf8");
    assert.match(route, /const options = await listBreederRelationOptions\(database\)/);
    assert.match(route, /mirrorBreederRelationNamesToNotion/);
    assert.match(sync, /const options = await listBreederRelationOptions\(database\)/);
    assert.match(sync, /resolveBreederRelationText\(text/);
    assert.match(sync, /saveBreederRelationSelection\(database, input\.profile\.id/);
    assert.match(sync, /formatBreederRelationText\(selected\[field\]/);
  } finally {
    sqlite.close();
  }
});
