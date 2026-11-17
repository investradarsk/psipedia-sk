import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  BREEDER_0169_FILE, BREEDER_0169_GIT_BLOB, BREEDER_0169_OBJECTS,
  assertBreeder0169PinnedDdl, assertBreeder0169State,
} from "../lib/production-d1-breeder-0169-guard.mjs";

const sql=readFileSync("drizzle/0169_directory_breeder_club_relations.sql","utf8");
const workflow=readFileSync(".github/workflows/production-d1-breeder-0169.yml","utf8");
const runner=readFileSync("scripts/production-d1-breeder-0169.mjs","utf8");

function fixture(){
  const db=new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT, applied_at TEXT);
    INSERT INTO d1_migrations VALUES (162,'0162_lost_found_short_description.sql','2026-11-10');
    CREATE TABLE managed_breeds (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, name TEXT, category TEXT);
    CREATE TABLE breed_directory_relations (breed_id INTEGER, profile_id INTEGER, relation_type TEXT);
    INSERT INTO managed_breeds VALUES(100,'existing breed');
    INSERT INTO directory_profiles VALUES(10,'station','chovatelske-stanice'),(20,'club','chovatelske-kluby');
    INSERT INTO breed_directory_relations VALUES(100,10,'breeding-station'),(100,20,'breed-club');
  `);
  return db;
}
function state(db){
  const rows=db.prepare("SELECT type,name,sql FROM sqlite_master WHERE type IN ('table','index') ORDER BY name").all();
  const historyNames=db.prepare("SELECT name FROM d1_migrations ORDER BY id").all().map(x=>x.name);
  const exists=rows.some(x=>x.name===BREEDER_0169_OBJECTS[0] && x.type==="table");
  const columns=exists?db.prepare(
    'SELECT name,type,"notnull" AS "notnull",pk FROM pragma_table_info(\'directory_breeder_club_relations\')'
  ).all():[];
  const indexes=exists?db.prepare(
    'SELECT name,"unique" AS "unique" FROM pragma_index_list(\'directory_breeder_club_relations\')'
  ).all():[];
  const indexColumns={};
  if(exists)for(const name of BREEDER_0169_OBJECTS.slice(1))
    indexColumns[name]=db.prepare("SELECT name FROM pragma_index_info('"+name+"') ORDER BY seqno")
      .all().map(x=>x.name);
  const originalCount=exists?db.prepare(
    "SELECT COUNT(*) AS n FROM directory_breeder_club_relations").get().n:0;
  return assertBreeder0169State({sql,rows,historyNames,columns,indexes,indexColumns,originalCount});
}
const insertSql=()=>sql.replaceAll("--> statement-breakpoint","");

test("0169 pins exactly three additive DDL statements and has no legacy backfill",()=>{
  const bytes=Buffer.from(sql);
  const hash=createHash("sha1").update(Buffer.concat([
    Buffer.from("blob "+bytes.length+"\0"),bytes,
  ])).digest("hex");
  assert.equal(hash,BREEDER_0169_GIT_BLOB);
  const ddl=assertBreeder0169PinnedDdl(sql);
  assert.deepEqual(ddl.map(x=>x.name),BREEDER_0169_OBJECTS);
  assert.deepEqual(ddl.map(x=>x.type),["table","index","index"]);
  assert.doesNotMatch(sql,/\b(?:DROP|DELETE|INSERT|UPDATE|ALTER|REPLACE)\b/i);
  assert.throws(()=>assertBreeder0169PinnedDdl(
    sql.replace("CREATE UNIQUE INDEX","DROP INDEX")) ,/BREEDER_0169_UNEXPECTED_DDL/);
});

test("new D1 relation table is empty and every old breed link/ledger row survives",()=>{
  const db=fixture();
  try {
    assert.equal(state(db).readyToApply,true);
    const beforeHistory=db.prepare("SELECT name FROM d1_migrations").all();
    const beforeLinks=db.prepare("SELECT * FROM breed_directory_relations ORDER BY profile_id").all();
    db.exec(insertSql());
    assert.equal(state(db).installed,true);
    assert.equal(state(db).originalCount,0);
    assert.deepEqual(db.prepare("SELECT name FROM d1_migrations").all(),beforeHistory);
    assert.deepEqual(db.prepare("SELECT * FROM breed_directory_relations ORDER BY profile_id").all(),beforeLinks);
    db.prepare("INSERT INTO directory_breeder_club_relations VALUES(10,20,'now','manual')").run();
    assert.equal(state(db).originalCount,1);
    assert.throws(()=>db.prepare(
      "INSERT INTO directory_breeder_club_relations VALUES(10,20,'now','manual')").run(),
      /UNIQUE constraint failed/);
  } finally { db.close(); }
});

test("partial table, missing index and divergent column schema are rejected",()=>{
  const db=fixture();
  try{
    // Keep original identifier casing: normalized guard fingerprints are not
    // executable SQL, because SQLite stores object names as they were created.
    const parts=sql.split("\n").filter(line=>!line.trimStart().startsWith("--"))
      .join("\n").split(";").map(part=>part.trim()).filter(Boolean);
    db.exec(parts[0]);
    assert.throws(()=>state(db),/BREEDER_0169_PARTIAL_SCHEMA_STOP/);
    db.exec(parts[1]);
    assert.throws(()=>state(db),/BREEDER_0169_PARTIAL_SCHEMA_STOP/);
  } finally {db.close();}
  const other=fixture();
  try{
    other.exec(`
      CREATE TABLE directory_breeder_club_relations (
        station_profile_id TEXT NOT NULL,club_profile_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,created_by TEXT NOT NULL
      );
      CREATE UNIQUE INDEX directory_breeder_club_relations_unique
        ON directory_breeder_club_relations(station_profile_id,club_profile_id);
      CREATE INDEX directory_breeder_club_relations_club_idx
        ON directory_breeder_club_relations(club_profile_id,station_profile_id);
    `);
    assert.throws(()=>state(other),/BREEDER_0169_INCOMPATIBLE_OBJECT_/);
  }finally{other.close();}
});

test("0169 refuses wrong dependency or ledger false claim without destructive repair",()=>{
  const db=fixture();
  try {
    db.exec("DROP TABLE managed_breeds");
    assert.throws(()=>state(db),/BREEDER_0169_DEPENDENCY_MISSING_managed_breeds/);
  }finally{db.close();}
  const other=fixture();
  try{
    other.exec("INSERT INTO d1_migrations VALUES(169,'0169_directory_breeder_club_relations.sql','2026-11-17')");
    assert.throws(()=>state(other),/BREEDER_0169_LEDGER_CLAIMS_MISSING_SCHEMA/);
  }finally{other.close();}
});

test("isolated workflow is manual, audit-default, protected and serialized",()=>{
  assert.match(workflow,/^on:\s*\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow,/^\s+(?:push|pull_request|schedule):/m);
  assert.match(workflow,/default: audit/);
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/group: production-d1-migration/);
  assert.match(workflow,/refs\/heads\/main/);
  assert.match(workflow,/CLOUDFLARE_D1_API_TOKEN/);
  assert.match(workflow,/production-d1-breeder-0169\.mjs/);
  assert.match(workflow,/production-d1-breeder-0169\.test\.mjs/);
  assert.match(workflow,/actions\/upload-artifact@v4/);
});

test("isolated runner pins SQL and bookmarks D1 but never imports old links or changes ledger",()=>{
  assert.match(runner,/GITHUB_EVENT_NAME === "workflow_dispatch"/);
  assert.match(runner,/BREEDER_0169_CONFIRMATION/);
  assert.match(runner,/PINNED_SQL_CHANGED/);
  assert.match(runner,/RECOVERY_BOOKMARK_MISSING/);
  assert.match(runner,/report\("RECOVERY_POINT"/);
  assert.match(runner,/migrationLedgerWritten:false/);
  assert.match(runner,/legacyBackfill:false/);
  assert.match(runner,/"--file",SQL,"--yes","--json"/);
  assert.doesNotMatch(runner,/\b(?:INSERT|UPDATE|DELETE|REPLACE)\s+(?:INTO\s+|FROM\s+)?d1_migrations\b/i);
  assert.doesNotMatch(runner,/"d1"\s*,\s*"migrations"\s*,\s*"apply"/);
  assert.doesNotMatch(runner,/d1-breeder-club-links-(?:reset|backfill)/);
});
