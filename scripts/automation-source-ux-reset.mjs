import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { executeAtomicBatch } from "./automation-detach-drafts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const APPLY_CONFIRMATION = "RESET AUTOMATION DATA";

export const CANONICAL_SAFETY_TABLES = Object.freeze([
  "managed_events",
  "directory_profiles",
  "adoption_dogs",
  "help_organizations",
  "help_cases",
  "lost_found_dog_reports",
  "users",
  "partner_accounts",
  "profile_reviews",
  "geo_points",
  "canonical_draft_flags",
  "canonical_external_provenance",
]);

export const PRESERVED_AUDIT_TABLES = Object.freeze([
  "automation_governance_review_history",
  "automation_governance_reviews",
  "automation_update_field_reviews",
]);

export const PRESERVED_STATE_TABLES = Object.freeze([
  "automation_record_suppressions",
]);

// Explicit child-first allowlist. Discovery-root rows are reusable code-level
// configuration, so reset clears their operational state instead of deleting them.
export const DELETE_TABLE_ORDER = Object.freeze([
  "automation_address_review_cases",
  "automation_update_suggestions",
  "automation_canonical_apply_operations",
  "automation_entity_match_decisions",
  "automation_source_provider_usage",
  "automation_search_usage",
  "automation_source_candidate_evidence",
  "automation_cluster_canonical_claims",
  "automation_applications",
  "automation_cluster_findings",
  "automation_field_conflicts",
  "automation_field_evidence",
  "automation_entity_candidate_keys",
  "automation_cluster_match_candidates",
  "automation_cluster_observations",
  "automation_cluster_source_records",
  "automation_findings",
  "automation_observations",
  "automation_runs",
  "automation_discovery_outcomes",
  "automation_discovery_runs",
  "automation_source_candidates",
  "automation_entity_clusters",
  "automation_source_authority",
  "automation_ingestion_receipts",
  "automation_sources",
]);

export const DIRECT_REFRESH_RESET_STATEMENT = `UPDATE automation_direct_refresh_settings SET
  enabled=0,
  cursor_entity_id=0,
  next_check_at=NULL,
  last_checked_at=NULL,
  last_success_at=NULL,
  last_error_at=NULL,
  last_error_code=NULL,
  updated_at=datetime('now')`;

