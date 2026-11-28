import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = (path) => readFileSync(root + path, "utf8");
const core = source("lib/admin-record-lifecycle.ts");
const route = source("app/api/admin/record-lifecycle/[kind]/[id]/route.ts");
const dialog = source("components/admin-record-lifecycle-actions.tsx");
const migration = source("drizzle/0164_admin_record_lifecycle.sql");

test("status-only operation cannot serialize editor payload, and records a Notion retry guard", () => {
  const body = core.split("export async function unpublishRecord(")[1]?.split("/** Called only AFTER")[0];
  assert.ok(body, "unpublish function must exist");
  assert.match(body, /SET status=\?,updated_at=\? WHERE id=\?/);
  assert.match(body, /db\.batch\(\[guard,update\]\)/);
  assert.match(body, /hideResult\.meta\?\.changes/);
  assert.match(body, /RECORD_HIDE_NOT_CONFIRMED/);
  assert.match(body, /await mirrorDraft\(db,bindings,kind,id,targets\)/);
  assert.doesNotMatch(body, /JSON\.stringify\(row\)|updateManaged|save\("draft"\)|\.imageKey\s*=/);
});

test("deletion never proceeds without a verified Notion GET-in-trash or explicit local-only consent", () => {
  assert.match(core, /LOCAL_ONLY_CONFIRMATION_REQUIRED/);
  assert.match(core, /notionText\(page,"Psipedia ID"\)!==String\(id\)/);
  assert.match(core, /parent\?\.type!=="data_source_id"/);
  assert.match(core, /method:"PATCH",body:JSON\.stringify\(\{in_trash:true\}\)/);
  assert.match(core, /const confirmed=await requireOwnedNotionPage\(bindings,target,id,true\)/);
  assert.match(core, /confirmed\.in_trash!==true/);
  const verify = core.indexOf("for(const target of targets)await verifyTrash");
  const cleanup = core.indexOf("await completeLocalRemoval(db,kind,id,targets)");
  assert.ok(verify >= 0 && cleanup > verify, "remote Notion trash must precede D1 deletion");
});

test("failed remote delete stays hidden and durable, with retryable error exposed in Admin", () => {
  assert.match(core, /await db\.batch\(\[insert,hide\]\)/);
  assert.match(core, /state='ERROR_NOTION'/);
  assert.match(core, /state='READY_LOCAL'/);
  assert.match(dialog, /Zopakovať odstránenie/);
  assert.match(dialog, /value\.removalState/);
  assert.match(dialog, /confirmed:true/);
  assert.match(route, /body\.confirmed!==true/);
  assert.doesNotMatch(dialog, /confirmation!==|"VYMAZAŤ"|Druhé potvrdenie/);
  assert.match(route, /strictProvenance:true/);
  assert.match(route, /body\.confirmed!==true/);
  assert.match(route, /body\.localOnly===true/);
});

test("shared UI is present in all 8 editors; old direct DELETE endpoints are blocked", () => {
  const editors = [
    "directory","event","help","breed","article","adoption","lost-found","organization",
  ];
  for (const name of editors) {
    const content = source("components/admin-" + name + "-editor.tsx");
    assert.match(content, /AdminRecordLifecycleActions/, name + " must use shared component");
  }
  for (const kind of ["events","help","breeds","articles"]) {
    const file = source("app/api/admin/"+kind+"/[id]/route.ts");
    assert.match(file, /export async function DELETE/);
    assert.match(file, /record-lifecycle/);
    assert.match(file, /status:409/);
  }
});

test("tombstones block exact slug reinsertion and forbid direct hard-delete without READY_LOCAL", () => {
  assert.equal((migration.match(/BEFORE INSERT ON /g)||[]).length,8);
  assert.equal((migration.match(/BEFORE UPDATE OF status, slug ON /g)||[]).length,8);
  assert.equal((migration.match(/BEFORE DELETE ON /g)||[]).length,8);
  assert.match(migration, /USE_VERIFIED_LIFECYCLE_DELETE/);
  assert.match(core, /triggerNames=recordKinds\.filter[\s\S]*?\.flatMap/);
});

