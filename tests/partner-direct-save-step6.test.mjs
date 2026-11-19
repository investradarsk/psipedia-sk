import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import test from "node:test";

const read = path => readFile(new URL("../"+path,import.meta.url),"utf8");
const mod = await import(pathToFileURL(new URL("../lib/partner-profile-changes.ts",import.meta.url).pathname).href);
const sync = await import(pathToFileURL(new URL("../lib/notion-profile-field-reconciliation.ts",import.meta.url).pathname).href);
const { buildDirectoryApplyStatement,buildHelpApplyStatements }=mod;
function fixture() {
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE partner_accounts (id TEXT PRIMARY KEY,status TEXT NOT NULL);
    CREATE TABLE partner_resources(id TEXT PRIMARY KEY,entity_type TEXT NOT NULL,directory_profile_id INTEGER,help_organization_id INTEGER);
    CREATE TABLE partner_memberships(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,resource_id TEXT NOT NULL,role TEXT NOT NULL,revoked_at TEXT);
    CREATE TABLE media_assets(id TEXT PRIMARY KEY,owner_id TEXT,owner_type TEXT,state TEXT,deleted_at TEXT);
    CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY,name TEXT,excerpt TEXT,description TEXT,services_json TEXT,
      qualifications_json TEXT,city TEXT,district TEXT,region TEXT,address TEXT,price_note TEXT,website_url TEXT,
      search_text TEXT,source_data_json TEXT,updated_at TEXT,updated_by TEXT);
    CREATE TABLE help_organizations(id INTEGER PRIMARY KEY,name TEXT,description TEXT,short_description TEXT,city TEXT,
      updated_at TEXT,updated_by TEXT);
    CREATE TABLE organization_locations(id INTEGER PRIMARY KEY,organization_id INTEGER,address TEXT,city TEXT,
      district TEXT,region TEXT,country_code TEXT);
    INSERT INTO partner_accounts VALUES ('a1','ACTIVE'),('a2','ACTIVE');
    INSERT INTO partner_resources VALUES ('directory-1','DIRECTORY_PROFILE',1,NULL),
      ('organization-1','HELP_ORGANIZATION',NULL,2);
    INSERT INTO partner_memberships VALUES ('d','a1','directory-1','OWNER',NULL),('o','a1','organization-1','OWNER',NULL);
    INSERT INTO directory_profiles VALUES
      (1,'Original','Existing excerpt','Existing body','[]','[]','Nitra','Nitra','Nitriansky kraj','1 Main','Price','','','','2026-11-19T10:00:00.000Z','admin');
    INSERT INTO help_organizations VALUES (2,'Útulok','Original body','Original excerpt','Nitra','2026-11-19T10:00:00.000Z','admin');
    INSERT INTO organization_locations VALUES(8,2,'1 Main','Nitra','Nitra','Nitriansky kraj','SK');
  `);
  const database={
    prepare(query){
      return {bind(...values){return {
        run:async()=>{
          if(/\bRETURNING\b/i.test(query)){
            const rows=sqlite.prepare(query).all(...values);
            return {results:rows,meta:{changes:rows.length}};
          }
          const change=sqlite.prepare(query).run(...values);
          return {meta:{changes:change.changes}};
        },
      }}};
    },
  };
  return {sqlite,database};
}
const revision="2026-11-19T10:00:00.000Z";
const now="2026-11-19T11:00:00.000Z";
function canonicalDirectory() {
  return {
    entityType:"DIRECTORY_PROFILE",canonicalId:1,directoryCategory:"veterinari",
    sourceDataJson:"{}",updatedAt:revision,values:{
      name:"Original",excerpt:"Existing excerpt",description:"Existing body",services:[],qualifications:[],
      city:"Nitra",district:"Nitra",region:"Nitriansky kraj",address:"1 Main",priceNote:"Price",
    },
  };
}
function canonicalOrg() {
  return {entityType:"HELP_ORGANIZATION",canonicalId:2,locationId:8,
    sourceDataJson:"{}",updatedAt:revision,values:{name:"Útulok",city:"Nitra",address:"1 Main",
      district:"Nitra",region:"Nitriansky kraj",countryCode:"SK"}};
}
test("Partner directory canonical UPDATE is owner-scoped, optimistic and field-only",async()=>{
  const {sqlite,database}=fixture();
  try{
    const guard={resourceId:"directory-1",accountId:"a1",baseUpdatedAt:revision};
    const apply=async()=>buildDirectoryApplyStatement(database,canonicalDirectory(),{name:"Nový názov"},
      "partner:a1",now,undefined,guard).run();
    assert.equal((await apply()).meta.changes,1);
    const row=sqlite.prepare("SELECT name,excerpt,description,updated_at FROM directory_profiles WHERE id=1").get();
    assert.deepEqual({...row},{name:"Nový názov",excerpt:"Existing excerpt",description:"Existing body",updated_at:now});
    assert.equal((await apply()).meta.changes,0,"stale version cannot overwrite a later canonical save");
    sqlite.exec("UPDATE partner_memberships SET revoked_at='2026-11-19T12:00:00Z' WHERE id='d'");
    const refreshed={...guard,baseUpdatedAt:now};
    assert.equal((await buildDirectoryApplyStatement(database,canonicalDirectory(),{name:"Revoked"},
      "partner:a1","2026-11-19T12:00:01.000Z",undefined,refreshed).run()).meta.changes,0);
    assert.equal(sqlite.prepare("SELECT name FROM directory_profiles WHERE id=1").get().name,"Nový názov");
  }finally{sqlite.close();}
});
test("Partner organization canonical and location writes require owner and correct revision",async()=>{
  const {sqlite,database}=fixture();
  try{
    const guard={resourceId:"organization-1",accountId:"a1",baseUpdatedAt:revision};
    const statements=buildHelpApplyStatements(database,canonicalOrg(),{city:"Trnava"},"partner:a1",now,undefined,guard);
    const result=await Promise.all(statements.map(statement=>statement.run()));
    assert.deepEqual(result.map(item=>item.meta.changes),[1,1]);
    assert.equal(sqlite.prepare("SELECT city FROM help_organizations WHERE id=2").get().city,"Trnava");
    assert.equal(sqlite.prepare("SELECT city FROM organization_locations WHERE id=8").get().city,"Trnava");
    const revoked={...guard,accountId:"a2",baseUpdatedAt:now};
    const denied=await buildHelpApplyStatements(database,canonicalOrg(),{name:"Not yours"},
      "partner:a2","2026-11-19T12:00:00.000Z",undefined,revoked)[0].run();
    assert.equal(denied.meta.changes,0);
    assert.equal(sqlite.prepare("SELECT name FROM help_organizations WHERE id=2").get().name,"Útulok");
  }finally{sqlite.close();}
});
test("Media race is guarded inside canonical directory and organization statements",async()=>{
  const {sqlite,database}=fixture();
  try{
    const guard={resourceId:"directory-1",accountId:"a1",baseUpdatedAt:revision,mediaIds:["asset-1"]};
    const save=()=>buildDirectoryApplyStatement(database,canonicalDirectory(),{},"partner:a1",now,undefined,guard).run();
    assert.equal((await save()).meta.changes,0,"missing media blocks canonical write");
    sqlite.exec("INSERT INTO media_assets VALUES ('asset-1','a1','PARTNER_PROFILE_UPDATE','PENDING',NULL)");
    assert.equal((await save()).meta.changes,1);
  }finally{sqlite.close();}
});
test("Step 6 direct routes use active account, same-origin JSON and preserve legacy pending moderation",async()=>{
  const paths=[
    "app/api/partner/direct-profiles/[resourceId]/route.ts",
    "app/api/partner/direct-events/[resourceId]/route.ts",
  ];
  for(const path of paths){
    const source=await read(path);
    assert.match(source,/requirePartnerAccount/);
    assert.match(source,/assertPartnerJsonMutation/);
    assert.match(source,/onboardingComplete/);
    assert.match(source,/Cache-Control/);
  }
  const [profile,event,form,eventForm,oldProfile,oldEvent]=await Promise.all([
    "lib/partner-direct-profile.ts","lib/partner-direct-event.ts",
    "components/partner-profile-edit-form.tsx","components/partner-event-form.tsx",
    "lib/partner-profile-changes-admin.ts","lib/partner-events-admin.ts",
  ].map(read));
  for(const source of [profile,event]){
    assert.match(source,/updated_at/);
    assert.match(source,/role='OWNER'/);
    assert.match(source,/state='PENDING'/);
    assert.match(source,/partner_audit_events/);
    assert.match(source,/DIRECT_PUBLIC_SAVE/);
    assert.match(source,/publishSafeImage/);
    assert.match(source,/invalidateVersionedPublicHtmlCacheUrl/);
    assert.doesNotMatch(source,/INSERT INTO (directory_profiles|help_organizations|managed_events)/);
  }
  assert.match(form,/\/api\/partner\/direct-profiles/);
  assert.match(eventForm,/\/api\/partner\/direct-events/);
  assert.match(oldProfile,/approvePartnerProfileChangeAdmin/);
  assert.match(oldEvent,/approvePartnerEventUpdateAdmin/);
  assert.match(event,/inbound_lock_reason='PARTNER_DIRECT_EDIT'/);
});
test("Same-field cross-system edits remain conflicts without proof of field timestamps",()=>{
  const result=sync.reconcileProfileFields({
    baseline:{name:"Before",city:"Nitra"},
    notion:{name:"New in Notion",city:"Nitra"},
    psipedia:{name:"New in D1",city:"Nitra"},
    protectedFields:new Set(),
  });
  assert.equal(result.kind,"CONFLICT");
  assert.ok(result.conflicts.some(item=>item.field==="name"));
  const nonoverlapping=sync.reconcileProfileFields({
    baseline:{name:"Before",city:"Nitra"},
    notion:{name:"Before",city:"Trnava"},
    psipedia:{name:"Changed in D1",city:"Nitra"},
    protectedFields:new Set(),
  });
  assert.equal(nonoverlapping.kind,"MERGE");
  assert.deepEqual(nonoverlapping.merged,{name:"Changed in D1",city:"Trnava"});
});
