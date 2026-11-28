#!/usr/bin/env node
// Isolated owner-dispatched V3 schema operation. Never replays d1_migrations.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const FILES = [
  ["0182_notion_v3_breed_workonly_links.sql","316a510f468fba7237cf9a77fd7d7ad1588bf7dc"],
  ["0183_notion_v3_eshop_lifecycle.sql","9c7fba54d60ba6c5bc80cbd043a5cc714bca396f"],
  ["0184_notion_v3_webhook_deletion.sql","5f430174a02be6fc3e53d2e83aab52d419b92fda"],
  ["0185_notion_v3_discovery_cursor.sql","4d16ee07d5d45838306e78aa079bd286592d6d98"],
];
const TABLES = ["breed_notion_workcopy_links","admin_record_tombstones",
  "admin_record_publication_guards","notion_webhook_inbox"];
const CURSOR = "notion_discovery_cursor";
const NAMES = [...TABLES,CURSOR];
const DEPENDENCIES = ["directory_profiles","managed_events","help_cases","managed_breeds",
  "managed_articles","adoption_dogs","lost_found_dog_reports","help_organizations",
  "managed_eshops","notion_unified_scope_invalidation","notion_unified_field_state",
  "notion_unified_admin_field_edits"];
const DATABASE="psipedia-sk-db", ID="8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const ACCOUNT="5ff902d3d80376478b9213b2b8ae8d6e";
const OUTPUT=resolve(".production-d1-notion-v3"), CONFIG=resolve(OUTPUT,"wrangler.json");
const MODE=process.argv[2];
const SCRATCH_NAME="psipedia-notion-v3-rehearsal";
const SCRATCH_ID=process.env.NOTION_V3_REHEARSAL_DATABASE_ID??"";
const TARGET=MODE==="rehearse"?SCRATCH_NAME:DATABASE;
const must=(condition,code)=>{if(!condition)throw Error("NOTION_V3_"+code);};
const digest=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
const read=name=>readFileSync(resolve("drizzle",name),"utf8");
const catalogSql="SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name";
let receipt={mode:MODE,sourceCommit:process.env.GITHUB_SHA,database:TARGET,migrations:FILES,phase:"START",applied:false};

