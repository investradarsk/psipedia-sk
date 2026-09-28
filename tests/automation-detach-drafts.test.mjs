import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { executeAtomicBatch, executeDetachMutationBatch } from "../scripts/automation-detach-drafts.mjs";

const scriptPath = new URL("../scripts/automation-detach-drafts.mjs", import.meta.url);
const source = await fs.readFile(scriptPath, "utf8");
const workflow = await fs.readFile(new URL("../.github/workflows/automation-detach-drafts.yml", import.meta.url), "utf8");
const migration = await fs.readFile(new URL("../drizzle/0091_automation_detach_drafts.sql", import.meta.url), "utf8");

test("detach defaults to read-only preview and apply is explicit", () => {
  assert.match(source, /process\.argv\.includes\("--apply"\)/);
  assert.match(workflow, /default: preview/);
  assert.match(workflow, /DETACH-AUTOMATION-DRAFTS-psipedia-sk-db/);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/);
});

test("production audit explicitly includes applications, running runs, claims and linked clusters", () => {
  assert.match(source, /FROM automation_applications a/);
  assert.match(source, /WHERE r\.status='RUNNING'/);
  assert.match(source, /FROM automation_cluster_canonical_claims c/);
  assert.match(source, /FROM automation_entity_clusters/);
  assert.match(source, /PRAGMA foreign_key_list\('automation_applications'\)/);
});

test("stale run recovery reuses the established failed stale-run semantics", () => {
  assert.match(source, /STALE_RUN_MS = 20 \* 60_000/);
  assert.match(source, /status='FAILED'/);
  assert.match(source, /stale_run_recovered/);
  assert.match(source, /non-stale automation run is still active/);
});

test("historical UPDATE_EXISTING applications detach to receipts without canonical mutation", () => {
  assert.match(source, /row\.application_type === "UPDATE_EXISTING" \? "SKIPPED_DUPLICATE" : "DRAFT_CREATED"/);
  assert.match(source, /canonicalApplicationRowsSnapshot/);
  assert.match(source, /canonical application rows changed during detach/);
  assert.match(source, /DELETE FROM automation_applications WHERE id=/);
  assert.doesNotMatch(source, /UPDATE help_organizations SET|UPDATE managed_events SET|UPDATE directory_profiles SET|UPDATE adoption_dogs SET|UPDATE help_cases SET|UPDATE lost_found_dog_reports SET/);
});

test("historical CREATE_DRAFT detach backfills receipt before removing provenance", () => {
  assert.match(source, /INSERT INTO automation_ingestion_receipts/);
  assert.match(source, /DELETE FROM automation_cluster_canonical_claims/);
  assert.match(source, /UPDATE automation_findings SET canonical_entity_id=NULL,canonical_entity_key=NULL/);
  assert.match(source, /DELETE FROM automation_applications WHERE id=/);
});

test("possible duplicate history moves to canonical-local flags", () => {
  assert.match(source, /INSERT INTO canonical_draft_flags/);
  assert.match(source, /'POSSIBLE_DUPLICATE'/);
  assert.match(migration, /canonical_draft_flags/);
  assert.doesNotMatch(migration, /canonical_draft_flags[\s\S]*(finding_id|cluster_id|source_id|observation_id)/);
});

test("receipt table contains no canonical or transient automation linkage", () => {
  const receipt = migration.match(/CREATE TABLE `automation_ingestion_receipts` \(([\s\S]*?)\n\);/);
  assert.ok(receipt);
  assert.doesNotMatch(receipt[1], /canonical_entity|draft_id|finding_id|cluster_id|observation_id/);
  assert.match(receipt[1], /source_id/);
  assert.match(receipt[1], /entity_type/);
  assert.match(receipt[1], /source_record_id/);
});

test("detach apply preserves canonical rows exactly, including historical organization #108", () => {
  assert.match(source, /canonicalBefore = canonicalSnapshot/);
  assert.match(source, /canonicalAfter = canonicalSnapshot/);
  assert.match(source, /canonicalRowsBefore = canonicalApplicationRowsSnapshot/);
  assert.match(source, /canonicalRowsAfter = canonicalApplicationRowsSnapshot/);
  assert.match(source, /canonical content row counts changed during detach/);
  assert.match(source, /canonical application rows changed during detach/);
});


