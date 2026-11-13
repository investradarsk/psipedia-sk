/**
 * Independent one-table-pair bootstrap for FB weekly planning.
 * It intentionally does NOT change d1_migrations and NEVER applies 0158–0165.
 * Future sequential 0166 remains idempotent because the SQL uses IF NOT EXISTS.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, ".production-d1-facebook-0166");
const REPORT = path.join(DIR, "preflight.json");
const CONFIG = path.join(DIR, "wrangler.json");
const FILE = path.join(ROOT, "drizzle/0166_facebook_weekly_template.sql");
const EXPECTED_SHA256 = "f9ff02bec55f814dbb738246ecacaa86c120d00428251c3fbc774f2670ce5dc6";
const LEGACY = "facebook_weekly_plan_marks";
const TABLES = ["facebook_weekly_template", "facebook_weekly_template_marks"];

function requireCondition(ok, message) {
  if (!ok) throw new Error(message);
}
function hash(value) { return createHash("sha256").update(value).digest("hex"); }

function parseWrangler(raw) {
  const trimmed = raw.trim();
  try { return JSON.parse(trimmed); } catch {
    // Wrangler sometimes prints a non-JSON diagnostic before the JSON result.
    const start = [trimmed.indexOf("["), trimmed.indexOf("{")].filter(i => i >= 0).sort((a,b)=>a-b)[0];
    requireCondition(Number.isInteger(start), "Wrangler returned no JSON");
    for (const end of ["]","}"]) {
      const index = trimmed.lastIndexOf(end);
      if (index <= start) continue;
      try { return JSON.parse(trimmed.slice(start,index+1)); } catch { /* next */ }
    }
  }
  throw new Error("Wrangler JSON response could not be parsed");
}

function wrangler(args) {
  const result = spawnSync("npx", ["--no-install", "wrangler", ...args], {
    cwd: ROOT, encoding:"utf8", maxBuffer: 10*1024*1024,
    env: { ...process.env, WRANGLER_SEND_METRICS:"false", NO_UPDATE_NOTIFIER:"1" },
  });
  requireCondition(!result.error && result.status === 0,
    "Protected D1 command failed (" + args.slice(0,3).join(" ") +
    ", exit " + String(result.status) + "). Check protected job logs.");
  return parseWrangler(result.stdout);
}

function flattenRows(output) {
  const blocks = Array.isArray(output) ? output : [output];
  const rows = blocks.flatMap(block => Array.isArray(block?.results) ? block.results
    : Array.isArray(block?.result?.results) ? block.result.results : []);
  requireCondition(blocks.every(block => block?.success !== false),
    "Remote D1 query reported failure");
  return rows;
}

function dbQuery(command) {
  return flattenRows(wrangler(["d1","execute","psipedia-sk-db","--remote",
    "--config",CONFIG,"--command",command,"--json"]));
}

function findBookmark(node) {
  if (!node || typeof node !== "object") return null;
  if (typeof node.bookmark === "string" && node.bookmark) return node.bookmark;
  for (const value of Object.values(node)) {
    const found = findBookmark(value);
    if (found) return found;
  }
  return null;
}

async function prepare() {
  requireCondition(process.env.GITHUB_REF === "refs/heads/main", "Production action must dispatch main");
  requireCondition(Boolean(process.env.CLOUDFLARE_API_TOKEN), "Protected Cloudflare credential required");
  const resources = JSON.parse(await fs.readFile(path.join(ROOT,"config/cloudflare-resources.json"),"utf8"));
  requireCondition(resources?.d1?.database_name === "psipedia-sk-db" &&
    resources.d1.binding === "DB" &&
    resources.d1.database_id === "8f7a0c3e-4d77-4a35-8192-a7bd57147950",
    "Canonical D1 identity changed; refusing rollout");
  requireCondition(process.env.CLOUDFLARE_ACCOUNT_ID === resources.account_id,
    "Cloudflare account differs from canonical resources");
  const sql = await fs.readFile(FILE);
  requireCondition(hash(sql) === EXPECTED_SHA256,
    "0166 SQL bytes differ from approved read-only audit");
  await fs.mkdir(DIR,{recursive:true});
  // An isolated config with NO migrations_dir. This job cannot run migrations apply.
  await fs.writeFile(CONFIG, JSON.stringify({
    name:"psipedia-0166-one-off", compatibility_date:"2026-08-23",
    d1_databases:[{
      binding:"DB", database_name:resources.d1.database_name,
      database_id:resources.d1.database_id,
    }],
  },null,2));
}

function verifyColumns(table, expected) {
  const got = dbQuery("PRAGMA table_info('" + table + "')");
  requireCondition(got.length === expected.length,
    "Unexpected number of columns in " + table);
  for (let i = 0; i < expected.length; i++) {
    const [name,type,notnull,pk] = expected[i];
    const actual = got[i];
    requireCondition(actual && actual.name === name &&
      String(actual.type).toUpperCase() === type &&
      Number(actual.notnull) === notnull && Number(actual.pk) === pk,
      "0166 table schema mismatch in " + table + " column " + name);
  }
}

