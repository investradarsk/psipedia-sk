import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import test from "node:test";

const read = (path) => readFile(new URL("../"+path,import.meta.url),"utf8");
const migration=await read("drizzle/0172_partner_help_claim_ownership.sql");
const helper=await import(pathToFileURL(new URL("../lib/partner-help-claims.ts",import.meta.url).pathname).href);

function fixture(){
  const sql = new DatabaseSync(":memory:");
  sql.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE partner_accounts(id TEXT PRIMARY KEY,status TEXT);
    CREATE TABLE adoption_dogs(id INTEGER PRIMARY KEY,name TEXT,slug TEXT,city TEXT,status TEXT);
    CREATE TABLE lost_found_dog_reports(id INTEGER PRIMARY KEY,dog_name TEXT,breed TEXT,slug TEXT,city TEXT,type TEXT,status TEXT,published_at TEXT,expires_at TEXT);
    CREATE TABLE help_cases(id INTEGER PRIMARY KEY,title TEXT,slug TEXT,category TEXT,city TEXT,status TEXT,resolved INTEGER);
    INSERT INTO partner_accounts VALUES('a1','ACTIVE'),('a2','ACTIVE'),('off','SUSPENDED');
    INSERT INTO adoption_dogs VALUES(1,'Bela','bela','Nitra','ACTIVE'),(2,'Skrytý pes','skryty','Nitra','DRAFT');
    INSERT INTO lost_found_dog_reports VALUES(3,'Rexo','','rexo','Trnava','LOST','ACTIVE','2026-01-01',NULL),
      (4,'Skrytý','','skryty','Nitra','FOUND','DRAFT',NULL,NULL);
    INSERT INTO help_cases VALUES(5,'Zbierka','zbierka','zbierky','Nitra','published',0),
      (6,'Ukončená zbierka','koniec','zbierky','Nitra','published',1);
  `);
  sql.exec(migration);
  const adapter = {
    prepare(query) {
      return {
        bind(...params) {
          return {
            first: async () => sql.prepare(query).get(...params) ?? null,
            all: async () => ({ results: sql.prepare(query).all(...params) }),
            run: async () => ({ meta: { changes: sql.prepare(query).run(...params).changes } }),
          };
        },
      };
    },
  };
  const claim=(id, account, type, canonicalId, status, when="2026-11-19T08:00:00Z")=>{
    const column={ADOPTION_DOG:"adoption_dog_id",LOST_FOUND_DOG:"lost_found_report_id",HELP_CASE:"help_case_id"}[type];
    return sql.prepare(`INSERT INTO partner_help_claims(id,account_id,entity_type,${column},status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`)
      .run(id,account,type,canonicalId,status,when,when);
  };
  return{sql,adapter,claim};
}
test("Help ownership migration keeps typed canonical foreign keys and exactly one approved manager",()=>{
  const {sql,claim}=fixture();
  try{
    claim("one","a1","ADOPTION_DOG",1,"APPROVED");
    claim("pending","a2","ADOPTION_DOG",1,"PENDING");
    assert.throws(()=>claim("two","a2","ADOPTION_DOG",1,"APPROVED"),/UNIQUE constraint failed/);
    assert.throws(()=>claim("pending2","a2","ADOPTION_DOG",1,"PENDING"),/UNIQUE constraint failed/);
    assert.throws(()=>claim("wrongFk","a1","HELP_CASE",777,"PENDING"),/FOREIGN KEY constraint failed/);
    assert.throws(()=>sql.prepare("INSERT INTO partner_help_claims(id,account_id,entity_type,adoption_dog_id,lost_found_report_id,status,created_at,updated_at) VALUES('bad','a1','ADOPTION_DOG',1,3,'PENDING','now','now')").run(),/CHECK constraint failed/);
    claim("case","a1","HELP_CASE",5,"APPROVED");
    claim("lost","a1","LOST_FOUND_DOG",3,"APPROVED");
    assert.equal(sql.prepare("SELECT COUNT(*) n FROM partner_help_claims WHERE account_id='a1' AND status='APPROVED'").get().n,3);
    sql.prepare("UPDATE partner_help_claims SET status='REVOKED',revoked_at='2026-11-19T09:00:00Z' WHERE id='one'").run();
    claim("newOwner","a2","ADOPTION_DOG",1,"APPROVED");
    assert.equal(sql.prepare("SELECT COUNT(*) n FROM partner_help_claims WHERE adoption_dog_id=1").get().n,3);
    assert.deepEqual(sql.prepare("PRAGMA foreign_key_check").all(),[]);
  }finally{sql.close();}
});
test("All three types have public-only claim previews, safe search and correct canonical URLs",async()=>{
  const {sql,adapter}=fixture();
  try{
    assert.equal((await helper.getPartnerHelpPreview("ADOPTION_DOG",1,adapter)).publicHref,"/pomoc-psom/adopcia/bela");
    assert.equal((await helper.getPartnerHelpPreview("LOST_FOUND_DOG",3,adapter)).publicHref,"/pomoc-psom/stratene-psy/rexo");
    assert.equal((await helper.getPartnerHelpPreview("HELP_CASE",5,adapter)).publicHref,"/pomoc-psom/zbierky/zbierka");
    assert.equal(await helper.getPartnerHelpPreview("ADOPTION_DOG",2,adapter),null);
    assert.equal(await helper.getPartnerHelpPreview("LOST_FOUND_DOG",4,adapter),null);
    assert.equal(await helper.getPartnerHelpPreview("HELP_CASE",6,adapter),null);
    assert.equal((await helper.searchPartnerHelpRecords("ADOPTION_DOG","Bela",adapter))[0].canonicalId,1);
    assert.equal((await helper.searchPartnerHelpRecords("LOST_FOUND_DOG","Rexo",adapter))[0].claimHref,"/partner/prevziat-profil/LOST_FOUND_DOG/3");
    assert.equal((await helper.searchPartnerHelpRecords("HELP_CASE","Zbierka",adapter))[0].canonicalId,5);
    assert.deepEqual(await helper.searchPartnerHelpRecords("HELP_CASE","%_",adapter),[]);
    assert.deepEqual(await helper.searchPartnerHelpRecords("HELP_CASE","x",adapter),[]);
  }finally{sql.close();}
});
test("Approved Help claims are scoped by active account and never grant unpublished editor permissions",async()=>{
  const {sql,adapter,claim}=fixture();
  try{
    claim("owned","a1","ADOPTION_DOG",1,"APPROVED");
    claim("other","a2","LOST_FOUND_DOG",3,"PENDING");
    claim("suspended","off","HELP_CASE",5,"APPROVED");
    const resourceId=helper.helpResourceId("ADOPTION_DOG",1);
    assert.equal((await helper.getPartnerHelpMembership("a1",resourceId,adapter))?.role,"OWNER");
    assert.equal(await helper.getPartnerHelpMembership("a2",resourceId,adapter),null);
    assert.equal(await helper.getPartnerHelpMembership("off",helper.helpResourceId("HELP_CASE",5),adapter),null);
    const managed=await helper.listPartnerApprovedHelpResources("a1",adapter);
    assert.deepEqual(managed.map(x=>x.entityType),["ADOPTION_DOG"]);
    assert.equal((await helper.listPartnerHelpClaims("a2",adapter))[0].status,"PENDING");
  }finally{sql.close();}
});
test("Step 3 is wired into existing claim approval and application without a duplicate canonical profile",async()=>{
  const sources=await Promise.all([
    "lib/partner-claims.ts","lib/partner-claims-admin.ts","lib/partner-platform.ts",
    "app/partner/prevziat/page.tsx","components/partner-claim-form.tsx",
    "app/admin/partners/claims/page.tsx","app/partner/profily/page.tsx",
    "app/api/admin/partners/claims/[id]/route.ts","scripts/production-d1-migrate.mjs",
  ].map(read));
  const [claims,admin,platform,search,form,adminPage,profiles,api,runner]=sources;
  for(const type of helper.partnerHelpTypes){
    assert.match(search,new RegExp(type));assert.match(form,new RegExp(type));assert.match(adminPage,new RegExp(type));
  }
  assert.match(claims,/createPartnerHelpClaim/);assert.match(claims,/cancelPartnerHelpClaim/);
  assert.match(admin,/decidePartnerHelpClaimAdmin/);assert.match(admin,/revokePartnerHelpClaimAdmin/);
  assert.match(platform,/getPartnerHelpMembership/);assert.match(platform,/listPartnerApprovedHelpResources/);
  assert.match(platform,/parseHelpResourceId\(resourceId\).*HELP_EDIT_PUBLIC/s);
  assert.match(profiles,/\/partner\/pomoc\//);
  assert.match(api,/body.action === "REVOKE"/);
  assert.match(runner,/0172_partner_help_claim_ownership.sql/);
});
