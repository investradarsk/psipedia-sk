#!/usr/bin/env node
/**
 * Owner-triggered phase 1: pair precisely 344 verified Notion breed pages.
 * audit: all reads, no data writes.
 * apply: ONE atomic INSERT to the inactive 0159 shadow table, only after
 *        a fresh read-only full Notion/D1 parity + identity verification.
 * Does NOT mutate breed_notion_sync, managed_breeds, Notion, migration ledger,
 * feature flags, per-field receipts for the new work copy, or automations.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { inspectBreed0159Schema } from "../lib/production-d1-0159-guard.mjs";
import { inspectBreedWorkCopy } from "../lib/notion-breed-workcopy-parity.mjs";
import { planBreedWorkcopyIdentity } from "../lib/notion-breed-workcopy-identity-plan.mjs";
import { planBreedWorkcopyShadowRows } from "../lib/notion-breed-workcopy-shadow-plan.mjs";
import { buildAtomicBreedShadowInsert, assertBreedStageStored } from
  "../lib/production-breed-workcopy-stage-plan.mjs";

const database = "psipedia-sk-db";
const expectedAccount = "5ff902d3d80376478b9213b2b8ae8d6e";
const expectedDbId = "8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const dir = resolve(".production-breed-workcopy-stage");
const config = resolve(dir, "wrangler.json");
const sqlFile = resolve(dir, "insert-344.sql");
const report = resolve(dir, "report.json");
const mode = process.argv[2];
const notionVersion = "2025-09-03";
const api = "https://api.notion.com/v1";
const error = code => { throw Error(code); };
const requireThat = (condition, code) => { if (!condition) error(code); };
const uuid = value => String(value ?? "").replaceAll("-", "").toLowerCase();

function configAndAuthorization() {
  requireThat(mode === "audit" || mode === "apply", "BREED_STAGE_MODE_INVALID");
  requireThat(process.env.GITHUB_EVENT_NAME === "workflow_dispatch" &&
    process.env.GITHUB_REF === "refs/heads/main" &&
    process.env.GITHUB_REPOSITORY === "investradarsk/psipedia-sk",
    "BREED_STAGE_PROTECTED_MAIN_DISPATCH_REQUIRED");
  const confirmation = mode === "apply"
    ? "APPLY-BREED-STAGE-344" : "AUDIT-BREED-STAGE-344";
  requireThat(process.env.BREED_STAGE_CONFIRMATION === confirmation,
    "BREED_STAGE_SEPARATE_EXPLICIT_CONFIRMATION_REQUIRED");
  requireThat(Boolean(process.env.CLOUDFLARE_API_TOKEN) &&
    Boolean(process.env.NOTION_API_TOKEN), "BREED_STAGE_PROTECTED_SECRETS_REQUIRED");
  requireThat(process.env.CLOUDFLARE_ACCOUNT_ID === expectedAccount,
    "BREED_STAGE_CLOUDFLARE_ACCOUNT_MISMATCH");
  const resources = JSON.parse(readFileSync("config/cloudflare-resources.json", "utf8"));
  const vars = JSON.parse(readFileSync("wrangler.jsonc", "utf8")).vars;
  requireThat(resources.account_id === expectedAccount &&
    resources.d1?.database_id === expectedDbId &&
    resources.d1?.database_name === database &&
    resources.d1?.binding === "DB", "BREED_STAGE_WRONG_D1");
  requireThat(vars.NOTION_BREED_SYNC_ENABLED === "true" &&
    ["NOTION_BREED_WORKCOPY_SYNC_ENABLED",
      "NOTION_BREED_WORKCOPY_STAGE_ENABLED",
      "NOTION_BREED_WORKCOPY_BASELINE_ENABLED",
      "NOTION_BREED_WORKCOPY_ACTIVATE_ENABLED"]
      .every(key => vars[key] === "false"), "BREED_STAGE_WORKCOPY_FLAGS_ENABLED");
  const source = vars.NOTION_BREEDS_DATA_SOURCE_ID;
  const work = vars.NOTION_BREEDS_WORK_DATA_SOURCE_ID;
  requireThat(uuid(source) === "2054d2772e1b45b5aeb6b1a5dcdf2db2" &&
    uuid(work) === "f460b1e544544a1092003b35106f9e32",
    "BREED_STAGE_NOTION_SOURCE_MISMATCH");
  mkdirSync(dir, { recursive: true });
  writeFileSync(config, JSON.stringify({
    name: "psipedia-breed-workcopy-stage-344",
    compatibility_date: "2026-11-07",
    d1_databases: [{
      binding: "DB", database_name: database, database_id: expectedDbId,
    }],
  }));
  return { source, work };
}
function wrangler(args) {
  const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx",
    ["wrangler", ...args], {
      encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false",
        NO_UPDATE_NOTIFIER: "1" },
  });
  if (result.error) error("BREED_STAGE_WRANGLER_SPAWN_FAILED");
  if (result.status !== 0) error("BREED_STAGE_WRANGLER_FAILED");
  return result.stdout || "";
}
function json(raw) {
  const text = raw.trim();
  try { return JSON.parse(text); } catch { /* Wrangler may add banners. */ }
  for (const from of [text.indexOf("["), text.indexOf("{")]) {
    if (from < 0) continue;
    for (const end of ["]", "}"]) {
      const last = text.lastIndexOf(end);
      if (last > from) {
        try { return JSON.parse(text.slice(from, last + 1)); }
        catch { /* next wrapper */ }
      }
    }
  }
  error("BREED_STAGE_WRANGLER_JSON_INVALID");
}
function query(sql) {
  const raw = json(wrangler(["d1", "execute", database,
    "--remote", "--config", config, "--command", sql, "--json"]));
  const batches = Array.isArray(raw) ? raw : [raw];
  requireThat(batches.length && batches.every(b =>
    b?.success === true && Array.isArray(b.results)),
  "BREED_STAGE_REMOTE_QUERY_FAILED");
  return batches.flatMap(b => b.results);
}
function inspectD1() {
  const canonicalBreeds = query(
    "SELECT id,slug,status,fci_number FROM managed_breeds");
  const productionLinks = query(
    "SELECT breed_id,notion_page_id,content_hash,last_synced_at,notion_last_edited_time FROM breed_notion_sync");
  const table = query(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='breed_notion_workcopy_links'");
  const index = query(
    "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_breed_notion_workcopy_status'");
  const columns = table.length
    ? query("SELECT name,type,pk FROM pragma_table_info('breed_notion_workcopy_links')") : [];
  const indexes = table.length
    ? query("SELECT name FROM pragma_index_list('breed_notion_workcopy_links') WHERE \"unique\"=1") : [];
  const uniques = indexes.map(row => query("SELECT name FROM pragma_index_info('" +
    String(row.name).replaceAll("'", "''") + "')").map(item => item.name));
  const statuses = columns.some(c => c.name === "status")
    ? query("SELECT status, count(*) AS count FROM breed_notion_workcopy_links GROUP BY status") : [];
  const statusIndexColumns = index.length
    ? query("SELECT name FROM pragma_index_info('idx_breed_notion_workcopy_status')").map(row => row.name)
    : [];
  const check = inspectBreed0159Schema({
    canonicalBreeds, productionLinks,
    shadowTablePresent: table.length === 1,
    shadowColumns: columns, shadowUniqueKeys: uniques, shadowStatuses: statuses,
    statusIndexPresent: index.length === 1, statusIndexColumns,
    createSql: table[0]?.sql || "",
  });
  requireThat(check.schemaReady && check.diagnostic.originalLinksReady &&
    check.diagnostic.canonicalCount === 347 &&
    check.diagnostic.extraCanonicalBreeds.length === 3 &&
    [5, 13, 14].every(id =>
      check.diagnostic.extraCanonicalBreeds.some(row => Number(row.id) === id)),
  "BREED_STAGE_0159_SCHEMA_OR_344_OR_EXTRAS_CHANGED");
  const shadowRows = query("SELECT breed_id,original_notion_page_id,work_notion_page_id," +
    "original_data_source_id,work_data_source_id,canonical_slug,fci_number," +
    "original_sync_receipt,original_sync_last_synced_at," +
    "original_notion_last_edited_time,status,work_sync_receipt," +
    "work_last_synced_at,work_notion_last_edited_time,verified_at," +
    "activated_at,rolled_back_at FROM breed_notion_workcopy_links");
  return { canonicalBreeds, productionLinks, shadowRows, diagnostics: check.diagnostic };
}
async function notionPages(sourceId) {
  const all = [], ids = new Set(), cursors = new Set();
  let cursor = null;
  do {
    let data;
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await fetch(api + "/data_sources/" +
        encodeURIComponent(sourceId) + "/query", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.NOTION_API_TOKEN,
          "Notion-Version": notionVersion,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}) }),
      });
      if (response.ok) { data = await response.json(); break; }
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 4)
        error("BREED_STAGE_NOTION_QUERY_FAILED_" + response.status);
      const delay = Math.max(
        Number(response.headers.get("retry-after") || 0) * 1000,
        500 * 2 ** attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    requireThat(data && Array.isArray(data.results),
      "BREED_STAGE_NOTION_RESPONSE_INVALID");
    for (const page of data.results) {
      requireThat(page.id && !ids.has(uuid(page.id)),
        "BREED_STAGE_NOTION_DUPLICATE_PAGE");
      ids.add(uuid(page.id)); all.push(page);
    }
    cursor = data.has_more ? data.next_cursor : null;
    requireThat(!data.has_more || (cursor && !cursors.has(cursor)),
      "BREED_STAGE_NOTION_CURSOR_INVALID");
    if (cursor) cursors.add(cursor);
    requireThat(all.length <= 344, "BREED_STAGE_NOTION_OVER_344");
  } while (cursor);
  return all;
}
async function prepare(sources) {
  const [d1, sourcePages, workPages] = await Promise.all([
    Promise.resolve().then(inspectD1),
    notionPages(sources.source),
    notionPages(sources.work),
  ]);
  const parity = inspectBreedWorkCopy(sourcePages, workPages);
  requireThat(parity.dataParity && parity.stats.comparedCells === 20640 &&
    parity.stats.mismatchedCells === 0 && parity.stats.matchedIds === 344,
    "BREED_STAGE_NOTION_CONTENT_PARITY_FAILED");
  const identity = planBreedWorkcopyIdentity({
    sourcePages, workPages, canonicalBreeds: d1.canonicalBreeds,
    productionLinks: d1.productionLinks,
  });
  requireThat(identity.identityReady && identity.rows.length === 344,
    "BREED_STAGE_NOTION_D1_IDENTITY_FAILED");
  const planned = planBreedWorkcopyShadowRows({
    identityPlan: identity, productionLinks: d1.productionLinks,
    originalDataSourceId: sources.source, workDataSourceId: sources.work,
  });
  return { d1, planned, parity: {
    compared: parity.stats.comparedCells,
    differences: parity.stats.mismatchedCells,
    approvedAdditions: parity.stats.approvedAdditions,
  } };
}
function reportState(data) {
  writeFileSync(report, JSON.stringify({ ...data, cutoverReady: false }, null, 2) + "\n");
  process.stdout.write(JSON.stringify({
    phase: data.phase, success: data.success,
    originalLinks: data.originalLinks, shadowLinks: data.shadowLinks,
    parityCells: data.parityCells, cutoverReady: false,
  }) + "\n");
}
function findBookmark(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.bookmark === "string" && value.bookmark) return value.bookmark;
  for (const item of Object.values(value)) {
    const found = findBookmark(item);
    if (found) return found;
  }
  return null;
}
function bookmark() {
  const data = json(wrangler(["d1", "time-travel", "info", database,
    "--config", config, "--json"]));
  const found = findBookmark(data);
  requireThat(found, "BREED_STAGE_RECOVERY_BOOKMARK_MISSING");
  return found;
}
function assertAlreadyStaged(p) {
  return assertBreedStageStored({
    plannedRows: p.planned, storedRows: p.d1.shadowRows,
    productionLinks: p.d1.productionLinks,
  });
}
async function main() {
  const sources = configAndAuthorization();
  const initial = await prepare(sources);
  const current = initial.d1.shadowRows.length;
  requireThat(current === 0 || current === 344,
    "BREED_STAGE_PARTIALLY_STAGED_MANUAL_REVIEW_REQUIRED");
  if (current === 344) assertAlreadyStaged(initial);
  if (mode === "audit" || current === 344) {
    reportState({ phase: current ? "ALREADY_STAGED" : "AUDIT",
      success: true, originalLinks: 344, shadowLinks: current,
      parityCells: initial.parity.compared,
      approvedAdditions: initial.parity.approvedAdditions,
      applied: false });
    return;
  }

  // Approval is separate from 0159 schema APPLY; refresh BOTH Notion and D1.
  const point = bookmark();
  const fresh = await prepare(sources);
  requireThat(fresh.d1.shadowRows.length === 0,
    "BREED_STAGE_SHADOW_CHANGED_BEFORE_INSERT");
  // Stage rows use the receipts from the active D1 at SQL execution time,
  // so concurrent original 109-field editorial data is never overwritten.
  const sql = buildAtomicBreedShadowInsert(fresh.planned);
  requireThat(sql.startsWith("WITH candidates(") &&
    sql.includes("INSERT INTO breed_notion_workcopy_links") &&
    !/\b(?:UPDATE|DELETE|DROP|ALTER|REPLACE|CREATE)\b/i.test(sql),
    "BREED_STAGE_SQL_NOT_ISOLATED_INSERT");
  writeFileSync(sqlFile, sql + "\n", { mode: 0o600 });
  reportState({ phase: "RECOVERY_POINT", success: false, applied: null,
    originalLinks: 344, shadowLinks: 0,
    parityCells: fresh.parity.compared, recoveryBookmark: point,
    note: "Outcome unknown until postflight; do not automatically restore." });
  try {
    wrangler(["d1", "execute", database, "--remote", "--config", config,
      "--file", sqlFile, "--yes", "--json"]);
  } finally {
    unlinkSync(sqlFile);
  }
  const after = inspectD1();
  // A concurrent active D1 sync may change receipts; in that case report
  // fail-closed and require a fresh audit, never rewrite active rows.
  const verified = assertBreedStageStored({
    plannedRows: fresh.planned, storedRows: after.shadowRows,
    productionLinks: after.productionLinks,
  });
  requireThat(JSON.stringify(after.canonicalBreeds) ===
    JSON.stringify(fresh.d1.canonicalBreeds) &&
    JSON.stringify(after.productionLinks) ===
    JSON.stringify(fresh.d1.productionLinks),
    "BREED_STAGE_PRODUCTION_SNAPSHOT_CHANGED");
  reportState({ phase: "POSTFLIGHT", success: true, applied: true,
    originalLinks: 344, shadowLinks: verified.stagedCount,
    workBaselines: verified.workBaselineCount,
    parityCells: fresh.parity.compared, recoveryBookmark: point,
    note: "SHADOW staging only; old mapping, Notion, flags and baselines unchanged." });
}
main().catch(e => {
  console.error(JSON.stringify({
    phase: "FAILED", code: e instanceof Error ? e.message : "BREED_STAGE_UNKNOWN",
  }));
  process.exitCode = 1;
});