export const ROOT_RESET_STATEMENT = `UPDATE automation_discovery_roots SET
  enabled=0,
  review_status='PENDING',
  next_check_at=NULL,
  last_checked_at=NULL,
  last_success_at=NULL,
  last_error_at=NULL,
  last_error_code=NULL,
  reviewed_at=NULL,
  reviewed_by=NULL,
  review_notes=NULL,
  updated_at=datetime('now')`;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function runWrangler(args, { capture = false } = {}) {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(npx, ["wrangler", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", NO_UPDATE_NOTIFIER: "1" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "wrangler failed").trim());
  if (!capture) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  return result.stdout || "";
}

function parseRows(output) {
  const text = output.trim();
  if (!text) return [];
  const payload = JSON.parse(text);
  const batches = Array.isArray(payload) ? payload : [payload];
  return batches.flatMap((batch) => Array.isArray(batch?.results) ? batch.results : []);
}

async function loadProductionTarget() {
  invariant(process.env.CLOUDFLARE_API_TOKEN, "CLOUDFLARE_API_TOKEN is required");
  const resources = JSON.parse(await fs.readFile(path.join(repoRoot, "config/cloudflare-resources.json"), "utf8"));
  const generated = JSON.parse(await fs.readFile(path.join(repoRoot, "dist/server/wrangler.json"), "utf8"));
  invariant(resources?.d1?.database_name && resources?.d1?.database_id && resources?.account_id, "canonical D1 target is incomplete");
  invariant(process.env.CLOUDFLARE_ACCOUNT_ID === resources.account_id, "Cloudflare account mismatch");
  const binding = (generated.d1_databases || []).find((item) => item.binding === resources.d1.binding);
  invariant(binding?.database_name === resources.d1.database_name, "generated D1 name mismatch");
  invariant(binding?.database_id === resources.d1.database_id, "generated D1 id mismatch");
  return {
    accountId: resources.account_id,
    databaseId: resources.d1.database_id,
    databaseName: resources.d1.database_name,
    configPath: path.join(repoRoot, "dist/server/wrangler.json"),
  };
}

function execute(target, sql) {
  return parseRows(runWrangler([
    "d1", "execute", target.databaseName, "--remote", "--config", target.configPath,
    "--command", sql, "--json",
  ], { capture: true }));
}

function scalar(target, sql) {
  return Number(execute(target, sql)[0]?.count ?? 0);
}

function tableExists(target, table) {
  const safe = table.replace(/'/g, "''");
  return scalar(target, `SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='${safe}'`) === 1;
}

function countTable(target, table) {
  return tableExists(target, table) ? scalar(target, `SELECT COUNT(*) AS count FROM "${table}"`) : null;
}

function countsFor(target, tables) {
  return Object.fromEntries(tables.map((table) => [table, countTable(target, table)]));
}

function canonicalSnapshot(target) {
  return countsFor(target, CANONICAL_SAFETY_TABLES);
}

export function assertStaticSafety() {
  const canonical = new Set(CANONICAL_SAFETY_TABLES);
  for (const table of DELETE_TABLE_ORDER) {
    invariant(table.startsWith("automation_"), `non-automation table in delete allowlist: ${table}`);
    invariant(!canonical.has(table), `canonical table in delete allowlist: ${table}`);
  }
  invariant(!DELETE_TABLE_ORDER.includes("automation_discovery_roots"), "discovery root presets must be reset, not deleted");
  invariant(!DELETE_TABLE_ORDER.includes("automation_direct_refresh_settings"), "direct refresh presets must be reset, not deleted");
  invariant(!DELETE_TABLE_ORDER.includes("canonical_draft_flags"), "canonical-local draft flags must be preserved");
  invariant(!DELETE_TABLE_ORDER.includes("canonical_external_provenance"), "canonical provenance must be preserved");
  for (const table of PRESERVED_AUDIT_TABLES) {
    invariant(table.startsWith("automation_"), `non-automation table in preserved audit allowlist: ${table}`);
    invariant(!DELETE_TABLE_ORDER.includes(table), `preserved audit table in delete allowlist: ${table}`);
  }
  for (const table of PRESERVED_STATE_TABLES) {
    invariant(table.startsWith("automation_"), `non-automation table in preserved state allowlist: ${table}`);
    invariant(!DELETE_TABLE_ORDER.includes(table), `preserved state table in delete allowlist: ${table}`);
  }
}

export function resetStatements(
  existingTables,
  hasEditorialNotifications,
  hasDiscoveryRoots,
  hasDirectRefreshSettings = false,
) {
  const statements = [];
  if (hasEditorialNotifications) statements.push("DELETE FROM editorial_notifications WHERE resource_type='automation_finding'");
  for (const table of existingTables) statements.push(`DELETE FROM "${table}"`);
  if (hasDirectRefreshSettings) statements.push(DIRECT_REFRESH_RESET_STATEMENT);
  if (hasDiscoveryRoots) statements.push(ROOT_RESET_STATEMENT);
  return statements;
}

export function preview(target) {
  assertStaticSafety();
  const deleteCounts = countsFor(target, DELETE_TABLE_ORDER);
  const preservedAuditCounts = countsFor(target, PRESERVED_AUDIT_TABLES);
  const preservedStateCounts = countsFor(target, PRESERVED_STATE_TABLES);
  const canonicalSafetyCounts = canonicalSnapshot(target);
  const discoveryRoots = countTable(target, "automation_discovery_roots");
  const editorialAutomationFinding = tableExists(target, "editorial_notifications")
    ? scalar(target, "SELECT COUNT(*) AS count FROM editorial_notifications WHERE resource_type='automation_finding'")
    : 0;
  const blockers = {
    runningSourceRuns: tableExists(target, "automation_runs")
      ? scalar(target, "SELECT COUNT(*) AS count FROM automation_runs WHERE status='RUNNING'") : 0,
    runningDiscoveryRuns: tableExists(target, "automation_discovery_runs")
      ? scalar(target, "SELECT COUNT(*) AS count FROM automation_discovery_runs WHERE completed_at IS NULL") : 0,
  };
  return {
    mode: "preview",
    strictReadOnly: true,
    deleteCounts,
    preservedAuditCounts,
    preservedStateCounts,
    resetCounts: {
      automation_discovery_roots: discoveryRoots,
      automation_direct_refresh_settings: countTable(target, "automation_direct_refresh_settings"),
      editorialAutomationFinding,
    },
    canonicalSafetyCounts,
    canonicalDeleteTargets: [],
    blockers,
    applyAllowed: Object.values(blockers).every((count) => count === 0),
  };
}

export async function apply(target, before, fetchImpl = fetch) {
  invariant(process.env.AUTOMATION_RESET_CONFIRMATION === APPLY_CONFIRMATION, "exact apply confirmation is required");
  invariant(before.applyAllowed, `reset blocked: ${JSON.stringify(before.blockers)}`);
  const canonicalBefore = before.canonicalSafetyCounts;
  const preservedAuditBefore = before.preservedAuditCounts;
  const preservedStateBefore = before.preservedStateCounts;
  const existingTables = DELETE_TABLE_ORDER.filter((table) => tableExists(target, table));
  const statements = resetStatements(
    existingTables,
    tableExists(target, "editorial_notifications"),
    tableExists(target, "automation_discovery_roots"),
    tableExists(target, "automation_direct_refresh_settings"),
  );
  invariant(statements.length > 0, "reset produced no statements");
  await executeAtomicBatch(target, statements, fetchImpl);

  const remaining = countsFor(target, DELETE_TABLE_ORDER);
  for (const [table, count] of Object.entries(remaining)) {
    if (count !== null) invariant(count === 0, `${table} is not empty after reset`);
  }
  const canonicalAfter = canonicalSnapshot(target);
  invariant(JSON.stringify(canonicalAfter) === JSON.stringify(canonicalBefore), "canonical safety counts changed");
  const preservedAuditAfter = countsFor(target, PRESERVED_AUDIT_TABLES);
  invariant(JSON.stringify(preservedAuditAfter) === JSON.stringify(preservedAuditBefore), "preserved governance audit counts changed");
  const preservedStateAfter = countsFor(target, PRESERVED_STATE_TABLES);
  invariant(JSON.stringify(preservedStateAfter) === JSON.stringify(preservedStateBefore), "preserved suppression state counts changed");
  if (tableExists(target, "automation_direct_refresh_settings")) {
    invariant(scalar(target, "SELECT COUNT(*) AS count FROM automation_direct_refresh_settings WHERE enabled<>0 OR cursor_entity_id<>0 OR next_check_at IS NOT NULL OR last_checked_at IS NOT NULL OR last_success_at IS NOT NULL OR last_error_at IS NOT NULL OR last_error_code IS NOT NULL") === 0,
      "direct refresh operational state remains after reset");
  }
  if (tableExists(target, "automation_discovery_roots")) {
    invariant(scalar(target, "SELECT COUNT(*) AS count FROM automation_discovery_roots WHERE enabled<>0 OR review_status<>'PENDING' OR next_check_at IS NOT NULL OR last_checked_at IS NOT NULL") === 0,
      "discovery operational state remains after reset");
  }
  return {
    mode: "apply",
    deleted: before.deleteCounts,
    preservedAuditBefore,
    preservedAuditAfter,
    preservedStateBefore,
    preservedStateAfter,
    canonicalBefore,
    canonicalAfter,
    remaining,
  };
}

async function main() {
  const applyRequested = process.argv.includes("--apply");
  const unknown = process.argv.slice(2).filter((arg) => !["--preview", "--apply"].includes(arg));
  invariant(unknown.length === 0, `unknown arguments: ${unknown.join(", ")}`);
  const target = await loadProductionTarget();
  const before = preview(target);
  console.log(JSON.stringify(before, null, 2));
  if (!applyRequested) return;
  console.log(JSON.stringify(await apply(target, before), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
