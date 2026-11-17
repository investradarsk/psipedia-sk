import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const preflightSql = readFileSync(new URL("../scripts/d1-trainer-breed-links-preflight.sql", import.meta.url), "utf8");
const backfillSql = readFileSync(new URL("../scripts/d1-trainer-breed-links-backfill.sql", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../lib/breeder-profile-relations.ts", import.meta.url), "utf8");

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE managed_breeds (id INTEGER PRIMARY KEY, status TEXT);
    CREATE TABLE directory_profiles (
      id INTEGER PRIMARY KEY, category TEXT, status TEXT, source_data_json TEXT, updated_at TEXT, updated_by TEXT
    );
    CREATE TABLE breed_directory_relations (
      breed_id INTEGER, profile_id INTEGER, relation_type TEXT, source TEXT,
      created_at TEXT, created_by TEXT, UNIQUE(breed_id,profile_id)
    );
    CREATE INDEX breed_directory_relations_profile_idx
      ON breed_directory_relations(profile_id,breed_id);
    INSERT INTO managed_breeds VALUES (1,'published'),(2,'published'),(3,'draft');
    INSERT INTO directory_profiles (id,category,status,source_data_json) VALUES
      (10,'treneri','published','{"_psipedia_trainer_breed_ids":"[1,2,2]","_psipedia_trainer_club_ids":"[18]","custom":"keep"}'),
      (11,'chovatelske-stanice','published','{"Plemeno":"Legacy text"}'),
      (12,'veterinari','published','{}'),
      (13,'treneri','archived','{"_psipedia_trainer_breed_ids":"[3]"}');
    INSERT INTO breed_directory_relations VALUES (1,11,'breeding-station','manual','now','tester');
  `);
  return db;
}

test("migration copies trainer IDs to the existing relation table without editing JSON", () => {
  const db = database();
  try {
    const before = db.prepare("SELECT id,source_data_json FROM directory_profiles ORDER BY id").all();
    const pre = db.prepare(preflightSql).get();
    assert.equal(pre.invalid_json, 0);
    assert.equal(pre.invalid_array, 0);
    assert.equal(pre.bad_ids, 0);
    assert.equal(pre.orphan_ids, 0);
    assert.equal(pre.legacy_pairs_missing, 3);
    db.exec(backfillSql);
    const after = db.prepare(preflightSql).get();
    assert.equal(after.legacy_pairs_missing, 0);
    assert.equal(after.trainer_relation_rows, 3);
    assert.deepEqual(db.prepare("SELECT breed_id,profile_id FROM breed_directory_relations ORDER BY profile_id,breed_id").all().map(row => ({...row})),[
      {breed_id:1,profile_id:10},
      {breed_id:2,profile_id:10},
      {breed_id:1,profile_id:11},
      {breed_id:3,profile_id:13},
    ]);
    assert.deepEqual(db.prepare("SELECT id,source_data_json FROM directory_profiles ORDER BY id").all(),before);
    db.exec(backfillSql);
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM breed_directory_relations").get().c, 4);
  } finally { db.close(); }
});

test("preflight flags malformed legacy trainer IDs instead of silently dropping them", () => {
  const db = database();
  try {
    db.exec(`UPDATE directory_profiles
      SET source_data_json='{"_psipedia_trainer_breed_ids":"bad json"}'
      WHERE id=10`);
    const report = db.prepare(preflightSql).get();
    assert.equal(report.invalid_array, 1);
    assert.equal(report.legacy_pairs_missing, 1);
  } finally { db.close(); }
});

test("one relational breed reader and writer is used for both trainer and breeder", () => {
  const get = runtime.slice(runtime.indexOf("export async function getBreederRelationSelection("),
    runtime.indexOf("export async function listBreederRelationOptions("));
  const save = runtime.slice(runtime.indexOf("export async function saveBreederRelationSelection("),
    runtime.indexOf("export async function listPublicBreederClubLinks("));
  const publicRead = runtime.slice(runtime.indexOf("export async function listPublicBreederBreedLinks("));
  assert.match(get, /SELECT breed_id AS id FROM breed_directory_relations/);
  assert.match(publicRead, /FROM breed_directory_relations r/);
  assert.match(save, /INSERT INTO breed_directory_relations/);
  assert.match(save, /source_data_json=\? RETURNING id/);
  assert.doesNotMatch(runtime, /TRAINER_BREED_IDS_METADATA_KEY/);
  assert.match(runtime, /database\.batch\(statements\)/);
});
