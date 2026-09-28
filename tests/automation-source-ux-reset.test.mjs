import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const scriptUrl = new URL("../scripts/automation-source-ux-reset.mjs", import.meta.url);
const workflowUrl = new URL("../.github/workflows/automation-source-ux-reset.yml", import.meta.url);
const mod = await import(scriptUrl);
const source = await fs.readFile(scriptUrl, "utf8");
const workflow = await fs.readFile(workflowUrl, "utf8");

test("reset defaults to preview and apply requires the exact confirmation", () => {
  assert.match(source, /process\.argv\.includes\("--apply"\)/);
  assert.equal(mod.APPLY_CONFIRMATION, "RESET AUTOMATION DATA");
  assert.match(source, /AUTOMATION_RESET_CONFIRMATION === APPLY_CONFIRMATION/);
  assert.match(workflow, /default: preview/);
  assert.match(workflow, /RESET AUTOMATION DATA/);
});

test("reset allowlist is automation-only and excludes canonical tables", () => {
  mod.assertStaticSafety();
  for (const table of mod.CANONICAL_SAFETY_TABLES) assert.equal(mod.DELETE_TABLE_ORDER.includes(table), false, table);
  assert.ok(mod.DELETE_TABLE_ORDER.includes("automation_sources"));
  assert.ok(mod.DELETE_TABLE_ORDER.includes("automation_ingestion_receipts"));
  assert.ok(mod.DELETE_TABLE_ORDER.includes("automation_source_candidates"));
  assert.ok(mod.DELETE_TABLE_ORDER.includes("automation_applications"));
});

test("FK-sensitive reset order is child-first", () => {
  const index = (table) => mod.DELETE_TABLE_ORDER.indexOf(table);
  assert.ok(index("automation_canonical_apply_operations") < index("automation_entity_match_decisions"));
  assert.ok(index("automation_applications") < index("automation_findings"));
  assert.ok(index("automation_cluster_findings") < index("automation_findings"));
  assert.ok(index("automation_observations") < index("automation_sources"));
  assert.ok(index("automation_ingestion_receipts") < index("automation_sources"));
});

test("root presets are preserved but all operational state is cleared", () => {
  assert.equal(mod.DELETE_TABLE_ORDER.includes("automation_discovery_roots"), false);
  assert.match(mod.ROOT_RESET_STATEMENT, /enabled=0/);
  assert.match(mod.ROOT_RESET_STATEMENT, /review_status='PENDING'/);
  assert.match(mod.ROOT_RESET_STATEMENT, /next_check_at=NULL/);
  assert.match(mod.ROOT_RESET_STATEMENT, /last_checked_at=NULL/);
});

test("mutation batch is explicit and includes no canonical delete", () => {
  const statements = mod.resetStatements(["automation_runs", "automation_sources"], true, true);
  assert.deepEqual(statements.slice(0, 3), [
    "DELETE FROM editorial_notifications WHERE resource_type='automation_finding'",
    'DELETE FROM "automation_runs"',
    'DELETE FROM "automation_sources"',
  ]);
  assert.equal(statements.at(-1), mod.ROOT_RESET_STATEMENT);
  assert.equal(statements.some((statement) => /DELETE FROM .*managed_events|directory_profiles|adoption_dogs|help_cases/i.test(statement)), false);
});

test("workflow is production-controlled and never runs automatically", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\bpush:/);
  assert.doesNotMatch(workflow, /\bschedule:/);
  assert.match(workflow, /Require dispatched revision to still be current main/);
  assert.match(workflow, /Production preview/);
  assert.match(workflow, /if: inputs\.mode == 'apply'/);
});
