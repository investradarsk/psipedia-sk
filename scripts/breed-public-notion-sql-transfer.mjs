#!/usr/bin/env node
/**
 * Public-only, ONE-TIME Notion -> relational D1 transfer.
 * Nothing is copied out of historical D1 JSON or legacy breed JSON files.
 * This command deliberately does not drop or modify the legacy JSON columns:
 * the website/Admin cutover MUST be merged and deployed before dropping them.
 *
 * Preview: NOTION_API_TOKEN=... node --experimental-strip-types scripts/breed-public-notion-sql-transfer.mjs --preview
 * Protected apply: manual workflow_dispatch from main, explicit confirmation,
 * and previously deployed 0173 tables. The script never commits data.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BREED_NOTION_SCHEMA } from "../lib/notion-breed-property-registry.ts";
import { breedWorkcopyEventValues } from "../lib/notion-breed-workcopy-field-values.mjs";
import { readBreedControlledNotionPage } from "../lib/breed-workcopy-controlled.mjs";
import { planBreedPublicSqlTransfer, breedPublicSqlStatements } from
  "../lib/breed-public-sql-transfer.mjs";

const NOTION_VERSION = "2025-09-03";
const NOTION_API = "https://api.notion.com/v1";
const TABLES = [
  "breed_public_profile", "breed_public_list_items", "breed_public_gallery",
  "breed_public_sports", "breed_public_sources", "breed_public_related_breeds",
];
const must = (test, message) => { if (!test) throw Error(message); };
const normalize = value => String(value??"").replaceAll("-", "").toLowerCase();
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
function notionValue(cell) {
  const values = cell?.rich_text ?? cell?.title;
  return Array.isArray(values) ? values.map(v=>v.plain_text ?? v.text?.content ?? "").join("").trim() : "";
}
async function notionPages(source, token) {
  const pages = [], ids = new Set(), cursors = new Set();
  let cursor = null;
  do {
    let result = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await fetch(NOTION_API + "/data_sources/" + encodeURIComponent(source) + "/query", {
        method: "POST",
        headers: {"Authorization":"Bearer "+token,"Notion-Version":NOTION_VERSION,
          "Content-Type":"application/json"},
        body:JSON.stringify({page_size:100,...(cursor ? {start_cursor:cursor} : {})}),
      });
      if (response.ok) { result = await response.json(); break; }
      if (![429,500,502,503,504].includes(response.status) || attempt === 4)
        throw Error("BREED_PUBLIC_NOTION_HTTP_"+response.status);
      await sleep(Math.max(450 * 2 ** attempt, Number(response.headers.get("retry-after")??0)*1000));
    }
    must(result?.object === "list" && Array.isArray(result.results), "BREED_PUBLIC_NOTION_LIST_INVALID");
    for (const page of result.results) {
      must(page?.id && !ids.has(normalize(page.id)), "BREED_PUBLIC_NOTION_DUPLICATE_PAGE");
      ids.add(normalize(page.id));
      pages.push(page);
    }
    cursor = result.has_more ? result.next_cursor : null;
    if (cursor) must(!cursors.has(cursor), "BREED_PUBLIC_NOTION_CURSOR_LOOP");
    if (cursor) cursors.add(cursor);
    must(!result.has_more || cursor, "BREED_PUBLIC_NOTION_CURSOR_MISSING");
  } while (cursor);
  return pages;
}
function prepare(pages) {
  const output = [], ids = new Set(), problems = [];
  for (const page of pages) {
    const raw = notionValue(page.properties?.["Psipedia ID"]);
    const breedId = Number(raw);
    must(/^\d+$/.test(raw) && Number.isSafeInteger(breedId) && breedId > 0,
      "BREED_PUBLIC_NOTION_ID_INVALID");
    must(!ids.has(breedId), "BREED_PUBLIC_NOTION_ID_DUPLICATE");
    ids.add(breedId);
    const changed = Object.keys(page.properties ?? {});
    const parsed = breedWorkcopyEventValues(page, changed, BREED_NOTION_SCHEMA);
    const controlled = readBreedControlledNotionPage(page);
    if (parsed.failures.length) problems.push({breedId,fields:parsed.failures.map(f=>f.field)});
    const transfer = planBreedPublicSqlTransfer({breedId,fields:parsed.values,controlled:controlled.values});
    output.push({breedId,notionPageId:normalize(page.id),transfer});
  }
  // A reduced Notion export must not silently delete 344 SQL profiles.
  must(output.length === 344, "BREED_PUBLIC_EXPECTED_344_NOTION_PROFILES");
  output.sort((a,b)=>a.breedId-b.breedId);
  return {output,problems};
}
function wrapResult(stdout) {
  const raw = stdout.trim();
  try { return JSON.parse(raw); } catch { /* Wrangler sometimes prints a banner. */ }
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  must(start>=0 && end>start, "BREED_PUBLIC_WRANGLER_OUTPUT_INVALID");
  return JSON.parse(raw.slice(start,end+1));
}
function wrangler(config,databaseName,args) {
  const result = spawnSync(process.platform==="win32"?"npx.cmd":"npx",
    ["wrangler","d1","execute",databaseName,"--remote","--config",config,...args,"--json"],
    {encoding:"utf8",maxBuffer:32*1024*1024,
      env:{...process.env,WRANGLER_SEND_METRICS:"false",NO_UPDATE_NOTIFIER:"1"}});
  must(!result.error && result.status===0,"BREED_PUBLIC_D1_COMMAND_FAILED");
  const parsed = wrapResult(result.stdout ?? "");
  const batches = Array.isArray(parsed)?parsed:[parsed];
  must(batches.length>0 && batches.every(b=>b?.success === true),
    "BREED_PUBLIC_D1_BATCH_FAILED");
  return batches.flatMap(b=>Array.isArray(b.results)?b.results:[]);
}
async function main() {
  const mode = process.argv[2] ?? "--preview";
  must(mode==="--preview" || mode==="--apply", "BREED_PUBLIC_MODE_INVALID");
  const token = process.env.NOTION_API_TOKEN?.trim();
  const setup = JSON.parse(readFileSync("wrangler.jsonc","utf8"));
  const source = process.env.NOTION_BREEDS_WORK_DATA_SOURCE_ID?.trim()
    || setup.vars?.NOTION_BREEDS_WORK_DATA_SOURCE_ID;
  must(token && /^[0-9a-f-]{36}$/i.test(source??""),
    "BREED_PUBLIC_NOTION_CREDENTIALS_OR_SOURCE_MISSING");
  const {output,problems} = prepare(await notionPages(source,token));
  console.log(JSON.stringify({mode,notionProfiles:output.length,
    missingOrUnparsedFields:problems.length,missingDetails:problems.slice(0,12)},null,2));
  if (mode==="--preview") return;
  must(process.env.GITHUB_EVENT_NAME==="workflow_dispatch" &&
    process.env.GITHUB_REF==="refs/heads/main" &&
    process.env.GITHUB_REPOSITORY==="investradarsk/psipedia-sk",
    "BREED_PUBLIC_MAIN_MANUAL_DISPATCH_REQUIRED");
  must(process.env.BREED_PUBLIC_TRANSFER_CONFIRMATION==="IMPORT-BREEDS-PUBLIC-344",
    "BREED_PUBLIC_EXPLICIT_CONFIRMATION_REQUIRED");
  must(Boolean(process.env.CLOUDFLARE_API_TOKEN), "BREED_PUBLIC_CLOUDFLARE_TOKEN_MISSING");
  const resources = JSON.parse(readFileSync("config/cloudflare-resources.json","utf8"));
  const dbResource = resources.d1;
  must(resources.account_id===process.env.CLOUDFLARE_ACCOUNT_ID &&
    dbResource?.binding==="DB" && dbResource.database_name==="psipedia-sk-db" &&
    /^[a-f0-9-]{36}$/i.test(dbResource.database_id),
    "BREED_PUBLIC_UNEXPECTED_D1_RESOURCE");
  const temp = mkdtempSync(join(tmpdir(),"breed-public-sql-"));
  try {
    const config = join(temp,"wrangler.json");
    writeFileSync(config,JSON.stringify({name:"breed-public-sql-transfer",
      compatibility_date:"2026-11-19",d1_databases:[{
        binding:"DB",database_name:dbResource.database_name,
        database_id:dbResource.database_id,
      }]}));
    const records = wrangler(config,dbResource.database_name,
      ["--command","SELECT id FROM managed_breeds"]);
    const known = new Set(records.map(r=>Number(r.id)));
    must(output.every(r=>known.has(r.breedId)), "BREED_PUBLIC_D1_IDENTITY_MISSING");
    // Every Notion source page must be the exact 344 identity-mapped workcopy
    // page, never just a similarly named page with a copied numeric ID.
    const linked = wrangler(config,dbResource.database_name,
      ["--command","SELECT breed_id,work_notion_page_id FROM breed_notion_workcopy_links"]);
    const byBreed = new Map(linked.map(r=>[Number(r.breed_id),normalize(r.work_notion_page_id)]));
    must(linked.length === 344 &&
      output.every(r=>byBreed.get(r.breedId)===r.notionPageId),
      "BREED_PUBLIC_WORKCOPY_PAGE_IDENTITY_MISMATCH");
    const tables = wrangler(config,dbResource.database_name,
      ["--command","SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'breed_public_%'"]);
    must(TABLES.every(t=>tables.some(r=>r.name===t)), "BREED_PUBLIC_MIGRATION_0173_NOT_DEPLOYED");
    // Batches remain small to respect D1 statement/size limits.
    // Every batch is repeatable after a failed run, never a legacy JSON fallback.
    for (let start=0;start<output.length;start+=6) {
      const group=output.slice(start,start+6);
      const sql=group.flatMap(r=>breedPublicSqlStatements(r.transfer)).join("\n")+"\n";
      const path=join(temp,"batch-"+start+".sql");
      writeFileSync(path,sql,{mode:0o600});
      wrangler(config,dbResource.database_name,["--file",path]);
    }
    const count = wrangler(config,dbResource.database_name,
      ["--command","SELECT COUNT(*) AS count FROM breed_public_profile"])[0]?.count;
    must(Number(count)>=344, "BREED_PUBLIC_D1_READBACK_INCOMPLETE");
    console.log(JSON.stringify({applied:true,profiles:output.length,storedRows:count}));
  } finally { rmSync(temp,{recursive:true,force:true}); }
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
