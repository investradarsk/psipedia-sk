#!/usr/bin/env node
/**
 * Owner-dispatched, SELECT-only production Directory 0170 inventory.
 * No D1 writes, Notion requests, backfill proposals or raw field values in reports.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DATABASE = "psipedia-sk-db";
const DB_ID = "8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const ACCOUNT = "5ff902d3d80376478b9213b2b8ae8d6e";
const DIR = resolve(ROOT, ".directory-0170-backfill-audit");
const REPORT = resolve(DIR, "report.json");
const CONFIG = resolve(DIR, "wrangler.json");
const PAGE_SIZE = 75;
const SAMPLE_LIMIT = 12;
const CATEGORIES = [
  "veterinari", "treneri", "kynologicke-kluby", "chovatelske-kluby",
  "chovatelske-stanice", "salony-a-sluzby", "hotely-a-opatrovanie",
  "vencenie", "fyzioterapia", "dalsie-sluzby",
];
const categorySet = new Set(CATEGORIES);
const CONTACTS = {
  website_url: ["Web", "Webstránka"],
  public_phone: ["Telefón", "Telefon", "phone"],
  public_email: ["E-mail", "Email", "email"],
  facebook_url: ["Facebook"],
  instagram_url: ["Instagram"],
};
const FILTER_NAMES = {
  veterinari: ["facility_type", "emergency", "home_visits"],
  treneri: ["individual_training", "group_training"],
  "kynologicke-kluby": ["trial_preparation", "group_training"],
  "chovatelske-kluby": ["breeding_advice", "member_events"],
  "chovatelske-stanice": ["visits_by_appointment", "health_testing_information"],
  "salony-a-sluzby": ["nail_trimming", "hand_stripping"],
  "hotely-a-opatrovanie": ["overnight_stays", "daycare"],
  vencenie: ["individual_walks", "group_walks"],
  fyzioterapia: ["hydrotherapy", "home_visits"],
  "dalsie-sluzby": ["pet_transport", "equipment_rental"],
};
const FACT_LABELS = {
  veterinari: ["Špecializácie", "Hospitalizácia", "RTG", "USG", "Laboratórium"],
  treneri: ["Výcvik šteniat", "Behaviorálne poradenstvo"],
  "kynologicke-kluby": ["Typ klubu", "Zameranie", "Výcvik šteniat", "Športová kynológia", "Obrany", "Stopy", "Agility", "Rally obedience", "Retriever / poľovnícka kynológia"],
  "chovatelske-kluby": [],
  "chovatelske-stanice": ["Chovateľ", "Aktívny chov", "Aktuálne vrhy", "Plánované vrhy"],
  "salony-a-sluzby": [],
  "hotely-a-opatrovanie": ["Hotel", "Opatrovanie", "Denná starostlivosť", "Vyzdvihnutie psa"],
  vencenie: ["Venčenie s tréningom", "Šteňatá", "Veľké psy", "Seniori / špeciálne potreby", "Vyzdvihnutie psa", "GPS / foto report", "Typ poskytovateľa"],
  fyzioterapia: [],
  "dalsie-sluzby": ["Typ služby", "Pokrytie", "Výjazd ku klientovi", "Celoslovenská dostupnosť", "Orientačná cena"],
};
const text = v => v == null ? "" : String(v);
const present = v => text(v).trim().length > 0;
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function parseObject(value) {
  try { const obj = JSON.parse(value); return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : null; }
  catch { return null; }
}
function parseArray(value) {
  try { const arr = JSON.parse(value); return Array.isArray(arr) ? arr : null; }
  catch { return null; }
}
function normalizeFilter(id, value) {
  const v = text(value).trim().toLocaleLowerCase("sk");
  if (!v) return null;
  if (id === "veterinari.facility_type") {
    return ["ambulance","clinic","hospital","unknown"].includes(v) ? v : "INVALID";
  }
  const aliases = { "áno":"yes", "ano":"yes", "nie":"no", "neznáme":"unknown", "nezname":"unknown" };
  const normalized = aliases[v] ?? v;
  return ["yes","no","unknown"].includes(normalized) ? normalized : "INVALID";
}

/** Pure, read-only classifier. Does NOT infer a last-write-wins winner. */
export function classifyDirectory0170Row(row) {
  const issues = new Set();
  const issue = (group, code) => issues.add(group + ":" + code);
  const source = parseObject(row.source_data_json);
  const category = row.category;
  const validCategory = categorySet.has(category);
  const reviewed = Boolean(source && present(source._psipedia_profile_review_reviewed_at));
  if (!source) issue("source", "invalid_json");
  if (!validCategory) issue("source", "unknown_primary_category");
  if (row.status === "archived") issue("lifecycle", "archived_no_backfill");
  if (reviewed) issue("lifecycle", "reviewed_no_automatic_backfill");
  if (source) {
    for (const [sql, aliases] of Object.entries(CONTACTS)) {
      const available = aliases.filter(key => own(source,key) && present(source[key]));
      if (available.length > 1 &&
          new Set(available.map(key => text(source[key]))).size > 1) {
        issue("contact", sql + "_alias_conflict");
      }
      const canonical = aliases[0];
      if (own(source,canonical) && !present(source[canonical]) && available.length) {
        issue("contact", sql + "_cleared_legacy_alias_present");
      }
      // An explicitly blank first alias must not conceal a populated second
      // alias. Report it as a potential resurrection risk; never promote it.
      const legacy = available.length ? text(source[available[0]]) : "";
      const value = row[sql];
      if (value == null && present(legacy)) issue("contact", sql + "_legacy_only_unverified");
      else if (value != null && value === "" && present(legacy))
        issue("contact", sql + "_explicit_clear_vs_legacy");
      else if (value != null && present(value) && present(legacy) && text(value) !== legacy)
        issue("contact", sql + "_different");
      else if (sql !== "website_url" && value != null && present(value) && !present(legacy))
        // website_url predates 0170 and is already a legitimate SQL owner;
        // not having obsolete JSON aliases is not a migration problem.
        issue("contact", sql + "_sql_only");
    }
  }
  const categories = parseArray(row.sql_categories);
  const facts = parseArray(row.sql_facts);
  const filters = parseArray(row.sql_filters);
  if (!categories || !facts || !filters) issue("source","invalid_relation_aggregate");
  // Facts and select filters may belong to a SECONDARY membership as well.
  // Use both legacy and SQL membership when auditing; never silently treat
  // a legitimate second-category value as an unregistered SQL field.
  const memberships = new Set(validCategory ? [category] : []);
  if (categories) for (const name of categories) {
    if (categorySet.has(name)) memberships.add(name);
  }
  if (source && typeof source._psipedia_additional_categories === "string") {
    const oldMemberships = parseArray(source._psipedia_additional_categories);
    if (oldMemberships) for (const name of oldMemberships) {
      if (categorySet.has(name)) memberships.add(name);
    }
  }
  if (source && categories) {
    const key = "_psipedia_additional_categories";
    let old = [];
    if (own(source,key)) {
      const parsed = typeof source[key] === "string" ? parseArray(source[key]) : null;
      if (!parsed || parsed.some(x => typeof x !== "string" || !categorySet.has(x) || x === category)) {
        issue("category","invalid_secondary_json");
      } else old = [...new Set(parsed)];
    }
    const current = categories.filter(x => typeof x === "string");
    if (current.length !== categories.length || current.some(x => !categorySet.has(x) || x === category)) {
      issue("category","invalid_sql_membership");
    }
    for (const x of old) if (!current.includes(x)) issue("category","legacy_only_unverified");
    for (const x of current) if (!old.includes(x)) issue("category","sql_only");
  }
  if (source && facts && validCategory) {
    const allowed = [...new Set([...memberships].flatMap(cat =>
      ["Ordinačné hodiny", "Pokrytie", ...(FACT_LABELS[cat] || [])]))];
    const sql = new Map(facts.map(x => [x?.field_key, x?.value_text]));
    for (const key of allowed) {
      const old = source[key];
      const newer = sql.get(key);
      if (present(old) && newer === undefined) issue("fact","legacy_only_unverified");
      else if (present(old) && newer === "") issue("fact","explicit_clear_vs_legacy");
      else if (present(old) && present(newer) && text(old) !== text(newer)) issue("fact","different");
      else if (!present(old) && present(newer)) issue("fact","sql_only");
    }
    for (const fact of facts) if (!allowed.includes(fact?.field_key)) issue("fact","unapproved_sql_key");
  }
  if (source && filters && validCategory) {
    const definitions = [...memberships].flatMap(cat => (FILTER_NAMES[cat] || []).map(name => ({
      id: cat+"."+name, category:cat,
      key: "_psipedia_filter_v1_"+cat.replace(/-/g,"_")+"_"+name,
    })));
    const sql = new Map(filters.map(x => [x?.filter_id,x]));
    for (const def of definitions) {
      const old = normalizeFilter(def.id, source[def.key]);
      const found = sql.get(def.id);
      const newer = found ? normalizeFilter(def.id, found.value_text) : null;
      if (old === "INVALID") issue("filter","invalid_legacy_value");
      if (newer === "INVALID") issue("filter","invalid_sql_value");
      if (found && found.category !== def.category) issue("filter","category_mismatch");
      if (!found && old && old !== "INVALID") issue("filter","legacy_only_unverified");
      else if (found && old && newer && old !== newer) issue("filter","different");
      else if (found && !old && newer) issue("filter","sql_only");
    }
    if (filters.some(x => !definitions.some(def => def.id === x?.filter_id))) issue("filter","unknown_sql_id");
  }
  return {
    category: validCategory ? category : "unknown",
    mappedToNotion: Number(row.notion_mapped) === 1,
    reviewed,
    issues: [...issues].sort(),
  };
}
export function aggregateDirectory0170Rows(rows) {
  const out = { scanned:0, byCategory:{}, issues:{}, sampleProfileIds:{} };
  for (const row of rows) {
    const id = Number(row.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw Error("DIRECTORY_AUDIT_INVALID_PROFILE_ID");
    const item = classifyDirectory0170Row(row);
    out.scanned++;
    const cat = out.byCategory[item.category] ??= { profiles:0, notionMapped:0, reviewed:0, profilesWithIssues:0 };
    cat.profiles++;
    if (item.mappedToNotion) cat.notionMapped++;
    if (item.reviewed) cat.reviewed++;
    if (item.issues.length) cat.profilesWithIssues++;
    for (const key of item.issues) {
      out.issues[key] = (out.issues[key] ?? 0) + 1;
      const ids = out.sampleProfileIds[key] ??= [];
      if (ids.length < SAMPLE_LIMIT) ids.push(id);
    }
  }
  return out;
}
function must(value, code) { if (!value) throw Error("DIRECTORY_AUDIT_" + code); }
function authorize() {
  must(process.env.GITHUB_EVENT_NAME === "workflow_dispatch", "MANUAL_ONLY");
  must(process.env.GITHUB_REF === "refs/heads/main", "MAIN_ONLY");
  must(process.env.GITHUB_REPOSITORY === "investradarsk/psipedia-sk", "REPOSITORY");
  must(process.env.DIRECTORY_0170_BACKFILL_CONFIRMATION === "AUDIT-0170-BACKFILL-psipedia-sk-db", "CONFIRMATION");
  must(Boolean(process.env.CLOUDFLARE_API_TOKEN), "PRODUCTION_TOKEN");
  const config = JSON.parse(readFileSync(resolve(ROOT,"config/cloudflare-resources.json"), "utf8"));
  must(config.account_id === ACCOUNT && config.d1?.database_name === DATABASE &&
    config.d1?.database_id === DB_ID && config.d1?.binding === "DB", "TARGET");
  must(process.env.CLOUDFLARE_ACCOUNT_ID === ACCOUNT, "ACCOUNT");
  mkdirSync(DIR,{recursive:true});
  writeFileSync(CONFIG, JSON.stringify({
    name:"directory-0170-backfill-select-only",
    compatibility_date:"2026-11-18",
    d1_databases:[{binding:"DB",database_name:DATABASE,database_id:DB_ID}],
  }));
}
function select(sql) {
  must(/^SELECT\s/i.test(sql) && !sql.includes(";") &&
    !/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE|ATTACH|VACUUM|PRAGMA)\b/i.test(sql),
    "SELECT_ONLY");
  const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx",
    ["--no-install","wrangler","d1","execute",DATABASE,"--remote","--config",CONFIG,
      "--command",sql,"--json"],{
      cwd:ROOT, encoding:"utf8", maxBuffer:12*1024*1024,
      env:{...process.env,WRANGLER_SEND_METRICS:"false",NO_UPDATE_NOTIFIER:"1"},
    });
  // stderr can contain private Cloudflare diagnostics: never echo it.
  must(!result.error && result.status === 0, "REMOTE_SELECT_FAILED");
  let parsed;
  try { parsed = JSON.parse(result.stdout); }
  catch { throw Error("DIRECTORY_AUDIT_INVALID_WRANGLER_JSON"); }
  const batches = Array.isArray(parsed) ? parsed : [parsed];
  must(batches.length > 0 && batches.every(x => x?.success !== false && Array.isArray(x?.results)), "REMOTE_SELECT_FAILED");
  return batches.flatMap(x => x.results);
}
function state() {
  const tables = select("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('directory_profiles','directory_notion_sync','directory_profile_additional_categories','directory_profile_public_facts','directory_profile_filter_values')");
  must(tables.length === 5, "MISSING_SCHEMA");
  const columns = select("SELECT name FROM pragma_table_info('directory_profiles') WHERE name IN ('website_url','public_phone','public_email','facebook_url','instagram_url','source_data_json')");
  must(columns.length === 6,"MISSING_COLUMNS");
  const row = select("SELECT COUNT(*) AS profiles,COALESCE(MAX(id),0) AS max_id,COALESCE(SUM(id),0) AS id_sum,COALESCE(SUM(length(source_data_json)),0) AS json_chars,COALESCE(MAX(updated_at),'') AS latest_update FROM directory_profiles")[0];
  must(row && Object.values({profiles:row.profiles,max_id:row.max_id,id_sum:row.id_sum,json_chars:row.json_chars}).every(x=>Number.isSafeInteger(Number(x))),"INVALID_BASELINE");
  return row;
}
const profileSelect = cursor => "SELECT p.id,p.category,p.status,p.source_data_json,p.website_url,p.public_phone,p.public_email,p.facebook_url,p.instagram_url,"+
  "(SELECT json_group_array(category) FROM directory_profile_additional_categories WHERE profile_id=p.id) AS sql_categories,"+
  "(SELECT json_group_array(json_object('field_key',field_key,'value_text',value_text)) FROM directory_profile_public_facts WHERE profile_id=p.id) AS sql_facts,"+
  "(SELECT json_group_array(json_object('category',category,'filter_id',filter_id,'value_text',value_text)) FROM directory_profile_filter_values WHERE profile_id=p.id) AS sql_filters,"+
  "CASE WHEN EXISTS(SELECT 1 FROM directory_notion_sync WHERE directory_profile_id=p.id) THEN 1 ELSE 0 END AS notion_mapped "+
  "FROM directory_profiles p WHERE p.id>"+cursor+" ORDER BY p.id LIMIT "+PAGE_SIZE;
