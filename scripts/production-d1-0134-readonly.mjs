/**
 * SERVICES V3 / 0134 — owner-dispatched, STRICT READ-ONLY production verifier.
 * No migration runner, no DML/DDL, no PRAGMA, no Notion/API writers.
 * Only exact immutable allowlisted SELECTs can reach the remote adapter.
 */
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {readFile,readdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  TARGET_0133,PINNED_SHA256_0133,expected0133Objects,
  SERVICE_TABLES_0133,SERVICE_INDEXES_0133,SQL_METRICS_0133,
} from "./production-d1-0133-readonly.mjs";

export const TARGET_0134 = "0134_services_admin_change_audit.sql";
export const PINNED_SHA256_0134 = "f6520f39af34739ccd72d424f7944923b6d0c5813ca3cc5d966a61821ebccda5";
const IDENTITY=Object.freeze({
  account:"5ff902d3d80376478b9213b2b8ae8d6e",
  database:"psipedia-sk-db",
  databaseId:"8f7a0c3e-4d77-4a35-8192-a7bd57147950",binding:"DB"
});
export const TABLES_0134=Object.freeze([
  "service_catalog_admin_change_audit","service_catalog_admin_notion_receipts"
]);
export const INDEXES_0134=Object.freeze(["service_catalog_admin_change_audit_entity_idx"]);
export const TRIGGERS_0134=Object.freeze([
  "service_catalog_admin_option_audit_insert",
  "service_catalog_admin_option_audit_update",
  "service_catalog_admin_choice_audit_insert",
  "service_catalog_admin_choice_audit_update",
  "service_catalog_admin_choice_audit_delete",
  "service_catalog_admin_audit_no_update",
  "service_catalog_admin_audit_no_delete",
  "service_catalog_admin_receipt_no_update",
  "service_catalog_admin_receipt_no_delete",
  "service_catalog_admin_option_approval_receipt"
]);
export const AUTO_INDEX_0134="sqlite_autoindex_service_catalog_admin_notion_receipts_1";
const AUTO_INDEXES_0133=Object.freeze([
  "sqlite_autoindex_service_catalog_admin_options_1",
  "sqlite_autoindex_service_catalog_admin_options_2",
  "sqlite_autoindex_service_profile_option_choices_1",
  "sqlite_autoindex_service_profile_property_values_1"
]);
export const SQL_LEDGER_0134="SELECT id,name FROM d1_migrations ORDER BY id";
export const SQL_OBJECTS_0134=
  "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE tbl_name IN ("+
  "'service_catalog_admin_options','service_profile_option_choices','service_profile_property_values',"+
  "'service_catalog_admin_change_audit','service_catalog_admin_notion_receipts') "+
  "OR name IN ('service_catalog_admin_option_approval_receipt') ORDER BY type,name";
export const QUERIES_0134=Object.freeze([SQL_LEDGER_0134,SQL_OBJECTS_0134,SQL_METRICS_0133]);

