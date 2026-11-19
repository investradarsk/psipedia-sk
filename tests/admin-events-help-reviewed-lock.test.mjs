import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { isAdminNotionSyncLocked, partnerAdminReviewStatement, partnerReviewOwnerSql,
  reviewTypeForAgenda } from "../lib/admin-notion-review-lock.ts";

const read = path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

function fixture(){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE admin_entity_reviews(entity_type TEXT,entity_id INTEGER,reviewed_at TEXT,reviewed_by TEXT,
      PRIMARY KEY(entity_type,entity_id));
    CREATE TABLE partner_resources(id TEXT PRIMARY KEY,managed_event_id INTEGER,help_organization_id INTEGER);
    CREATE TABLE partner_memberships(id TEXT PRIMARY KEY,account_id TEXT,resource_id TEXT,revoked_at TEXT);
    CREATE TABLE partner_help_claims(id TEXT PRIMARY KEY,account_id TEXT,status TEXT,
      adoption_dog_id INTEGER,lost_found_report_id INTEGER,help_case_id INTEGER);
    CREATE TABLE managed_events(id INTEGER PRIMARY KEY);
    CREATE TABLE help_organizations(id INTEGER PRIMARY KEY);
    CREATE TABLE adoption_dogs(id INTEGER PRIMARY KEY);
    CREATE TABLE lost_found_dog_reports(id INTEGER PRIMARY KEY);
    CREATE TABLE help_cases(id INTEGER PRIMARY KEY);
    INSERT INTO managed_events(id) VALUES(1);
    INSERT INTO help_organizations(id) VALUES(2);
    INSERT INTO adoption_dogs(id) VALUES(3);
    INSERT INTO lost_found_dog_reports(id) VALUES(4);
    INSERT INTO help_cases(id) VALUES(5);
  `);
  const database={prepare(sql){
    const prepared=sqlite.prepare(sql);
    return {bind(...args){
      return {first:async()=>prepared.get(...args)??null,
        run:async()=>{const r=prepared.run(...args);return {meta:{changes:r.changes}};}};
    }};
  }};
  return{sqlite,database};
}
const types=[["events","EVENT",1],["organizations","ORGANIZATION",2],
  ["adoptions","ADOPTION",3],["lost-found","LOST_FOUND",4],["help-cases","HELP_CASE",5]];

test("all five agenda families use the existing, fixed review schema",()=>{
  for(const [agenda,type] of types)assert.equal(reviewTypeForAgenda(agenda),type);
  assert.match(partnerReviewOwnerSql("ADOPTION","?1"),/adoption_dog_id/);
  assert.match(partnerReviewOwnerSql("LOST_FOUND","?1"),/lost_found_report_id/);
  assert.match(partnerReviewOwnerSql("HELP_CASE","?1"),/help_case_id/);
  assert.match(partnerReviewOwnerSql("EVENT","?1"),/managed_event_id/);
  assert.match(partnerReviewOwnerSql("ORGANIZATION","?1"),/help_organization_id/);
});

test("manual Odkontrolovane prevents Notion sync for each agenda without a partner",async()=>{
  const {sqlite,database}=fixture();
  try{
    for(const [agenda,type,id] of types){
      assert.equal(await isAdminNotionSyncLocked(database,agenda,id),false);
      sqlite.prepare("INSERT INTO admin_entity_reviews VALUES(?,?,?,?)").run(type,id,"2026-11-19","admin");
      assert.equal(await isAdminNotionSyncLocked(database,agenda,id),true);
      sqlite.prepare("DELETE FROM admin_entity_reviews WHERE entity_type=? AND entity_id=?").run(type,id);
      assert.equal(await isAdminNotionSyncLocked(database,agenda,id),false);
    }
  }finally{sqlite.close()}
});

test("active owner locks even without checkbox; revoking does not remove a reviewed marker",async()=>{
  const{sqlite,database}=fixture();
  try{
    sqlite.exec("INSERT INTO partner_resources VALUES('res-event',1,NULL),('res-org',NULL,2)");
    sqlite.exec("INSERT INTO partner_memberships VALUES('mem-event','a','res-event',NULL),('mem-org','a','res-org',NULL)");
    sqlite.exec("INSERT INTO partner_help_claims VALUES('claim-a','a','APPROVED',3,NULL,NULL),('claim-l','a','APPROVED',NULL,4,NULL),('claim-h','a','APPROVED',NULL,NULL,5)");
    for(const[agenda,,id]of types){
      assert.equal(await isAdminNotionSyncLocked(database,agenda,id),true,agenda);
      const type=reviewTypeForAgenda(agenda);
      await partnerAdminReviewStatement(database,{type,entitySql:`SELECT ${id}`,
        nowIso:"2026-11-19T20:00:00Z",actorRef:"admin"}).run();
    }
    sqlite.exec("UPDATE partner_memberships SET revoked_at='2026-11-19'");
    sqlite.exec("UPDATE partner_help_claims SET status='REVOKED'");
    for(const[agenda,,id]of types)assert.equal(await isAdminNotionSyncLocked(database,agenda,id),true);
  }finally{sqlite.close()}
});

test("Notion event and Help paths enforce the same lock in both directions",()=>{
  const sweep=read("lib/notion-events-help-sync.ts");
  const legacy=read("lib/notion-event-sync.ts");
  const fields=read("lib/notion-event-field-sync.ts");
  const targeted=read("lib/notion-targeted-admin-help.ts");
  assert.match(sweep,/if \(await isAdminNotionSyncLocked\(input.database, input.definition.key, entityId\)\)/);
  assert.match(legacy,/isAdminNotionSyncLocked\(database,"events",existing.id\)/);
  assert.match(fields,/isAdminNotionSyncLocked\(input.database,"events",id\)/);
  assert.match(fields,/isAdminNotionSyncLocked\(input.database,"events",input.eventId\)/);
  assert.match(targeted,/isAdminNotionSyncLocked\(input.database,input.agenda,input.entityId\)/);
});

test("every partner approval includes automatic review lock and Admin shows owner",()=>{
  const claims=read("lib/partner-help-claims.ts");
  const helpCreate=read("lib/partner-help-create-admin.ts");
  const events=read("lib/partner-events-admin.ts");
  const newProfiles=read("lib/partner-new-profile-admin.ts");
  const store=read("lib/partner-admin-store.ts");
  const reviewStore=read("lib/admin-entity-review-store.ts");
  const ui=read("components/admin-partner-review-status.tsx");
  assert.match(claims,/partnerAdminReviewStatement/);
  assert.match(claims,/database\.batch\(/);
  assert.equal((helpCreate.match(/partnerAdminReviewStatement\(/g)??[]).length,2);
  assert.equal((events.match(/partnerAdminReviewStatement\(/g)??[]).length,2);
  assert.equal((newProfiles.match(/partnerAdminReviewStatement\(/g)??[]).length,2,
    "organization CREATE and LINK_EXISTING both persist Odkontrolované");
  assert.equal((newProfiles.match(/type:"ORGANIZATION"/g)??[]).length,2);
  assert.match(newProfiles,/row\.resourceType==="HELP_ORGANIZATION"/);
  assert.match(store,/markPartnerGrantedReview/);
  assert.match(reviewStore,/partnerReviewOwnerSql\(entityType,"\?2"\)/);
  assert.match(ui,/Tento záznam spravuje partner/);
  for(const file of ["podujatia","adopcie","pomoc","stratene-najdene","organizacie"]){
    assert.match(read(`app/admin/${file}/[id]/page.tsx`),/AdminPartnerReviewStatus/);
  }
});
