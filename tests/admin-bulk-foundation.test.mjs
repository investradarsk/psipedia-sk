import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BulkPreflightError,
  materializeBulkSelection,
  parseBulkPreflightRequest,
  revalidateMaterializedSelection,
  summarizeBulkSelection,
} from "../lib/admin-bulk/core.ts";

const publishEligibility = (record) => {
  if (record.status === "draft") return { eligible: true };
  if (record.status === "published") return { eligible: false, reason: "already-target-state" };
  return { eligible: false, reason: "invalid-lifecycle" };
};

test("explicit selection accepts one or multiple valid IDs and deduplicates", () => {
  assert.deepEqual(
    parseBulkPreflightRequest({
      module: "directory",
      action: "publish",
      selection: { mode: "explicit", ids: [12], filter: { status: "draft" } },
    }).selection.ids,
    [12],
  );
  assert.deepEqual(
    parseBulkPreflightRequest({
      module: "directory",
      action: "publish",
      selection: { mode: "explicit", ids: [12, 13, 12], filter: {} },
    }).selection.ids,
    [12, 13],
  );
});

test("invalid module, action and selection ID are rejected before any database work", () => {
  for (const payload of [
    { module: "events", action: "publish", selection: { mode: "explicit", ids: [1] } },
    { module: "directory", action: "delete", selection: { mode: "explicit", ids: [1] } },
    { module: "directory", action: "publish", selection: { mode: "explicit", ids: [0] } },
  ]) {
    assert.throws(() => parseBulkPreflightRequest(payload), BulkPreflightError);
  }
});

test("materialization reports eligible and categorized skipped records", () => {
  const items = materializeBulkSelection(
    ["1", "2", "3"],
    [
      { id: "1", status: "draft", updatedAt: "v1" },
      { id: "2", status: "published", updatedAt: "v2" },
    ],
    publishEligibility,
  );
  assert.deepEqual(summarizeBulkSelection(items), {
    matched: 3,
    eligible: 1,
    wouldBeSkipped: 2,
    skips: [
      { reason: "already-target-state", count: 1 },
      { reason: "record-no-longer-exists", count: 1 },
    ],
  });
});

test("materialized all-matching membership does not grow when a later matching record appears", () => {
  const resolvedAtSnapshot = Array.from({ length: 61 }, (_, index) => ({
    id: String(index + 1),
    status: "draft",
    updatedAt: `v${index + 1}`,
  }));
  const items = materializeBulkSelection(
    resolvedAtSnapshot.map((record) => record.id),
    resolvedAtSnapshot,
    publishEligibility,
  );
  resolvedAtSnapshot.push({ id: "62", status: "draft", updatedAt: "v62" });
  assert.equal(items.length, 61);
  assert.equal(summarizeBulkSelection(items).matched, 61);
});

test("record changed after snapshot is no longer eligible during revalidation", () => {
  const captured = materializeBulkSelection(
    ["1", "2"],
    [
      { id: "1", status: "draft", updatedAt: "v1" },
      { id: "2", status: "draft", updatedAt: "v1" },
    ],
    publishEligibility,
  );
  const revalidated = revalidateMaterializedSelection(
    captured,
    [
      { id: "1", status: "published", updatedAt: "v2" },
      { id: "2", status: "draft", updatedAt: "v1" },
    ],
    publishEligibility,
  );
  assert.deepEqual(summarizeBulkSelection(revalidated), {
    matched: 2,
    eligible: 1,
    wouldBeSkipped: 1,
    skips: [{ reason: "record-changed-since-snapshot", count: 1 }],
  });
});

test("foundation migration materializes selection only and contains no directory profile mutation", () => {
  const sql = readFileSync(new URL("../drizzle/0033_admin_bulk_selection_foundation.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE `admin_bulk_selection_snapshots`/);
  assert.match(sql, /CREATE TABLE `admin_bulk_selection_items`/);
  assert.doesNotMatch(sql, /UPDATE\s+directory_profiles/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+directory_profiles/i);
});