export function assertReadonly0134Query(sql) {
  if (typeof sql!=="string" || !QUERIES_0134.includes(sql)) throw Error("0134_UNAUTHORIZED_SQL");
  return sql;
}
export function buildReadonly0134Command(database,sql) {
  if (database!==IDENTITY.database) throw Error("0134_WRONG_DATABASE");
  return ["wrangler","d1","execute",database,"--remote","--json","--command",assertReadonly0134Query(sql)];
}
function remoteRead(database,sql,env) {
  const argv=buildReadonly0134Command(database,sql);
  const out=spawnSync(process.platform==="win32"?"npx.cmd":"npx",argv,{
    encoding:"utf8",maxBuffer:4*1024*1024,
    env:{...env,WRANGLER_SEND_METRICS:"false",NO_UPDATE_NOTIFIER:"1"}
  });
  if (out.error || out.status!==0) throw Error("REMOTE_READ_FAILED");
  let payload;
  try { payload=JSON.parse(out.stdout); } catch {throw Error("REMOTE_JSON_INVALID");}
  const parts=Array.isArray(payload)?payload:[payload];
  if (parts.length!==1 || parts[0]?.success!==true || !Array.isArray(parts[0].results))
    throw Error("REMOTE_RESULT_INVALID");
  return parts[0].results;
}
export function normalize0134Ddl(sql) {
  return String(sql??"").replace(/\s+/g," ").trim().replace(/;$/,"").trim().toLowerCase();
}
export function expected0134Objects(migration) {
  // Extract entire CREATE statements by their STARTS: triggers contain internal
  // semicolons and MUST NEVER be split on semicolons.
  const cleaned=migration.split(/\r?\n/).filter(s=>!/^\s*--/.test(s)).join("\n");
  const starts=[...cleaned.matchAll(/^CREATE\s+(?:TABLE|INDEX|TRIGGER)\s+[a-z][a-z0-9_]*\b/gim)].map(m=>m.index);
  const expected=new Map();
  for (let i=0;i<starts.length;i++) {
    const statement=cleaned.slice(starts[i],starts[i+1]??cleaned.length).trim().replace(/;\s*$/,"").trim();
    const match=/^CREATE\s+(TABLE|INDEX|TRIGGER)\s+([a-z][a-z0-9_]*)\b/i.exec(statement);
    if (!match || expected.has(match[2])) throw Error("0134_INVALID_APPROVED_SQL");
    if (match[1].toUpperCase()==="TRIGGER" && !/\bEND$/i.test(statement))
      throw Error("0134_INVALID_APPROVED_TRIGGER");
    expected.set(match[2],{type:match[1].toLowerCase(),sql:normalize0134Ddl(statement)});
  }
  const names=[...TABLES_0134,...INDEXES_0134,...TRIGGERS_0134];
  if (starts.length!==13 || expected.size!==13 ||
      names.some(x=>!expected.has(x)) ||
      [...expected.keys()].some(x=>!names.includes(x)))
    throw Error("0134_INVALID_APPROVED_SQL");
  return expected;
}
function canonicalLedger(names) {
  if (!Array.isArray(names)) throw Error("0134_INVALID_SOURCE_INVENTORY");
  const files=names.filter(n=>/^\d{4}_[a-z0-9_]+\.sql$/.test(n)).sort();
  if (files.length<135 || files[133]!==TARGET_0133 || files[134]!==TARGET_0134 ||
      files.some((n,i)=>Number(n.slice(0,4))!==i))
    throw Error("0134_INVALID_SOURCE_INVENTORY");
  return files;
}
function historyResult(ledger,files) {
  if (!Array.isArray(ledger)) return "INVALID";
  const seen=new Set();
  for (let i=0;i<ledger.length;i++) {
    const row=ledger[i];
    if (!row || !Number.isSafeInteger(row.id) ||
        (i>0 && row.id<=ledger[i-1].id) ||
        typeof row.name!=="string" || row.name!==files[i] || seen.has(row.name)) return "INVALID";
    seen.add(row.name);
  }
  if (ledger.length>files.length) return "INVALID";
  return seen.has(TARGET_0134)?"APPLIED":seen.has(TARGET_0133)?"NOT_RECORDED":"MISSING_0133";
}
function expected0133Integrity(objects,migration) {
  const expected=expected0133Objects(migration);
  for (const [name,want] of expected) {
    const rows=objects.filter(x=>x?.name===name);
    if (rows.length!==1 || rows[0].type!==want.type ||
        !SERVICE_TABLES_0133.includes(rows[0].tbl_name) ||
        normalize0134Ddl(rows[0].sql)!==want.sql) return "DRIFT";
  }
  for (const name of AUTO_INDEXES_0133) {
    const rows=objects.filter(x=>x?.name===name);
    if (rows.length!==1 || rows[0].type!=="index" || rows[0].sql!==null ||
        !SERVICE_TABLES_0133.includes(rows[0].tbl_name)) return "DRIFT";
  }
  return "PASS";
}
function inspect0134(objects, expected) {
  const required=[...expected.keys(),AUTO_INDEX_0134];
  const observed=objects.filter(x=>required.includes(x?.name) ||
    TABLES_0134.includes(x?.tbl_name) ||
    (x?.type==="trigger" && ["service_catalog_admin_options","service_profile_option_choices"].includes(x?.tbl_name)));
  const found=observed.filter(x=>required.includes(x.name));
  const names=new Set(found.map(x=>x.name));
  const unexpected=observed.filter(x=>!required.includes(x.name)).map(()=>"UNEXPECTED_SERVICES_OBJECT");
  const missing=required.filter(n=>!names.has(n));
  const changed=[];
  for (const row of found) {
    const want=expected.get(row.name);
    if (found.filter(x=>x.name===row.name).length!==1) {changed.push(row.name);continue;}
    if (row.name===AUTO_INDEX_0134) {
      if (row.type!=="index" || row.sql!==null || row.tbl_name!==TABLES_0134[1]) changed.push(row.name);
    } else if (row.type!==want.type || normalize0134Ddl(row.sql)!==want.sql ||
      row.tbl_name!==(want.type==="table"?row.name:want.type==="index"?TABLES_0134[0]:
        row.name.startsWith("service_catalog_admin_option_")?"service_catalog_admin_options":
        row.name.startsWith("service_catalog_admin_choice_")?"service_profile_option_choices":
        row.name.startsWith("service_catalog_admin_receipt_")?TABLES_0134[1]:TABLES_0134[0])) changed.push(row.name);
  }
  return {found:names.size,missing,changed:[...new Set(changed)],unexpected};
}
function minimal(result,history,inspect,schema0133,reason,sha,mainSha,referentialIntegrity="NOT_CHECKED") {
  return {
    auditId:"PSIPEDIA-D1-0134-READONLY-01",mainSha, migration:TARGET_0134,
    migrationSha256:sha,priorMigration:TARGET_0133,
    priorState:schema0133,history0134:history,
    expectedObjects:14,confirmedObjects:inspect.found-inspect.changed.length,
    missingObjects:inspect.missing,changedObjects:inspect.changed,
    unexpectedObjects:inspect.unexpected,
    constraints:inspect.missing.length||inspect.changed.length||inspect.unexpected.length?"BLOCKED":"EXACT_DDL",
    // The 0133 schema check is independent from the aggregate orphan check.
    // Never report PASS unless SQL_METRICS_0133 returned valid zero-orphan aggregates.
    referentialIntegrity,
    featureFlags:{SERVICE_CATALOG_ADMIN_WRITES_ENABLED:"UNKNOWN",SERVICE_CATALOG_NOTION_MIRROR_READY:"UNKNOWN"},
    result,reason
  };
}
export function classify0134({ledger,objects,metrics,canonicalNames,migration0133,migration0134,mainSha="UNKNOWN"}) {
  const files=canonicalLedger(canonicalNames);
  const expected=expected0134Objects(migration0134);
  const empty={found:0,missing:[...expected.keys(),AUTO_INDEX_0134],changed:[],unexpected:[]};
  const sha=PINNED_SHA256_0134;
  if (!Array.isArray(objects) || objects.some(x=>!x || typeof x.name!=="string" || typeof x.type!=="string"))
    return minimal("UNKNOWN","UNKNOWN",empty,"UNKNOWN","INVALID_SCHEMA_RESULT",sha,mainSha);
  const history=historyResult(ledger,files);
  if (history==="INVALID") return minimal("PARTIAL_OR_INCONSISTENT","INCONSISTENT",empty,"UNKNOWN","MIGRATION_HISTORY_MISMATCH",sha,mainSha);
  const prior=expected0133Integrity(objects,migration0133);
  const state=inspect0134(objects,expected);
  if (prior!=="PASS") return minimal("SCHEMA_DRIFT_BLOCKED",history,state,"DRIFT","0133_SCHEMA_DRIFT",sha,mainSha);
  if (history==="MISSING_0133") return minimal("PARTIAL_OR_INCONSISTENT",history,state,"PASS","0133_NOT_RECORDED",sha,mainSha);
  if (state.changed.length || state.unexpected.length)
    return minimal("SCHEMA_DRIFT_BLOCKED",history,state,"PASS","0134_DEFINITION_DRIFT",sha,mainSha);
  if (history==="NOT_RECORDED" && state.found>0)
    return minimal("PARTIAL_OR_INCONSISTENT",history,state,"PASS","0134_OBJECTS_WITHOUT_HISTORY",sha,mainSha);
  if (history==="APPLIED" && state.missing.length)
    return minimal("PARTIAL_OR_INCONSISTENT",history,state,"PASS","0134_HISTORY_WITH_MISSING_OBJECTS",sha,mainSha);
  if (!Array.isArray(metrics) || metrics.length!==1 ||
      ["options_count","choices_count","properties_count","choice_orphans","property_orphans"]
        .some(k=>!Number.isSafeInteger(metrics[0]?.[k])||metrics[0][k]<0))
    return minimal("UNKNOWN",history,state,"PASS","INVALID_INTEGRITY_AGGREGATES",
      sha,mainSha,metrics==null?"NOT_CHECKED":"UNKNOWN");
  if (metrics[0].choice_orphans!==0 || metrics[0].property_orphans!==0)
    return minimal("SCHEMA_DRIFT_BLOCKED",history,state,"PASS","0133_ORPHANED_REFERENCES",
      sha,mainSha,"FAIL");
  return minimal(history==="APPLIED"?"APPLIED_AND_VERIFIED":"NOT_APPLIED_VERIFIED",
    history,state,"PASS","CONSISTENT_LEDGER_AND_SCHEMA",sha,mainSha,"PASS");
}
export async function audit0134({resources,migration0133,migration0134,canonicalNames,env,query=remoteRead}) {
  // Preflight occurs BEFORE any remote query, including mocked transports.
  if (env?.GITHUB_ACTIONS!=="true" || env?.GITHUB_EVENT_NAME!=="workflow_dispatch" ||
      env?.GITHUB_REF!=="refs/heads/main" || !/^[a-f0-9]{40}$/.test(env?.GITHUB_SHA??"") ||
      env?.GITHUB_WORKFLOW!=="Production D1 0134 Read-only Verifier" ||
      !env?.CLOUDFLARE_API_TOKEN || env?.CLOUDFLARE_ACCOUNT_ID!==IDENTITY.account ||
      resources?.account_id!==IDENTITY.account || resources?.d1?.database_id!==IDENTITY.databaseId ||
      resources?.d1?.database_name!==IDENTITY.database || resources?.d1?.binding!==IDENTITY.binding)
    throw Error("0134_IDENTITY_OR_ACTIONS_GUARD");
  if (createHash("sha256").update(migration0133).digest("hex")!==PINNED_SHA256_0133 ||
      createHash("sha256").update(migration0134).digest("hex")!==PINNED_SHA256_0134)
    throw Error("0134_APPROVED_SQL_BYTES_CHANGED");
  canonicalLedger(canonicalNames);
  expected0134Objects(migration0134);
  const read=async sql=>{
    const allowed=assertReadonly0134Query(sql);
    const rows=await query(IDENTITY.database,allowed,env);
    if (!Array.isArray(rows)) throw Error("REMOTE_RESULT_INVALID");
    return rows;
  };
  try {
    const ledger=await read(SQL_LEDGER_0134);
    const objects=await read(SQL_OBJECTS_0134);
    const base={ledger,objects,canonicalNames,migration0133,migration0134,mainSha:env.GITHUB_SHA};
    const prelim=classify0134({...base,metrics:null});
    // If the ledger or DDL already blocks, do not run the metrics SELECT.
    // The preliminary report explicitly records referentialIntegrity=NOT_CHECKED.
    if (prelim.reason!=="INVALID_INTEGRITY_AGGREGATES")
      return {...prelim,database:IDENTITY.database,databaseId:IDENTITY.databaseId};
    const metrics=await read(SQL_METRICS_0133);
    return {...classify0134({...base,metrics}),database:IDENTITY.database,databaseId:IDENTITY.databaseId};
  } catch {
    return {...minimal("UNKNOWN","UNKNOWN",{found:0,missing:[],changed:[],unexpected:[]},"UNKNOWN",
      "READ_FAILED_OR_INVALID_REMOTE_RESPONSE",PINNED_SHA256_0134,env.GITHUB_SHA),
      database:IDENTITY.database,databaseId:IDENTITY.databaseId};
  }
}
async function main() {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
  const [res,m133,m134,names]=await Promise.all([
    readFile(path.join(root,"config/cloudflare-resources.json"),"utf8"),
    readFile(path.join(root,"drizzle",TARGET_0133),"utf8"),
    readFile(path.join(root,"drizzle",TARGET_0134),"utf8"),
    readdir(path.join(root,"drizzle"))
  ]);
  const result=await audit0134({resources:JSON.parse(res),migration0133:m133,migration0134:m134,canonicalNames:names,env:process.env});
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
  if (!["NOT_APPLIED_VERIFIED","APPLIED_AND_VERIFIED"].includes(result.result)) process.exitCode=1;
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(()=>{process.stderr.write("0134_READONLY_PREFLIGHT_BLOCKED\n");process.exitCode=1;});