function run() {
  authorize();
  const before = state();
  const byCategory={},issues={},sampleProfileIds={};
  let cursor=0,scanned=0;
  while (true) {
    const rows = select(profileSelect(cursor));
    must(rows.length<=PAGE_SIZE, "PAGE_OVERFLOW");
    if (!rows.length) break;
    for (const row of rows) {
      must(Number.isSafeInteger(row.id) && row.id>cursor,"UNSORTED_PAGE");
      cursor=row.id;
    }
    const part = aggregateDirectory0170Rows(rows);
    scanned+=part.scanned;
    for(const [key,val] of Object.entries(part.byCategory)){
      const current=byCategory[key]??={profiles:0,notionMapped:0,reviewed:0,profilesWithIssues:0};
      for(const k of Object.keys(current)) current[k]+=val[k];
    }
    for(const [key,val] of Object.entries(part.issues)){
      issues[key]=(issues[key]??0)+val;
      const list=sampleProfileIds[key]??=[];
      for(const id of part.sampleProfileIds[key]||[]) if(list.length<SAMPLE_LIMIT) list.push(id);
    }
    if(rows.length<PAGE_SIZE)break;
  }
  const after=state();
  const keys=["profiles","max_id","id_sum","json_chars","latest_update"];
  const stable=keys.every(k=>String(before[k])===String(after[k])) &&
    scanned===Number(before.profiles) && cursor===Number(before.max_id);
  const report={
    phase:"READ_ONLY_BACKFILL_AUDIT", database:DATABASE, sourceCommit:process.env.GITHUB_SHA,
    readOnly:true, rawValuesIncluded:false, notionLiveVerified:false,
    perFieldLastWriteWinnerVerified:false, transferApproved:false,
    snapshot:"best_effort_live_keyset_scan", stableAggregates:stable,
    scanned, baselineProfiles:Number(before.profiles), endProfiles:Number(after.profiles),
    byCategory,issues,sampleProfileIds,
    nextStep:"review evidence and timestamps per field; this audit never approves backfill",
  };
  writeFileSync(REPORT,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({
    phase:report.phase,readOnly:true,scanned,baselineProfiles:report.baselineProfiles,
    endProfiles:report.endProfiles,stableAggregates:stable,
    issuesByType:issues,notionLiveVerified:false,transferApproved:false,
  }));
  must(stable,"CONCURRENT_DATABASE_CHANGE_RESCAN_REQUIRED");
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {run();}
  catch (e) {
    const code=e instanceof Error?e.message:"DIRECTORY_AUDIT_UNKNOWN";
    console.error(JSON.stringify({phase:"FAILED",code:code.startsWith("DIRECTORY_AUDIT_")?code:"DIRECTORY_AUDIT_FAILED"}));
    process.exitCode=1;
  }
}
