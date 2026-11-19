import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createCanonicalDraft } from "../lib/canonical-draft-service.ts";
import { canTransitionModerationSubmission, isFoundationSubmissionStatus } from "../lib/moderation-transition.ts";

const read = p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

function fakeDraftDatabase(sqlite){
  return {prepare(sql){
    const found=/^INSERT INTO (\w+) \(([^)]+)\) VALUES/i.exec(sql);
    if(found){
      const table=found[1],columns=found[2].split(",").map(s=>s.trim());
      const exists=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
      if(!exists){
        const ddl="CREATE TABLE "+table+" (id INTEGER PRIMARY KEY AUTOINCREMENT,"+
          columns.filter(name=>name!=="id").map(name=>name+" TEXT").join(",")+")";
        sqlite.exec(ddl);
      }
    }
    return {bind(...params){return {
      async first(){return sqlite.prepare(sql).get(...params)??null;},
      async run(){const result=sqlite.prepare(sql).run(...params);return {meta:{changes:result.changes}};},
    }}};
  }};
}

test("canonical service creates never-published real SQL drafts with no mandatory public text",async()=>{
  const sqlite=new DatabaseSync(":memory:");
  const cases=[
    ["DIRECTORY",{category:"veterinari"},"directory_profiles"],
    ["ORGANIZATION",{type:"OTHER"},"help_organizations"],
    ["EVENT",{},"managed_events"],
    ["ADOPTION",{},"adoption_dogs"],
    ["LOST_FOUND",{type:"LOST"},"lost_found_dog_reports"],
    ["HELP_ITEM",{category:"docasna-opatera"},"help_cases"],
  ];
  try{
    for(const [entityType,data,table] of cases){
      const draft=await createCanonicalDraft(
        {entityType,data,slugSuffix:"partner-test"},
        {actor:"partner:account-1",createdAt:"2026-11-20T08:00:00.000Z",allowIncomplete:true},
        fakeDraftDatabase(sqlite));
      assert.equal(draft.canonicalEntityId,1,entityType);
      const row=sqlite.prepare("SELECT * FROM "+table+" WHERE id=1").get();
      assert.ok(row,entityType);
      assert.ok(row.status==="draft"||row.status==="DRAFT");
      assert.equal(row.published_at,null);
      assert.ok(row.slug.includes("partner-test"));
    }
  }finally{sqlite.close();}
});

test("empty-content override is opt-in; existing editorial validation remains strict",async()=>{
  const sqlite=new DatabaseSync(":memory:");
  try{
    await assert.rejects(
      createCanonicalDraft({entityType:"EVENT",data:{}},
        {actor:"admin:test",createdAt:"2026-11-20T08:00:00.000Z"},fakeDraftDatabase(sqlite)),
      /názov a dátum/);
    await assert.rejects(
      createCanonicalDraft({entityType:"DIRECTORY",data:{category:"veterinari"}},
        {actor:"admin:test",createdAt:"2026-11-20T08:00:00.000Z"},fakeDraftDatabase(sqlite)),
      /kategóriu/);
  }finally{sqlite.close();}
});

