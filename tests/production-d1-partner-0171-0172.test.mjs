import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import test from "node:test";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const file1="pending-migrations/0171_partner_single_manager.sql";
const file2="pending-migrations/0172_partner_help_claim_ownership.sql";
const m1=read(file1),m2=read(file2);
test("Staged migrations have pinned Git blob identities",()=>{
  for(const [path,expected] of [[file1,"99054ef49fcc2935b26c517251a1fe4a5a0baa97"],[file2,"0be2dc902fdf6164f3aad1389fc24d94335ab685"]]){
    const b=readFileSync(new URL("../"+path,import.meta.url));
    const sha=createHash("sha1").update(Buffer.concat([Buffer.from("blob "+b.length+"\0"),b])).digest("hex");
    assert.equal(sha,expected);
  }
});
test("0171 then 0172: preserving memberships, audit and foreign keys",()=>{
  const db=new DatabaseSync(":memory:");try{
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE partner_accounts(id TEXT PRIMARY KEY,status TEXT);
      CREATE TABLE partner_memberships(id TEXT PRIMARY KEY,account_id TEXT,resource_id TEXT,role TEXT,revoked_at TEXT,updated_at TEXT);
      CREATE TABLE partner_audit_events(id TEXT PRIMARY KEY,actor_type TEXT,actor_ref TEXT,action TEXT,target_type TEXT,target_id TEXT,metadata_json TEXT,created_at TEXT);
      CREATE TABLE adoption_dogs(id INTEGER PRIMARY KEY);
      CREATE TABLE lost_found_dog_reports(id INTEGER PRIMARY KEY);
      CREATE TABLE help_cases(id INTEGER PRIMARY KEY);
      INSERT INTO partner_accounts VALUES('a','ACTIVE');
      INSERT INTO partner_memberships VALUES('m','a','r','OWNER',NULL,'now');`);
    db.exec(m1);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM partner_memberships").get().n,1);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM partner_audit_events").get().n,0);
    assert.throws(()=>db.exec(m1),/already exists/);
    db.exec(m2);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM partner_help_claims").get().n,0);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);
    assert.throws(()=>db.exec(m2),/already exists/);
  }finally{db.close()}
});
test("Manual production workflow is isolated, recovery guarded, and serial",()=>{
  const w=read(".github/workflows/production-d1-partner-0171-0172.yml");
  const s=read("scripts/production-d1-partner-0171-0172.mjs");
  assert.match(w,/workflow_dispatch/);assert.match(w,/environment: production/);
  assert.match(w,/production-d1-migration/);assert.match(w,/refs\/heads\/main/);
  assert.doesNotMatch(w,/^\s+(?:push|pull_request|schedule):/m);
  assert.match(s,/time-travel","info"/);assert.match(s,/--file",sql\[key\]/);
  assert.doesNotMatch(s,/"migrations","apply"/);
});
