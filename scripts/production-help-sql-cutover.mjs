#!/usr/bin/env node
/**
 * Manual-only, production protected, SELECT-only Help SQL gate.
 *
 * Runs AFTER the existing canonical production inventory script.
 * Collects a Time Travel recovery checkpoint fingerprint, not a database
 * export or the raw bookmark. Makes no D1 writes and never calls Notion.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HELP_SQL_CUTOVER_SCHEMA, assessHelpSqlCutover } from "../lib/help-sql-cutover-readiness.mjs";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const DATABASE="psipedia-sk-db";
const ID="8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const ACCOUNT="5ff902d3d80376478b9213b2b8ae8d6e";
const OUT=join(ROOT,".production-help-sql-cutover");
const REPORT=join(OUT,"report.json");
const MODES=Object.freeze({
  audit:"AUDIT-HELP-SQL-psipedia-sk-db",
  postflight:"POSTFLIGHT-HELP-SQL-psipedia-sk-db",
});

export function assertHelpSqlManualContext(env,mode,resources) {
  if (!Object.hasOwn(MODES,mode) ||
      env.GITHUB_EVENT_NAME!=="workflow_dispatch" ||
      env.GITHUB_REPOSITORY!=="investradarsk/psipedia-sk" ||
      env.GITHUB_REF!=="refs/heads/main" ||
      !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??"") ||
      env.HELP_SQL_CONFIRMATION!==MODES[mode] ||
      !env.CLOUDFLARE_API_TOKEN ||
      env.CLOUDFLARE_ACCOUNT_ID!==ACCOUNT ||
      resources?.account_id!==ACCOUNT ||
      resources?.d1?.binding!=="DB" ||
      resources?.d1?.database_name!==DATABASE ||
      resources?.d1?.database_id!==ID)
    throw new Error("HELP_SQL_CUTOVER_PRODUCTION_CONTEXT_INVALID");
  // "postflight" means inspecting an independently deployed release, NEVER
  // applying a migration or restoring older D1 data.
  if (mode==="postflight" &&
      (env.HELP_SQL_BACKUP_CONFIRMATION!=="INDEPENDENT-BACKUP-VERIFIED" ||
       env.HELP_SQL_PARITY_CONFIRMATION!=="ADMIN-NOTION-PUBLIC-PARITY-REVIEWED"))
    throw new Error("HELP_SQL_CUTOVER_MANUAL_ATTESTATIONS_MISSING");
}

export function assertHelpSqlReadOnly(sql) {
  const prefixes=Object.keys(HELP_SQL_CUTOVER_SCHEMA).map(table=>
    "SELECT name FROM pragma_table_info('"+table+"')");
  if (!prefixes.includes(sql))
    throw new Error("HELP_SQL_CUTOVER_UNAPPROVED_SQL");
  return sql;
}

export function unwrapWranglerRows(raw) {
  let obj;
  try {obj=JSON.parse(raw.trim())}
  catch {throw Error("HELP_SQL_CUTOVER_INVALID_WRANGLER_JSON")}
  const batches=Array.isArray(obj)?obj:[obj];
  if (!batches.length ||
      batches.some(batch=>batch?.success!==true || !Array.isArray(batch.results)))
    throw Error("HELP_SQL_CUTOVER_D1_QUERY_FAILED");
  return batches.flatMap(batch=>batch.results);
}

function bookmarkIn(value,depth=0) {
  if (!value || typeof value!=="object" || depth>10) return null;
  if (typeof value.bookmark==="string" && value.bookmark.length>12)
    return value.bookmark;
  const values=Array.isArray(value)?value:Object.values(value);
  for (const child of values) {
    const match=bookmarkIn(child,depth+1);
    if (match) return match;
  }
  return null;
}
export function checkpointFingerprint(raw) {
  let obj;
  try {obj=JSON.parse(raw.trim())}
  catch {throw Error("HELP_SQL_CUTOVER_RECOVERY_JSON_INVALID")}
  const bookmark=bookmarkIn(obj);
  if (!bookmark) throw Error("HELP_SQL_CUTOVER_RECOVERY_POINT_MISSING");
  return createHash("sha256").update(bookmark).digest("hex").slice(0,16);
}

function wrangler(args) {
  const result=spawnSync(process.platform==="win32"?"npx.cmd":"npx",
    ["--no-install","wrangler",...args], {
      cwd:ROOT,encoding:"utf8",maxBuffer:8*1024*1024,
      env:{...process.env,NO_UPDATE_NOTIFIER:"1",WRANGLER_SEND_METRICS:"false"},
    });
  if (result.error || result.status!==0)
    throw Error("HELP_SQL_CUTOVER_REMOTE_READ_FAILED");
  return result.stdout??"";
}

function readRemote(sql,config) {
  const data=wrangler(["d1","execute",DATABASE,"--remote","--config",config,
    "--json","--command",assertHelpSqlReadOnly(sql)]);
  return unwrapWranglerRows(data);
}

async function main() {
  const mode=process.argv[2]??"";
  const resources=JSON.parse(await readFile(join(ROOT,"config/cloudflare-resources.json"),"utf8"));
  assertHelpSqlManualContext(process.env,mode,resources);
  const temp=await mkdtemp(join(tmpdir(),"psipedia-help-sql-gate-"));
  try {
    const config=join(temp,"wrangler.json");
    await writeFile(config,JSON.stringify({
      name:"psipedia-help-sql-read-only",compatibility_date:"2026-11-19",
      d1_databases:[{binding:"DB",database_name:DATABASE,database_id:ID}],
    }));
    // Checkpoint must be available BEFORE any remote schema inspection.
    // Fingerprint only; raw bookmark is not printed, exported or persisted.
    const fingerprint=checkpointFingerprint(wrangler(
      ["d1","time-travel","info",DATABASE,"--config",config,"--json"]));
    const tableResults=[];
    for (const [table,required] of Object.entries(HELP_SQL_CUTOVER_SCHEMA)) {
      const names=readRemote("SELECT name FROM pragma_table_info('"+table+"')",config);
      if (names.some(row=>typeof row?.name!=="string"))
        throw Error("HELP_SQL_CUTOVER_SCHEMA_RESPONSE_INVALID");
      const found=new Set(names.map(x=>x.name));
      tableResults.push({
        table,exists:found.size>0,
        missingColumns:required.filter(key=>!found.has(key)),
      });
    }
    const schema={ready:tableResults.every(x=>x.exists && !x.missingColumns.length),
      tables:tableResults};
    const inventory=JSON.parse(await readFile(
      join(ROOT,".production-editorial-storage-readonly","report.json"),"utf8"));
    const assessment=assessHelpSqlCutover({
      inventory,schema,recoveryCheckpoint:true,now:new Date().toISOString(),
      expectedSha:process.env.GITHUB_SHA,
    });
    const report={
      mode,gitSha:process.env.GITHUB_SHA,checkedAt:new Date().toISOString(),
      database:DATABASE,readOnly:true,productionDataModified:false,
      checkpointFingerprint:fingerprint,schema,assessment,
      backupIndependentlyConfirmed:mode==="postflight",
      editorialParityManuallyAttested:mode==="postflight",
    };
    await mkdir(OUT,{recursive:true});
    await writeFile(REPORT,JSON.stringify(report,null,2)+"\n",{mode:0o600});
    const lines=[
      "### Pomoc psom — SQL-only production gate",
      "",
      "| Stage | Result |",
      "| --- | --- |",
      "| Mode | "+mode+" |",
      "| Schema | "+(schema.ready?"ready":"blocked")+" |",
      "| Aggregates | "+assessment.status+" |",
      "| Recovery checkpoint | present, SHA256 fingerprint "+fingerprint+" |",
      "| Notion live parity | NOT checked by this job |",
      "| D1 writes | NONE |",
      "| Backfill/deletes/restore | NONE |",
      "",
      "Blockers: "+(assessment.blockers.join(", ")||"none in aggregate gate")+".",
      "An audit result never authorizes deletion or a whole-D1 rollback.",
    ];
    if (process.env.GITHUB_STEP_SUMMARY)
      await appendFile(process.env.GITHUB_STEP_SUMMARY,lines.join("\n")+"\n");
    process.stdout.write(JSON.stringify({
      status:assessment.status,mode,readOnly:true,
      schemaReady:schema.ready,blockers:assessment.blockers,
    })+"\n");
    if (assessment.status!=="structural_check_passed")
      process.exitCode=1;
  } finally {
    await rm(temp,{recursive:true,force:true});
  }
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(error=>{
    console.error(error instanceof Error ? error.message : "HELP_SQL_CUTOVER_FAILED");
    process.exitCode=1;
  });
}
