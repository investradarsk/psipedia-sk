import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";

const scriptPath = new URL("../scripts/automation-cleanup-legacy.mjs", import.meta.url);
const mod = await import(scriptPath);
const source = await fs.readFile(scriptPath, "utf8");

test("preview is the default and apply requires an explicit flag", () => {
  assert.match(source, /process\.argv\.includes\("--apply"\)/);
  assert.doesNotMatch(source, /applyRequested\s*=\s*true/);
});

test("canonical and KEEP tables never enter the delete allowlist", () => {
  mod.assertStaticSafety();
  for (const table of [...mod.CANONICAL_TABLES, ...mod.KEEP_TABLES, ...mod.UNCERTAIN_TABLES]) {
    assert.equal(mod.DELETE_TABLE_ORDER.includes(table), false, table);
  }
});

test("no discovery runtime state is reset implicitly", () => {
  assert.deepEqual(mod.RESET_ONLY_FIELDS, []);
});

test("critical persistent state is preserved", () => {
  for (const table of [
    "automation_sources",
    "automation_discovery_roots",
    "automation_search_usage",
    "automation_governance_reviews",
    "automation_governance_review_history",
    "automation_entity_match_decisions",
    "automation_canonical_apply_operations",
  ]) assert.ok(mod.KEEP_TABLES.includes(table), table);
});

test("FK-safe child-first cleanup order is explicit", () => {
  const idx = (name) => mod.DELETE_TABLE_ORDER.indexOf(name);
  assert.ok(idx("automation_source_candidate_evidence") < idx("automation_source_candidates"));
  assert.ok(idx("automation_cluster_findings") < idx("automation_findings"));
  assert.ok(idx("automation_cluster_observations") < idx("automation_observations"));
  assert.ok(idx("automation_observations") < idx("automation_runs"));
  assert.ok(idx("automation_source_candidates") < idx("automation_entity_clusters"));
});

test("cluster canonical claims are explicitly uncertain and never deleted", () => {
  assert.deepEqual(mod.UNCERTAIN_TABLES, ["automation_cluster_canonical_claims"]);
  assert.equal(mod.DELETE_TABLE_ORDER.includes("automation_cluster_canonical_claims"), false);
});

test("manual match memory, canonical provenance and duplicate warnings block destructive apply", () => {
  assert.match(source, /manualMatchDecisions/);
  assert.match(source, /canonicalApplyOperations/);
  assert.match(source, /canonicalClusterClaims/);
  assert.match(source, /canonicalLinkedClusters/);
  assert.match(source, /duplicateDraftWarnings/);
  assert.match(source, /cleanup blocked/);
});

test("apply uses one explicit transaction for the hardcoded cleanup list", () => {
  assert.match(source, /BEGIN TRANSACTION/);
  assert.match(source, /COMMIT/);
  assert.match(source, /cleanupSql\(existingDeleteTables/);
});

test("no wildcard or dynamic discovered-table delete exists", () => {
  assert.doesNotMatch(source, /DELETE FROM\s+<|DELETE FROM\s+automation_%|sqlite_master[\s\S]{0,300}DELETE FROM/i);
  assert.match(source, /DELETE FROM editorial_notifications WHERE resource_type='automation_finding'/);
});
