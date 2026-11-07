#!/usr/bin/env node
/**
 * Manual, single-target 0159 rollout.
 * "audit": read-only, no D1 or Notion writes.
 * "apply": exact SQL 0159 only, after independent operator confirmation.
 *
 * Deliberately separate from generic numbered migration history: migration
 * 0158 remains held. This operation only creates an empty SHADOW table/index;
 * it DOES NOT write to d1_migrations, stage records or switch synchronizers.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BREED_0159_TARGET, BREED_0159_TABLE, BREED_0159_INDEX,
  BREED_0159_BLOB_SHA, assertBreed0159Preflight, assertBreed0159Postflight,
} from "../lib/production-d1-0159-guard.mjs";

const database = "psipedia-sk-db";
const reportDir = resolve(".production-d1-0159");
const configPath = resolve(reportDir, "wrangler.json");
const sqlPath = resolve("drizzle", BREED_0159_TARGET);
const command = process.argv[2] || "";
const expectedAccount = "5ff902d3d80376478b9213b2b8ae8d6e";
const expectedDatabaseId = "8f7a0c3e-4d77-4a35-8192-a7bd57147950";

function requireCondition(value, code) {
  if (!value) throw Error(code);
}
function requireOperator(mode) {
  requireCondition(mode === "audit" || mode === "apply", "BREED_0159_MODE_INVALID");
  requireCondition(process.env.GITHUB_EVENT_NAME === "workflow_dispatch",
    "BREED_0159_MANUAL_WORKFLOW_REQUIRED");
  requireCondition(process.env.GITHUB_REPOSITORY === "investradarsk/psipedia-sk",
    "BREED_0159_REPOSITORY_MISMATCH");
  requireCondition(process.env.GITHUB_REF === "refs/heads/main",
    "BREED_0159_MAIN_REQUIRED");
  requireCondition(Boolean(process.env.CLOUDFLARE_API_TOKEN),
    "BREED_0159_PROTECTED_TOKEN_REQUIRED");
  requireCondition(process.env.CLOUDFLARE_ACCOUNT_ID === expectedAccount,
    "BREED_0159_ACCOUNT_MISMATCH");
  const confirmation = process.env.BREED_0159_CONFIRMATION || "";
  const expected = mode === "apply"
    ? "APPLY-0159-psipedia-sk-db"
    : "AUDIT-0159-psipedia-sk-db";
  requireCondition(confirmation === expected,
    "BREED_0159_EXPLICIT_CONFIRMATION_REQUIRED");
}
function verifyPinnedSql() {
  const content = readFileSync(sqlPath);
  const gitBlob = createHash("sha1").update(
    Buffer.concat([Buffer.from("blob " + content.length + "\0"), content]),
  ).digest("hex");
  requireCondition(gitBlob === BREED_0159_BLOB_SHA, "BREED_0159_SQL_CHANGED");
  const plain = content.toString("utf8").replace(/--[^\n]*(?:\n|$)/g, "").trim();
  requireCondition(/^CREATE TABLE IF NOT EXISTS breed_notion_workcopy_links\s*\(/i.test(plain),
    "BREED_0159_SQL_NOT_ADDITIVE_TABLE");
  requireCondition(plain.includes("CREATE INDEX IF NOT EXISTS idx_breed_notion_workcopy_status"),
    "BREED_0159_SQL_MISSING_INDEX");
  // ON DELETE CASCADE belongs to a foreign-key declaration; it is not
  // a DELETE statement. Only the pinned 0159 bytes may reach this point.
  const noForeignKeyClause = plain.replace(/\bON\s+DELETE\s+CASCADE\b/gi, "");
  requireCondition(!/\b(DROP|DELETE|UPDATE|ALTER|INSERT|TRUNCATE|REPLACE)\b/i.test(noForeignKeyClause),
    "BREED_0159_SQL_MUTATION_FORBIDDEN");
  return gitBlob;
}
function setUpConfig() {
  const resources = JSON.parse(readFileSync("config/cloudflare-resources.json", "utf8"));
  requireCondition(resources.account_id === expectedAccount &&
    resources.d1?.database_name === database &&
    resources.d1?.database_id === expectedDatabaseId &&
    resources.d1?.binding === "DB",
    "BREED_0159_RESOURCE_MISMATCH");
  const vars = JSON.parse(readFileSync("wrangler.jsonc", "utf8")).vars;
  requireCondition(vars.NOTION_BREED_SYNC_ENABLED === "true" &&
    vars.NOTION_BREED_WORKCOPY_SYNC_ENABLED === "false" &&
    vars.NOTION_BREED_WORKCOPY_STAGE_ENABLED === "false" &&
    vars.NOTION_BREED_WORKCOPY_BASELINE_ENABLED === "false" &&
    vars.NOTION_BREED_WORKCOPY_ACTIVATE_ENABLED === "false",
    "BREED_0159_SYNC_FLAGS_UNSAFE");
  mkdirSync(reportDir, { recursive:true });
  writeFileSync(configPath, JSON.stringify({
    name: "psipedia-sk-0159-d1-only",
    compatibility_date: "2026-11-07",
    d1_databases: [{
      binding: resources.d1.binding,
      database_name: resources.d1.database_name,
      database_id: resources.d1.database_id,
    }],
  }, null, 2));
}
function runWrangler(args) {
  const binary = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(binary, ["wrangler", ...args], {
    encoding:"utf8", env:{
      ...process.env,
      NO_UPDATE_NOTIFIER:"1", WRANGLER_SEND_METRICS:"false",
    },
  });
  if (result.error) throw result.error;
  requireCondition(result.status === 0, "BREED_0159_WRANGLER_FAILED");
  return result.stdout || "";
}
function jsonPayload(raw) {
  const content = raw.trim();
  try { return JSON.parse(content); }
  catch {
    for (const begin of [content.indexOf("["), content.indexOf("{")]) {
      if (begin < 0) continue;
      for (const close of ["]", "}"]) {
        const end = content.lastIndexOf(close);
        if (end > begin) {
          try { return JSON.parse(content.slice(begin, end+1)); }
          catch { /* other output wrapper */ }
        }
      }
    }
  }
  throw Error("BREED_0159_WRANGLER_JSON_INVALID");
}
function select(sql) {
  const payload = jsonPayload(runWrangler([
    "d1","execute",database,"--remote","--config",configPath,
    "--command",sql,"--json",
  ]));
  const batches = Array.isArray(payload) ? payload : [payload];
  requireCondition(batches.length > 0 &&
    batches.every(batch => batch?.success === true && Array.isArray(batch.results)),
    "BREED_0159_REMOTE_QUERY_FAILED");
  return batches.flatMap(batch => batch.results);
}
function inspect() {
  const canonicalBreeds = select("SELECT id,slug,status FROM managed_breeds");
  const productionLinks = select("SELECT breed_id,notion_page_id FROM breed_notion_sync");
  const table = select("SELECT name,sql FROM sqlite_master WHERE type='table' AND name='breed_notion_workcopy_links'");
  const index = select("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_breed_notion_workcopy_status'");
  const present = table.length === 1;
  const columns = present ? select("SELECT name,type,pk FROM pragma_table_info('breed_notion_workcopy_links')") : [];
  const indexes = present ? select("SELECT name FROM pragma_index_list('breed_notion_workcopy_links') WHERE \"unique\"=1") : [];
  const uniqueKeys = indexes.map(row =>
    select("SELECT name FROM pragma_index_info('" + String(row.name).replaceAll("'", "''") + "')")
      .map(item => item.name));
  const shadowStatuses = present
    ? select("SELECT status,COUNT(*) AS count FROM breed_notion_workcopy_links GROUP BY status")
    : [];
  return {
    canonicalBreeds, productionLinks,
    shadowTablePresent: present,
    shadowColumns: columns, shadowUniqueKeys: uniqueKeys,
    shadowStatuses, statusIndexPresent:index.length===1,
    createSql: table[0]?.sql || "",
  };
}
function findBookmark(data) {
  if (!data || typeof data !== "object") return null;
  if (typeof data.bookmark === "string" && data.bookmark.length) return data.bookmark;
  for (const child of Object.values(data)) {
    const found = findBookmark(child);
    if (found) return found;
  }
  return null;
}
function recoveryBookmark() {
  const json = jsonPayload(runWrangler([
    "d1","time-travel","info",database,"--config",configPath,"--json",
  ]));
  const bookmark = findBookmark(json);
  requireCondition(bookmark, "BREED_0159_RECOVERY_BOOKMARK_MISSING");
  return bookmark;
}
function summary(report) {
  const d = report.diagnostic;
  return {
    canonicalCount:d.canonicalCount,
    originalLinkCount:d.originalLinkCount,
    originalLinksReady:d.originalLinksReady,
    extraCanonicalBreeds:d.extraCanonicalBreeds,
    shadowTablePresent:d.shadowTablePresent,
    shadowSchemaCompatible:d.shadowSchemaCompatible,
    totalShadowLinks:d.totalShadowLinks,
    cutoverReady:false,
  };
}
function record(data) {
  writeFileSync(resolve(reportDir,"report.json"), JSON.stringify(data,null,2) + "\n");
  process.stdout.write(JSON.stringify({
    phase:data.phase,success:data.success,tableInstalled:data.tableInstalled,
    ...data.after,
  }) + "\n");
}
async function main() {
  requireOperator(command);
  const pinnedGitBlob=verifyPinnedSql();
  setUpConfig();
  const first=assertBreed0159Preflight(inspect());
  const before=summary(first);
  if (command === "audit") {
    record({phase:"AUDIT",success:true,tableInstalled:first.alreadyInstalled,
      pinnedGitBlob,before,after:before,applied:false});
    return;
  }
  if (first.alreadyInstalled) {
    record({phase:"ALREADY_INSTALLED",success:true,tableInstalled:true,
      pinnedGitBlob,before,after:before,applied:false});
    return;
  }
  // A valid recovery bookmark is mandatory before any SQL is sent.
  const bookmark=recoveryBookmark();
  // Recheck current remote D1 immediately before the one additive statement.
  const fresh=assertBreed0159Preflight(inspect());
  requireCondition(!fresh.alreadyInstalled,"BREED_0159_RACE_ALREADY_APPLIED");
  runWrangler(["d1","execute",database,"--remote","--config",configPath,
    "--file",sqlPath,"--json"]);
  const post=assertBreed0159Postflight(inspect());
  record({phase:"POSTFLIGHT",success:true,tableInstalled:true,pinnedGitBlob,
    recoveryBookmark:bookmark,before,after:summary(post),applied:true,
    migrationHistoryRecorded:false,
    note:"Schema-only 0159; old migration ledger, data and sync flags unchanged."});
}
main().catch(error=>{
  console.error(JSON.stringify({phase:"FAILED",code:error instanceof Error
    ? error.message : "BREED_0159_UNKNOWN"}));
  process.exitCode=1;
});
