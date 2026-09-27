import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";

const scriptPath = new URL("../scripts/automation-cleanup-legacy.mjs", import.meta.url);
const mod = await import(scriptPath);
const source = await fs.readFile(scriptPath, "utf8");
const workflow = await fs.readFile(new URL("../.github/workflows/automation-finalize-v1.yml", import.meta.url), "utf8");
const { executeAtomicBatch } = await import(new URL("../scripts/automation-detach-drafts.mjs", import.meta.url));

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
    "automation_ingestion_receipts",
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

test("canonical claims and automation applications are explicitly uncertain and never deleted blindly", () => {
  assert.deepEqual(mod.UNCERTAIN_TABLES, ["automation_cluster_canonical_claims", "automation_applications"]);
  assert.equal(mod.DELETE_TABLE_ORDER.includes("automation_cluster_canonical_claims"), false);
  assert.equal(mod.DELETE_TABLE_ORDER.includes("automation_applications"), false);
});

test("manual match memory, canonical provenance and automation applications block destructive apply", () => {
  assert.match(source, /manualMatchDecisions/);
  assert.match(source, /canonicalApplyOperations/);
  assert.match(source, /canonicalClusterClaims/);
  assert.match(source, /canonicalLinkedClusters/);
  assert.match(source, /automationApplications/);
  assert.match(source, /createDraftApplications/);
  assert.match(source, /updateExistingApplications/);
  assert.match(source, /cleanup blocked/);
});

test("cleanup fail-closes canonical-linked draft findings and legacy applications", () => {
  assert.match(source, /linkedNewDuplicateFindings/);
  assert.match(source, /automationApplications/);
  assert.match(source, /updateExistingApplications/);
  assert.match(source, /applyAllowed: Object\.values\(blockers\)\.every/);
});

test("cleanup apply uses one supported atomic D1 batch without explicit transaction SQL", () => {
  assert.doesNotMatch(source, /BEGIN\s+TRANSACTION/i);
  assert.doesNotMatch(source, /\bCOMMIT\b/i);
  assert.doesNotMatch(source, /\bSAVEPOINT\b/i);
  assert.match(source, /executeAtomicBatch/);
  assert.match(source, /await executeAtomicBatch\(target, statements, fetchImpl\)/);
  assert.match(source, /cleanupStatements\(existingDeleteTables/);
  assert.match(source, /import \{ executeAtomicBatch \} from "\.\/automation-detach-drafts\.mjs"/);
});

test("cleanup mutation order remains editorial notification then FK-safe DELETE_TABLE_ORDER", () => {
  const statements = mod.cleanupStatements(["child_table", "parent_table"], true);
  assert.deepEqual(statements, [
    "DELETE FROM editorial_notifications WHERE resource_type='automation_finding'",
    'DELETE FROM "child_table"',
    'DELETE FROM "parent_table"',
  ]);
});

test("simulated middle-statement batch failure has no per-statement fallback", async () => {
  let calls = 0;
  let body = null;
  const fetchImpl = async (_url, init) => {
    calls += 1;
    body = JSON.parse(init.body);
    return {
      ok: true,
      async json() {
        return {
          success: true,
          errors: [],
          result: [
            { success: true },
            { success: false, error: "simulated cleanup failure" },
            { success: false, error: "rolled back" },
          ],
        };
      },
    };
  };

  await assert.rejects(
    executeAtomicBatch(
      { accountId: "account", databaseId: "database" },
      ["DELETE FROM a", "DELETE FROM b", "DELETE FROM c"],
      fetchImpl,
    ),
    /atomic D1 batch failed/,
  );
  assert.equal(calls, 1);
  assert.deepEqual(body, {
    batch: [
      { sql: "DELETE FROM a" },
      { sql: "DELETE FROM b" },
      { sql: "DELETE FROM c" },
    ],
  });
});

test("no wildcard or dynamic discovered-table delete exists", () => {
  assert.doesNotMatch(source, /DELETE FROM\s+<|DELETE FROM\s+automation_%|sqlite_master[\s\S]{0,300}DELETE FROM/i);
  assert.match(source, /DELETE FROM editorial_notifications WHERE resource_type='automation_finding'/);
});


test("cleanup preserves detached receipts and canonical-local draft flags", () => {
  assert.ok(mod.KEEP_TABLES.includes("automation_ingestion_receipts"));
  assert.ok(mod.CANONICAL_TABLES.includes("canonical_draft_flags"));
  assert.equal(mod.DELETE_TABLE_ORDER.includes("automation_ingestion_receipts"), false);
  assert.equal(mod.DELETE_TABLE_ORDER.includes("canonical_draft_flags"), false);
});

test("cleanup preserves canonical publication lifecycle and final automation invariants", () => {
  assert.match(source, /canonicalLifecycleSnapshot/);
  assert.match(source, /canonical publication\/lifecycle state changed/);
  assert.match(source, /automation_applications remain after cleanup/);
  assert.match(source, /automation_cluster_canonical_claims remain after cleanup/);
});

test("Automation V1 Finalize workflow contract remains unchanged", () => {
  assert.match(workflow, /name: Automation V1 Finalize/);
  assert.match(workflow, /FINALIZE-AUTOMATION-V1-psipedia-sk-db/);
  assert.match(workflow, /DETACH preview/);
  assert.match(workflow, /DETACH apply/);
  assert.match(workflow, /LEGACY CLEANUP preview/);
  assert.match(workflow, /LEGACY CLEANUP apply/);
  assert.match(workflow, /Final postconditions/);
  assert.ok(workflow.indexOf("DETACH apply") < workflow.indexOf("LEGACY CLEANUP preview"));
  assert.ok(workflow.indexOf("LEGACY CLEANUP preview") < workflow.indexOf("LEGACY CLEANUP apply"));
});

test("KEEP tables and canonical lifecycle protections remain unchanged", () => {
  for (const table of [
    "automation_sources",
    "automation_discovery_roots",
    "automation_search_usage",
    "automation_governance_reviews",
    "automation_governance_review_history",
    "automation_ingestion_receipts",
  ]) assert.ok(mod.KEEP_TABLES.includes(table), table);
  assert.match(source, /canonicalLifecycleSnapshot/);
  assert.match(source, /canonical publication\/lifecycle state changed/);
});
