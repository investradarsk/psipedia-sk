import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import test from "node:test";

const read = path => readFile(new URL("../" + path, import.meta.url),"utf8");
const idx=await import(pathToFileURL(new URL("../lib/partner-help-search-index.ts",import.meta.url).pathname).href);
const reconcile=await import(pathToFileURL(new URL("../lib/notion-profile-field-reconciliation.ts",import.meta.url).pathname).href);

function helpSql(){
  const db=new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE adoption_dogs(id INTEGER PRIMARY KEY,name TEXT,breed_name TEXT,organization_name TEXT,
      city TEXT,region TEXT,description TEXT,color TEXT,contact_phone TEXT,search_text TEXT,updated_at TEXT);
    INSERT INTO adoption_dogs VALUES(1,'Bela','Labrador','Útulok','Nitra','Nitriansky','Hľadá domov','čierna',
      '111','bela labrador útulok nitra nitriansky hľadá domov čierna','2026-11-19T00:00:00.000Z');
    CREATE TABLE lost_found_dog_reports(id INTEGER PRIMARY KEY,dog_name TEXT,breed TEXT,color TEXT,city TEXT,
      region TEXT,description TEXT,short_description TEXT,public_phone TEXT,search_text TEXT,updated_at TEXT);
    INSERT INTO lost_found_dog_reports VALUES(2,'Neo','Labrador','čierna','Nitra','Nitriansky','Pes','Stratil sa',
      '222','neo labrador čierna nitra nitriansky pes stratil sa','2026-11-19T00:00:00.000Z');
  `);
  return db;
}
test("contact-only approved Help update binds exact parameters and preserves every unrelated public field",()=>{
  const db=helpSql();
  try{
    const assignment=idx.helpSearchIndexAssignment("ADOPTION_DOG",{contact_phone:"999"});
    assert.equal(assignment.sql,"");assert.deepEqual(assignment.bindings,[]);
    const old=db.prepare("SELECT * FROM adoption_dogs WHERE id=1").get();
    const sql=`UPDATE adoption_dogs SET contact_phone=?,${assignment.sql?assignment.sql+",":""}updated_at=? WHERE id=?`;
    db.prepare(sql).run("999","2026-11-19T01:00:00.000Z",1,...assignment.bindings);
    const current=db.prepare("SELECT * FROM adoption_dogs WHERE id=1").get();
    for(const [key,value] of Object.entries(old)){
      if(["contact_phone","updated_at"].includes(key))continue;
      assert.equal(current[key],value,key+" must survive partial save");
    }
    assert.equal(current.contact_phone,"999");
  }finally{db.close();}
});
test("searchable Help edit binds exactly one value per index column and preserves untargeted content",()=>{
  const db=helpSql();
  try{
    const assignment=idx.helpSearchIndexAssignment("ADOPTION_DOG",{city:"Trnava"});
    assert.match(assignment.sql,/search_text=lower/);
    assert.equal(assignment.bindings.length,7);
    assert.equal(assignment.bindings.filter(v=>v!==null).length,1);
    db.prepare(`UPDATE adoption_dogs SET city=?,${assignment.sql},updated_at=? WHERE id=?`)
      .run("Trnava",...assignment.bindings,"2026-11-19T01:00:00.000Z",1);
    const row=db.prepare("SELECT name,description,city,search_text FROM adoption_dogs WHERE id=1").get();
    assert.equal(row.name,"Bela");assert.equal(row.description,"Hľadá domov");
    assert.equal(row.city,"Trnava");assert.ok(row.search_text.includes("trnava"));
    assert.ok(row.search_text.includes("bela"));
    const lost=idx.helpSearchIndexAssignment("LOST_FOUND_DOG",{public_phone:"333"});
    assert.equal(lost.sql,"");
    assert.equal(lost.bindings.length,0);
    const caseIndex=idx.helpSearchIndexAssignment("HELP_CASE",{title:"Zbierka"});
    assert.equal(caseIndex.sql,"");assert.deepEqual(caseIndex.bindings,[]);
  }finally{db.close();}
});
test("same-field Notion and D1 changes are never silently overwritten without a trusted field revision",()=>{
  const baseline={name:"Bela",city:"Nitra",publicPhone:"111"};
  const result=reconcile.reconcileProfileFields({
    baseline,
    notion:{name:"Bela z Notionu",city:"Nitra",publicPhone:"111"},
    psipedia:{name:"Bela z D1",city:"Nitra",publicPhone:"111"},
    protectedFields:new Set(),
  });
  assert.equal(result.kind,"CONFLICT");
  assert.ok(result.conflicts.some(x=>x.field==="name"));
});
test("step8 keeps prepared migrations manual and guards all approved owner canonical writes",async()=>{
  const [migrationDriver,profile,event,help,helpReview,migrations]=await Promise.all([
    "scripts/production-d1-migrate.mjs","lib/partner-direct-profile.ts",
    "lib/partner-direct-event.ts","lib/partner-help-editor.ts",
    "lib/partner-help-create-admin.ts","drizzle/0172_partner_help_claim_ownership.sql",
  ].map(read));
  assert.match(migrationDriver,/UNACTIVATED_PRODUCTION_TARGETS/);
  assert.match(migrationDriver,/0171_partner_single_manager.sql/);
  assert.match(migrationDriver,/0172_partner_help_claim_ownership.sql/);
  assert.match(profile,/role='OWNER'/);
  assert.match(event,/role='OWNER'/);
  assert.match(help,/c.status='APPROVED'/);
  assert.match(helpReview,/applyAtomicModerationTransition/);
  assert.match(helpReview,/status='APPROVED'/);
  assert.match(migrations,/CREATE UNIQUE INDEX `partner_help_claims_case_manager`/);
});

test("0171/0172 preflight remains strictly read-only and refuses silent ownership selection",async()=>{
  const [preflight,m171,m172]=await Promise.all([
    "scripts/partner-self-service-0171-0172-preflight.sql",
    "drizzle/0171_partner_single_manager.sql",
    "drizzle/0172_partner_help_claim_ownership.sql",
  ].map(read));
  const statements=preflight.split("\n")
    .filter(line=>!line.trim().startsWith("--")).join("\n");
  assert.match(statements,/PRAGMA foreign_key_check/i);
  assert.match(statements,/active_manager_duplicate/);
  assert.match(statements,/partner_help_claims/);
  assert.doesNotMatch(statements,/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i);
  assert.match(m171,/CREATE UNIQUE INDEX `partner_memberships_one_active_resource`/);
  assert.match(m171,/partner_memberships_only_owner_insert/);
  assert.match(m172,/CREATE UNIQUE INDEX `partner_help_claims_adoption_manager`/);
});

test("0170 SQL first public filters, secondary categories and contact clears are mirrored atomically",async()=>{
  const [direct,writer,overlay,preflight]=await Promise.all([
    "lib/partner-direct-profile.ts","lib/partner-profile-changes.ts",
    "lib/directory-sql-contacts.ts","scripts/partner-self-service-0171-0172-preflight.sql",
  ].map(read));
  assert.match(direct,/planDirectory0170FilterSqlMirror/);
  assert.match(direct,/planDirectory0170FactSqlMirror/);
  assert.match(direct,/planDirectorySecondaryCategorySqlMirror/);
  assert.match(direct,/const guard=plans\[0\]\[0\]/);
  assert.match(direct,/statements\.push\(database\.prepare\(guard\.sql\)/);
  assert.match(writer,/omitDirectorySqlContactAliases/);
  assert.match(writer,/readDirectorySqlBackedContacts/);
  assert.match(writer,/\["publicPhone", "public_phone"\]/);
  assert.match(writer,/String\(patch\[field\] \?\? ""\)/);
  assert.match(overlay,/empty string is an intentional clear/);
  assert.match(preflight,/PRAGMA table_info\(directory_profiles\)/);
  assert.match(preflight,/directory_profile_additional_categories/);
  assert.match(preflight,/directory_profile_filter_values/);
});