test("lifecycle: unsubmitted, submitted, returned and final states use existing no-migration moderation schema",()=>{
  for(const status of ["DRAFT","SUBMITTED","PENDING_REVIEW","QUARANTINED","RETURNED","APPROVED","REJECTED"])
    assert.ok(isFoundationSubmissionStatus(status),status);
  assert.ok(canTransitionModerationSubmission("DRAFT","SUBMITTED"));
  assert.ok(canTransitionModerationSubmission("RETURNED","SUBMITTED"));
  assert.ok(canTransitionModerationSubmission("PENDING_REVIEW","RETURNED"));
  assert.ok(canTransitionModerationSubmission("PENDING_REVIEW","APPROVED"));
  assert.equal(canTransitionModerationSubmission("DRAFT","APPROVED"),false);
  assert.equal(canTransitionModerationSubmission("APPROVED","RETURNED"),false);
  const migration=read("drizzle/0029_submission_moderation_security_foundation.sql");
  const table=migration.slice(migration.indexOf("CREATE TABLE `moderation_submissions`"),
    migration.indexOf("--> statement-breakpoint"));
  assert.doesNotMatch(table,/CHECK\s*\(.*status/i);
});

test("partner V2 has dedicated same-origin authenticated API and reusable canonical Admin editors",()=>{
  const base=read("app/api/partner/canonical-drafts/route.ts");
  const edit=read("app/api/partner/canonical-drafts/[id]/route.ts");
  const admin=read("app/api/admin/partners/canonical-drafts/[id]/route.ts");
  const workflow=read("lib/partner-canonical-workflow.ts");
  for(const src of [base,edit])assert.match(src,/requirePartnerAccount/);
  for(const src of [base,edit])assert.match(src,/assertPartnerJsonMutation/);
  assert.match(admin,/requirePartnerAdminMutation/);
  assert.match(workflow,/createCanonicalDraft/);
  assert.match(workflow,/applyAtomicModerationTransition/);
  assert.match(workflow,/STALE_CANONICAL_DRAFT/);
  assert.match(workflow,/partnerDirectoryReviewLockStatement/);
  assert.match(workflow,/partnerDirectory0173ReviewSqlMirrorStatement/);
  assert.match(workflow,/partnerAdminReviewStatement/);
  assert.match(workflow,/INSERT INTO partner_memberships/);
  assert.match(workflow,/INSERT INTO partner_help_claims/);
  assert.match(workflow,/status IN \('draft','DRAFT'\)/);
  assert.doesNotMatch(workflow,/\bseo_json\s*=/i);
  const pages=[
    "app/admin/adresar/[id]/page.tsx","app/admin/organizacie/[id]/page.tsx",
    "app/admin/podujatia/[id]/page.tsx","app/admin/adopcie/[id]/page.tsx",
    "app/admin/stratene-najdene/[id]/page.tsx","app/admin/pomoc/[id]/page.tsx",
  ];
  for(const path of pages)assert.match(read(path),/<AdminPartnerCanonicalDraft /,path);
  const form=read("components/partner-canonical-draft-form.tsx");
  for(const option of ["Uložiť koncept","Odoslať na schválenie","Vrátené na doplnenie"])
    assert.ok(form.includes(option),option);
  assert.match(read("app/partner/page.tsx"),/\/partner\/koncepty\/novy/);
});

test("old Admin CREATE paths delegate linked canonical submissions rather than duplicating rows",()=>{
  for(const path of ["lib/partner-new-profile-admin.ts","lib/partner-events-admin.ts","lib/partner-help-create-admin.ts"]){
    const src=read(path);
    assert.match(src,/decidePartnerCanonicalDraftAdmin/);
    assert.match(src,/\.subjectId/);
  }
  const dossier=read("lib/partner-admin-dossier.ts");
  assert.match(dossier,/s\.status<>'DRAFT'/);
});


test("submitted canonical drafts cannot be withdrawn via legacy Partner mutation endpoints",()=>{
  const sources=[
    ["lib/partner-new-profile.ts","withdrawPartnerNewProfile"],
    ["lib/partner-events.ts","withdrawPartnerEventSubmission"],
    ["lib/partner-help-create.ts","withdrawPartnerHelpCreate"],
  ];
  for(const [file,start] of sources){
    const text=read(file);
    const entry=text.slice(text.indexOf("export async function "+start));
    assert.match(entry,/subject_id subjectId/,file+" must read canonical link");
    assert.match(entry,/row\.subjectId\s*!==\s*null/,file+" must reject linked drafts");
    assert.match(entry,/409/,file+" must return conflict");
  }
  const domain=read("lib/partner-canonical-workflow.ts");
  assert.doesNotMatch(domain,/export async function withdrawPartnerCanonicalDraft/);
});

test("partner cannot edit internal SEO or organization registration number",()=>{
  const domain=read("lib/partner-canonical-workflow.ts");
  const form=read("components/partner-canonical-draft-form.tsx");
  assert.match(domain,/Object\.prototype\.hasOwnProperty\.call\(mapping,key\)/);
  assert.doesNotMatch(domain,/registrationNumber/);
  assert.doesNotMatch(form,/registrationNumber|Registračné číslo/);
  for(const key of ["seoJson","publishedAt","updatedBy","sourceDataJson","ownerId"])
    assert.doesNotMatch(domain,new RegExp('"' + key + '"'));
});
