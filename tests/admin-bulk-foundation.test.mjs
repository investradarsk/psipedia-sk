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

test("article explicit selection accepts single and multiple IDs", () => {
  const single = parseBulkPreflightRequest({
    module: "articles",
    action: "publish",
    selection: { mode: "explicit", ids: [21], filter: { status: "draft", q: "neo" } },
  });
  assert.equal(single.module, "articles");
  assert.deepEqual(single.selection.ids, [21]);

  const multiple = parseBulkPreflightRequest({
    module: "articles",
    action: "move-to-draft",
    selection: { mode: "explicit", ids: [21, 22, 23, 21], filter: { status: "published" } },
  });
  assert.deepEqual(multiple.selection.ids, [21, 22, 23]);
});

test("article all-matching stays disabled until a deterministic server membership contract exists", () => {
  assert.throws(
    () => parseBulkPreflightRequest({
      module: "articles",
      action: "publish",
      selection: { mode: "all-matching", filter: { status: "draft" } },
    }),
    (error) => error instanceof BulkPreflightError && error.code === "unsupported-selection-mode",
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

test("article adapter owns explicit membership SQL against canonical managed_articles and performs zero article mutation", () => {
  const source = readFileSync(new URL("../lib/admin-bulk/article-adapter.ts", import.meta.url), "utf8");
  assert.match(source, /SELECT id, status, updated_at[\s\S]*FROM managed_articles WHERE id IN/);
  assert.match(source, /record\.status !== "draft"[\s\S]*record\.status !== "scheduled"[\s\S]*record\.status !== "published"/);
  assert.doesNotMatch(source, /UPDATE\s+managed_articles/i);
  assert.doesNotMatch(source, /DELETE\s+FROM\s+managed_articles/i);
  assert.doesNotMatch(source, /INSERT\s+INTO\s+managed_articles/i);
});

test("article membership fingerprint excludes pagination and includes q/status/portal section", () => {
  const source = readFileSync(new URL("../lib/article-admin-bulk-filter.ts", import.meta.url), "utf8");
  assert.match(source, /portalSection: normalized\.portalSection/);
  assert.match(source, /status: normalized\.status/);
  assert.match(source, /q: normalized\.q/);
  assert.doesNotMatch(source, /\bpage\b/);
  assert.doesNotMatch(source, /\boffset\b/);
});

test("shared selection UI covers current-page selection, indeterminate, count, clear and stale filter safety", () => {
  const source = readFileSync(new URL("../components/admin-bulk-selection.tsx", import.meta.url), "utf8");
  assert.match(source, /currentPageAllSelected/);
  assert.match(source, /currentPageSomeSelected/);
  assert.match(source, /indeterminate=\{currentPageSomeSelected\}/);
  assert.match(source, /selectedCount/);
  assert.match(source, /Zrušiť výber/);
  assert.match(source, /selectionState\.membershipFingerprint === membershipFingerprint/);
  assert.match(source, /sessionStorage\.setItem/);
});

test("article dashboard preserves explicit IDs across pagination but disables all-matching", () => {
  const source = readFileSync(new URL("../components/admin-dashboard.tsx", import.meta.url), "utf8");
  assert.match(source, /module: "articles"/);
  assert.match(source, /membershipFingerprint/);
  assert.match(source, /supportsAllMatching: false/);
  assert.match(source, /supportsAllMatching=\{false\}/);
  assert.doesNotMatch(source, /membershipFilter[\s\S]{0,160}\bpage\b/);
});

test("article row selection uses native checkbox semantics and existing single-record actions remain", () => {
  const bulkSource = readFileSync(new URL("../components/admin-bulk-selection.tsx", import.meta.url), "utf8");
  const dashboardSource = readFileSync(new URL("../components/admin-dashboard.tsx", import.meta.url), "utf8");
  assert.match(bulkSource, /type="checkbox"/);
  assert.match(bulkSource, /aria-live="polite"/);
  assert.match(dashboardSource, /Pozrieť ↗/);
  assert.match(dashboardSource, />Upraviť</);
  assert.match(dashboardSource, /removeArticle\(article\)/);
});

test("bulk preflight route denies unauthorized callers before database access", () => {
  const source = readFileSync(new URL("../app/api/admin/bulk/preflight/route.ts", import.meta.url), "utf8");
  const authIndex = source.indexOf("const user = await getAdminApiUser()");
  const denyIndex = source.indexOf("if (!user) return unauthorizedAdminResponse()");
  const databaseIndex = source.indexOf("getBulkSelectionDatabase()");
  assert.ok(authIndex >= 0);
  assert.ok(denyIndex > authIndex);
  assert.ok(databaseIndex > denyIndex);
});

test("article mobile row contract gives checkbox its own grid column without changing shared row CSS", () => {
  const source = readFileSync(new URL("../components/admin-article-dashboard.module.css", import.meta.url), "utf8");
  assert.match(source, /grid-template-columns: 24px 76px minmax\(0, 1fr\) auto/);
  assert.match(source, /@media \(max-width: 720px\)/);
  assert.match(source, /grid-template-columns: 24px 62px minmax\(0, 1fr\)/);
  assert.match(source, /\.actions[\s\S]*grid-column: 1 \/ -1/);
});
