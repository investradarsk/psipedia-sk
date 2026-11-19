import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  listPartnerAccountDossierRequests,
  listPartnerAccountDossierProfiles,
  listPartnerAccountDossierHistory,
  partnerDossierEditorHref,
} from "../lib/partner-admin-dossier.ts";

function fakeD1(sqlite) {
  return {
    prepare(query) {
      const stmt=sqlite.prepare(query);
      return {
        bind(...params) {
          return {
            async first() { return stmt.get(...params)??null; },
            async all() { return {results:stmt.all(...params)}; },
          };
        },
      };
    },
  };
}
function setup() {
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE partner_resources (id TEXT PRIMARY KEY,entity_type TEXT,directory_profile_id INTEGER,help_organization_id INTEGER,managed_event_id INTEGER);
    CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY,name TEXT,status TEXT);
    CREATE TABLE help_organizations (id INTEGER PRIMARY KEY,name TEXT,status TEXT);
    CREATE TABLE managed_events (id INTEGER PRIMARY KEY,title TEXT,status TEXT);
    CREATE TABLE adoption_dogs (id INTEGER PRIMARY KEY,name TEXT,status TEXT);
    CREATE TABLE lost_found_dog_reports (id INTEGER PRIMARY KEY,dog_name TEXT,breed TEXT,status TEXT);
    CREATE TABLE help_cases (id INTEGER PRIMARY KEY,title TEXT,status TEXT);
    CREATE TABLE partner_claims (id TEXT PRIMARY KEY,account_id TEXT,resource_id TEXT,status TEXT,created_at TEXT);
    CREATE TABLE partner_help_claims (id TEXT PRIMARY KEY,account_id TEXT,entity_type TEXT,adoption_dog_id INTEGER,lost_found_report_id INTEGER,help_case_id INTEGER,status TEXT,created_at TEXT);
    CREATE TABLE moderation_submissions (id TEXT PRIMARY KEY,resource_type TEXT,status TEXT,created_at TEXT,proposed_patch_json TEXT,submitter_type TEXT,submitter_ref TEXT,subject_id TEXT,operation TEXT);
    CREATE TABLE partner_new_profile_metadata (submission_id TEXT,partner_account_id TEXT,display_name TEXT,resolved_canonical_id INTEGER);
    CREATE TABLE partner_profile_change_metadata (submission_id TEXT,partner_account_id TEXT,partner_resource_id TEXT);
    CREATE TABLE partner_event_submission_metadata (submission_id TEXT,partner_account_id TEXT,display_title TEXT,resolved_event_id INTEGER,partner_resource_id TEXT);
    CREATE TABLE partner_resource_verifications (id TEXT PRIMARY KEY,account_id TEXT,resource_id TEXT,status TEXT,created_at TEXT);
    CREATE TABLE partner_commercial_interests (id TEXT PRIMARY KEY,account_id TEXT,status TEXT,created_at TEXT);
    CREATE TABLE partner_commercial_agreements (id TEXT PRIMARY KEY,account_id TEXT,status TEXT,created_at TEXT);
    CREATE TABLE partner_memberships (id TEXT PRIMARY KEY,account_id TEXT,resource_id TEXT,created_at TEXT,revoked_at TEXT);
    CREATE TABLE partner_audit_events (id TEXT PRIMARY KEY,action TEXT,actor_type TEXT,actor_ref TEXT,target_type TEXT,target_id TEXT,created_at TEXT);
    INSERT INTO directory_profiles VALUES (1,'Psí hotel Mops','published');
    INSERT INTO help_organizations VALUES (2,'Útulok','PUBLISHED');
    INSERT INTO managed_events VALUES (3,'Výstava psov','published');
    INSERT INTO adoption_dogs VALUES (11,'Labrador Neo','ACTIVE');
    INSERT INTO help_cases VALUES (13,'Pomoc útulku','published');
    INSERT INTO partner_resources VALUES ('r1','DIRECTORY_PROFILE',1,NULL,NULL);
    INSERT INTO partner_resources VALUES ('r3','MANAGED_EVENT',NULL,NULL,3);
    INSERT INTO partner_claims VALUES ('claim-a','partner-a','r1','PENDING','2026-11-16T12:00:00Z');
    INSERT INTO partner_claims VALUES ('claim-b','partner-b','r1','REJECTED','2026-11-18T12:00:00Z');
    INSERT INTO partner_help_claims VALUES ('help-a-approved','partner-a','ADOPTION_DOG',11,NULL,NULL,'APPROVED','2026-11-15T12:00:00Z');
    INSERT INTO partner_help_claims VALUES ('help-a-pending','partner-a','HELP_CASE',NULL,NULL,13,'PENDING','2026-11-17T12:00:00Z');
    INSERT INTO moderation_submissions VALUES
      ('new-a','DIRECTORY_PROFILE','SUBMITTED','2026-11-18T13:00:00Z','{}','PARTNER_ACCOUNT','partner-a',NULL,'CREATE'),
      ('change-a','DIRECTORY_PROFILE','PENDING_REVIEW','2026-11-18T14:00:00Z','{}','PARTNER_ACCOUNT','partner-a','1','UPDATE'),
      ('event-a','MANAGED_EVENT','REJECTED','2026-11-18T15:00:00Z','{}','PARTNER_ACCOUNT','partner-a',NULL,'CREATE'),
      ('help-create-a','ADOPTION_DOG','SUBMITTED','2026-11-18T16:00:00Z','{"name":"Šteniatko"}','PARTNER_ACCOUNT','partner-a',NULL,'CREATE');
    INSERT INTO partner_new_profile_metadata VALUES ('new-a','partner-a','Nový salón',NULL);
    INSERT INTO partner_profile_change_metadata VALUES ('change-a','partner-a','r1');
    INSERT INTO partner_event_submission_metadata VALUES ('event-a','partner-a','Výstava nová',NULL,NULL);
    INSERT INTO partner_resource_verifications VALUES ('verify-a','partner-a','r1','PENDING_VERIFICATION','2026-11-18T17:00:00Z');
    INSERT INTO partner_commercial_interests VALUES ('interest-a','partner-a','NEW','2026-11-18T18:00:00Z');
    INSERT INTO partner_commercial_agreements VALUES ('agreement-a','partner-a','OFFERED','2026-11-18T19:00:00Z');
    INSERT INTO partner_memberships VALUES ('membership-a','partner-a','r1','2026-11-15T10:00:00Z',NULL);
    INSERT INTO partner_memberships VALUES ('membership-old','partner-a','r3','2026-11-14T10:00:00Z','2026-11-15T10:00:00Z');
    INSERT INTO partner_audit_events VALUES
      ('audit-owner','MEMBERSHIP_CREATED','PARTNER','partner:partner-a','PARTNER_RESOURCE','r1','2026-11-15T10:00:00Z'),
      ('audit-admin','NEW_PROFILE_CREATED','ADMIN','admin:owner','MODERATION_SUBMISSION','new-a','2026-11-18T21:00:00Z'),
      ('audit-claim','CLAIM_APPROVED','ADMIN','admin:owner','PARTNER_HELP_CLAIM','help-a-approved','2026-11-18T22:00:00Z'),
      ('audit-other','CLAIM_APPROVED','ADMIN','admin:owner','MODERATION_SUBMISSION','other','2026-11-19T09:00:00Z');
  `);
  return {sqlite,db:fakeD1(sqlite)};
}

test("dossier: every historic request type stays under the correct partner and preserves canonical links",async()=>{
  const {sqlite,db}=setup();
  try{
    const result=await listPartnerAccountDossierRequests("partner-a",db);
    assert.equal(result.total,10);
    assert.equal(result.pending,8);
    assert.equal(result.items.length,10);
    assert.equal(result.items[0].id,"agreement-a");
    assert.ok(result.items.every(row=>row.id!=="claim-b"));
    const claim=result.items.find(row=>row.id==="claim-a");
    assert.equal(claim.requestHref,"/admin/partners/claims/claim-a");
    assert.equal(claim.editorHref,"/admin/adresar/1");
    const adoption=result.items.find(row=>row.id==="help-a-approved");
    assert.equal(adoption.editorHref,"/admin/adopcie/11");
    const help=result.items.find(row=>row.id==="help-create-a");
    assert.equal(help.title,"Šteniatko");
    assert.equal(help.editorHref,null,"Unapproved proposal must not invent canonical ID");
    const event=result.items.find(row=>row.id==="event-a");
    assert.equal(event.requestHref,"/admin/partners/events/event-a");
    assert.equal(event.pending,false);
    const second=await listPartnerAccountDossierRequests("partner-b",db);
    assert.equal(second.total,1);
    assert.equal(second.pending,0);
    assert.equal(second.items[0].id,"claim-b");
  }finally{sqlite.close();}
});

test("dossier: paginates the combined request history without losing older types",async()=>{
  const {sqlite,db}=setup();
  try{
    const ins=sqlite.prepare("INSERT INTO partner_commercial_interests VALUES (?,?,?,?)");
    for(let i=0;i<55;i++)ins.run(`extra-${i}`,"partner-a","NEW",`2026-11-19T10:${String(i).padStart(2,"0")}:00Z`);
    const first=await listPartnerAccountDossierRequests("partner-a",db,1);
    const second=await listPartnerAccountDossierRequests("partner-a",db,2);
    assert.equal(first.total,65);
    assert.equal(first.pending,63);
    assert.equal(first.items.length,50);
    assert.equal(second.items.length,15);
    assert.equal(new Set([...first.items,...second.items].map(item=>item.id)).size,65);
    assert.equal(first.totalPages,2);
  }finally{sqlite.close();}
});

test("dossier: active managed profiles include approved Help ownership but not revoked memberships",async()=>{
  const {sqlite,db}=setup();
  try{
    const data=await listPartnerAccountDossierProfiles("partner-a",db);
    assert.equal(data.total,2);
    assert.deepEqual(new Set(data.items.map(p=>p.editorHref)),new Set(["/admin/adresar/1","/admin/adopcie/11"]));
    assert.equal((await listPartnerAccountDossierProfiles("partner-b",db)).total,0);
    assert.equal(partnerDossierEditorHref("LOST_FOUND_DOG",12),"/admin/stratene-najdene/12");
    assert.equal(partnerDossierEditorHref("HELP_CASE",13),"/admin/pomoc/13");
    assert.equal(partnerDossierEditorHref("MANAGED_EVENT",3),"/admin/podujatia/3");
    assert.equal(partnerDossierEditorHref("HELP_ORGANIZATION",2),"/admin/organizacie/2");
    assert.equal(partnerDossierEditorHref("DIRECTORY_PROFILE",0),null);
    assert.equal(partnerDossierEditorHref("COMMERCIAL",1),null);
  }finally{sqlite.close();}
});

test("dossier: history includes partner actions and admin decisions for their submitted records only",async()=>{
  const {sqlite,db}=setup();
  try{
    const history=await listPartnerAccountDossierHistory("partner-a",db);
    assert.equal(history.total,3);
    assert.deepEqual(new Set(history.items.map(row=>row.id)),new Set(["audit-owner","audit-admin","audit-claim"]));
    assert.equal((await listPartnerAccountDossierHistory("partner-b",db)).total,0);
  }finally{sqlite.close();}
});

test("dossier: five navigation tabs, account-scoped loaders and safe placeholder for not-yet-built chat",()=>{
  const page=readFileSync(new URL("../app/admin/partners/accounts/[id]/page.tsx",import.meta.url),"utf8");
  const store=readFileSync(new URL("../lib/partner-admin-store.ts",import.meta.url),"utf8");
  for(const label of ["Žiadosti","Profily","Správy","Účet","História"])assert.ok(page.includes(`name:"${label}"`));
  assert.match(page,/getPartnerAccountAdmin\(id\)/);
  assert.match(page,/getPartnerAccountDossierAdmin\(\{accountId:id,tab,page\}\)/);
  assert.match(page,/Zatiaľ nepodal žiadnu žiadosť/);
  assert.match(page,/Otvoriť žiadosť/);
  assert.match(page,/Otvoriť editor/);
  assert.match(page,/AdminPartnerAccountActions/);
  assert.match(page,/chat zatiaľ|Chat zatiaľ|Súkromný rozhovor/);
  assert.match(store,/listPartnerAccountDossierRequests/);
  assert.match(store,/listPartnerAccountDossierProfiles/);
  assert.match(store,/listPartnerAccountDossierHistory/);
});
