import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { getPartnerHelpClaimAdmin, decidePartnerHelpClaimAdmin } from "../lib/partner-help-claims.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function fixture(){
  const sql=new DatabaseSync(":memory:");
  sql.exec([
    "PRAGMA foreign_keys=ON;",
    "CREATE TABLE partner_accounts(id TEXT PRIMARY KEY, status TEXT, email_ciphertext TEXT);",
    "CREATE TABLE adoption_dogs(id INTEGER PRIMARY KEY, name TEXT, slug TEXT, city TEXT, status TEXT);",
    "CREATE TABLE lost_found_dog_reports(id INTEGER PRIMARY KEY, dog_name TEXT, breed TEXT, slug TEXT, city TEXT, type TEXT, status TEXT, source TEXT, published_at TEXT, expires_at TEXT);",
    "CREATE TABLE help_cases(id INTEGER PRIMARY KEY, title TEXT, slug TEXT, city TEXT, category TEXT, status TEXT);",
    "CREATE TABLE partner_audit_events(id TEXT PRIMARY KEY,target_type TEXT,target_id TEXT,action TEXT,actor_ref TEXT,created_at TEXT);",
    "INSERT INTO partner_accounts VALUES('reporter','ACTIVE','encrypted-placeholder');",
    "INSERT INTO lost_found_dog_reports VALUES(21,'Mia','','mia','Oravská Polhora','LOST','ACTIVE','Používateľské hlásenie','2026-11-23T00:00:00Z',NULL);",
    "INSERT INTO lost_found_dog_reports VALUES(22,'Bady','','bady','Nitra','FOUND','ACTIVE','EDITORIAL','2026-11-23T00:00:00Z',NULL);",
  ].join("\n"));
  sql.exec(read("drizzle/0172_partner_help_claim_ownership.sql"));
  const insert=sql.prepare("INSERT INTO partner_help_claims(id,account_id,entity_type,lost_found_report_id,status,created_at,updated_at) VALUES(?,?,'LOST_FOUND_DOG',?,'PENDING','2026-11-23T00:00:00Z','2026-11-23T00:00:00Z')");
  insert.run("help-claim-mia","reporter",21);
  insert.run("help-claim-bady","reporter",22);
  const db={
    prepare(query){return {
      bind(...params){return {
        async first(){return sql.prepare(query).get(...params)??null;},
        async all(){return {results:sql.prepare(query).all(...params)};},
        async run(){const result=sql.prepare(query).run(...params);return {meta:{changes:result.changes}};},
      }},
    }},
  };
  return {sql,db};
}

test("legacy public dog report is flagged only in its admin claim; no private contact leaks",async()=>{
  const {sql,db}=fixture();
  try{
    const mia=await getPartnerHelpClaimAdmin("help-claim-mia",db);
    assert.ok(mia);
    assert.equal(mia.requiresReporterVerification,true);
    assert.equal(mia.canonicalId,21);
    assert.equal(mia.accountId,"reporter");
    assert.equal(mia.publicHref,"/pomoc-psom/stratene-psy/mia");
    assert.equal("contactEmail" in mia,false);
    assert.equal("contactPhone" in mia,false);
    const editorial=await getPartnerHelpClaimAdmin("help-claim-bady",db);
    assert.equal(editorial?.requiresReporterVerification,false);
    assert.equal(editorial?.canonicalId,22);
  }finally{sql.close();}
});

test("Admin cannot approve a historic anonymous report without verified reporter identity",async()=>{
  const {sql,db}=fixture();
  try{
    for(const flag of [undefined,false,"true"]){
      await assert.rejects(
        decidePartnerHelpClaimAdmin({
          id:"help-claim-mia",action:"APPROVE",adminEmail:"moderator@example.invalid",
          database:db,reporterIdentityVerified:flag,
        }),
        error=>error.status===422&&/overte pôvodného oznamovateľa/.test(error.message),
      );
      assert.equal(sql.prepare("SELECT status FROM partner_help_claims WHERE id='help-claim-mia'").get().status,"PENDING");
    }
  }finally{sql.close();}
});

test("approval of a new canonical profile grants OWNER atomically, without creating a second profile",()=>{
  const src=read("lib/partner-canonical-workflow.ts");
  const owners=src.slice(src.indexOf("function ownerStatements("),src.indexOf("function approveMetadata("));
  const decision=src.slice(src.indexOf("export async function decidePartnerCanonicalDraftAdmin("));
  for(const type of ["DIRECTORY_PROFILE","HELP_ORGANIZATION","MANAGED_EVENT","ADOPTION_DOG","LOST_FOUND_DOG","HELP_CASE"])
    assert.ok(src.includes(type),type);
  assert.match(owners,/INSERT INTO partner_memberships/);
  assert.match(owners,/INSERT INTO partner_help_claims/);
  assert.match(owners,/row.accountId/);
  assert.match(owners,/row.canonicalId/);
  assert.match(decision,/extras.push\(publication\(db,row,nowIso,actorRef,revision.updatedAt\),guard\(db\),[\s\S]*?ownerStatements\(db,row,nowIso,actorRef\)/);
  assert.match(decision,/applyAtomicModerationTransition\(db,/);
  const migration=read("drizzle/0172_partner_help_claim_ownership.sql");
  assert.match(migration,/partner_help_claims_report_manager/);
  assert.match(migration,/WHERE .*status.*APPROVED/);
});

test("public report has an exact takeover link and existing owner returns to editor",()=>{
  const page=read("components/lost-found-dog-detail.tsx");
  const claim=read("app/partner/prevziat-profil/[type]/[id]/page.tsx");
  const form=read("components/partner-claim-form.tsx");
  assert.match(page,/partner\/prevziat-profil\/LOST_FOUND_DOG/);
  assert.match(page,/report.id/);
  assert.match(claim,/getPartnerHelpMembership\(identity.accountId,resourceId\)/);
  assert.match(claim,/if \(owned\) redirect/);
  assert.match(form,/Aký je váš vzťah k tomuto hláseniu a ako vás môžeme overiť/);
  assert.match(form,/Nepíšte sem heslá ani doklady/);
});

test("Admin review links to original contact, private chat and explicit approval",()=>{
  const page=read("app/admin/partners/claims/[id]/page.tsx");
  const actions=read("components/admin-partner-claim-actions.tsx");
  const api=read("app/api/admin/partners/claims/[id]/route.ts");
  const admin=read("lib/partner-help-claims.ts");
  assert.match(page,/admin\/stratene-najdene/);
  assert.match(page,/tab=spravy/);
  assert.match(page,/Overenie pôvodného oznamovateľa/);
  assert.match(page,/requiresReporterVerification=\{requiresReporterVerification\}/);
  assert.match(actions,/type="checkbox" checked=\{reporterIdentityVerified\}/);
  assert.match(actions,/requiresReporterVerification && !reporterIdentityVerified/);
  assert.match(api,/reporterIdentityVerified: body.reporterIdentityVerified/);
  assert.match(admin,/input.reporterIdentityVerified!==true/);
  assert.match(admin,/reporterIdentityVerified:true/);
  assert.doesNotMatch(page,/contact_name_encrypted|contact_email_encrypted|contact_phone_encrypted/);
});
