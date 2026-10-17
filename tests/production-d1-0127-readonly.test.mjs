import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { audit0127, classify0127, assertReadonly0127Query,
  TARGET_0127, PREVIOUS_0126, SQL_LEDGER, SQL_OBJECTS
} from "../scripts/production-d1-0127-readonly.mjs";

const migration=readFileSync(new URL("../drizzle/0127_gemini_notion_created_pages.sql",import.meta.url),"utf8");
const resources={account_id:"offline",d1:{database_name:"offline-db"}};
const env={CLOUDFLARE_ACCOUNT_ID:"offline",CLOUDFLARE_API_TOKEN:"offline-token"};
function fixture(){
  const db=new DatabaseSync(":memory:");
  db.exec("CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE)");
  db.exec("INSERT INTO d1_migrations VALUES(126,'"+PREVIOUS_0126+"')");
  db.exec("CREATE TABLE gemini_manual_background_jobs(id INTEGER PRIMARY KEY)");
  return {db,query:async(_,sql)=>db.prepare(sql).all()};
}
test("0127 workflow stays manual, protected and READ-ONLY",()=>{
  const w=readFileSync(new URL("../.github/workflows/production-d1-0127-readonly.yml",import.meta.url),"utf8");
  assert.match(w,/workflow_dispatch/);
  assert.match(w,/environment: production/);
  assert.match(w,/refs\/heads\/main/);
  assert.match(w,/AUDIT-0127/);
  assert.doesNotMatch(w,/migrations apply|APPLY-0127/);
  for(const sql of [SQL_LEDGER,SQL_OBJECTS]) assert.equal(assertReadonly0127Query(sql),sql);
  for(const sql of ["UPDATE x SET y=1","SELECT * FROM d1_migrations; DROP TABLE x"])
    assert.throws(()=>assertReadonly0127Query(sql),/UNAUTHORIZED_SQL/);
});
test("0127 pre/postflight uses original SQL on in-memory SQLite and detects partial rollout",async()=>{
  const {db,query}=fixture();
  try{
    assert.equal((await audit0127({mode:"preflight",resources,migration,env,query})).result,
      "READY_FOR_SEPARATE_APPLY_APPROVAL");
    db.exec(migration);
    assert.throws(()=>classify0127("preflight",db.prepare(SQL_LEDGER).all(),db.prepare(SQL_OBJECTS).all()),/NOT_CLEAN/);
    assert.throws(()=>classify0127("postflight",db.prepare(SQL_LEDGER).all(),db.prepare(SQL_OBJECTS).all()),/POSTFLIGHT_FAILED/);
    db.exec("INSERT INTO d1_migrations VALUES(127,'"+TARGET_0127+"')");
    assert.equal((await audit0127({mode:"postflight",resources,migration,env,query})).result,"APPLIED_AND_VERIFIED");
  }finally{db.close();}
});
test("0127 wrong credentials, migration bytes and missing 0126 fail closed",async()=>{
  const {db,query}=fixture();
  try{
    await assert.rejects(()=>audit0127({mode:"preflight",resources,migration,env:{},query}),/WRONG_PRODUCTION_ACCOUNT/);
    await assert.rejects(()=>audit0127({mode:"preflight",resources,migration:"invalid",env,query}),/WRONG_MIGRATION_BYTES/);
    db.exec("DELETE FROM d1_migrations");
    await assert.rejects(()=>audit0127({mode:"preflight",resources,migration,env,query}),/LEDGER_MISMATCH/);
  }finally{db.close();}
});