test("image files are deleted only after D1 deletion and a separate reference check", () => {
  assert.match(core, /keyStillReferenced\(db,key\)/);
  assert.match(core, /await bucket\.delete\(key\)/);
  const done = core.lastIndexOf("await completeLocalRemoval(db,kind,id,targets)");
  const media = core.lastIndexOf("await removeExclusiveMedia(db,bindings,row)");
  assert.ok(media > done);
});

test("every Notion inbound sweep honors unpublished guards and pre-migration workers remain compatible", () => {
  assert.match(core, /export async function notionPageMustSkipInboundSync/);
  assert.match(core, /notionPageHasAdminUnpublishGuard\(db,pageId\)/);
  assert.match(core, /no such table: admin_record_publication_guards/);
  for (const adapter of [
    "notion-directory-sync", "notion-events-help-sync",
    "notion-event-sync", "notion-breed-sync", "notion-article-sync",
  ]) {
    const content = source("lib/" + adapter + ".ts");
    assert.match(content, /await notionPageMustSkipInboundSync\(/,
      adapter + " must not replay a hidden Admin record");
  }
  // A breed draft still receives content edits; only tombstones stop replay.
  const breeds = source("lib/notion-breed-workcopy-sync.ts");
  assert.match(breeds, /await notionPageIsTombstoned\(args.database,link.work_notion_page_id\)/);
  assert.doesNotMatch(breeds, /notionPageMustSkipInboundSync\(/);
  // Work-copy now writes one explicitly mapped field instead of resaving a
  // complete breed: publication must remain D1-owned, never overwritten.
  assert.match(breeds, /await saveBreedNotionField\(\{/);
  const directField = source("lib/notion-breed-workcopy-direct-field.ts");
  const fieldSql = source("lib/notion-breed-workcopy-field-sql.mjs");
  assert.match(directField, /"UPDATE managed_breeds SET "\+patch\.assignments\.join\(","\)/);
  assert.match(fieldSql, /throw Error\("BREED_EVENT_D1_FIELD_NOT_MAPPED"\)/);
  assert.doesNotMatch(fieldSql, /^\s*status\s*:/m);
  for (const mapping of ["directory_notion_sync","event_notion_sync","breed_notion_sync",
    "breed_notion_workcopy_links","article_notion_sync","notion_agenda_sync"]) {
    assert.ok(core.includes(mapping), "guard must recognize " + mapping);
  }
});

test("unpublish mirrors the exact existing Notion status enums and tolerates unmigrated schemas", () => {
  const adapters = source("lib/notion-events-help-adapters.ts");
  assert.match(adapters, /normalized === "draft"/);
  assert.match(adapters, /const normalized = value\.toUpperCase\(\) \|\| "DRAFT"/);
  const propertyMap = core.split("function notionDraftProperties(")[1]?.split("async function mirrorDraft")[0];
  assert.ok(propertyMap, "must resolve exact Notion status selection per agenda");
  assert.match(propertyMap, /kind==="help"\?"draft"/);
  assert.match(propertyMap, /kind==="lost-found"\?"DRAFT"/);
  assert.match(propertyMap, /kind==="articles"\?"Ready"/);
  const guard = core.split("export async function notionPageHasAdminUnpublishGuard")[1]
    ?.split("export async function notionPageMustSkipInboundSync")[0];
  assert.ok(guard);
  assert.match(guard, /sqlite_master/);
  assert.match(guard, /if\(!present\.has\("admin_record_publication_guards"\)\)return false/);
  assert.match(guard, /if\(!present\.has\(table\)\)return/);
});

test("archived records are not silently converted into drafts by the unpublish action", () => {
  const body = core.split("export async function unpublishRecord(")[1]
    ?.split("/** Called only AFTER")[0];
  assert.ok(body);
  assert.match(body, /!spec\.publicStatuses\.includes\(clean\(row\.status\)\)/);
  assert.match(body, /throw Error\("RECORD_NOT_PUBLIC"\)/);
  const route = source("app/api/admin/record-lifecycle/[kind]/[id]/route.ts");
  assert.match(route, /code==="RECORD_NOT_PUBLIC"\|\|/);
  assert.match(dialog, /preview\?preview\.published:publicStates\.has\(status\)/);
  assert.doesNotMatch(dialog.split("const publicStates=new Set(")[1]?.split(");")[0]??"", /ARCHIVED/);
});

test("remote Notion deletion cannot begin unless the canonical D1 row was hidden", () => {
  const removal = core.split("export async function removeRecord(")[1] ?? "";
  assert.match(removal, /const \[,legacyHideResult\]=await db\.batch\(\[insert,hide\]\)/);
  assert.match(removal, /stagedProfileRemovalGuard\(db,kind,id,row\.updated_at,targets\)/);
  assert.match(removal, /db\.batch\(\[guard,insert,hide,db\.prepare\(/);
  assert.match(removal, /hideResult\.meta\?\.changes/);
  const hidden = removal.indexOf("RECORD_HIDE_NOT_CONFIRMED");
  const remote = removal.indexOf("for(const target of targets)await verifyTrash");
  assert.ok(hidden >= 0 && remote > hidden);
  assert.match(removal, /WHERE id=\?"/);
});

test("READY_LOCAL retries D1 only; the verified Notion-trash receipt is durable", () => {
  const removal = core.split("export async function removeRecord(")[1] ?? "";
  const skip = removal.indexOf('if(prior?.state!=="READY_LOCAL")');
  const remote = removal.indexOf("for(const target of targets)await verifyTrash");
  const cleanup = removal.indexOf("await completeLocalRemoval(db,kind,id,targets)");
  assert.ok(skip >= 0 && remote > skip && cleanup > remote,
    "remote trash must be skipped after an existing READY_LOCAL receipt");
  assert.match(removal, /notionTrash:targets\.length\?"confirmed":"unlinked"/);
});

test("verified breed removal clears exact work-copy identity and typed receipts", () => {
  const cleanup = core.split("async function completeLocalRemoval(")[1]
    ?.split("export async function removeRecord(")[0] ?? "";
  assert.match(cleanup, /DELETE FROM breed_notion_workcopy_links WHERE breed_id=\?/);
  assert.match(cleanup, /DELETE FROM breed_notion_controlled_values WHERE breed_id=\?/);
  assert.match(cleanup, /DELETE FROM notion_agenda_sync WHERE agenda=\? AND entity_id=\?/);
  assert.match(cleanup, /if\(mapping && present\.has\(mapping\.table\)\)/);
});

test("optional relation cleanup is schema-gated and never removes linked entities", () => {
  const cleanup = core.split("async function completeLocalRemoval(")[1]
    ?.split("export async function removeRecord(")[0] ?? "";
  assert.match(cleanup, /present\.has\("breed_article_relations"\)/);
  assert.match(cleanup, /present\.has\("breed_directory_relations"\)/);
  assert.doesNotMatch(cleanup, /DELETE FROM managed_breeds|DELETE FROM managed_articles WHERE.*breed_id|DELETE FROM directory_profiles WHERE.*breed_id/);
});

test("destructive confirmation is bound to the exact record displayed in Admin", () => {
  const removal = core.split("export async function removeRecord(")[1] ?? "";
  assert.match(removal, /expected:\{slug:string;name:string;category:string\}/);
  assert.match(removal, /if\(!matches\(meta\)\)throw Error\("RECORD_CONFIRMATION_MISMATCH"\)/);
  assert.match(removal, /if\(!matches\(\{slug:prior\.record_slug,name:prior\.record_name,category:prior\.record_category\}\)\)/);
  assert.match(route, /DELETE_IDENTITY_REQUIRED/);
  assert.match(route, /body\.expectedSlug/);
  assert.match(route, /body\.expectedName/);
  assert.match(route, /body\.expectedCategory/);
  assert.match(dialog, /expectedSlug:preview\.slug/);
  assert.match(dialog, /expectedName:preview\.name/);
  assert.match(dialog, /expectedCategory:preview\.category/);
});

test("event deletion protects both legacy and generic Notion mapping identities", () => {
  const mapping = core.split("async function mappedTargets(")[1]?.split("async function tombstone(")[0] ?? "";
  assert.match(mapping, /SELECT notion_page_id FROM event_notion_sync WHERE event_id=\?/);
  assert.match(mapping, /SELECT notion_page_id FROM notion_agenda_sync WHERE agenda='events' AND entity_id=\?/);
  assert.match(mapping, /NOTION_MAPPING_AMBIGUOUS/);
  assert.match(mapping, /const unique=new Map<string,NotionTarget>\(\)/);
  const guard = core.split("export async function notionPageHasAdminUnpublishGuard")[1]
    ?.split("export async function notionPageMustSkipInboundSync")[0] ?? "";
  assert.match(guard, /WHEN 'events' THEN 'events'/);
  assert.match(route, /code==="NOTION_MAPPING_AMBIGUOUS"\|\|/);
});

test("unpublished breeds cannot be revived from any Notion work-copy migration stage", () => {
  const guard = core.split("export async function notionPageHasAdminUnpublishGuard")[1]
    ?.split("export async function notionPageMustSkipInboundSync")[0] ?? "";
  assert.match(guard, /w\.original_notion_page_id IN \(\?,\?\) OR w\.work_notion_page_id IN \(\?,\?\)/);
  assert.doesNotMatch(guard, /w\.status='ACTIVE'/);
});

test("Notion UUID spellings and remote provenance are checked before destructive D1 writes", () => {
  assert.match(core, /function notionPageIdVariants\(pageId:string\)/);
  assert.match(core, /notion_page_id IN \(\?,\?\)/);
  assert.match(core, /json_extract\(json_each\.value,'\$\.pageId'\) IN \(\?,\?\)/);
  const deletion = core.split("export async function removeRecord(")[1] ?? "";
  const firstProvenance=deletion.indexOf("assertNotionTargetsConfigured(targets)");
  const firstTombstoneInsert=deletion.indexOf("INSERT INTO admin_record_tombstones");
  assert.ok(firstProvenance>=0 && firstProvenance<firstTombstoneInsert);
  assert.match(deletion, /assertNotionTargetsConfigured\(targets\)/);
  assert.match(route, /NOTION_MAPPING_INVALID/);
  assert.match(dialog, /NOTION_DATA_SOURCE_UNCONFIGURED/);
});

test("V3 proposals preserve lifecycle data, mappings and guards in isolated SQLite",()=>{
  const oldKinds=["directory","events","help","breeds","articles","adoptions","lost-found","organizations"];
  const tables=["directory_profiles","managed_events","help_cases","managed_breeds","managed_articles","adoption_dogs","lost_found_dog_reports","help_organizations","managed_eshops"];
  const ratings=["energy","trainability","family","children","other_dogs","apartment","grooming","shedding","prey_drive"];
  const bSource=source("drizzle/0159_breed_notion_workcopy_links.sql");
  const triggers=source("drizzle/0181_notion_unified_scope_invalidation.sql").match(/CREATE TRIGGER IF NOT EXISTS unified_scope_breed_notion_workcopy_links_\w+[\s\S]*?\nEND;/g);
  assert.equal(triggers?.length,3);
  const breedProposal=source("drizzle/0182_notion_v3_breed_workonly_links.sql");
  const lifecycleProposal=source("drizzle/0183_notion_v3_eshop_lifecycle.sql");
  const webhookProposal=source("drizzle/0184_notion_v3_webhook_deletion.sql");
  const cursorProposal=source("drizzle/0185_notion_v3_discovery_cursor.sql");
  for(const [slug,sql] of [["breed-workonly-links",breedProposal],["eshop-lifecycle",lifecycleProposal],["webhook-deletion",webhookProposal],["discovery-cursor",cursorProposal]]){
    assert.equal(sql,source("docs/proposals/notion-v3-"+slug+"-UNNUMBERED_PROPOSAL.sql"));
  }
  const bundle=[breedProposal,lifecycleProposal,webhookProposal,cursorProposal].join("\n");
  function fixture(){
    const db=new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys=ON;");
    for(const table of tables)db.exec("CREATE TABLE "+table+"(id INTEGER PRIMARY KEY,slug TEXT,status TEXT,import_key TEXT,fci_number INTEGER,website_url TEXT,fci_group INTEGER NOT NULL DEFAULT 0,"+ratings.map(r=>r+" INTEGER NOT NULL DEFAULT 0").join(",")+")");
    db.exec("CREATE TABLE notion_unified_scope_invalidation(agenda TEXT,entity_id TEXT,invalidated_at TEXT,PRIMARY KEY(agenda,entity_id));CREATE TABLE notion_unified_field_state(agenda TEXT,entity_id TEXT,baseline_version INTEGER,baseline_json TEXT,notion_json TEXT,psipedia_json TEXT,notion_edit_json TEXT,psipedia_edit_json TEXT,status TEXT,reason TEXT,version INTEGER,updated_at TEXT,recovery_after TEXT);CREATE TABLE notion_unified_admin_field_edits(agenda TEXT,entity_id TEXT);");
    db.exec(bSource);db.exec(triggers.join("\n"));db.exec(migration);db.exec(source("drizzle/0145_notion_webhook_inbox.sql"));
    return db;
  }
  const apply=(db,sql)=>{db.exec("BEGIN");try{db.exec(sql);db.exec("COMMIT");}catch(error){db.exec("ROLLBACK");throw error;}};
  const db=fixture();
  try{
    db.exec("INSERT INTO managed_breeds(id,slug,status,fci_number) VALUES(1,'old','draft',1),(2,'new','draft',NULL)");
    db.exec("INSERT INTO breed_notion_workcopy_links(breed_id,original_notion_page_id,work_notion_page_id,original_data_source_id,work_data_source_id,canonical_slug,fci_number,original_sync_receipt) VALUES(1,'original','work','os','ws','old',1,'receipt')");
    for(const [i,kind] of oldKinds.entries()){
      db.prepare("INSERT INTO admin_record_tombstones(kind,record_id,record_slug,record_name,record_category,state,created_by,created_at,updated_at) VALUES(?,?,?,?,?,'COMPLETE','actor','created','updated')").run(kind,100+i,"old-"+kind,"Name","cat");
      db.prepare("INSERT INTO admin_record_publication_guards VALUES(?,?,'SYNCED',NULL,'t')").run(kind,100+i);
    }
    db.exec("INSERT INTO notion_webhook_inbox(event_key,page_id,event_type,status,attempts,outcome) VALUES('old-event','old-page','page.properties_updated','DONE',2,'APPLIED')");
    const names=["breed_notion_workcopy_links","admin_record_tombstones","admin_record_publication_guards","notion_webhook_inbox"];
    const snapshot=()=>names.map(name=>db.prepare("SELECT * FROM "+name+" ORDER BY 1,2").all());
    const catalog=()=>db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY name").all();
    const before=snapshot(),beforeCatalog=catalog();
    assert.throws(()=>apply(db,bundle+"\nSELECT json_extract('V3_ROLLBACK_PROBE','$');"),/malformed JSON/i);
    assert.deepEqual(snapshot(),before);
    assert.deepEqual(catalog(),beforeCatalog);
    apply(db,bundle);
    assert.equal(db.prepare("SELECT count(*) AS n FROM notion_discovery_cursor").get().n,0);
    assert.deepEqual(names.map(name=>db.prepare("SELECT * FROM "+name+" ORDER BY 1,2").all()),before);
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name LIKE 'admin_%'").get().n,27);
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name LIKE 'unified_scope_breed_%'").get().n,3);
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='index' AND (name LIKE 'admin_record_tombstones_%_idx' OR name='idx_breed_notion_workcopy_status')").get().n,4);
    db.exec("INSERT INTO breed_notion_workcopy_links(breed_id,work_notion_page_id,work_data_source_id,canonical_slug,status,activated_at) VALUES(2,'newwork','ws','new','ACTIVE','t')");
    assert.throws(()=>db.exec("UPDATE managed_breeds SET status='published' WHERE id=2"),/BREED_DRAFT_REQUIRED_VALUES/);
    db.exec("UPDATE managed_breeds SET fci_group=1,"+ratings.map(r=>r+"=3").join(",")+" WHERE id=2");
    db.exec("UPDATE breed_notion_workcopy_links SET work_last_error_code='INBOUND_ID_PENDING' WHERE breed_id=2");
    assert.throws(()=>db.exec("UPDATE managed_breeds SET status='published' WHERE id=2"),/BREED_DRAFT_REQUIRED_VALUES/);
    db.exec("UPDATE breed_notion_workcopy_links SET work_last_error_code=NULL WHERE breed_id=2; UPDATE managed_breeds SET status='published' WHERE id=2;");
    db.exec("INSERT INTO managed_eshops(id,slug,status,website_url) VALUES(1,'shop','draft','https://shop.test/')");
    assert.throws(()=>db.exec("DELETE FROM managed_eshops WHERE id=1"),/USE_VERIFIED_LIFECYCLE_DELETE/);
    db.exec("INSERT INTO admin_record_tombstones(kind,record_id,record_slug,record_external_key,record_name,record_category,state,created_by,created_at,updated_at) VALUES('eshops',1,'shop','https://shop.test','shop','cat','PENDING_NOTION','a','c','u')");
    assert.throws(()=>db.exec("UPDATE managed_eshops SET status='published' WHERE id=1"),/RECORD_REMOVAL_PENDING/);
    assert.throws(()=>db.exec("DELETE FROM managed_eshops WHERE id=1"),/USE_VERIFIED_LIFECYCLE_DELETE/);
    db.exec("UPDATE admin_record_tombstones SET state='READY_LOCAL' WHERE kind='eshops'; DELETE FROM managed_eshops WHERE id=1;");
    assert.throws(()=>db.exec("INSERT INTO managed_eshops(id,slug,status,website_url) VALUES(2,'new-shop','draft','https://shop.test/')"),/RECORD_TOMBSTONED/);
  }finally{db.close();}
  for(const [table,proposal,columns,definitions] of [
    ["breed_notion_workcopy_links",breedProposal,"breed_id","breed_id INTEGER"],
    ["admin_record_tombstones",lifecycleProposal,"kind,record_id","kind TEXT,record_id INTEGER"],
    ["admin_record_publication_guards",lifecycleProposal,"kind,record_id","kind TEXT,record_id INTEGER"],
    ["notion_webhook_inbox",webhookProposal,"event_key","event_key TEXT"],
  ]){
    const db=fixture();
    try{
      db.exec("CREATE TABLE incoming("+definitions+", FOREIGN KEY("+columns+") REFERENCES "+table+"("+columns+"))");
      assert.throws(()=>apply(db,proposal));
      assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table));
      assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE '%_v3_new'").get().n,0);
    }finally{db.close();}
  }
});