function readState() {
  const objects = dbQuery("SELECT name,sql FROM sqlite_master WHERE type='table' AND name IN (" +
    "'facebook_weekly_plan_marks','facebook_weekly_template','facebook_weekly_template_marks') ORDER BY name");
  const byName = new Map(objects.map(row => [row.name,row]));
  requireCondition(byName.has(LEGACY), "0157 legacy weekly marks table is absent; abort");
  const seen = TABLES.filter(name => byName.has(name));
  requireCondition(seen.length === 0 || seen.length === 2,
    "Partial 0166 schema detected; manual review required");
  if (seen.length === 2) {
    verifyColumns(TABLES[0],[
      ["id","INTEGER",0,1],["version","INTEGER",1,0],
      ["slots_json","TEXT",1,0],["updated_at","TEXT",1,0],["updated_by","TEXT",1,0],
    ]);
    verifyColumns(TABLES[1],[
      ["slot_date","TEXT",1,1],["slot_id","TEXT",1,2],
      ["marked_at","TEXT",1,0],["marked_by","TEXT",1,0],
    ]);
    const templateSQL = byName.get(TABLES[0]).sql ?? "";
    requireCondition(/CHECK\s*\(\s*id\s*=\s*1\s*\)/i.test(templateSQL) &&
      /CHECK\s*\(\s*version\s*>=\s*1\s*\)/i.test(templateSQL),
      "Missing 0166 singleton/version constraints");
  }
  const history = dbQuery("SELECT id,name,applied_at FROM d1_migrations ORDER BY id");
  requireCondition(history.length > 0, "Canonical D1 migration history is missing");
  requireCondition(history.some(row => row.name === "0157_facebook_weekly_plan_marks.sql"),
    "0157 must be recorded in the D1 migration ledger before standalone 0166");
  return {
    installed:seen.length===2,
    historyHash:hash(JSON.stringify(history)),
    legacySchemaHash:hash(String(byName.get(LEGACY).sql)),
  };
}

async function preflight() {
  await prepare();
  const state = readState();
  const raw = wrangler(["d1","time-travel","info","psipedia-sk-db",
    "--config",CONFIG,"--json"]);
  const recoveryBookmark = findBookmark(raw);
  requireCondition(Boolean(recoveryBookmark), "D1 Time Travel bookmark missing; refusing mutation");
  const report = {
    target:"0166_facebook_weekly_template.sql", sha256:EXPECTED_SHA256,
    database:"psipedia-sk-db", commit:process.env.GITHUB_SHA,
    ...state, recoveryBookmark,
  };
  await fs.writeFile(REPORT,JSON.stringify(report,null,2));
  console.log("0166 protected preflight passed; installed=" + state.installed +
    "; history unchanged and Time Travel recovery point captured");
}

async function loadPreflight() {
  const report=JSON.parse(await fs.readFile(REPORT,"utf8"));
  requireCondition(report.target==="0166_facebook_weekly_template.sql" &&
    report.sha256===EXPECTED_SHA256 && report.database==="psipedia-sk-db" &&
    report.commit===process.env.GITHUB_SHA && Boolean(report.recoveryBookmark),
    "Preflight report does not match this protected run");
  return report;
}

function verifyUnrelatedState(report,state) {
  requireCondition(report.historyHash===state.historyHash,
    "Migration history changed during rollout (0158–0165 must stay untouched)");
  requireCondition(report.legacySchemaHash===state.legacySchemaHash,
    "Legacy 0157 table DDL changed; stop");
}

async function apply() {
  await prepare();
  const report=await loadPreflight();
  const before=readState();
  verifyUnrelatedState(report,before);
  requireCondition(!report.installed && !before.installed,
    "0166 already installed or state changed; no repeat APPLY");
  // Execute the pinned SQL file only. DO NOT use wrangler d1 migrations apply.
  wrangler(["d1","execute","psipedia-sk-db","--remote","--config",CONFIG,
    "--file",FILE,"--yes","--json"]);
  console.log("0166 standalone schema bootstrap executed; canonical migration history not modified");
}

async function verify() {
  await prepare();
  const report=await loadPreflight();
  const after=readState();
  verifyUnrelatedState(report,after);
  requireCondition(after.installed, "0166 tables are not installed");
  // Existing rows may already be present if this is a repeat verification.
  dbQuery("SELECT version,slots_json FROM facebook_weekly_template WHERE id=1");
  dbQuery("SELECT slot_date,slot_id FROM facebook_weekly_template_marks LIMIT 1");
  console.log("0166 verified: both planner tables available; 0157 and migration history preserved");
}

const command=process.argv[2];
if (!["preflight","apply","verify"].includes(command)) {
  throw new Error("Usage: node scripts/production-d1-facebook-0166.mjs <preflight|apply|verify>");
}
if(command==="preflight") await preflight();
if(command==="apply") await apply();
if(command==="verify") await verify();
