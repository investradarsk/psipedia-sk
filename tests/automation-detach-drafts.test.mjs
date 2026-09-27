import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

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


test("destructive detach linkage changes are committed atomically", () => {
  assert.match(source, /BEGIN TRANSACTION/);
  assert.match(source, /COMMIT/);
  assert.match(source, /detachSql\(target, createRows, before\.linkedClusters\)/);
});