function report(update){
  receipt={...receipt,...update};
  mkdirSync(OUTPUT,{recursive:true});
  writeFileSync(resolve(OUTPUT,"report.json"),JSON.stringify(receipt,null,2)+"\n");
  const {phase,applied,auditFingerprint,counts,processing,error}=receipt;
  console.log(JSON.stringify({phase,applied,auditFingerprint,counts,processing,error}));
}
function authorize(){
  must(["audit","apply","rehearse"].includes(MODE),"MODE");
  must(process.env.GITHUB_EVENT_NAME==="workflow_dispatch","MANUAL_ONLY");
  must(process.env.GITHUB_REPOSITORY==="investradarsk/psipedia-sk","REPOSITORY");
  must(process.env.GITHUB_REF==="refs/heads/main"&&Boolean(process.env.GITHUB_SHA),"MAIN_ONLY");
  must(process.env.CLOUDFLARE_ACCOUNT_ID===ACCOUNT&&Boolean(process.env.CLOUDFLARE_API_TOKEN),"CREDENTIALS");
  const confirmation=MODE==="rehearse"?"REHEARSE-0182-0185-psipedia-notion-v3-rehearsal":
    (MODE==="audit"?"AUDIT":"APPLY")+"-0182-0185-psipedia-sk-db";
  must(process.env.NOTION_V3_CONFIRMATION===confirmation,"CONFIRMATION");
  if(MODE==="rehearse"){
    must(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(SCRATCH_ID)&&SCRATCH_ID.toLowerCase()!==ID,"SCRATCH_ID_REQUIRED");
  }
  if(MODE==="apply"){
    must(/^[a-f0-9]{64}$/.test(process.env.NOTION_V3_AUDIT_FINGERPRINT??""),"AUDIT_RECEIPT_REQUIRED");
    must(process.env.NOTION_V3_WRITERS_PAUSED==="true","PAUSE_WRITERS_FIRST");
    // This is an owner attestation, not a programmatic proof of a remote staging run.
    must(Boolean(process.env.NOTION_V3_ISOLATED_D1_EVIDENCE?.trim()),"ISOLATED_D1_ROLLBACK_EVIDENCE_REQUIRED");
  }
}
function prepare(){
  const resources=JSON.parse(readFileSync("config/cloudflare-resources.json","utf8"));
  must(resources.account_id===ACCOUNT&&resources.d1?.database_name===DATABASE&&
    resources.d1?.database_id===ID&&resources.d1?.binding==="DB","DATABASE_IDENTITY");
  mkdirSync(OUTPUT,{recursive:true});
  writeFileSync(CONFIG,JSON.stringify({name:"psipedia-notion-v3-isolated",
    compatibility_date:"2026-11-28",
    d1_databases:[{binding:"DB",database_name:TARGET,database_id:MODE==="rehearse"?SCRATCH_ID:ID}]}));
  return FILES.map(([name,sha])=>{
    const bytes=readFileSync(resolve("drizzle",name));
    const blob=createHash("sha1").update(Buffer.concat([Buffer.from("blob "+bytes.length+"\0"),bytes])).digest("hex");
    must(blob===sha,"PINNED_SQL_CHANGED_"+name);
    return bytes.toString("utf8");
  }).join("\n");
}
function wranglerRaw(args){
  return spawnSync(process.platform==="win32"?"npx.cmd":"npx",["--no-install","wrangler",...args],{
    encoding:"utf8",maxBuffer:32*1024*1024,
    env:{...process.env,WRANGLER_SEND_METRICS:"false",NO_UPDATE_NOTIFIER:"1"},
  });
}
function wrangler(args){
  const child=wranglerRaw(args);
  must(!child.error&&child.status===0,"WRANGLER_FAILED");
  const raw=(child.stdout??"").trim();
  try{return JSON.parse(raw)}catch{}
  for(const start of [raw.indexOf("["),raw.indexOf("{")].filter(n=>n>=0)){
    for(const end of [raw.lastIndexOf("]"),raw.lastIndexOf("}")].filter(n=>n>start)){
      try{return JSON.parse(raw.slice(start,end+1))}catch{}
    }
  }
  throw Error("NOTION_V3_INVALID_WRANGLER_JSON");
}
function pages(value){
  const result=Array.isArray(value)?value:[value];
  must(result.length>0&&result.every(x=>x&&x.success!==false),"REMOTE_RESULT_FAILED");
  return result;
}
function readRemote(sql){
  must((/^\s*SELECT\b/i.test(sql)||["PRAGMA quick_check","PRAGMA foreign_key_check"].includes(sql))&&!sql.includes(";"),"READ_ONLY");
  const result=pages(wrangler(["d1","execute",TARGET,"--remote","--config",CONFIG,"--command",sql,"--json"]));
  must(result.every(x=>Array.isArray(x.results)),"MISSING_RESULTS");
  return result.flatMap(x=>x.results);
}
function scope(rows){
  return rows.filter(row=>NAMES.some(name=>
    row.tbl_name===name||String(row.sql).toLowerCase().includes(name)));
}
function normalized(rows){
  return rows.map(row=>({type:row.type,name:row.name,tbl_name:row.tbl_name,
    sql:String(row.sql).replace(/^CREATE TABLE\s+"([^"]+)"/i,"CREATE TABLE $1")
      .replace(/\s+/g," ").trim()})).sort((a,b)=>a.name.localeCompare(b.name));
}
function same(a,b){return digest(a)===digest(b);}
function localCatalog(db){return db.prepare(catalogSql).all();}
function localIntegrity(db){
  must(db.prepare("PRAGMA quick_check").all().every(x=>x.quick_check==="ok"),"FIXTURE_INTEGRITY");
  must(db.prepare("PRAGMA foreign_key_check").all().length===0,"FIXTURE_FOREIGN_KEYS");
}
function fixture(catalog,bundle){
  // Copy only physical DDL of untouched prerequisite tables, never production rows.
  // Reconstruct the old affected objects from canonical historical migration files.
  const db=new DatabaseSync(":memory:");
  try{
    db.exec("PRAGMA foreign_keys=ON;");
    for(const name of DEPENDENCIES){
      const entry=catalog.find(x=>x.type==="table"&&x.name===name);
      must(entry&&typeof entry.sql==="string","DEPENDENCY_MISSING_"+name);
      db.exec(entry.sql);
    }
    db.exec(read("0159_breed_notion_workcopy_links.sql"));
    db.exec(read("0164_admin_record_lifecycle.sql"));
    db.exec(read("0145_notion_webhook_inbox.sql"));
    const source=read("0181_notion_unified_scope_invalidation.sql");
    const start=source.indexOf("CREATE TRIGGER IF NOT EXISTS unified_scope_breed_notion_workcopy_links_insert");
    const end=source.indexOf("CREATE TRIGGER IF NOT EXISTS unified_scope_notion_agenda_sync_insert",start);
    must(start>=0&&end>start,"SCOPE_TRIGGER_SOURCE");
    db.exec(source.slice(start,end));
    const before=normalized(scope(localCatalog(db)));
    // Deliberate failure at the very end must leave the prior schema intact.
    db.exec("BEGIN;");
    let rejected=false;
    try{db.exec(bundle+"\nSELECT json_extract('V3_ROLLBACK_PROBE','$');");}
    catch{rejected=true;}
    finally{db.exec("ROLLBACK;");}
    must(rejected&&same(before,normalized(scope(localCatalog(db)))),"FIXTURE_ROLLBACK");
    db.exec("BEGIN;");
    try{db.exec(bundle);db.exec("COMMIT;");}
    catch(error){db.exec("ROLLBACK;");throw error;}
    localIntegrity(db);
    const after=normalized(scope(localCatalog(db)));
    must(before.filter(x=>x.type==="trigger").length===27,"FIXTURE_OLD_TRIGGERS");
    must(after.filter(x=>x.type==="trigger").length===31,"FIXTURE_NEW_TRIGGERS");
    must(after.filter(x=>x.type==="index").length===6,"FIXTURE_INDEXES");
    return {before,after};
  }finally{db.close();}
}
function integrity(){
  const rows=readRemote("PRAGMA quick_check");
  must(rows.length===1&&rows[0].quick_check==="ok","D1_INTEGRITY");
  must(readRemote("PRAGMA foreign_key_check").length===0,"D1_FOREIGN_KEYS");
}
function history(){
  const rows=readRemote("SELECT id,name FROM d1_migrations ORDER BY id");
  const expected=readdirSync("drizzle").filter(n=>/^\d{4}_.+\.sql$/.test(n)&&Number(n.slice(0,4))<=162).sort();
  must(rows.length===163&&expected.length===163,"HISTORICAL_LEDGER_LENGTH");
  must(rows.every((row,i)=>Number(row.id)===i+1&&row.name===expected[i]),"HISTORICAL_LEDGER_MISMATCH");
  return rows;
}
function state(bundle){
  const catalog=readRemote(catalogSql);
  const expected=fixture(catalog,bundle);
  const actual=scope(catalog);
  const normalizedActual=normalized(actual);
  const before=same(normalizedActual,expected.before), after=same(normalizedActual,expected.after);
  must(before!==after,"UNKNOWN_OR_PARTIAL_SCHEMA");
  const ledger=history();
  const tables=after?NAMES:TABLES;
  const counts=Object.fromEntries(tables.map(name=>{
    const row=readRemote("SELECT COUNT(*) AS n FROM "+name)[0];
    const n=Number(row?.n);must(Number.isSafeInteger(n)&&n>=0,"BAD_COUNT_"+name);return [name,n];
  }));
  const processing=Number(readRemote("SELECT COUNT(*) AS n FROM notion_webhook_inbox WHERE status='PROCESSING'")[0]?.n);
  must(Number.isSafeInteger(processing)&&processing>=0,"PROCESSING_COUNT");
  integrity();
  return {actual,expected,ledger,counts,processing,installed:after,
    fingerprint:digest({schema:normalizedActual,ledger})};
}
function findBookmark(value){
  if(!value||typeof value!=="object")return null;
  if(typeof value.bookmark==="string"&&value.bookmark)return value.bookmark;
  for(const item of Object.values(value)){const b=findBookmark(item);if(b)return b;}
  return null;
}
function transactionGuard(s){
  // Check the same schema and row-count snapshot inside the import itself.
  // A concurrent dependency or DDL change must abort before any DROP.
  const predicate="sql IS NOT NULL AND ("+NAMES.map(name=>
    "(tbl_name="+literal(name)+" OR instr(lower(sql),"+literal(name)+")>0)").join(" OR ")+")";
  const conditions=["(SELECT COUNT(*) FROM sqlite_master WHERE "+predicate+")="+s.actual.length];
  for(const row of s.actual){
    conditions.push("EXISTS(SELECT 1 FROM sqlite_master WHERE type="+literal(row.type)+
      " AND name="+literal(row.name)+" AND tbl_name="+literal(row.tbl_name)+" AND sql="+literal(row.sql)+")");
  }
  for(const [name,n] of Object.entries(s.counts))conditions.push("(SELECT COUNT(*) FROM "+name+")="+n);
  conditions.push("(SELECT COUNT(*) FROM notion_webhook_inbox WHERE status='PROCESSING')=0");
  conditions.push("(SELECT COUNT(*) FROM d1_migrations)=163");
  conditions.push("EXISTS(SELECT 1 FROM d1_migrations WHERE id=163 AND name='0162_lost_found_short_description.sql')");
  return "SELECT CASE WHEN "+conditions.join("\n AND ")+" THEN 1 ELSE json_extract('V3_CONCURRENT_SCHEMA_OR_ROWS','$') END;\n";
}
function rehearse(bundle){
  // Only a separate, explicitly named, empty D1 database is allowed.
  const info=wrangler(["d1","info",TARGET,"--config",CONFIG,"--json"]);
  const metadata=Array.isArray(info)?info[0]:info;
  must(metadata?.name===SCRATCH_NAME&&String(metadata.uuid??metadata.id).toLowerCase()===SCRATCH_ID.toLowerCase(),"SCRATCH_IDENTITY");
  must(readRemote("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").length===0,"SCRATCH_NOT_EMPTY");
  const ratings=["energy","trainability","family","children","other_dogs","apartment","grooming","shedding","prey_drive"];
  const base=DEPENDENCIES.slice(0,9).map(name=>"CREATE TABLE "+name+
    "(id INTEGER PRIMARY KEY,slug TEXT,status TEXT,import_key TEXT,fci_number INTEGER,website_url TEXT,fci_group INTEGER NOT NULL DEFAULT 0,"+
    ratings.map(r=>r+" INTEGER NOT NULL DEFAULT 0").join(",")+");").join("\n");
  const scopeTables="CREATE TABLE notion_unified_scope_invalidation(agenda TEXT,entity_id TEXT,invalidated_at TEXT,PRIMARY KEY(agenda,entity_id));"+
    "CREATE TABLE notion_unified_field_state(agenda TEXT,entity_id TEXT,baseline_version INTEGER,baseline_json TEXT,notion_json TEXT,psipedia_json TEXT,notion_edit_json TEXT,psipedia_edit_json TEXT,status TEXT,reason TEXT,version INTEGER,updated_at TEXT,recovery_after TEXT);"+
    "CREATE TABLE notion_unified_admin_field_edits(agenda TEXT,entity_id TEXT);";
  const source=read("0181_notion_unified_scope_invalidation.sql");
  const start=source.indexOf("CREATE TRIGGER IF NOT EXISTS unified_scope_breed_notion_workcopy_links_insert");
  const end=source.indexOf("CREATE TRIGGER IF NOT EXISTS unified_scope_notion_agenda_sync_insert",start);
  must(start>=0&&end>start,"SCOPE_TRIGGER_SOURCE");
  const ledger=readdirSync("drizzle").filter(n=>/^\d{4}_.+\.sql$/.test(n)&&Number(n.slice(0,4))<=162).sort();
  must(ledger.length===163,"FIXTURE_LEDGER");
  const seed=[
    "INSERT INTO managed_breeds(id,slug,status,fci_number) VALUES(1,'old-breed','draft',1);",
    "INSERT INTO breed_notion_workcopy_links(breed_id,original_notion_page_id,work_notion_page_id,original_data_source_id,work_data_source_id,canonical_slug,fci_number,original_sync_receipt) VALUES(1,'original','work','os','ws','old-breed',1,'receipt');",
    "INSERT INTO admin_record_tombstones(kind,record_id,record_slug,record_name,record_category,state,created_by,created_at,updated_at) VALUES('directory',10,'old','Name','cat','COMPLETE','actor','created','updated');",
    "INSERT INTO admin_record_publication_guards VALUES('directory',10,'SYNCED',NULL,'t');",
    "INSERT INTO notion_webhook_inbox(event_key,page_id,event_type,status,attempts,outcome) VALUES('old-event','old-page','page.properties_updated','DONE',2,'APPLIED');",
    "CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL);",
    "INSERT INTO d1_migrations(id,name) VALUES "+ledger.map((name,i)=>"("+(i+1)+","+literal(name)+")").join(",")+";",
  ].join("\n");
  const setup=[base,scopeTables,read("0159_breed_notion_workcopy_links.sql"),read("0164_admin_record_lifecycle.sql"),
    read("0145_notion_webhook_inbox.sql"),source.slice(start,end),seed].join("\n");
  const importArgs=file=>["d1","execute",TARGET,"--remote","--config",CONFIG,"--file",file,"--yes","--json"];
  const makeFile=(name,sql)=>{const p=resolve(OUTPUT,name);writeFileSync(p,sql);return p;};
  pages(wrangler(importArgs(makeFile("rehearsal-fixture.sql",setup))));
  const before=state(bundle);
  must(!before.installed&&TABLES.every(name=>before.counts[name]===1),"SCRATCH_FIXTURE_COUNTS");
  const snapshot=()=>TABLES.map(name=>readRemote("SELECT * FROM "+name+" ORDER BY 1,2"));
  const original=snapshot();
  report({phase:"REHEARSAL_FIXTURE",counts:before.counts});
  const guarded=transactionGuard(before)+bundle;
  const failed=wranglerRaw(importArgs(makeFile("rehearsal-failure.sql",guarded+"\nSELECT json_extract('V3_ROLLBACK_PROBE','$');")));
  must(!failed.error&&failed.status!==0&&/malformed JSON/i.test((failed.stderr??"")+"\n"+(failed.stdout??"")),"EXPECTED_SQL_FAILURE_NOT_PROVEN");
  const restored=state(bundle);
  must(!restored.installed&&restored.fingerprint===before.fingerprint&&same(snapshot(),original),"REMOTE_ROLLBACK_FAILED");
  report({phase:"REHEARSAL_ROLLBACK",remoteRollback:"PASS"});
  pages(wrangler(importArgs(makeFile("rehearsal-success.sql",guarded))));
  const after=state(bundle);
  must(after.installed&&same(after.ledger,before.ledger)&&same(snapshot(),original)&&after.counts[CURSOR]===0,"REMOTE_MIGRATION_PARITY");
  report({phase:"REHEARSAL_PASS",remoteRollback:"PASS",remoteImport:"PASS",counts:after.counts,
    scratchDatabaseId:SCRATCH_ID,productionActivation:false,applied:false});
}
function main(){
  authorize();
  const bundle=prepare();
  if(MODE==="rehearse")return rehearse(bundle);
  const initial=state(bundle);
  report({phase:"AUDIT",installed:initial.installed,auditFingerprint:initial.fingerprint,
    counts:initial.counts,processing:initial.processing,fixtureRollback:"PASS",historicalLedger:"0162"});
  if(MODE==="audit")return;
  must(!initial.installed,"ALREADY_INSTALLED_NO_REPLAY");
  must(initial.fingerprint===process.env.NOTION_V3_AUDIT_FINGERPRINT,"AUDIT_SCHEMA_CHANGED");
  must(initial.processing===0,"ACTIVE_WEBHOOK_LEASES");
  const bookmark=findBookmark(wrangler(["d1","time-travel","info",DATABASE,"--config",CONFIG,"--json"]));
  must(Boolean(bookmark),"RECOVERY_BOOKMARK_MISSING");
  const fresh=state(bundle);
  must(!fresh.installed&&fresh.fingerprint===initial.fingerprint&&fresh.processing===0,"CONCURRENT_CHANGE");
  const file=resolve(OUTPUT,"pinned-0182-0185.sql");
  writeFileSync(file,transactionGuard(fresh)+bundle);
  report({phase:"RECOVERY_POINT",recoveryBookmark:bookmark,counts:fresh.counts,applied:null,
    isolatedD1Evidence:process.env.NOTION_V3_ISOLATED_D1_EVIDENCE});
  // One remote SQL file import. No separate DDL calls, no replay or ledger writes.
  pages(wrangler(["d1","execute",TARGET,"--remote","--config",CONFIG,"--file",file,"--yes","--json"]));
  report({phase:"IMPORTED",applied:true});
  const after=state(bundle);
  must(after.installed&&same(after.ledger,fresh.ledger),"POSTFLIGHT_SCHEMA_OR_LEDGER");
  must(TABLES.every(name=>after.counts[name]===fresh.counts[name])&&after.counts[CURSOR]===0,"POSTFLIGHT_ROW_COUNTS");
  report({phase:"POSTFLIGHT",installed:true,applied:true,counts:after.counts,processing:after.processing,
    migrationLedgerWritten:false,productionActivation:false});
}
try{main();}
catch(error){
  const failedAt=receipt.phase;
  // Do not perform automatic Time Travel or retry a possibly committed import.
  try{report({phase:"FAILED",failedAt,error:error instanceof Error?error.message:"UNKNOWN"});}catch{}
  process.exitCode=1;
}
