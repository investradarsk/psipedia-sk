import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  getBreederRelationSelection, saveBreederRelationSelection,
  listPublicBreederClubLinks, listPublicClubStationLinks,
} from "../lib/breeder-profile-relations.ts";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE managed_breeds (id INTEGER PRIMARY KEY,name TEXT,status TEXT);
    CREATE TABLE directory_profiles (
      id INTEGER PRIMARY KEY,slug TEXT,name TEXT,category TEXT,status TEXT,
      archived_at TEXT,source_data_json TEXT,updated_at TEXT,updated_by TEXT
    );
    CREATE TABLE breed_directory_relations (
      breed_id INTEGER,profile_id INTEGER,relation_type TEXT,source TEXT,
      created_at TEXT,created_by TEXT,UNIQUE(breed_id,profile_id)
    );
  `);
  const migration = readFileSync("drizzle/0169_directory_breeder_club_relations.sql", "utf8")
    .split("--> statement-breakpoint").join("\n");
  sqlite.exec(migration);
  sqlite.exec(`
    INSERT INTO managed_breeds VALUES (100,'Labrador','published'),(101,'Vlkodav','published');
    INSERT INTO directory_profiles VALUES
      (10,'stanica','Stanica','chovatelske-stanice','published',NULL,
       '{"_psipedia_breeder_club_profile_ids":"[20]"}','2026-01-01','test'),
      (20,'klub','Klub','chovatelske-kluby','published',NULL,
       '{}','2026-01-01','test'),
      (30,'trener','Tréner','treneri','published',NULL,
       '{}','2026-01-01','test');
  `);
  const wrap = (sql, values = []) => ({
    bind: (...args) => wrap(sql, args),
    all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
    first: async () => sqlite.prepare(sql).get(...values) ?? null,
    _execute: () => sqlite.prepare(sql).all(...values),
  });
  const database = {
    prepare: sql => wrap(sql),
    batch: async statements => {
      sqlite.exec("BEGIN");
      try {
        const result = statements.map(statement => ({ results: statement._execute() }));
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { sqlite, database };
}

test("station and kennel club share SQL breeds; trainer has no linked breeds", async () => {
  const { sqlite, database } = fixture();
  try {
    assert.equal(await getBreederRelationSelection(database, 30), null);
    await saveBreederRelationSelection(database, 10, {breedIds:[100],clubIds:[20]}, "test");
    await saveBreederRelationSelection(database, 20, {breedIds:[101],clubIds:[]}, "test");
    assert.deepEqual(await getBreederRelationSelection(database, 10), {breedIds:[100],clubIds:[20]});
    assert.deepEqual(await getBreederRelationSelection(database, 20), {breedIds:[101],clubIds:[]});
    assert.deepEqual(await listPublicBreederClubLinks(database, 10), [
      {id:20,name:"Klub",href:"/adresar/chovatelske-kluby/klub"},
    ]);
    assert.deepEqual(await listPublicClubStationLinks(database, 20), [
      {id:10,name:"Stanica",href:"/adresar/chovatelske-stanice/stanica"},
    ]);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM breed_directory_relations WHERE profile_id=30").get().n,0);
    assert.equal(sqlite.prepare("SELECT source_data_json FROM directory_profiles WHERE id=10").get().source_data_json,
      '{"_psipedia_breeder_club_profile_ids":"[20]"}');
    await assert.rejects(
      saveBreederRelationSelection(database,20,{breedIds:[],clubIds:[20]},"test"),
      /neprepája/,
    );
  } finally { sqlite.close(); }
});

test("new station-club table starts blank; legacy relation JSON is never imported", () => {
  const { sqlite } = fixture();
  try {
    const preflight = readFileSync("scripts/d1-breeder-club-links-preflight.sql","utf8");
    const before = sqlite.prepare(preflight).get();
    assert.equal(before.invalid_json,0);
    assert.equal(before.invalid_club_array,0);
    assert.equal(before.invalid_club_targets,0);
    assert.equal(before.legacy_pairs,1);
    // The old JSON link is deliberately ignored. The canonical SQL stays empty.
    const postflight = readFileSync("scripts/d1-breeder-club-links-postflight.sql","utf8");
    const after = sqlite.prepare(postflight).get();
    assert.equal(after.station_club_table_exists,1);
    assert.equal(after.station_club_links,0);
    assert.equal(after.station_breed_links,0);
    assert.equal(after.club_breed_links,0);
  } finally { sqlite.close(); }
});

test("scoped one-shot reset clears breeder/club breed links but never trainer or other links", () => {
  const { sqlite } = fixture();
  try {
    sqlite.exec(`
      INSERT INTO breed_directory_relations VALUES
        (100,10,'breeding-station','fixture','now','test'),
        (101,20,'breed-club','fixture','now','test'),
        (100,30,'trainer','fixture','now','test');
    `);
    sqlite.exec(readFileSync("scripts/d1-breeder-club-links-reset.sql","utf8"));
    const rows = sqlite.prepare("SELECT profile_id FROM breed_directory_relations ORDER BY profile_id").all();
    assert.deepEqual(rows.map(row=>row.profile_id),[30]);
    const after = sqlite.prepare(readFileSync("scripts/d1-breeder-club-links-postflight.sql","utf8")).get();
    assert.equal(after.station_club_links,0);
    assert.equal(after.station_breed_links,0);
    assert.equal(after.club_breed_links,0);
    assert.equal(after.unaffected_other_links,1);
  } finally { sqlite.close(); }
});

test("public and editor never accept trainer relation editing or JSON canonical club writes", () => {
  const editor=readFileSync("components/admin-directory-editor.tsx","utf8");
  const page=readFileSync("app/adresar/[category]/[slug]/page.tsx","utf8");
  const store=readFileSync("lib/breeder-profile-relations.ts","utf8");
  const notion=readFileSync("lib/notion-directory-sync.ts","utf8");
  assert.match(editor,/\["chovatelske-stanice", "chovatelske-kluby"\]/);
  assert.match(page,/profile\.category === "treneri" \? Promise\.resolve\(\[\]\)/);
  assert.match(store,/directory_breeder_club_relations/);
  assert.doesNotMatch(store,/TRAINER_BREED_IDS_METADATA_KEY|TRAINER_CLUB_IDS_METADATA_KEY/);
  assert.match(notion,/profile\.category === "chovatelske-kluby" && field !== "breedIds"/);
});
