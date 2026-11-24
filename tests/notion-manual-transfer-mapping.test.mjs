import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  assertManualMappingEligible, assertManualMappingsUnique, assertManualRemoteIdentity,
  readManualMappingDiagnostics, validManualPageId, manualMappingEditorHref, manualRemoteDiagnostic,
} from "../lib/notion-manual-transfer-mapping.ts";

const PAGE="01234567-89ab-cdef-0123-456789abcdef";
const OTHER="11111111-2222-3333-4444-555555555555";
const allowed=new Set(["breeds","directory:veterinari","events","eshops","organizations","adoptions","help-cases","lost-found"]);

function fixture(){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE managed_breeds(id INTEGER PRIMARY KEY,name TEXT,status TEXT);
    CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY,name TEXT,category TEXT,status TEXT);
    CREATE TABLE managed_events(id INTEGER PRIMARY KEY,title TEXT,status TEXT);
    CREATE TABLE managed_eshops(id INTEGER PRIMARY KEY,name TEXT,status TEXT);
    CREATE TABLE help_organizations(id INTEGER PRIMARY KEY,name TEXT,status TEXT);
    CREATE TABLE adoption_dogs(id INTEGER PRIMARY KEY,name TEXT,status TEXT);
    CREATE TABLE help_cases(id INTEGER PRIMARY KEY,title TEXT,category TEXT,status TEXT);
    CREATE TABLE lost_found_dog_reports(id INTEGER PRIMARY KEY,dog_name TEXT,status TEXT);
    CREATE TABLE breed_notion_workcopy_links(breed_id INTEGER,work_notion_page_id TEXT,status TEXT,work_sync_receipt TEXT);
    CREATE TABLE directory_notion_sync(directory_profile_id INTEGER,notion_page_id TEXT);
    CREATE TABLE event_notion_sync(event_id INTEGER,notion_page_id TEXT);
    CREATE TABLE eshop_notion_sync(eshop_id INTEGER,notion_page_id TEXT);
    CREATE TABLE notion_agenda_sync(agenda TEXT,entity_id INTEGER,notion_page_id TEXT);
    CREATE TABLE directory_profile_review_state(profile_id INTEGER,reviewed_at TEXT,unlock_pending INTEGER);
    CREATE TABLE partner_resources(id INTEGER,entity_type TEXT,directory_profile_id INTEGER,managed_event_id INTEGER,help_organization_id INTEGER);
    CREATE TABLE partner_memberships(resource_id INTEGER,revoked_at TEXT);
    CREATE TABLE admin_entity_reviews(entity_type TEXT,entity_id INTEGER);
    CREATE TABLE partner_help_claims(adoption_dog_id INTEGER,lost_found_report_id INTEGER,help_case_id INTEGER,status TEXT);
    CREATE TABLE admin_record_tombstones(kind TEXT,record_id INTEGER);
    INSERT INTO adoption_dogs VALUES(7,'Adoption','ACTIVE');
    INSERT INTO lost_found_dog_reports VALUES(7,'Lost','ACTIVE');
    INSERT INTO directory_profiles VALUES(8,'Directory','veterinari','published');
    INSERT INTO directory_profiles VALUES(9,'Archived','veterinari','archived');
    INSERT INTO directory_profiles VALUES(10,'Unmapped','veterinari','draft');
  `);
  const reads=[];
  const db={prepare(sql){
    assert.match(sql,/^(WITH|SELECT) /);
    reads.push(sql);
    const stmt=sqlite.prepare(sql);
    const bind=(...args)=>({
      all:async()=>({success:true,results:stmt.all(...args)}),
      first:async()=>stmt.get(...args)??null,
    });
    return { ...bind(),bind };
  }};
  return {sqlite,db,reads};
}

test("typed identities do not collide across help agendas but normalized page IDs do",async()=>{
  const {sqlite,db}=fixture();
  try{
    sqlite.prepare("INSERT INTO notion_agenda_sync VALUES (?,?,?)").run("adoptions",7,PAGE);
    sqlite.prepare("INSERT INTO notion_agenda_sync VALUES (?,?,?)").run("lost-found",7,OTHER);
    const link={scope:"adoptions",profile_id:7,notion_page_id:PAGE};
    await assertManualMappingsUnique(db,[link]);
    const first=await readManualMappingDiagnostics(db,{area:"help",profileId:7,offset:0},allowed);
    assert.equal(first.result.length,2);
    assert.ok(first.result.every(row=>row.diagnostic.issues.length===0));
    assert.deepEqual(first.result.map(row=>row.diagnostic.editorHref),["/admin/adopcie/7","/admin/stratene-najdene/7"]);
    sqlite.prepare("UPDATE notion_agenda_sync SET notion_page_id=? WHERE agenda='lost-found'").run(PAGE.replaceAll("-","").toUpperCase());
    await assert.rejects(assertManualMappingsUnique(db,[link]),/TRANSFER_DUPLICATE_NOTION_PAGE/);
    const second=await readManualMappingDiagnostics(db,{area:"help",profileId:7,offset:0},allowed);
    assert.ok(second.result.every(row=>row.diagnostic.issues.includes("PAGE_DUPLICATE")));
    assert.deepEqual(second.result[0].diagnostic.relatedMappings,[{kind:"adoptions",profileId:7},{kind:"lost-found",profileId:7}]);
    assert.ok(second.result[1].diagnostic.issues.includes("PAGE_ID_FORMAT_UNSUPPORTED"));
    assert.ok(second.result.every(row=>!JSON.stringify(row.diagnostic).includes(PAGE)));
    sqlite.prepare("INSERT INTO notion_agenda_sync VALUES (?,?,?)").run("adoptions",7,OTHER);
    await assert.rejects(assertManualMappingsUnique(db,[link]),/TRANSFER_PROFILE_AMBIGUOUS/);
  }finally{sqlite.close();}
});

test("missing, malformed, stale and locked mappings are distinguished without any writes",async()=>{
  const {sqlite,db}=fixture();
  try{
    sqlite.prepare("INSERT INTO directory_notion_sync VALUES (?,?)").run(8,PAGE);
    sqlite.prepare("INSERT INTO directory_notion_sync VALUES (?,?)").run(9,OTHER);
    sqlite.prepare("INSERT INTO directory_notion_sync VALUES (?,?)").run(99,"broken");
    sqlite.exec("INSERT INTO directory_profile_review_state VALUES(8,'2026-11-24',0); INSERT INTO partner_resources(id,entity_type,directory_profile_id) VALUES(1,'DIRECTORY_PROFILE',8); INSERT INTO partner_memberships VALUES(1,NULL);");
    const report=await readManualMappingDiagnostics(db,{area:"directory",offset:0},allowed);
    const rows=new Map(report.result.map(row=>[row.diagnostic.profileId,row.diagnostic]));
    assert.deepEqual(rows.get(8).issues,["PROFILE_REVIEWED","PARTNER_MANAGED"]);
    assert.ok(rows.get(9).issues.includes("PROFILE_ARCHIVED"));
    assert.ok(rows.get(10).issues.includes("MAPPING_MISSING"));
    assert.ok(rows.get(99).issues.includes("CANONICAL_MISSING"));
    assert.ok(rows.get(99).issues.includes("PAGE_ID_INVALID"));
    assert.equal(rows.get(99).editorHref,null);
    await assert.rejects(assertManualMappingEligible(db,{scope:"directory:veterinari",profile_id:8,notion_page_id:PAGE}),/TRANSFER_PROFILE_LOCKED/);
    await assert.rejects(assertManualMappingEligible(db,{scope:"directory:veterinari",profile_id:9,notion_page_id:OTHER}),/TRANSFER_PROFILE_ARCHIVED/);
    await assert.rejects(assertManualMappingEligible(db,{scope:"directory:veterinari",profile_id:99,notion_page_id:OTHER}),/TRANSFER_CANONICAL_MISSING/);
    sqlite.exec("INSERT INTO managed_breeds VALUES(1,'Breed','published');");
    sqlite.prepare("INSERT INTO breed_notion_workcopy_links VALUES(?,?,?,?)").run(1,PAGE,"SHADOW",null);
    const breed=await readManualMappingDiagnostics(db,{area:"breeds",offset:0},allowed);
    assert.deepEqual(breed.result[0].diagnostic.issues,["MAPPING_INACTIVE"]);
    sqlite.exec("INSERT INTO help_cases VALUES(7,'Legacy adoption','adopcia','published');");
    sqlite.prepare("INSERT INTO notion_agenda_sync VALUES (?,?,?)").run("help-cases",7,OTHER);
    const legacy=await readManualMappingDiagnostics(db,{area:"help",scope:"help-cases",profileId:7,offset:0},allowed);
    assert.ok(legacy.result[0].diagnostic.issues.includes("CATEGORY_UNSUPPORTED"));
    assert.equal(legacy.result[0].diagnostic.editorHref,null);
    assert.equal(legacy.result[0].diagnostic.category,"adopcia");
  }finally{sqlite.close();}
});

test("remote identity requires exact typed ID, correct data source and active page",()=>{
  const base={page:{id:PAGE},pageId:PAGE,belongsToSource:true,claimedId:"7",profileId:7};
  assert.doesNotThrow(()=>assertManualRemoteIdentity(base));
  assert.throws(()=>assertManualRemoteIdentity({...base,claimedId:"8"}),/TRANSFER_REMOTE_IDENTITY_MISMATCH/);
  assert.throws(()=>assertManualRemoteIdentity({...base,belongsToSource:false}),/TRANSFER_REMOTE_SOURCE_MISMATCH/);
  assert.throws(()=>assertManualRemoteIdentity({...base,page:{id:PAGE,in_trash:true}}),/TRANSFER_REMOTE_PAGE_ARCHIVED/);
  assert.equal(manualRemoteDiagnostic(new Error("Notion API 404: object_not_found")),"PAGE_INACCESSIBLE");
  assert.equal(manualRemoteDiagnostic(new Error("Notion API 429: rate_limited")),"UNAVAILABLE");
  assert.equal(validManualPageId("breeds",PAGE.replaceAll("-","")),true);
  assert.equal(validManualPageId("events",PAGE.replaceAll("-","")),false);
  assert.equal(manualMappingEditorHref("unknown",7),null);
  assert.equal(manualMappingEditorHref("adoptions","7"),null);
});

test("review and partner locks in Help/Events reuse typed agenda ownership",async()=>{
  const {sqlite,db}=fixture();
  try{
    sqlite.prepare("INSERT INTO notion_agenda_sync VALUES (?,?,?)").run("adoptions",7,PAGE);
    sqlite.prepare("INSERT INTO notion_agenda_sync VALUES (?,?,?)").run("lost-found",7,OTHER);
    sqlite.exec("INSERT INTO admin_entity_reviews VALUES('ADOPTION',7); INSERT INTO partner_help_claims(adoption_dog_id,status) VALUES(7,'APPROVED');");
    const report=await readManualMappingDiagnostics(db,{area:"help",profileId:7,offset:0},allowed);
    assert.deepEqual(report.result[0].diagnostic.issues,["PROFILE_REVIEWED","PARTNER_MANAGED"]);
    assert.deepEqual(report.result[1].diagnostic.issues,[]);
    await assert.rejects(assertManualMappingEligible(db,{scope:"adoptions",profile_id:7,notion_page_id:PAGE}),/TRANSFER_PROFILE_LOCKED/);
    await assertManualMappingEligible(db,{scope:"lost-found",profile_id:7,notion_page_id:OTHER});
    sqlite.exec("INSERT INTO managed_events VALUES(7,'Event','published'); INSERT INTO partner_resources(id,entity_type,managed_event_id) VALUES(2,'MANAGED_EVENT',7); INSERT INTO partner_memberships VALUES(2,NULL);");
    const events=await readManualMappingDiagnostics(db,{area:"events",profileId:7,offset:0},allowed);
    assert.ok(events.result[0].diagnostic.issues.includes("PARTNER_MANAGED"));
    assert.ok(events.result[0].diagnostic.issues.includes("MAPPING_MISSING"));
  }finally{sqlite.close();}
});
