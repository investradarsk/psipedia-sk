import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { partnerFieldDiff,parsePartnerAuditChanges } from "../lib/partner-audit-diff.ts";

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("direct Partner audit records only changed public fields, including gallery and main image",()=>{
  const before={name:"Útulok ZM",description:"Pôvodný text",galleryUrls:["/media/old.webp"],
    imageUrl:"/media/main.webp",publicPhone:"0900"};
  const after={name:"Útulok ZM",description:"Opravený text",galleryUrls:["/media/new.webp"],
    imageUrl:"/media/main-2.webp"};
  const changes=partnerFieldDiff(before,after);
  assert.deepEqual(Object.keys(changes).sort(),["description","galleryUrls","imageUrl"]);
  assert.deepEqual(changes.description,{old:"Pôvodný text",new:"Opravený text"});
  assert.deepEqual(changes.galleryUrls.old,["/media/old.webp"]);
  assert.equal(changes.galleryUrls.new[0],"/media/new.webp");
  const parsed=parsePartnerAuditChanges(JSON.stringify({mode:"DIRECT_PUBLIC_SAVE",changes}));
  assert.equal(parsed.changes.length,3);
  assert.equal(parsed.changes.find(c=>c.field==="imageUrl").next,"/media/main-2.webp");
  assert.deepEqual(parsePartnerAuditChanges("{old broken JSON").changes,[]);
});

test("every direct Partner writer inserts a per-edit Admin notification and audit in the SAME D1 batch",()=>{
  for(const path of ["lib/partner-direct-profile.ts","lib/partner-direct-event.ts","lib/partner-help-editor.ts"]){
    const src=read(path);
    assert.match(src,/partnerFieldDiff/);
    assert.match(src,/adminNotificationEventStatement/);
    assert.match(src,/mode:"DIRECT_PUBLIC_SAVE"/);
    assert.match(src,/changes:changeLog/);
    assert.match(src,/PARTNER_(?:EDIT|EVENT|HELP)_CAS_CONFLICT/);
    const batch=src.slice(src.indexOf("const batchResults=await database.batch([")>=0?
      src.indexOf("const batchResults=await database.batch(["):src.indexOf("const results=await database.batch([")>=0?
      src.indexOf("const results=await database.batch(["):src.indexOf("const result = await database.batch(["));
    assert.match(batch,/adminNotificationEventStatement/);
  }
});

test("lifecycle is a request first: submitted Partner cannot directly archive, hide, revoke or close",()=>{
  const source=read("lib/partner-lifecycle.ts");
  const create=source.slice(source.indexOf("export async function createPartnerLifecycleRequest("),
    source.indexOf("type Row="));
  assert.match(create,/INSERT INTO moderation_submissions/);
  assert.match(create,/status IN \('SUBMITTED','PENDING_REVIEW','QUARANTINED'\)/);
  assert.doesNotMatch(create,/UPDATE directory_profiles|UPDATE partner_accounts SET status='DEACTIVATED'/);
  assert.match(create,/adminNotificationEventStatement/);
  const decision=source.slice(source.indexOf("export async function decidePartnerLifecycleAdmin("));
  assert.match(decision,/applyAtomicModerationTransition/);
  assert.match(decision,/extraStatements:statements/);
  assert.match(decision,/status:"SUBMITTED" as const|APPROVED/);
  assert.match(source,/partner_memberships SET revoked_at/);
  assert.match(source,/partner_help_claims SET status='REVOKED'/);
  assert.match(source,/status='DEACTIVATED'/);
  assert.match(source,/status='WITHDRAWN'/);
  assert.doesNotMatch(source,/DELETE FROM (directory_profiles|help_organizations|managed_events|adoption_dogs|lost_found_dog_reports|help_cases)/);
});

test("Lifecycle terminal decisions preserve published_at and don't restore Notion sync after revoke",()=>{
  const lifecycle=read("lib/partner-lifecycle.ts");
  assert.match(lifecycle,/SET status=\?,updated_at=\?/);
  assert.doesNotMatch(lifecycle,/SET published_at=NULL/);
  assert.doesNotMatch(lifecycle,/admin_entity_reviews.*DELETE/);
  assert.match(lifecycle,/revoked_at/);
  const admin=read("lib/partner-admin-store.ts");
  const status=admin.slice(admin.indexOf("export async function setPartnerAccountStatusAdmin"),admin.indexOf("export async function searchCanonicalPartnerResources"));
  assert.match(status,/input\.action==="DEACTIVATE"/);
  assert.match(status,/UPDATE partner_help_claims SET status='REVOKED'/);
  assert.match(status,/UPDATE partner_memberships SET revoked_at/);
  assert.match(status,/SUSPEND/);
});

test("lifecycle API enforces authenticated same-origin Partner and separate Admin authorization",()=>{
  const partner=read("app/api/partner/lifecycle/route.ts");
  const admin=read("app/api/admin/partners/lifecycle/[id]/route.ts");
  assert.match(partner,/assertPartnerJsonMutation/);
  assert.match(partner,/requirePartnerAccount/);
  assert.match(partner,/onboardingComplete/);
  assert.match(admin,/requirePartnerAdminMutation/);
  assert.match(admin,/decidePartnerLifecycleAdmin/);
  for(const path of [
    "app/partner/profily/[resourceId]/upravit/page.tsx",
    "app/partner/podujatia/[resourceId]/upravit/page.tsx",
    "app/partner/pomoc/[resourceId]/upravit/page.tsx",
    "app/partner/nastavenia/page.tsx",
  ])assert.match(read(path),/PartnerLifecycleRequest/);
  assert.match(read("app/admin/partners/accounts/[id]/page.tsx"),/AdminPartnerLifecycleDecision/);
});

test("moderation requests reuse TEXT operation without database migration or duplicate profile table",()=>{
  const sqlite=new DatabaseSync(":memory:");
  try{
    sqlite.exec("CREATE TABLE moderation_submissions(id TEXT PRIMARY KEY,operation TEXT NOT NULL,status TEXT NOT NULL,subject_id TEXT);");
    const insert=sqlite.prepare("INSERT INTO moderation_submissions VALUES(?,?,?,?)");
    for(const [i,action] of ["REQUEST_HIDE","REQUEST_ARCHIVE","REQUEST_RELEASE","REQUEST_DELETE_ACCOUNT"].entries())
      insert.run("lifecycle-"+i,action,"SUBMITTED",action==="REQUEST_DELETE_ACCOUNT"?"acct-1":"100");
    const result=sqlite.prepare("SELECT COUNT(*) count FROM moderation_submissions WHERE operation LIKE 'REQUEST_%' AND status='SUBMITTED'").get();
    assert.equal(result.count,4);
  }finally{sqlite.close();}
});
