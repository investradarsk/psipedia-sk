/**
 * SERVICES V3 — production D1 0138 -> 0139 read-only gate.
 * Owner-dispatched Github Actions only. Exact allowlisted SELECT queries; no
 * DML, DDL, PRAGMA commands, Notion API, flag changes, migration apply or deploy.
 */
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {readFile,readdir,mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {PINNED_SHA256_0138,OBJECTS_0138,assertArticleOutbox0138Schema}
  from "./production-d1-0138-schema.mjs";
import {PINNED_SHA256_0139,OBJECTS_0139,assertServicesV3Auto0139Schema}
  from "./production-d1-0139-schema.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
export const WORKFLOW="Services V3 Production Read-only Gate";
export const DB="psipedia-sk-db";
export const TARGET138="0138_article_editorial_outbox.sql";
export const TARGET139="0139_services_catalog_notion_auto_attempts.sql";
export const SQL=Object.freeze({
  ledger:"SELECT id,name FROM d1_migrations ORDER BY id",
  objects:"SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name IN ('managed_articles','article_notion_sync','service_catalog_admin_options','service_catalog_admin_notion_receipts','service_catalog_admin_receipt_no_delete') OR tbl_name IN ('article_notion_editorial_outbox','service_catalog_notion_auto_attempts') ORDER BY type,name",
  outboxColumns:"SELECT name,type,\"notnull\",pk FROM pragma_table_info('article_notion_editorial_outbox')",
  notionColumns:"SELECT name,type,\"notnull\",pk FROM pragma_table_info('article_notion_sync')",
  articleColumns:"SELECT name,type,\"notnull\",pk FROM pragma_table_info('managed_articles')",
  outboxForeignKeys:"SELECT id,seq,\"table\",\"from\",\"to\",on_delete FROM pragma_foreign_key_list('article_notion_editorial_outbox')",
  dynamicOptions:"SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN status='DRAFT' AND notion_mirror_status='PENDING' THEN 1 ELSE 0 END),0) AS pending FROM service_catalog_admin_options",
  receipts:"SELECT COUNT(*) AS total FROM service_catalog_admin_notion_receipts",
  yesChoices:"SELECT COUNT(*) AS total FROM service_profile_option_choices WHERE choice='yes'",
  attempts:"SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN outcome IN ('CLAIMED','RETRY','REVIEW') THEN 1 ELSE 0 END),0) AS unresolved FROM service_catalog_notion_auto_attempts"
});
const allowed=new Set(Object.values(SQL));
export function assertReadonlySql(sql){
  if(typeof sql!=="string"||!allowed.has(sql))throw Error("UNAPPROVED_D1_SQL");
  if(!sql.startsWith("SELECT "))throw Error("NON_SELECT_SQL");
  return sql;
}
function assertRunner(env,resources){
  if(env.GITHUB_ACTIONS!=="true"||env.GITHUB_WORKFLOW!==WORKFLOW||
    env.GITHUB_EVENT_NAME!=="workflow_dispatch"||
    env.GITHUB_REF!=="refs/heads/main"||
    !/^[0-9a-f]{40}$/.test(env.GITHUB_SHA??"")||
    !env.CLOUDFLARE_API_TOKEN||!env.CLOUDFLARE_ACCOUNT_ID||
    env.CLOUDFLARE_ACCOUNT_ID!==resources.account_id||
    resources.d1.database_name!==DB||
    resources.d1.binding!=="DB"||!resources.d1.database_id)
    throw Error("READONLY_RUNNER_GUARD");
}
function parseRows(output){
  let payload;
  try{payload=JSON.parse(output.trim());}catch{throw Error("D1_READ_JSON_INVALID");}
  const batches=Array.isArray(payload)?payload:[payload];
  if(batches.length!==1||batches[0]?.success!==true||
    !Array.isArray(batches[0].results))throw Error("D1_READ_RESULT_INVALID");
  return batches[0].results;
}
export function migrationGate({ledger,files,objects,articleColumns,notionColumns,outboxColumns,outboxForeignKeys,sql138,sql139,metrics}){
  const names=files.filter(n=>/^\d{4}_[a-z0-9_]+\.sql$/.test(n)).sort();
  const noGo=reason=>({state:"NO_GO",reason,migration0138:"UNVERIFIED",migration0139:"UNVERIFIED"});
  if(createHash("sha256").update(sql138).digest("hex")!==PINNED_SHA256_0138||
     createHash("sha256").update(sql139).digest("hex")!==PINNED_SHA256_0139)
    return noGo("PINNED_SQL_CHANGED");
  if(names[138]!==TARGET138||names[139]!==TARGET139||
    !Array.isArray(ledger)||!Array.isArray(objects))
    return noGo("CANONICAL_MIGRATION_INVENTORY_INVALID");
  for(let i=0;i<ledger.length;i++){
    const row=ledger[i];
    if(!Number.isSafeInteger(row?.id)||i>0&&row.id<=ledger[i-1].id||
       row?.name!==names[i])return noGo("MIGRATION_LEDGER_DRIFT");
  }
  if(ledger.length<=138)return {...noGo("0138_NOT_APPLIED"),migration0138:"NOT_APPLIED"};
  if(ledger.length>140)return noGo("UNEXPECTED_LATER_MIGRATION");
  const schema={
    objects,managedArticleColumns:articleColumns,articleNotionSyncColumns:notionColumns,
    articleNotionEditorialOutboxColumns:outboxColumns,
    articleNotionEditorialOutboxForeignKeys:outboxForeignKeys
  };
  try{assertArticleOutbox0138Schema(schema,sql138);}
  catch{return {...noGo("0138_SCHEMA_DRIFT"),migration0138:"DRIFT"};}
  const applied139=ledger.length===140;
  const present139=objects.some(row=>Object.hasOwn(OBJECTS_0139,String(row.name))||
    row.tbl_name==="service_catalog_notion_auto_attempts");
  if(applied139){
    try{assertServicesV3Auto0139Schema(schema,sql139);}
    catch{return {...noGo("0139_SCHEMA_DRIFT"),migration0138:"VERIFIED",migration0139:"DRIFT"};}
  }else if(present139){
    return {...noGo("0139_PARTIAL_SCHEMA_WITHOUT_LEDGER"),migration0138:"VERIFIED",migration0139:"DRIFT"};
  }
  for(const k of ["dynamicOptions","receipts","yesChoices",...(applied139?["attempts"]:[])]){
    const val=metrics?.[k];
    if(!val||!Number.isSafeInteger(val.total)||val.total<0||
       (k==="dynamicOptions"&&(!Number.isSafeInteger(val.pending)||val.pending<0))||
       (k==="attempts"&&(!Number.isSafeInteger(val.unresolved)||val.unresolved<0)))
      return {...noGo("COVERAGE_AGGREGATE_UNVERIFIED"),migration0138:"VERIFIED",migration0139:applied139?"VERIFIED":"NOT_APPLIED"};
  }
  return {state:applied139?"ALREADY_APPLIED":"READY_TO_REQUEST_0139",
    reason:applied139?"EXACT_0139_SCHEMA":"EXACT_0138_PREDECESSOR",
    migration0138:"VERIFIED",migration0139:applied139?"VERIFIED":"NOT_APPLIED",
    coverage:{
      dynamicOptions:metrics.dynamicOptions.total,
      pendingDynamicOptions:metrics.dynamicOptions.pending,
      notionReceipts:metrics.receipts.total,
      explicitYesSelections:metrics.yesChoices.total,
      ...(applied139?{attemptJournalRows:metrics.attempts.total,unresolvedAttempts:metrics.attempts.unresolved}:{})
    }};
}
async function remoteAudit(){
  const resources=JSON.parse(await readFile(path.join(root,"config/cloudflare-resources.json"),"utf8"));
  assertRunner(process.env,resources);
  const [files,sql138,sql139]=await Promise.all([
    readdir(path.join(root,"drizzle")),
    readFile(path.join(root,"drizzle",TARGET138),"utf8"),
    readFile(path.join(root,"drizzle",TARGET139),"utf8")]);
  const dir=path.join(root,".production-services-v3-readonly");
  await mkdir(dir,{recursive:true});
  const config=path.join(dir,"wrangler.json");
  await writeFile(config,JSON.stringify({
    name:"psipedia-sk",compatibility_date:"2026-08-23",
    d1_databases:[{binding:"DB",database_name:DB,database_id:resources.d1.database_id}]
  },null,2));
  function wrangler(args){
    const exe=process.platform==="win32"?"npx.cmd":"npx";
    const z=spawnSync(exe,["wrangler",...args],{
      encoding:"utf8",maxBuffer:6*1024*1024,
      env:{...process.env,WRANGLER_SEND_METRICS:"false",NO_UPDATE_NOTIFIER:"1"}
    });
    if(z.error||z.status!==0)throw Error("D1_REMOTE_READ_FAILED");
    return z.stdout??"";
  }
  const info=wrangler(["d1","info",DB,"--config",config,"--json"]);
  if(!info.includes(resources.d1.database_id)||!info.includes(DB))
    throw Error("D1_PRODUCTION_IDENTITY_MISMATCH");
  const read=sql=>parseRows(wrangler([
    "d1","execute",DB,"--remote","--config",config,"--command",assertReadonlySql(sql),"--json"
  ]));
  const ledger=read(SQL.ledger);
  const objects=read(SQL.objects);
  const articleColumns=read(SQL.articleColumns);
  const notionColumns=read(SQL.notionColumns);
  const outboxColumns=read(SQL.outboxColumns);
  const outboxForeignKeys=read(SQL.outboxForeignKeys);
  // These are bounded aggregate counts, never personal data or profile identities.
  let metrics={};
  // If the predecessor is unverified, emit a NO-GO without contacting
  // any additional object tables.
  const preliminary=migrationGate({ledger,objects,files,sql138,sql139,
    articleColumns,notionColumns,outboxColumns,outboxForeignKeys,metrics:null});
  if(preliminary.reason!=="COVERAGE_AGGREGATE_UNVERIFIED")return preliminary;
  try {
    metrics={
      dynamicOptions:read(SQL.dynamicOptions)[0],
      receipts:read(SQL.receipts)[0],
      yesChoices:read(SQL.yesChoices)[0],
      ...(ledger.length===140?{attempts:read(SQL.attempts)[0]}:{})
    };
  }catch{return {state:"NO_GO",reason:"COVERAGE_REMOTE_READ_FAILED",migration0138:"VERIFIED",migration0139:ledger.length===140?"VERIFIED":"NOT_APPLIED"};}
  return migrationGate({ledger,objects,files,sql138,sql139,
    articleColumns,notionColumns,outboxColumns,outboxForeignKeys,metrics});
}
async function main(){
  const dest=path.join(root,".production-services-v3-readonly","report.json");
  let report;
  try{report=await remoteAudit();}
  catch{report={state:"NO_GO",reason:"REMOTE_READ_OR_IDENTITY_FAILED"};}
  report={audit:"SERVICES_V3_D1_0138_0139_READONLY",generatedAt:new Date().toISOString(),
    mainSha:process.env.GITHUB_SHA??"UNKNOWN",mode:"READ_ONLY",...report,
    autoSyncFlags:"NOT_VERIFIED",notionRemote:"NOT_VERIFIED"};
  await mkdir(path.dirname(dest),{recursive:true});
  await writeFile(dest,JSON.stringify(report,null,2)+"\n");
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
  if(!["READY_TO_REQUEST_0139","ALREADY_APPLIED"].includes(report.state))
    process.exitCode=2;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(()=>{process.stderr.write("SERVICES_V3_READONLY_FATAL_NO_GO\n");process.exitCode=2;});
