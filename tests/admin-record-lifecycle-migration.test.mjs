import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const sql=readFileSync(fileURLToPath(new URL("../drizzle/0164_admin_record_lifecycle.sql",import.meta.url)),"utf8");
const records=[
  ["directory_profiles","directory"],
  ["managed_events","events"],
  ["help_cases","help"],
  ["managed_breeds","breeds"],
  ["managed_articles","articles"],
  ["adoption_dogs","adoptions"],
  ["lost_found_dog_reports","lost-found"],
  ["help_organizations","organizations"],
];
function fixture() {
  const db=new DatabaseSync(":memory:");
  for(const [table] of records) {
    const identityColumns=table==="directory_profiles"||table==="help_organizations"
      ?",import_key TEXT":table==="managed_breeds"?",fci_number INTEGER":"";
    db.exec("CREATE TABLE "+table+" (id INTEGER PRIMARY KEY AUTOINCREMENT,slug TEXT NOT NULL,status TEXT NOT NULL,updated_at TEXT"+identityColumns+")");
  }
  db.exec(sql);
  return db;
}
function tombstone(db,kind,slug,recordId) {
  db.prepare("INSERT INTO admin_record_tombstones "+
    "(kind,record_id,record_slug,record_name,record_category,notion_targets_json,state,created_by,created_at,updated_at) "+
    "VALUES (?,?,?,'Fixture','Test','[]','PENDING_NOTION','isolated-test','now','now')")
    .run(kind,recordId,slug);
}
test("0164 is a schema-only migration with no production backfill",()=>{
  assert.doesNotMatch(sql,/\bUPDATE\s+(directory_profiles|managed_events|managed_articles|help_cases|managed_breeds|adoption_dogs|lost_found_dog_reports|help_organizations)\s+SET\b/i);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS admin_record_tombstones/i);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS admin_record_publication_guards/i);
});
for(const [table,kind] of records) {
  test(kind+": deleted slug cannot be reimported, unrelated profiles remain untouched",()=>{
    const db=fixture();
    try{
      const draft=kind==="adoptions"||kind==="lost-found"||kind==="organizations"?"DRAFT":"draft";
      db.prepare("INSERT INTO "+table+"(id,slug,status) VALUES (1,'owned-to-delete',?),(2,'unrelated',?)").run(draft,draft);
      tombstone(db,kind,"owned-to-delete",1);
      assert.throws(()=>db.prepare("INSERT INTO "+table+"(slug,status) VALUES ('owned-to-delete','draft')").run(),/RECORD_TOMBSTONED/);
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM "+table).get().count,2);
      db.prepare("UPDATE "+table+" SET status=? WHERE id=1").run(draft);
      assert.throws(()=>db.prepare("UPDATE "+table+" SET status=? WHERE id=1")
        .run(kind==="adoptions"||kind==="lost-found"?"ACTIVE":kind==="organizations"?"PUBLISHED":"published"),/RECORD_REMOVAL_PENDING/);
      db.prepare("UPDATE "+table+" SET status='published' WHERE id=2").run();
      assert.equal(db.prepare("SELECT status FROM "+table+" WHERE id=2").get().status,"published");
      assert.throws(()=>db.prepare("UPDATE "+table+" SET slug='changed' WHERE id=1").run(),/RECORD_REMOVAL_PENDING/);
    }finally{db.close();}
  });
}
test("tombstone remains after canonical delete and blocks automatic resurrection",()=>{
  const db=fixture();
  try{
    db.prepare("INSERT INTO managed_events(id,slug,status) VALUES (1,'deleted-event','draft')").run();
    tombstone(db,"events","deleted-event",1);
    assert.throws(()=>db.prepare("DELETE FROM managed_events WHERE id=1").run(),/USE_VERIFIED_LIFECYCLE_DELETE/);
    db.prepare("UPDATE admin_record_tombstones SET state='READY_LOCAL' WHERE kind='events' AND record_id=1").run();
    db.prepare("DELETE FROM managed_events WHERE id=1").run();
    db.prepare("UPDATE admin_record_tombstones SET state='COMPLETE' WHERE kind='events' AND record_id=1").run();
    assert.throws(()=>db.prepare("INSERT INTO managed_events(slug,status) VALUES ('deleted-event','draft')").run(),/RECORD_TOMBSTONED/);
  }finally{db.close();}
});
test("all original record tables have both anti-resurrection and pending-removal protections",()=>{
  for(const [table,kind] of records){
    assert.match(sql,new RegExp("BEFORE INSERT ON "+table+"\\b"));
    assert.match(sql,new RegExp("BEFORE UPDATE OF status, slug ON "+table+"\\b"));
    assert.match(sql,new RegExp("BEFORE DELETE ON "+table+"\\b"));
    assert.match(sql,new RegExp("kind='"+kind+"'"));
  }
});


test("verified import keys and FCI identities cannot resurrect deleted entities under different slugs",()=>{
  const db=fixture();
  try{
    const cases=[
      ["directory_profiles","directory","import_key","source:vet:123"],
      ["help_organizations","organizations","import_key","source:shelter:123"],
      ["managed_breeds","breeds","fci_number",42],
    ];
    for(let idx=0;idx<cases.length;idx++){
      const [table,kind,column,key]=cases[idx];
      const id=idx+101;
      db.prepare("INSERT INTO "+table+"(id,slug,status,"+column+") VALUES (?,?,?,?)")
        .run(id,kind+"-old",kind==="organizations"?"DRAFT":"draft",key);
      db.prepare("INSERT INTO admin_record_tombstones "+
        "(kind,record_id,record_slug,record_external_key,record_name,record_category,notion_targets_json,state,created_by,created_at,updated_at) "+
        "VALUES (?,?,?,?,'Test','Test','[]','READY_LOCAL','fixture','now','now')")
        .run(kind,id,kind+"-old",String(key));
      db.prepare("DELETE FROM "+table+" WHERE id=?").run(id);
      assert.throws(()=>db.prepare("INSERT INTO "+table+"(slug,status,"+column+") VALUES (?,?,?)")
        .run(kind+"-new",kind==="organizations"?"DRAFT":"draft",key),/RECORD_TOMBSTONED/);
      db.prepare("INSERT INTO "+table+"(slug,status,"+column+") VALUES (?,?,?)")
        .run(kind+"-unrelated",kind==="organizations"?"DRAFT":"draft",column==="fci_number"?52:"another-source");
    }
  }finally{db.close();}
});
