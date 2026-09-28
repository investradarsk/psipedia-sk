import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const scriptUrl = new URL("../scripts/automation-source-ux-reset.mjs", import.meta.url);
const workflowUrl = new URL("../.github/workflows/automation-source-ux-reset.yml", import.meta.url);
const drizzleUrl = new URL("../drizzle/", import.meta.url);
const governanceMigrationUrl = new URL("../drizzle/0084_automation_governance_registry.sql", import.meta.url);
const sourceFoundationMigrationUrl = new URL("../drizzle/0050_data_automation_foundation.sql", import.meta.url);
const discoveryMigrationUrl = new URL("../drizzle/0056_scheduled_source_discovery.sql", import.meta.url);
const mod = await import(scriptUrl);
const source = await fs.readFile(scriptUrl, "utf8");
const workflow = await fs.readFile(workflowUrl, "utf8");
const governanceMigration = await fs.readFile(governanceMigrationUrl, "utf8");
const sourceFoundationMigration = await fs.readFile(sourceFoundationMigrationUrl, "utf8");
const discoveryMigration = await fs.readFile(discoveryMigrationUrl, "utf8");

async function automationSchemaSql() {
  const files = (await fs.readdir(drizzleUrl))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const sql = await Promise.all(files.map((name) => fs.readFile(new URL(name, drizzleUrl), "utf8")));
  return sql.join("\n");
}

function parseAutomationSchema(sql) {
  const tables = [];
  const foreignKeys = [];
  const deleteTriggers = [];
  const tablePattern = /CREATE TABLE(?: IF NOT EXISTS)?\s+[`"]?([a-zA-Z0-9_]+)[`"]?\s*\(([\s\S]*?)\);/gi;
  for (const match of sql.matchAll(tablePattern)) {
    const child = match[1];
    tables.push(child);
    const referencePattern = /REFERENCES\s+[`"]?([a-zA-Z0-9_]+)[`"]?\s*\([^)]*\)\s*(?:ON DELETE\s+(CASCADE|SET NULL|RESTRICT|NO ACTION))?/gi;
    for (const reference of match[2].matchAll(referencePattern)) {
      foreignKeys.push({ child, parent: reference[1], onDelete: reference[2] ?? "NO ACTION" });
    }
  }
  const triggerPattern = /CREATE TRIGGER(?: IF NOT EXISTS)?\s+[`"]?([a-zA-Z0-9_]+)[`"]?([\s\S]*?)END;/gi;
  for (const match of sql.matchAll(triggerPattern)) {
    const deleteMatch = match[2].match(/\b(BEFORE|AFTER)\s+DELETE\s+ON\s+[`"]?([a-zA-Z0-9_]+)[`"]?/i);
    if (deleteMatch) deleteTriggers.push({ name: match[1], timing: deleteMatch[1].toUpperCase(), table: deleteMatch[2] });
  }
  return { tables, foreignKeys, deleteTriggers };
}

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


test("immutable governance audit tables are preserved and never mutated by reset", () => {
  assert.deepEqual(mod.PRESERVED_AUDIT_TABLES, [
    "automation_governance_review_history",
    "automation_governance_reviews",
  ]);
  for (const table of mod.PRESERVED_AUDIT_TABLES) assert.equal(mod.DELETE_TABLE_ORDER.includes(table), false, table);
  assert.match(governanceMigration, /automation_governance_review_history_no_delete/);
  assert.match(governanceMigration, /BEFORE DELETE ON `automation_governance_review_history`/);
  assert.doesNotMatch(source, /DROP\s+TRIGGER|PRAGMA\s+foreign_keys\s*=\s*OFF/i);
  assert.doesNotMatch(source, /DELETE\s+FROM\s+[`"]?automation_governance_(?:review_history|reviews)/i);
  assert.match(source, /preservedAuditCounts/);
  assert.match(source, /preserved governance audit counts changed/);
});

test("all inbound automation FKs and delete triggers are safe for the destructive scope", async () => {
  const schema = parseAutomationSchema(await automationSchemaSql());
  const index = new Map(mod.DELETE_TABLE_ORDER.map((table, position) => [table, position]));

  for (const fk of schema.foreignKeys) {
    if (!index.has(fk.parent)) continue;
    assert.ok(index.has(fk.child), `${fk.child} references delete target ${fk.parent} but is outside destructive scope`);
    if (fk.child !== fk.parent) {
      assert.ok(
        index.get(fk.child) < index.get(fk.parent),
        `${fk.child} must be deleted before ${fk.parent} (${fk.onDelete})`,
      );
    }
  }

  const blockingTriggers = schema.deleteTriggers.filter(
    (trigger) => trigger.timing === "BEFORE" && index.has(trigger.table),
  );
  assert.deepEqual(blockingTriggers, []);
});


test("preserved governance rows cannot structurally block source recreation or root reset", () => {
  assert.match(sourceFoundationMigration, /CREATE TABLE `automation_sources`[\s\S]*?`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL/);
  assert.match(discoveryMigration, /CREATE TABLE `automation_discovery_roots`[\s\S]*?`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL/);
  assert.doesNotMatch(governanceMigration, /REFERENCES\s+`?automation_(?:sources|discovery_roots)`?/i);
  assert.match(governanceMigration, /UNIQUE INDEX `automation_governance_reviews_subject_unique`[\s\S]*?(`subject_type`,`subject_id`)/);
  assert.equal(mod.DELETE_TABLE_ORDER.includes("automation_discovery_roots"), false);
});


test("every automation table is explicitly deleted or intentionally preserved", async () => {
  const schema = parseAutomationSchema(await automationSchemaSql());
  const covered = new Set([
    ...mod.DELETE_TABLE_ORDER,
    ...mod.PRESERVED_AUDIT_TABLES,
    "automation_discovery_roots",
  ]);
  const uncovered = [...new Set(schema.tables.filter((table) => table.startsWith("automation_")))]
    .filter((table) => !covered.has(table))
    .sort();
  assert.deepEqual(uncovered, []);
});