test("production detach mutations use one supported atomic D1 batch without explicit transaction SQL", () => {
  assert.doesNotMatch(source, /BEGIN\s+TRANSACTION/i);
  assert.doesNotMatch(source, /\bCOMMIT\b/i);
  assert.doesNotMatch(source, /\bSAVEPOINT\b/i);
  assert.match(source, /batch: statements\.map\(\(sql\) => \(\{ sql \}\)\)/);
  assert.match(source, /await executeAtomicBatch\(target, statements, fetchImpl\)/);
});

test("stale run recovery is part of the same atomic detach statement batch", () => {
  const detachStart = source.indexOf("function detachStatements");
  const applyStart = source.indexOf("async function apply");
  const detachBody = source.slice(detachStart, applyStart);
  assert.match(detachBody, /UPDATE automation_runs SET/);
  assert.match(detachBody, /stale_run_recovered/);
  assert.match(detachBody, /INSERT INTO automation_ingestion_receipts/);
  assert.match(detachBody, /DELETE FROM automation_applications/);
  assert.doesNotMatch(source, /function recoverStaleRuns/);
});

test("simulated middle-statement failure rejects the single atomic batch without per-statement fallback", async () => {
  let calls = 0;
  let requestBody = null;
  const fetchImpl = async (_url, init) => {
    calls += 1;
    requestBody = JSON.parse(init.body);
    return {
      ok: true,
      async json() {
        return {
          success: true,
          errors: [],
          result: [
            { success: true },
            { success: false, error: "simulated middle failure" },
            { success: false, error: "rolled back" },
          ],
        };
      },
    };
  };

  await assert.rejects(
    executeAtomicBatch(
      { accountId: "account", databaseId: "database" },
      ["UPDATE a SET x=1", "DELETE FROM b", "UPDATE c SET y=2"],
      fetchImpl,
    ),
    /atomic D1 batch failed/,
  );
  assert.equal(calls, 1);
  assert.deepEqual(requestBody, {
    batch: [
      { sql: "UPDATE a SET x=1" },
      { sql: "DELETE FROM b" },
      { sql: "UPDATE c SET y=2" },
    ],
  });
});

test("zero pending detach statements succeed as a no-op without calling atomic batch", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error("fetch must not be called for empty detach");
  };
  const result = await executeDetachMutationBatch(
    { accountId: "account", databaseId: "database" },
    [],
    fetchImpl,
  );
  assert.deepEqual(result, { noOp: true, batchExecuted: false });
  assert.equal(calls, 0);
});

test("non-empty detach still executes exactly one atomic D1 batch", async () => {
  let calls = 0;
  const fetchImpl = async (_url, init) => {
    calls += 1;
    const body = JSON.parse(init.body);
    assert.deepEqual(body, { batch: [{ sql: "DELETE FROM automation_applications" }] });
    return {
      ok: true,
      async json() {
        return { success: true, errors: [], result: [{ success: true }] };
      },
    };
  };
  const result = await executeDetachMutationBatch(
    { accountId: "account", databaseId: "database" },
    ["DELETE FROM automation_applications"],
    fetchImpl,
  );
  assert.deepEqual(result, { noOp: false, batchExecuted: true });
  assert.equal(calls, 1);
});

test("no-op branch still reaches detach postconditions and preserves snapshots and receipts", () => {
  const helperCall = source.indexOf("const mutation = await executeDetachMutationBatch");
  const applicationsPostcondition = source.indexOf("automation applications remain after detach");
  const canonicalAfter = source.indexOf("const canonicalAfter = canonicalSnapshot");
  const receiptCountAfter = source.indexOf("receiptCountAfter:");
  assert.ok(helperCall >= 0);
  assert.ok(applicationsPostcondition > helperCall);
  assert.ok(canonicalAfter > applicationsPostcondition);
  assert.ok(receiptCountAfter > canonicalAfter);
  assert.match(source, /canonical content row counts changed during detach/);
  assert.match(source, /canonical application rows changed during detach/);
  assert.match(source, /noOp: mutation\.noOp/);
});

test("Automation V1 Finalize can rerun after detach is already complete", () => {
  assert.match(source, /if \(statements\.length === 0\) return \{ noOp: true, batchExecuted: false \}/);
  assert.match(source, /const mutation = await executeDetachMutationBatch\(target, statements, fetchImpl\)/);
});
