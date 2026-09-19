import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BulkPreflightError,
  materializeBulkSelection,
  parseBulkExecutionRequest,
} from "../lib/admin-bulk/core.ts";
import { articleBulkEligibility } from "../lib/admin-bulk/article-adapter.ts";
import { runArticleBulkExecution } from "../lib/admin-bulk/execution.ts";

const future = "2099-01-01T00:00:00.000Z";

function makeDatabase({ articles, action = "publish", captured = articles, failIds = [], raceIds = [] }) {
  const articleMap = new Map(articles.map((article) => [article.id, { ...article }]));
  const capturedItems = materializeBulkSelection(
    captured.map((article) => String(article.id)),
    captured.map((article) => ({ id: String(article.id), status: article.status, updatedAt: article.updated_at })),
    (record) => articleBulkEligibility(action, record),
  );
  const fail = new Set(failIds);
  const race = new Set(raceIds);

  const database = {
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...bound) { values = bound; return statement; },
        async first() {
          if (!sql.includes("admin_bulk_selection_snapshots")) return null;
          return {
            id: "snapshot-1",
            module: "articles",
            action,
            selection_mode: "explicit",
            membership_filter_json: JSON.stringify({ portalSection: "", status: "all", q: "" }),
            filter_fingerprint: "articles:fingerprint",
            actor_ref: "actor-1",
            matched_count: capturedItems.length,
            created_at: "2026-09-17T07:00:00.000Z",
            expires_at: future,
          };
        },
        async all() {
          if (sql.includes("admin_bulk_selection_items")) {
            return { results: capturedItems.map((item) => ({
              record_id: item.recordId,
              exists_at_snapshot: item.existsAtSnapshot ? 1 : 0,
              captured_status: item.capturedStatus,
              captured_updated_at: item.capturedUpdatedAt,
              eligible: item.eligible ? 1 : 0,
              skip_reason: item.skipReason,
            })) };
          }
          if (sql.includes("FROM managed_articles")) {
            const ids = values.map(Number);
            return { results: ids.flatMap((id) => {
              const article = articleMap.get(id);
              return article ? [{ id, status: article.status, updated_at: article.updated_at }] : [];
            }) };
          }
          return { results: [] };
        },
        async run() {
          if (!sql.includes("UPDATE managed_articles")) return { meta: { changes: 0 } };
          const isPublish = sql.includes("status = 'published'");
          const id = Number(values[isPublish ? 3 : 2]);
          const expectedStatus = values[isPublish ? 4 : 3];
          const expectedUpdatedAt = values[isPublish ? 5 : 4];
          if (fail.has(id)) throw new Error("simulated failure");
          if (race.has(id)) return { meta: { changes: 0 } };
          const article = articleMap.get(id);
          if (!article || article.status !== expectedStatus || article.updated_at !== expectedUpdatedAt) return { meta: { changes: 0 } };
          article.status = isPublish ? "published" : "draft";
          if (isPublish && !article.published_at) article.published_at = values[0];
          article.updated_at = isPublish ? values[1] : values[0];
          articleMap.set(id, article);
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
    async batch() { return []; },
  };
  return { database, articleMap };
}

function executionPayload(action, ids) {
  return {
    module: "articles",
    action,
    snapshotId: "snapshot-1",
    membershipFingerprint: "articles:fingerprint",
    selection: { mode: "explicit", ids },
  };
}

test("execution parser accepts article explicit and directory explicit/all-matching contracts", () => {
  assert.deepEqual(parseBulkExecutionRequest(executionPayload("publish", [2, 1, 2])).selection.ids, [2, 1]);
  assert.deepEqual(
    parseBulkExecutionRequest({ ...executionPayload("publish", [4, 3, 4]), module: "directory" }).selection,
    { mode: "explicit", ids: [4, 3] },
  );
  assert.deepEqual(
    parseBulkExecutionRequest({
      module: "directory",
      action: "move-to-draft",
      snapshotId: "snapshot-1",
      membershipFingerprint: "directory:fingerprint",
      selection: { mode: "all-matching" },
    }).selection,
    { mode: "all-matching" },
  );
  for (const payload of [
    { ...executionPayload("publish", [1]), module: "events" },
    { ...executionPayload("publish", [1]), action: "delete" },
    { ...executionPayload("publish", [1]), selection: { mode: "all-matching" } },
    { ...executionPayload("publish", [1]), table: "managed_articles" },
    { ...executionPayload("publish", [1]), selection: { mode: "explicit", ids: [1], column: "status" } },
    {
      module: "directory", action: "publish", snapshotId: "snapshot-1",
      membershipFingerprint: "directory:fingerprint", selection: { mode: "all-matching", ids: [1] },
    },
  ]) {
    assert.throws(() => parseBulkExecutionRequest(payload), BulkPreflightError);
  }
});

test("canonical eligibility handles draft/published/scheduled target states", () => {
  assert.equal(articleBulkEligibility("publish", { id: "1", status: "draft", updatedAt: "v1" }).eligible, true);
  assert.equal(articleBulkEligibility("publish", { id: "1", status: "scheduled", updatedAt: "v1" }).eligible, true);
  assert.deepEqual(articleBulkEligibility("publish", { id: "1", status: "published", updatedAt: "v1" }), { eligible: false, reason: "already-target-state" });
  assert.equal(articleBulkEligibility("move-to-draft", { id: "1", status: "published", updatedAt: "v1" }).eligible, true);
  assert.equal(articleBulkEligibility("move-to-draft", { id: "1", status: "scheduled", updatedAt: "v1" }).eligible, true);
  assert.deepEqual(articleBulkEligibility("move-to-draft", { id: "1", status: "draft", updatedAt: "v1" }), { eligible: false, reason: "already-target-state" });
});

