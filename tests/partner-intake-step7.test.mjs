import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  listAdminInbox,normalizeInboxFilters,inboxReviewHref,inboxEditorHref,INBOX_PAGE_SIZE,
} from "../lib/admin-submission-inbox.ts";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

function fixture(){
 const sql=new DatabaseSync(":memory:");
 sql.exec([
  "CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY,name TEXT);",
  "CREATE TABLE help_organizations(id INTEGER PRIMARY KEY,name TEXT);",
  "CREATE TABLE managed_events(id INTEGER PRIMARY KEY,title TEXT);",
  "CREATE TABLE adoption_dogs(id INTEGER PRIMARY KEY,name TEXT);",
  "CREATE TABLE lost_found_dog_reports(id INTEGER PRIMARY KEY,dog_name TEXT);",
  "CREATE TABLE help_cases(id INTEGER PRIMARY KEY,title TEXT);",
  "CREATE TABLE moderation_submissions(id TEXT PRIMARY KEY,resource_type TEXT,subject_id TEXT,operation TEXT,status TEXT,submitter_type TEXT,submitter_ref TEXT,created_at TEXT,updated_at TEXT,proposed_patch_json TEXT DEFAULT '{}');",
  "CREATE TABLE partner_new_profile_metadata(submission_id TEXT PRIMARY KEY, display_name TEXT, resolved_canonical_id INTEGER);",
  "CREATE TABLE partner_event_submission_metadata(submission_id TEXT PRIMARY KEY, display_title TEXT, resolved_event_id INTEGER);",
  "CREATE TABLE partner_resources(id TEXT PRIMARY KEY,entity_type TEXT,directory_profile_id INTEGER,help_organization_id INTEGER,managed_event_id INTEGER);",
  "CREATE TABLE partner_claims(id TEXT PRIMARY KEY,account_id TEXT,resource_id TEXT,status TEXT,created_at TEXT,updated_at TEXT);",
  "CREATE TABLE partner_help_claims(id TEXT PRIMARY KEY,account_id TEXT,entity_type TEXT,adoption_dog_id INTEGER,lost_found_report_id INTEGER,help_case_id INTEGER,status TEXT,decision_note TEXT,created_at TEXT,updated_at TEXT);",
  "CREATE TABLE directory_inquiries(id INTEGER PRIMARY KEY,profile_id INTEGER,profile_name TEXT,status TEXT,created_at TEXT,updated_at TEXT);",
  "INSERT INTO directory_profiles VALUES(1,'Psí salón');",
  "INSERT INTO managed_events VALUES(7,'Psia výstava');",
  "INSERT INTO lost_found_dog_reports VALUES(21,'Mia'),(22,'Bady');",
  "INSERT INTO partner_resources VALUES('resource-1','DIRECTORY_PROFILE',1,NULL,NULL);",
  "INSERT INTO moderation_submissions(id,resource_type,subject_id,operation,status,submitter_type,submitter_ref,created_at,updated_at) VALUES",
  " ('m1','LOST_FOUND_DOG','21','CREATE','SUBMITTED','PARTNER_ACCOUNT','account-1','2026-11-23T10:00:00Z','2026-11-23T10:00:00Z'),",
  " ('m2','LOST_FOUND_DOG','22','CREATE','PENDING_REVIEW','PUBLIC_REPORTER','private-reporter-ref','2026-11-23T09:00:00Z','2026-11-23T09:00:00Z'),",
  " ('m3','MANAGED_EVENT','7','CREATE','APPROVED','PARTNER_ACCOUNT','account-1','2026-11-22T08:00:00Z','2026-11-22T08:00:00Z'),",
  " ('m4','DIRECTORY_PROFILE','1','UPDATE','REJECTED','PARTNER_ACCOUNT','account-1','2026-11-21T07:00:00Z','2026-11-21T07:00:00Z'),",
  " ('m5','DIRECTORY_PROFILE','1','CREATE','DRAFT','PARTNER_ACCOUNT','account-1','2026-11-23T12:00:00Z','2026-11-23T12:00:00Z');",
  "INSERT INTO partner_claims VALUES('claim-1','account-1','resource-1','PENDING','2026-11-23T11:00:00Z','2026-11-23T11:00:00Z');",
  "INSERT INTO partner_help_claims VALUES",
  " ('help-claim-1','account-1','LOST_FOUND_DOG',NULL,21,NULL,'PENDING','Pôvodný oznamovateľ','2026-11-23T08:00:00Z','2026-11-23T08:00:00Z'),",
  " ('auto-owner','account-1','LOST_FOUND_DOG',NULL,22,NULL,'APPROVED','Schválený nový partnerský profil','2026-11-23T08:00:00Z','2026-11-23T08:00:00Z');",
  "INSERT INTO directory_inquiries VALUES",
  " (2,1,'Psí salón','new','2026-11-23T12:00:00Z','2026-11-23T12:00:00Z'),",
  " (3,1,'Psí salón','resolved','2026-11-20T11:00:00Z','2026-11-20T11:00:00Z');",
 ].join("\n"));
 const db={prepare(query){return {bind(...values){return {
   async first(){return sql.prepare(query).get(...values)??null;},
   async all(){return {results:sql.prepare(query).all(...values)};},
 };}}}};
 return {sql,db};
}

