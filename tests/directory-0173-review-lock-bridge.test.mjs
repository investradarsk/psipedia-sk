import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {
  DIRECTORY_0173_REVIEW_BRIDGE_COUNT_SQL as countSql,
  DIRECTORY_0173_REVIEW_BRIDGE_APPLY_SQL as applySql,
  DIRECTORY_0173_REVIEW_BRIDGE_PARITY_SQL as paritySql,
  DIRECTORY_0173_REVIEW_BRIDGE_INVALID_JSON_SQL as invalidSql,
} from "../lib/directory-0173-review-lock-bridge.mjs";

function fixture(){
  const db=new DatabaseSync(":memory:");
  db.exec("CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY,status TEXT NOT NULL,source_data_json TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL)");
  db.exec("CREATE TABLE directory_profile_review_state(profile_id INTEGER PRIMARY KEY,reviewed_at TEXT,reviewed_by TEXT,unlock_pending INTEGER NOT NULL DEFAULT 0,unlock_requested_at TEXT,unlock_requested_by TEXT,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL)");
  const insert=db.prepare("INSERT INTO directory_profiles VALUES(?,?,?,?,?)");
  const source=(at="",by="",pending="0")=>JSON.stringify({
    _psipedia_profile_review_reviewed_at:at,
    _psipedia_profile_review_reviewed_by:by,
    _psipedia_profile_review_unlock_pending:pending,
    "Poznámka":"Historical data must not be changed",
  });
  return {db,insert,source,
    count:()=>db.prepare(countSql).get().n,
    apply:()=>db.prepare(applySql).run(),
    parity:()=>db.prepare(paritySql).get().n,
    list:()=>db.prepare("SELECT * FROM directory_profile_review_state ORDER BY profile_id").all(),
    snapshot:()=>db.prepare("SELECT * FROM directory_profiles ORDER BY id").all(),
  };
}

test("eight old reviewed profiles gain SQL locks without changing source, contacts, status or timestamps",()=>{
  const f=fixture();
  try{
    for(let id=1;id<=8;id++){
      f.insert.run(id,"published",f.source("2026-11-18T12:00:00Z","owner:"+id),"T"+id,"admin");
    }
    f.insert.run(9,"published",f.source(),"T9","admin");
    f.insert.run(10,"archived",f.source("2026-11-18T12:00:00Z","owner"),"T10","admin");
    const before=f.snapshot();
    assert.equal(f.count(),8);
    f.apply();
    assert.equal(f.count(),0);
    assert.equal(f.parity(),0);
    assert.equal(f.list().length,8);
    assert.deepEqual(f.snapshot(),before,"must never mutate directory_profiles or source_data_json");
    assert.equal(f.list()[0].reviewed_at,"2026-11-18T12:00:00Z");
    assert.equal(f.list()[0].reviewed_by,"owner:1");
    f.apply();
    assert.equal(f.list().length,8,"idempotence: existing SQL locks are not touched");
  }finally{f.db.close()}
});

test("pending owner unlock alone stays locked, without inventing a reviewer or timestamp",()=>{
  const f=fixture();
  try{
    f.insert.run(12,"draft",f.source("","","1"),"2026-11-18","admin");
    assert.equal(f.count(),1);
    f.apply();
    assert.equal(f.count(),0);
    const row=f.list()[0];
    assert.equal(row.reviewed_at,null);
    assert.equal(row.reviewed_by,null);
    assert.equal(row.unlock_pending,1);
    assert.equal(row.unlock_requested_at,null);
    assert.equal(row.unlock_requested_by,null);
  }finally{f.db.close()}
});

test("existing SQL row, including owner-unchecked state, is never overwritten",()=>{
  const f=fixture();
  try{
    f.insert.run(19,"published",f.source("2026-11-18","old-owner"),"T19","admin");
    f.db.prepare("INSERT INTO directory_profile_review_state VALUES(?,?,?,?,?,?,?,?)")
      .run(19,null,null,0,null,null,"NEWER","admin");
    assert.equal(f.count(),0);
    f.apply();
    assert.equal(f.list()[0].updated_at,"NEWER");
    assert.equal(f.list()[0].reviewed_at,null);
    assert.equal(f.parity(),1,"old JSON and SQL conflict must be inspected, not auto-overwritten");
  }finally{f.db.close()}
});

test("more than eight legacy review candidates cannot cause a partial bulk write",()=>{
  const f=fixture();
  try{
    for(let id=1;id<=9;id++)
      f.insert.run(id,"published",f.source("2026-11-18","owner"),"T","admin");
    assert.equal(f.count(),9);
    f.apply();
    assert.equal(f.list().length,0,"SQL guard blocks unexpected candidate counts");
  }finally{f.db.close()}
});

test("invalid source JSON never causes an automatic SQL grant",()=>{
  const f=fixture();
  try{
    f.insert.run(21,"published","{","T","admin");
    assert.equal(f.db.prepare(invalidSql).get().n,1);
    assert.equal(f.count(),0);
    f.apply();
    assert.equal(f.list().length,0);
  }finally{f.db.close()}
});

test("production writer rejects non-manual dispatch and is limited to one SQL INSERT",()=>{
  const file=readFileSync(new URL("../scripts/production-directory-0173-review-lock-bridge.mjs",import.meta.url),"utf8");
  const workflow=readFileSync(new URL("../.github/workflows/directory-0173-review-lock-bridge.yml",import.meta.url),"utf8");
  assert.match(file,/GITHUB_EVENT_NAME==="workflow_dispatch"/);
  assert.match(file,/GITHUB_REF==="refs\/heads\/main"/);
  assert.match(file,/DIRECTORY_REVIEW_BRIDGE_CONFIRMATION===CONFIRM/);
  assert.match(file,/before\.missingLocks<=8/);
  assert.match(file,/await query\(APPLY_SQL,true\)/);
  assert.match(file,/after\.missingLocks===0/);
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/workflow_dispatch:/);
  assert.doesNotMatch(workflow,/\bpush:/);
  assert.doesNotMatch(applySql,/\bUPDATE\b|\bDELETE\b|\bDROP\b|\bALTER\b/i);
  assert.match(applySql,/ON CONFLICT\(profile_id\) DO NOTHING/);
});
