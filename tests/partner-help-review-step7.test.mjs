import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const m=await import(pathToFileURL(new URL("../lib/partner-help-create-admin.ts",import.meta.url).pathname).href);
const source=await import(pathToFileURL(new URL("../lib/partner-help-create.ts",import.meta.url).pathname).href);
const stamp="2026-11-19T12:00:00.000Z";
const actor="admin:review";
function fixture(){
  const sql=new DatabaseSync(":memory:");
  sql.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE moderation_submissions(id TEXT PRIMARY KEY,status TEXT,updated_at TEXT,reviewed_by TEXT);
    CREATE TABLE adoption_dogs(
      id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,slug TEXT UNIQUE,status TEXT,sex TEXT,size TEXT,
      approximate_age_months INTEGER,breed_name TEXT,region TEXT,district TEXT,city TEXT,organization_name TEXT,
      short_description TEXT,description TEXT,search_text TEXT,created_at TEXT,updated_at TEXT,
      created_by TEXT,updated_by TEXT);
    CREATE TABLE lost_found_dog_reports(
      id INTEGER PRIMARY KEY AUTOINCREMENT,type TEXT,slug TEXT,status TEXT,dog_name TEXT,sex TEXT,breed TEXT,color TEXT,
      size TEXT,event_date TEXT,region TEXT,district TEXT,city TEXT,location_description TEXT,
      description TEXT,search_text TEXT,created_at TEXT,updated_at TEXT,
      UNIQUE(type,slug));
    CREATE TABLE help_cases(
      id INTEGER PRIMARY KEY AUTOINCREMENT,slug TEXT,title TEXT,category TEXT,status TEXT,excerpt TEXT,
      description TEXT,organization TEXT,city TEXT,region TEXT,action_label TEXT,contact_note TEXT,
      created_at TEXT,updated_at TEXT,created_by TEXT,updated_by TEXT,
      UNIQUE(category,slug));
    CREATE TABLE partner_help_claims(
      id TEXT PRIMARY KEY,account_id TEXT,entity_type TEXT,
      adoption_dog_id INTEGER REFERENCES adoption_dogs(id),lost_found_report_id INTEGER REFERENCES lost_found_dog_reports(id),
      help_case_id INTEGER REFERENCES help_cases(id),status TEXT,request_message TEXT,decision_note TEXT,
      created_at TEXT,updated_at TEXT,reviewed_at TEXT,reviewed_by TEXT);
    CREATE UNIQUE INDEX approved_adoption ON partner_help_claims(adoption_dog_id) WHERE status='APPROVED';
    CREATE UNIQUE INDEX approved_lost ON partner_help_claims(lost_found_report_id) WHERE status='APPROVED';
    CREATE UNIQUE INDEX approved_case ON partner_help_claims(help_case_id) WHERE status='APPROVED';
  `);
  const database={prepare(query){return{bind(...args){return{
    run:async()=>({meta:{changes:sql.prepare(query).run(...args).changes}}),
    first:async()=>sql.prepare(query).get(...args)??null,
  }}}}};
  return {sql,database};
}
const examples={
  ADOPTION_DOG:{
    name:"Rex",sex:"MALE",size:"MEDIUM",approximateAgeMonths:22,breedName:"Kríženec",
    region:"Nitriansky kraj",district:"Nitra",city:"Nitra",organizationName:"Psí domov",
    shortDescription:"Hľadá milujúcu rodinu",description:"Rex je priateľský pes a hľadá si pokojný domov s láskavým majiteľom.",
  },
  LOST_FOUND_DOG:{
    type:"LOST",dogName:"Bady",sex:"MALE",breed:"Labrador",color:"Čierna",
    size:"LARGE",eventDate:"2026-11-19",region:"Nitriansky kraj",district:"Nitra",city:"Nitra",
    locationDescription:"Pri námestí v Nitre",description:"Pes sa stratil vo štvrtok na prechádzke pri námestí v Nitre.",
  },
  HELP_CASE:{
    title:"Pomoc pre psí útulok",category:"zbierky",excerpt:"Potrebujeme krmivo pre útulok",
    description:"Útulok potrebuje krmivo pre opustené a zachránené psy na zimu.",
    organization:"Psí domov",region:"Nitriansky kraj",city:"Nitra",actionLabel:"Kontaktovať útulok",contactNote:"Napíšte nám správu.",
  },
};
for(const type of Object.keys(examples)){
  test("Step 7 "+type+" creates only canonical draft and approves the single manager claim",async()=>{
    const {sql,database}=fixture();
    try{
      const id="test-"+type;
      sql.prepare("INSERT INTO moderation_submissions VALUES (?,?,?,?)").run(id,"APPROVED",stamp,actor);
      const p=source.normalizePartnerHelpCreate(type,examples[type]);
      const slug="partner-"+type.toLowerCase();
      const insert=m.insertCanonical(database,{id,type,p,slug,nowIso:stamp,actorRef:actor});
      const created=await insert.run();
      assert.equal(created.meta.changes,1,"approved transition permits canonical creation");
      const table=type==="ADOPTION_DOG"?"adoption_dogs":type==="LOST_FOUND_DOG"?"lost_found_dog_reports":"help_cases";
      const row=sql.prepare(`SELECT * FROM ${table} WHERE slug=?`).get(slug);
      assert.ok(row);
      assert.equal(row.status,type==="HELP_CASE"?"draft":"DRAFT","creation never publishes");
      assert.equal(row.created_at,stamp);
      assert.equal(row.updated_at,stamp);
      if(type!=="LOST_FOUND_DOG")assert.equal(row.created_by,actor);
      const column=type==="ADOPTION_DOG"?"adoption_dog_id":type==="LOST_FOUND_DOG"?"lost_found_report_id":"help_case_id";
      const canonicalIdSql=`SELECT id FROM ${table} WHERE slug='${slug}' LIMIT 1`;
      const claim=await m.claim(database,{submissionId:id,type,accountId:"partner-a",
        canonicalIdSql,actorRef:actor,nowIso:stamp}).run();
      assert.equal(claim.meta.changes,1);
      const manager=sql.prepare(`SELECT account_id,status,${column} canonicalId FROM partner_help_claims`).get();
      assert.equal(manager.account_id,"partner-a");
      assert.equal(manager.status,"APPROVED");
      assert.equal(manager.canonicalId,row.id);
      assert.equal((await m.claim(database,{submissionId:id,type,accountId:"partner-b",
        canonicalIdSql,actorRef:actor,nowIso:stamp}).run()).meta.changes,0,
        "cannot grant a second approved external manager");
    }finally{sql.close();}
  });
}
test("Non-approved or mismatched moderator cannot create any canonical draft",async()=>{
  const {sql,database}=fixture();
  try{
    const p=source.normalizePartnerHelpCreate("HELP_CASE",examples.HELP_CASE);
    sql.prepare("INSERT INTO moderation_submissions VALUES (?,?,?,?)")
      .run("draft1","SUBMITTED",stamp,actor);
    const stmt=m.insertCanonical(database,{id:"draft1",type:"HELP_CASE",p,
      slug:"never-published",nowIso:stamp,actorRef:actor});
    assert.equal((await stmt.run()).meta.changes,0);
    assert.equal(sql.prepare("SELECT COUNT(*) n FROM help_cases").get().n,0);
    sql.prepare("UPDATE moderation_submissions SET status='APPROVED',reviewed_by='admin:other' WHERE id='draft1'").run();
    assert.equal((await stmt.run()).meta.changes,0);
  }finally{sql.close();}
});
test("Step 7 routes require admin mutation, allow editing only through validated payload and preserve original submission",async()=>{
  const [domain,api,page,actions,queue,fields,transition,migration]=await Promise.all([
    "lib/partner-help-create-admin.ts",
    "app/api/admin/partners/help-submissions/[id]/route.ts",
    "app/admin/partners/help-submissions/[id]/page.tsx",
    "components/admin-partner-help-review-actions.tsx",
    "app/admin/partners/help-submissions/page.tsx",
    "lib/partner-help-create-form-fields.ts",
    "lib/moderation-transition.ts",
    "drizzle/0172_partner_help_claim_ownership.sql",
  ].map(read));
  assert.match(api,/requirePartnerAdminMutation/);
  for(const operation of ["CREATE_DRAFT","LINK_EXISTING","REJECT"])assert.match(api,new RegExp(operation));
  assert.match(page,/requireAdminPageUser/);
  assert.match(page,/getPartnerHelpCreateAdmin/);
  assert.match(queue,/admin\/partners\/help-submissions\/\$\{item.id\}/);
  assert.match(actions,/editedPayload/);
  assert.match(actions,/specs\[resourceType\]/);
  assert.match(fields,/ADOPTION_DOG/);
  assert.match(domain,/normalizePartnerHelpCreate\(original.resourceType,raw\)/);
  assert.match(domain,/assertIndependentOwnershipApprover/);
  assert.match(domain,/duplicateGuard/);
  assert.match(domain,/transitionGuard/);
  assert.match(domain,/partner_help_claims/);
  assert.match(domain,/NEW_PROFILE_LINKED_EXISTING/);
  assert.match(domain,/NEW_PROFILE_REJECTED/);
  assert.match(domain,/subject_id=CAST/);
  assert.match(domain,/partner_notification_outbox/);
  assert.match(transition,/applyAtomicModerationTransition/);
  assert.match(migration,/CREATE UNIQUE INDEX `partner_help_claims_adoption_manager`/);
  assert.doesNotMatch(domain,/UPDATE adoption_dogs SET status='ACTIVE'/);
  assert.doesNotMatch(domain,/UPDATE lost_found_dog_reports SET status='ACTIVE'/);
});
test("Admin adjusted payload rejects mass assignment and HTML before canonical insert",()=>{
  assert.throws(()=>source.normalizePartnerHelpCreate("HELP_CASE",{...examples.HELP_CASE,status:"published"}),/nie je možné nastaviť/);
  assert.throws(()=>source.normalizePartnerHelpCreate("HELP_CASE",{...examples.HELP_CASE,description:"<script>alert(1)</script>"}),/HTML/);
  assert.throws(()=>source.normalizePartnerHelpCreate("ADOPTION_DOG",{...examples.ADOPTION_DOG,approximateAgeMonths:-1}),/Vek/);
});