test("unified inbox projects canonical data exactly once and exposes bounded pending work",async()=>{
 const {sql,db}=fixture();
 try {
  const r=await listAdminInbox(normalizeInboxFilters({}),db);
  assert.equal(r.total,5);
  assert.equal(r.pending,5);
  assert.equal(r.pageSize,INBOX_PAGE_SIZE);
  assert.equal(r.totalPages,1);
  assert.equal(new Set(r.items.map(x=>x.key)).size,r.items.length);
  assert.deepEqual(new Set(r.items.map(x=>x.kind)),new Set(["PARTNER","PUBLIC","CLAIM","INQUIRY"]));
  assert.ok(r.items.some(x=>x.id==="m1"&&x.title==="Mia"&&x.reviewHref==="/admin/partners/help-submissions/m1"));
  const publicReport=r.items.find(x=>x.id==="m2");
  assert.equal(publicReport.reviewHref,"/admin/stratene-najdene/22");
  assert.equal(publicReport.partnerHref,null);
  assert.equal(publicReport.chatHref,null);
  assert.ok(!JSON.stringify(publicReport).includes("private-reporter-ref"));
  assert.ok(!r.items.some(x=>x.id==="auto-owner"),"Automatic OWNER is not a duplicate takeover request");
  assert.ok(!r.items.some(x=>x.id==="m5"),"Unsent DRAFT does not belong in review queue");
 } finally {sql.close();}
});

test("status/history and type filters use bound SQLite parameters and preserve older decisions",async()=>{
 const {sql,db}=fixture();
 try {
  const all=await listAdminInbox(normalizeInboxFilters({state:"all"}),db);
  assert.equal(all.total,8);
  assert.equal(all.pending,5);
  assert.equal(all.items[0].id,"2","Pending dopyt is newest");
  const history=await listAdminInbox(normalizeInboxFilters({state:"history"}),db);
  assert.equal(history.total,3);
  assert.ok(history.items.some(x=>x.status==="APPROVED"));
  assert.ok(history.items.some(x=>x.status==="REJECTED"));
  assert.ok(history.items.some(x=>x.status==="resolved"));
  const inquiries=await listAdminInbox(normalizeInboxFilters({kind:"INQUIRY",state:"all"}),db);
  assert.equal(inquiries.total,2);
  assert.equal(inquiries.items[0].reviewHref,"/admin/dopyty?id=2#dopyt-2");
  const found=await listAdminInbox(normalizeInboxFilters({state:"all",q:"Mia"}),db);
  assert.equal(found.total,2);
  const injected=await listAdminInbox(normalizeInboxFilters({state:"all",q:"Mia' OR 1=1 --"}),db);
  assert.equal(injected.total,0);
 } finally {sql.close();}
});

test("filter normalization and safe detail links never accept external or oversized paging",()=>{
 assert.deepEqual(normalizeInboxFilters({kind:"evil",state:"bad",q:"  abc  ",page:"-4"}),{
  kind:"all",state:"pending",q:"abc",page:1,
 });
 assert.equal(normalizeInboxFilters({page:"100000"}).page,10000);
 assert.equal(inboxReviewHref({kind:"PARTNER",id:"test-1",resourceType:"DIRECTORY_PROFILE",operation:"UPDATE",canonicalId:1}),"/admin/partners/changes/test-1");
 assert.equal(inboxReviewHref({kind:"PARTNER",id:"test-2",resourceType:"MANAGED_EVENT",operation:"CREATE",canonicalId:7}),"/admin/partners/events/test-2");
 assert.equal(inboxReviewHref({kind:"CLAIM",id:"help-claim-1",resourceType:"LOST_FOUND_DOG",operation:"CLAIM",canonicalId:21}),"/admin/partners/claims/help-claim-1");
 assert.equal(inboxEditorHref({resourceType:"LOST_FOUND_DOG",canonicalId:21}),"/admin/stratene-najdene/21");
 assert.equal(inboxEditorHref({resourceType:"LOST_FOUND_DOG",canonicalId:null}),null);
});

