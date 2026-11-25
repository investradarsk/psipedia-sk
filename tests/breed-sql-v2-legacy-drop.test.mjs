import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {BREED_LEGACY_OBJECT_COLUMNS,breedSqlV2InsertColumns}
  from "../lib/breed-sql-v2-legacy-drop.mjs";

const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");

test("SQL-only insert covers both physical D1 schemas and blocks a partial DROP",()=>{
  const columns=["slug","fci_standard_json","editorial_json","sports_json",
    "related_breeds_json","gallery_json","seo_json","updated_at"];
  assert.deepEqual(breedSqlV2InsertColumns(columns,4),columns);
  assert.deepEqual(breedSqlV2InsertColumns(columns,0),
    ["slug","sports_json","gallery_json","updated_at"]);
  for(const count of [1,2,3,5])
    assert.throws(()=>breedSqlV2InsertColumns(columns,count),
      /BREED_LEGACY_SCHEMA_PARTIAL_STOP/);
  assert.deepEqual([...BREED_LEGACY_OBJECT_COLUMNS].sort(),
    ["fci_standard_json","editorial_json","related_breeds_json","seo_json"].sort());
});

test("exact SQLite 0175 DROP preserves canonical arrays, existing rows and typed SQL",()=>{
  const db=new DatabaseSync(":memory:");
  try{
    db.exec("PRAGMA foreign_keys=ON");
    db.exec("CREATE TABLE managed_breeds (id INTEGER PRIMARY KEY, slug TEXT NOT NULL,"+
      "fci_standard_json TEXT NOT NULL DEFAULT '{}',editorial_json TEXT NOT NULL DEFAULT '{}',"+
      "related_breeds_json TEXT NOT NULL DEFAULT '[]',seo_json TEXT NOT NULL DEFAULT '{}',"+
      "gallery_json TEXT NOT NULL DEFAULT '[]',sports_json TEXT NOT NULL DEFAULT '[]',"+
      "seo_title TEXT,updated_at TEXT NOT NULL)");
    db.exec("CREATE TABLE breed_fci_standard (breed_id INTEGER PRIMARY KEY,"+
      "description TEXT,FOREIGN KEY(breed_id) REFERENCES managed_breeds(id))");
    db.prepare("INSERT INTO managed_breeds (slug,gallery_json,sports_json,seo_title,updated_at) "+
      "VALUES (?,?,?,?,?)").run("labrador",'["one"]','["two"]',"SQL title","2026-11-20");
    db.prepare("INSERT INTO breed_fci_standard (breed_id,description) VALUES (1,?)")
      .run("SQL FCI");
    db.exec(read("../scripts/sql/breeds_drop_four_legacy_objects.sql")
      .replace(/--> statement-breakpoint/g,""));
    const columns=db.prepare("SELECT name FROM pragma_table_info('managed_breeds')")
      .all().map(row=>row.name);
    assert.ok(BREED_LEGACY_OBJECT_COLUMNS.every(col=>!columns.includes(col)));
    const row=db.prepare("SELECT gallery_json,sports_json,seo_title FROM managed_breeds").get();
    assert.equal(row.gallery_json,'["one"]');
    assert.equal(row.sports_json,'["two"]');
    assert.equal(row.seo_title,"SQL title");
    assert.equal(db.prepare("SELECT description FROM breed_fci_standard WHERE breed_id=1")
      .get().description,"SQL FCI");
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
    db.prepare("INSERT INTO managed_breeds (slug,gallery_json,sports_json,updated_at) "+
      "VALUES (?,?,?,?)").run("second",'["three"]',"[]","2026-11-20");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM managed_breeds").get().n,2);
  } finally {db.close()}
});

test("production CREATE and FCI preview are compatible with post-DROP schema",()=>{
  const store=read("../lib/breed-store.ts");
  const importer=read("../lib/breed-import.ts");
  const route=read("../app/api/admin/import/route.ts");
  assert.doesNotMatch(store,/pragma_table_info\('managed_breeds'\)/);
  const insertColumns = store.match(/const BREED_ROW_VALUE_COLUMNS="([^"]+)"/)[1].split(",");
  for (const col of BREED_LEGACY_OBJECT_COLUMNS) assert.ok(!insertColumns.includes(col), col);
  assert.match(store,/breedSqlV2NewBreedStatements\(database, value.slug, value\)/);
  assert.match(store,/BREED_SQL_ONLY_INSERT_COLUMNS_MISMATCH/);
  assert.doesNotMatch(importer,/fci_standard_json|editorial_json|related_breeds_json|seo_json/);
  assert.match(importer,/breedSqlV2NewBreedStatements/);
  assert.match(route,/if \(!localFixtureImport\)/);
  const schema=read("../db/schema.ts").split("export const managedBreeds =")[1]
    .split("export const breedArticleRelations =")[0];
  for(const col of BREED_LEGACY_OBJECT_COLUMNS)
    assert.ok(!schema.includes('text("'+col+'")'),col);
});

test("real D1 deletion is manual, current-main-only and runs SQL health first",()=>{
  const action=read("../.github/workflows/production-d1-breed-0175.yml");
  const script=read("../scripts/production-d1-breed-0175.mjs");
  assert.match(action,/workflow_dispatch/);
  assert.match(action,/Verify current SQL-only production integrity/);
  assert.doesNotMatch(action,/\bpush:|\bschedule:/);
  assert.match(script,/BREED_SQL_V2_READ_MODE==="sql"/);
  assert.match(script,/BREED_SQL_V2_WRITE_MODE==="sql"/);
  assert.match(script,/RECOVERY_BOOKMARK_REQUIRED/);
  assert.match(script,/PARTIAL_LEGACY_SCHEMA/);
  assert.match(script,/SQL_INTEGRITY/);
});
