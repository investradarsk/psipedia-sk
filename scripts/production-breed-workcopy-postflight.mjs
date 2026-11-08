#!/usr/bin/env node
/**
 * STEP 3 - owner-dispatched, strictly read-only live Notion + D1 postflight.
 * Never execute INSERT/UPDATE/PATCH/DELETE, switch sources or flip flags.
 * The report contains aggregate counts and short lists of breed IDs only.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BREED_NOTION_PRIORITY_FIELDS } from "../lib/notion-breed-property-registry.ts";
import { auditBreedBaselinePostflight } from
  "../lib/production-breed-workcopy-postflight.mjs";

const reportDir = resolve(".production-breed-workcopy-postflight");
const config = resolve(reportDir, "wrangler.json");
const reportFile = resolve(reportDir, "report.json");
const database = "psipedia-sk-db";
const account = "5ff902d3d80376478b9213b2b8ae8d6e";
const databaseId = "8f7a0c3e-4d77-4a35-8192-a7bd57147950";
const api = "https://api.notion.com/v1";
const version = "2025-09-03";
const fail = code => { throw Error(code); };
const ensure = (ok, code) => { if (!ok) fail(code); };
const uuid = value => String(value ?? "").replaceAll("-", "").toLowerCase();

function readOnlyPreflight() {
  ensure(process.env.GITHUB_REPOSITORY === "investradarsk/psipedia-sk" &&
    process.env.GITHUB_EVENT_NAME === "workflow_dispatch" &&
    process.env.GITHUB_REF === "refs/heads/main" &&
    process.env.BREED_POSTFLIGHT_CONFIRMATION === "AUDIT-BREED-BASELINES-344",
  "BREED_POSTFLIGHT_MANUAL_MAIN_CONFIRMATION_REQUIRED");
  ensure(process.env.CLOUDFLARE_API_TOKEN &&
    process.env.BREED_POSTFLIGHT_NOTION_TOKEN &&
    process.env.CLOUDFLARE_ACCOUNT_ID === account,
  "BREED_POSTFLIGHT_AUTHORIZATION_INVALID");
  const c = JSON.parse(readFileSync("config/cloudflare-resources.json", "utf8"));
  ensure(c.account_id === account && c.d1?.database_id === databaseId &&
    c.d1?.database_name === database && c.d1?.binding === "DB",
  "BREED_POSTFLIGHT_D1_DESTINATION_INVALID");
  const vars = JSON.parse(readFileSync("wrangler.jsonc", "utf8")).vars;
  ensure(vars.NOTION_BREED_SYNC_ENABLED === "true" &&
    vars.NOTION_BREED_WORKCOPY_SYNC_ENABLED === "false" &&
    vars.NOTION_BREED_WORKCOPY_STAGE_ENABLED === "false" &&
    vars.NOTION_BREED_WORKCOPY_BASELINE_ENABLED === "false" &&
    vars.NOTION_BREED_WORKCOPY_ACTIVATE_ENABLED === "false",
  "BREED_POSTFLIGHT_UNEXPECTED_PRODUCTION_FLAGS");
  ensure(uuid(vars.NOTION_BREEDS_DATA_SOURCE_ID) ===
    "2054d2772e1b45b5aeb6b1a5dcdf2db2" &&
    uuid(vars.NOTION_BREEDS_WORK_DATA_SOURCE_ID) ===
    "f460b1e544544a1092003b35106f9e32",
  "BREED_POSTFLIGHT_WRONG_NOTION_DATABASES");
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(config, JSON.stringify({
    name: "psipedia-breed-workcopy-postflight-readonly",
    compatibility_date: "2026-11-07",
    d1_databases: [{
      binding: "DB", database_name: database, database_id: databaseId,
    }],
  }));
  return {
    originalSource: vars.NOTION_BREEDS_DATA_SOURCE_ID,
    workSource: vars.NOTION_BREEDS_WORK_DATA_SOURCE_ID,
  };
}
function wrangler(args) {
  const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx",
    ["wrangler", ...args], {
      encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false",
        NO_UPDATE_NOTIFIER: "1" },
  });
  if (result.error || result.status !== 0)
    fail("BREED_POSTFLIGHT_REMOTE_READ_FAILED");
  return result.stdout ?? "";
}
function readWranglerJson(raw) {
  const clean = raw.trim();
  try { return JSON.parse(clean); } catch {}
  for (const start of [clean.indexOf("["), clean.indexOf("{")]) {
    if (start < 0) continue;
    for (const endChar of ["]", "}"]) {
      const end = clean.lastIndexOf(endChar);
      if (end > start) {
        try { return JSON.parse(clean.slice(start, end + 1)); }
        catch {}
      }
    }
  }
  fail("BREED_POSTFLIGHT_WRANGLER_JSON_INVALID");
}
function select(sql) {
  ensure(/^SELECT\s+/i.test(sql.trim()) &&
    !/\b(?:UPDATE|INSERT|DELETE|ALTER|DROP|CREATE|REPLACE|PRAGMA|ATTACH|DETACH)\b/i.test(sql),
  "BREED_POSTFLIGHT_NON_READONLY_SQL");
  const response = readWranglerJson(wrangler([
    "d1", "execute", database, "--remote",
    "--config", config, "--command", sql, "--json",
  ]));
  const batches = Array.isArray(response) ? response : [response];
  ensure(batches.length > 0 && batches.every(x =>
    x.success === true && Array.isArray(x.results)),
  "BREED_POSTFLIGHT_INVALID_REMOTE_REPLY");
  return batches.flatMap(x => x.results);
}
function readD1() {
  const canonicalBreeds = select("SELECT id,slug,status,fci_number FROM managed_breeds");
  const productionLinks = select(
    "SELECT breed_id,notion_page_id,content_hash,last_synced_at FROM breed_notion_sync");
  const shadowRows = select(
    "SELECT breed_id,original_notion_page_id,work_notion_page_id," +
    "original_data_source_id,work_data_source_id,canonical_slug,fci_number," +
    "original_sync_receipt,original_sync_last_synced_at," +
    "work_sync_receipt,work_notion_last_edited_time,work_last_error_code," +
    "status,verified_at,activated_at,rolled_back_at " +
    "FROM breed_notion_workcopy_links");
  return { canonicalBreeds, productionLinks, shadowRows };
}
async function pages(sourceId) {
  const all = [], cursorSet = new Set(), ids = new Set();
  let cursor = null;
  do {
    let data;
    for (let retry = 0; retry < 5; retry++) {
      const response = await fetch(api + "/data_sources/" +
        encodeURIComponent(sourceId) + "/query", {
        method: "POST", // Notion's QUERY operation is read-only.
        headers: {
          Authorization: "Bearer " + process.env.BREED_POSTFLIGHT_NOTION_TOKEN,
          "Notion-Version": version, "Content-Type": "application/json",
        },
        body: JSON.stringify({ page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}) }),
      });
      if (response.ok) { data = await response.json(); break; }
      if (![429, 500, 502, 503, 504].includes(response.status) || retry === 4)
        fail("BREED_POSTFLIGHT_NOTION_QUERY_" + response.status);
      const delay = Math.max(Number(response.headers.get("retry-after") ?? 0) * 1000,
        500 * 2 ** retry);
      await new Promise(r => setTimeout(r, delay));
    }
    ensure(data && Array.isArray(data.results),
      "BREED_POSTFLIGHT_NOTION_RESPONSE_INVALID");
    for (const page of data.results) {
      ensure(page.id && !ids.has(uuid(page.id)),
        "BREED_POSTFLIGHT_DUPLICATE_NOTION_PAGE");
      ids.add(uuid(page.id));
      all.push(page);
    }
    cursor = data.has_more ? data.next_cursor : null;
    ensure(!data.has_more || (cursor && !cursorSet.has(cursor)),
      "BREED_POSTFLIGHT_BAD_NOTION_CURSOR");
    if (cursor) cursorSet.add(cursor);
    ensure(all.length <= 344, "BREED_POSTFLIGHT_MORE_THAN_344_NOTION");
  } while (cursor);
  return all;
}
function publish(result) {
  const sanitized = { ...result, checkedAt: new Date().toISOString() };
  writeFileSync(reportFile, JSON.stringify(sanitized, null, 2) + "\n");
  process.stdout.write(JSON.stringify({
    phase: sanitized.phase, success: sanitized.success,
    counters: sanitized.counters, errors: sanitized.errors,
    readyForSeparateCutoverReview: sanitized.readyForSeparateCutoverReview,
    cutoverReady: false,
  }) + "\n");
}
async function main() {
  const sources = readOnlyPreflight();
  const [d1, originalPages, workPages] = await Promise.all([
    Promise.resolve().then(readD1),
    pages(sources.originalSource), pages(sources.workSource),
  ]);
  const requiredFields = BREED_NOTION_PRIORITY_FIELDS
    .filter(field => field.mode === "content").map(field => field.id);
  const result = auditBreedBaselinePostflight({
    ...d1, originalPages, workPages, requiredFields,
    originalSource: sources.originalSource, workSource: sources.workSource,
  });
  publish(result);
  if (!result.success) fail("BREED_POSTFLIGHT_INTEGRITY_REVIEW_REQUIRED");
}
main().catch(error => {
  const code = error instanceof Error ? error.message : "BREED_POSTFLIGHT_UNKNOWN";
  if (!process.exitCode) publish({
    phase: "FAILED", success: false, code, cutoverReady: false,
  });
  process.exitCode = 1;
});