test("publishes eligible draft and scheduled records, skips already-published deterministically", async () => {
  const articles = [
    { id: 1, status: "draft", updated_at: "v1", published_at: null },
    { id: 2, status: "scheduled", updated_at: "v2", published_at: "2026-10-01T08:00:00.000Z" },
    { id: 3, status: "published", updated_at: "v3", published_at: "2026-09-01T08:00:00.000Z" },
  ];
  const { database, articleMap } = makeDatabase({ articles, action: "publish" });
  const result = await runArticleBulkExecution(database, "actor-1", "admin@example.test", executionPayload("publish", [1, 2, 3]), new Date("2026-09-17T07:30:00.000Z"));
  assert.deepEqual(result.counts, { requested: 3, updated: 2, skipped: 1, failed: 0 });
  assert.equal(articleMap.get(1).status, "published");
  assert.equal(articleMap.get(1).published_at, "2026-09-17T07:30:00.000Z");
  assert.equal(articleMap.get(2).published_at, "2026-10-01T08:00:00.000Z");
  assert.equal(result.skipped[0].reason, "already-target-state");
});

test("moves published article to draft while preserving published_at", async () => {
  const publishedAt = "2026-09-01T08:00:00.000Z";
  const articles = [{ id: 4, status: "published", updated_at: "v4", published_at: publishedAt }];
  const { database, articleMap } = makeDatabase({ articles, action: "move-to-draft" });
  const result = await runArticleBulkExecution(database, "actor-1", "admin@example.test", executionPayload("move-to-draft", [4]), new Date("2026-09-17T07:30:00.000Z"));
  assert.deepEqual(result.counts, { requested: 1, updated: 1, skipped: 0, failed: 0 });
  assert.equal(articleMap.get(4).status, "draft");
  assert.equal(articleMap.get(4).published_at, publishedAt);
});

test("stale record after preflight is skipped and never overwritten", async () => {
  const captured = [{ id: 5, status: "draft", updated_at: "v1", published_at: null }];
  const live = [{ id: 5, status: "draft", updated_at: "v2", published_at: null }];
  const { database, articleMap } = makeDatabase({ articles: live, captured, action: "publish" });
  const result = await runArticleBulkExecution(database, "actor-1", "admin@example.test", executionPayload("publish", [5]), new Date("2026-09-17T07:30:00.000Z"));
  assert.deepEqual(result.counts, { requested: 1, updated: 0, skipped: 1, failed: 0 });
  assert.equal(result.skipped[0].reason, "record-changed-since-snapshot");
  assert.equal(articleMap.get(5).status, "draft");
});

test("ID outside snapshot is rejected and mixed eligible/skipped/failed counts are explicit", async () => {
  const articles = [
    { id: 6, status: "draft", updated_at: "v6", published_at: null },
    { id: 7, status: "published", updated_at: "v7", published_at: "2026-09-01T00:00:00.000Z" },
    { id: 8, status: "draft", updated_at: "v8", published_at: null },
  ];
  const { database } = makeDatabase({ articles, action: "publish", failIds: [8] });
  await assert.rejects(
    runArticleBulkExecution(database, "actor-1", "admin@example.test", executionPayload("publish", [6, 7, 8, 999]), new Date("2026-09-17T07:30:00.000Z")),
    (error) => error instanceof BulkPreflightError && error.code === "selection-mismatch",
  );
  const result = await runArticleBulkExecution(database, "actor-1", "admin@example.test", executionPayload("publish", [6, 7, 8]), new Date("2026-09-17T07:30:00.000Z"));
  assert.deepEqual(result.counts, { requested: 3, updated: 1, skipped: 1, failed: 1 });
});

test("conditional mutation catches a race after server revalidation", async () => {
  const articles = [{ id: 9, status: "draft", updated_at: "v9", published_at: null }];
  const { database } = makeDatabase({ articles, action: "publish", raceIds: [9] });
  const result = await runArticleBulkExecution(database, "actor-1", "admin@example.test", executionPayload("publish", [9]), new Date("2026-09-17T07:30:00.000Z"));
  assert.deepEqual(result.counts, { requested: 1, updated: 0, skipped: 1, failed: 0 });
  assert.equal(result.skipped[0].reason, "record-changed-since-snapshot");
});

test("execution route authenticates before database access and exposes no generic SQL contract", () => {
  const route = readFileSync(new URL("../app/api/admin/bulk/execute/route.ts", import.meta.url), "utf8");
  const execution = readFileSync(new URL("../lib/admin-bulk/execution.ts", import.meta.url), "utf8");
  assert.ok(route.indexOf("if (!user) return unauthorizedAdminResponse()") < route.indexOf("getBulkSelectionDatabase()"));
  assert.doesNotMatch(execution, /payload\.(table|column|sql)/);
  assert.match(execution, /UPDATE managed_articles/);
  assert.match(execution, /WHERE id = \? AND status = \? AND updated_at = \?/);
});

test("article execution UI requires preflight confirmation, reports partial result, clears selection and refreshes", () => {
  const source = readFileSync(new URL("../components/admin-bulk-selection.tsx", import.meta.url), "utf8");
  assert.match(source, /\/api\/admin\/bulk\/preflight/);
  assert.match(source, /\/api\/admin\/bulk\/execute/);
  assert.match(source, /Potvrdiť a vykonať/);
  assert.match(source, /execution\.counts\.updated/);
  assert.match(source, /execution\.counts\.skipped/);
  assert.match(source, /execution\.counts\.failed/);
  assert.match(source, /clear\(\)/);
  assert.match(source, /window\.location\.reload\(\)/);
});