test("Admin-only page is a compact read-only view; original routes remain edit authorities",()=>{
 const page=read("app/admin/podania/page.tsx"),style=read("app/admin/podania/podania.module.css");
 const menu=read("lib/admin-navigation.ts");
 const oldPage=read("app/admin/dopyty/page.tsx");
 const dashboard=read("components/admin-inquiry-dashboard.tsx");
 assert.match(page,/requireAdminPageUser\("\/admin\/podania"\)/);
 assert.match(page,/listAdminInbox\(filters\)/);
 assert.match(page,/<Suspense fallback=/);
 assert.match(page,/<InboxContent filters=\{filters\}/);
 assert.match(page,/Spoločný prehľad momentálne nie je dostupný/);
 assert.match(page,/data-admin-submission-inbox/);
 assert.match(page,/aria-label="Stránkovanie podaní"/);
 assert.match(page,/item.reviewHref/);
 assert.match(page, /adminDetailHref\(item\.partnerHref, returnHref\)/);
 assert.match(page, /adminDetailHref\(item\.chatHref, returnHref\)/);
 assert.match(page, /urlFor\(result\?\.page/);
 const account = read("app/admin/partners/accounts/[id]/page.tsx");
 assert.match(account, /adminReturnHref\(options\.returnTo, \[partnerListHref, inboxHref\]\)/);
 assert.match(account, /Späť na podania a dopyty/);
 assert.match(page,/Otvoriť podanie/);
 assert.doesNotMatch(page,/fetch\(|INSERT INTO|UPDATE |DELETE FROM|\.run\(/);
 assert.match(style,/min-width:790px/);
 assert.match(menu,/label: "Podania a dopyty", href: "\/admin\/podania", matches: \["\/admin\/dopyty"\]/);
 assert.match(oldPage,/initialFocusedId=\{focusedId\}/);
 assert.match(dashboard,/initialIndex\/COMMUNITY_PAGE_SIZE/);
 assert.match(read("app/admin/partners/page.tsx"),/href="\/admin\/podania\?kind=PARTNER"/);
});

test("approved help claims without a decision note stay in inbox history", async () => {
  const { sql, db } = fixture();
  try {
    sql.exec("UPDATE partner_help_claims SET status='APPROVED', decision_note=NULL WHERE id='help-claim-1'");
    const history = await listAdminInbox(normalizeInboxFilters({ kind: "CLAIM", state: "history" }), db);
    assert.deepEqual(history.items.map((item) => item.id), ["help-claim-1"]);
  } finally {
    sql.close();
  }
});

test("inbox search uses submission names and resolved IDs if the subject link is missing", async () => {
  const { sql, db } = fixture();
  try {
    sql.exec(`
      UPDATE moderation_submissions SET subject_id=NULL WHERE id IN ('m1','m2','m3');
      INSERT INTO moderation_submissions(id,resource_type,operation,status,submitter_type,submitter_ref,created_at,updated_at)
        VALUES ('m6','DIRECTORY_PROFILE','CREATE','APPROVED','PARTNER_ACCOUNT','account-1','2026-11-22T08:00:00Z','2026-11-22T08:00:00Z');
      UPDATE moderation_submissions SET proposed_patch_json='{"dogName":"Mia podanie"}' WHERE id='m1';
      UPDATE moderation_submissions SET proposed_patch_json='{' WHERE id='m2';
      INSERT INTO partner_event_submission_metadata VALUES ('m3','Psia výstava z podania',7);
      INSERT INTO partner_new_profile_metadata VALUES ('m6','Psí salón z podania',1);
    `);
    for (const [label, expectedId, editorHref] of [
      ["Mia podanie", "m1", null],
      ["Psia výstava", "m3", "/admin/podujatia/7"],
      ["Psí salón z podania", "m6", "/admin/adresar/1"],
    ]) {
      const result = await listAdminInbox(normalizeInboxFilters({ q: label, state: "all" }), db);
      assert.equal(result.total, 1);
      assert.equal(result.items[0].id, expectedId);
      assert.equal(result.items[0].editorHref, editorHref);
    }
  } finally {
    sql.close();
  }
});

test("inbox finds Slovak titles with or without accents", async () => {
  const { sql, db } = fixture();
  try {
    const result = await listAdminInbox(normalizeInboxFilters({ q: "PSIA VYSTAVA", state: "all" }), db);
    assert.deepEqual(result.items.map((item) => item.id), ["m3"]);
  } finally {
    sql.close();
  }
});
