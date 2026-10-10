import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {ensureResourceForManagedEvent,ensureResourceForDirectoryProfile} from "../lib/canonical-resource.ts";

const source=(path)=>readFileSync(new URL("../lib/"+path,import.meta.url),"utf8");
function makeDb() {
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY);
    CREATE TABLE managed_events (id INTEGER PRIMARY KEY);
    CREATE TABLE partner_resources (
      id TEXT PRIMARY KEY,entity_type TEXT NOT NULL,
      directory_profile_id INTEGER UNIQUE,managed_event_id INTEGER UNIQUE,
      created_at TEXT,updated_at TEXT
    );
    INSERT INTO directory_profiles(id) VALUES (1);
    INSERT INTO managed_events(id) VALUES (2);`);
  const db={prepare(sql){return {bind(...values){const stmt=sqlite.prepare(sql);return {
    async first(){return stmt.get(...values)??null},
    async run(){const r=stmt.run(...values);return {meta:{changes:r.changes}}}
  }}}}};
  return {sqlite,db};
}
test("managed event resource anchor is deterministic and idempotent",async()=>{
  const {sqlite,db}=makeDb();
  try{
    const first=await ensureResourceForManagedEvent(2,db);
    const repeated=await ensureResourceForManagedEvent(2,db);
    assert.equal(first.id,"managed-event-2");
    assert.deepEqual(repeated,first);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM partner_resources WHERE managed_event_id=2").get().n,1);
  }finally{sqlite.close();}
});
test("missing managed event anchor fails closed, and retry heals the original event",async()=>{
  const {sqlite,db}=makeDb();
  let blocked=true;
  const failing={prepare(sql){
    if(blocked && sql.includes("INSERT OR IGNORE INTO partner_resources"))
      return {bind(){return {async run(){throw Error("ANCHOR_FAILURE")}}}};
    return db.prepare(sql);
  }};
  try{
    await assert.rejects(ensureResourceForManagedEvent(2,failing),/ANCHOR_FAILURE/);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM partner_resources").get().n,0);
    blocked=false;
    await ensureResourceForManagedEvent(2,failing);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM managed_events").get().n,1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM partner_resources WHERE managed_event_id=2").get().n,1);
  }finally{sqlite.close();}
});
test("Directory and Events ensure anchors in fresh and recovery paths before DRAFT_CREATED",()=>{
  for(const [file,helper,update] of [
    ["gemini-automation-notion-bridge.ts","ensureResourceForDirectoryProfile","updateConcept(db,row.id,\"DRAFT_CREATED\""],
    ["gemini-automation-event-bridge.ts","ensureResourceForManagedEvent","update(db,row.id,\"DRAFT_CREATED\""],
  ]){
    const code=source(file);
    const marker=code.indexOf("await "+helper+"(id, db)");
    const draft=code.indexOf(update);
    assert.ok(marker>0 && marker<draft,file+" ensure before DRAFT_CREATED");
    assert.ok(code.includes("if (row.canonical_entity_id) await "+helper)||
      code.includes("if(row.canonical_entity_id)await "+helper),file+" persisted canonical guard");
    const notion=code.indexOf(file.includes("notion-bridge")?"ensureDirectoryProfileInNotion({":"ensureManagedEventInNotion({");
    assert.ok(draft<notion,file+" before Notion");
  }
});
test("directory helper remains idempotent with existing canonical resource",async()=>{
  const {sqlite,db}=makeDb();
  try{
    await ensureResourceForDirectoryProfile(1,db);
    await ensureResourceForDirectoryProfile(1,db);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM partner_resources WHERE directory_profile_id=1").get().n,1);
  }finally{sqlite.close();}
});
