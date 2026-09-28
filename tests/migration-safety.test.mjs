import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  loadMigrationSafetyState,
  validateMigrationSafety,
} from "../scripts/check-migration-safety.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDirectory, "..");

function clone(value) {
  return structuredClone(value);
}

function baselineSqlFiles(state) {
  return state.migrationFileNames.filter(
    (fileName) => Number(fileName.slice(0, 4)) <= state.baseline.sql.highestIndexAtMig0,
  );
}

test("current MIG-0 hybrid baseline is explicitly allowed", async () => {
  const state = await loadMigrationSafetyState(repoRoot);
  const result = validateMigrationSafety(state);
  assert.deepEqual(result.errors, []);
  assert.ok(result.summary.highestSqlIndex >= state.baseline.sql.highestIndexAtMig0);
  assert.equal(result.summary.journalLastIndex, state.baseline.journal.frozenLastIndex);
  assert.equal(result.summary.highestSnapshotIndex, state.baseline.snapshots.frozenHighestIndex);
});

test("duplicate migration index is rejected", async () => {
  const state = await loadMigrationSafetyState(repoRoot);
  const result = validateMigrationSafety({
    ...state,
    migrationFileNames: [...baselineSqlFiles(state), "0039_duplicate_index.sql"],
  });
  assert.match(result.errors.join("\n"), /Duplicate migration index 0039/);
});

test("invalid migration filename is rejected", async () => {
  const state = await loadMigrationSafetyState(repoRoot);
  const result = validateMigrationSafety({
    ...state,
    migrationFileNames: [...baselineSqlFiles(state), "0040-invalid-name.sql"],
  });
  assert.match(result.errors.join("\n"), /Invalid migration filename: 0040-invalid-name\.sql/);
});

test("gap in the required contiguous SQL sequence is rejected", async () => {
  const state = await loadMigrationSafetyState(repoRoot);
  const result = validateMigrationSafety({
    ...state,
    migrationFileNames: baselineSqlFiles(state).filter((fileName) => !fileName.startsWith("0038_")),
  });
  assert.match(result.errors.join("\n"), /Missing migration index 0038/);
});

test("reviewed SQL append after the MIG-0 baseline is allowed while journal stays frozen", async () => {
  const state = await loadMigrationSafetyState(repoRoot);
  const result = validateMigrationSafety({
    ...state,
    migrationFileNames: [...baselineSqlFiles(state), "0040_reviewed_manual_append.sql"],
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.highestSqlIndex, 40);
  assert.equal(result.summary.journalLastIndex, 23);
});

test("unexpected Drizzle journal advance is rejected", async () => {
  const state = await loadMigrationSafetyState(repoRoot);
  const journal = clone(state.journal);
  journal.entries.push({
    idx: 24,
    version: "6",
    when: 0,
    tag: "0024_breed_data_audit_repairs",
    breakpoints: true,
  });
  const result = validateMigrationSafety({ ...state, journal });
  assert.match(result.errors.join("\n"), /Drizzle journal moved from frozen MIG-0 index 0023 to 0024/);
});

test("unexpected Drizzle snapshot advance is rejected", async () => {
  const state = await loadMigrationSafetyState(repoRoot);
  const result = validateMigrationSafety({
    ...state,
    snapshotFileNames: [...state.snapshotFileNames, "0024_snapshot.json"],
  });
  assert.match(result.errors.join("\n"), /Drizzle snapshots moved from frozen MIG-0 index 0023 to 0024/);
});

test("db:generate points only to the fail-fast blocker and blocker performs no generation", async () => {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
  assert.equal(packageJson.scripts["db:generate"], "node scripts/block-db-generate.mjs");
  assert.doesNotMatch(packageJson.scripts["db:generate"], /drizzle-kit\s+generate/);

  const blockerPath = path.join(repoRoot, "scripts", "block-db-generate.mjs");
  const run = spawnSync(process.execPath, [blockerPath], { encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /intentionally blocked by MIG-0/);
  assert.match(run.stderr, /No migration generation was run/);
  assert.match(run.stderr, /docs\/MIGRATION-SAFETY-SK\.md/);
});
