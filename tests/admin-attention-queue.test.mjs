import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  ADMIN_ATTENTION_QUERY_COUNT,
  ADMIN_ATTENTION_SOURCE_LIMIT,
  filterAdminAttentionItems,
  mapAdoptionStaleAttention,
  mapDirectoryChangeRequestAttention,
  mapDirectoryInquiryAttention,
  mapModerationAttention,
  mapNewsTipAttention,
  sortAdminAttentionItems,
  summarizeAdminAttention,
} from "../lib/admin-attention-queue.ts";

const NOW = new Date("2026-09-15T12:00:00.000Z");

function manualItem(overrides = {}) {
  return {
    key: "news-tip:1",
    sourceType: "NEWS_TIP",
    sourceId: "1",
    title: "Test",
    reason: "Test",
    priority: "MEDIUM",
    status: "new",
    createdAt: "2026-09-10T12:00:00.000Z",
    relevantAt: "2026-09-10T12:00:00.000Z",
    ageDays: 5,
    targetHref: "/admin/tipy#tip-1",
    ...overrides,
  };
}

test("moderation adapter maps only submissions with an existing admin workflow and raises quarantined/risky items", () => {
  const item = mapModerationAttention({
    id: "submission-1",
    resourceType: "LOST_FOUND_CASE",
    operation: "CREATE",
    status: "QUARANTINED",
    riskFlagsJson: '["duplicate"]',
    createdAt: "2026-09-12T12:00:00.000Z",
    updatedAt: "2026-09-13T12:00:00.000Z",
  }, NOW);
  assert.equal(item?.sourceType, "MODERATION_SUBMISSION");
  assert.equal(item?.priority, "HIGH");
  assert.equal(item?.targetHref, "/admin/stratene-najdene");
  assert.equal(item?.ageDays, 3);
  assert.equal(mapModerationAttention({
    id: "submission-2",
    resourceType: "ORGANIZATION_CHANGE",
    operation: "UPDATE",
    status: "PENDING_REVIEW",
    riskFlagsJson: "[]",
    createdAt: "2026-09-12T12:00:00.000Z",
    updatedAt: "2026-09-12T12:00:00.000Z",
  }, NOW), null);
});

test("news tip adapter maps a new tip without contact PII", () => {
  const item = mapNewsTipAttention({ id: 7, title: "Nový tip", topic: "veda", status: "new", createdAt: "2026-09-14T12:00:00.000Z" }, NOW);
  assert.equal(item.key, "news-tip:7");
  assert.equal(item.priority, "MEDIUM");
  assert.equal(item.targetHref, "/admin/tipy#tip-7");
  assert.deepEqual(item.metadata, [{ label: "Téma", value: "veda" }]);
});

test("directory change adapter maps a pending profile request", () => {
  const item = mapDirectoryChangeRequestAttention({ id: 8, profileName: "Psí salón", profileCategory: "salony-a-sluzby", status: "new", createdAt: "2026-09-13T12:00:00.000Z" }, NOW);
  assert.equal(item.key, "directory-change:8");
  assert.equal(item.priority, "MEDIUM");
  assert.equal(item.targetHref, "/admin/adresar/navrhy#navrh-8");
});

test("directory inquiry adapter reuses the existing 24h stale attention contract", () => {
  const fresh = mapDirectoryInquiryAttention({ id: 9, profileName: "Veterina", profileCategory: "veterinari", status: "new", createdAt: "2026-09-15T06:00:00.000Z" }, NOW);
  const stale = mapDirectoryInquiryAttention({ id: 10, profileName: "Veterina", profileCategory: "veterinari", status: "new", createdAt: "2026-09-13T12:00:00.000Z" }, NOW);
  assert.equal(fresh.priority, "MEDIUM");
  assert.equal(stale.priority, "HIGH");
  assert.equal(stale.targetHref, "/admin/dopyty#dopyt-10");
});

test("adoption adapter reuses 30d stale and 45d markedly-stale contracts", () => {
  const stale = mapAdoptionStaleAttention({ id: 11, name: "Neo", status: "ACTIVE", organizationName: "OZ", lastVerifiedAt: "2026-08-11T12:00:00.000Z", createdAt: "2026-05-01T12:00:00.000Z" }, NOW);
  const veryStale = mapAdoptionStaleAttention({ id: 12, name: "Rex", status: "RESERVED", organizationName: "OZ", lastVerifiedAt: "2026-07-20T12:00:00.000Z", createdAt: "2026-05-01T12:00:00.000Z" }, NOW);
  const neverVerified = mapAdoptionStaleAttention({ id: 13, name: "Luna", status: "ACTIVE", organizationName: "", lastVerifiedAt: null, createdAt: "2026-06-01T12:00:00.000Z" }, NOW);
  assert.equal(stale.priority, "MEDIUM");
  assert.equal(veryStale.priority, "HIGH");
  assert.equal(neverVerified.priority, "HIGH");
  assert.equal(stale.targetHref, "/admin/adopcie/11");
});

test("priority ordering is deterministic and higher priority wins", () => {
  const sorted = sortAdminAttentionItems([
    manualItem({ key: "low", priority: "LOW" }),
    manualItem({ key: "medium", priority: "MEDIUM" }),
    manualItem({ key: "high", priority: "HIGH" }),
  ]);
  assert.deepEqual(sorted.map((item) => item.key), ["high", "medium", "low"]);
});

test("same priority orders older relevant timestamps first", () => {
  const sorted = sortAdminAttentionItems([
    manualItem({ key: "newer", relevantAt: "2026-09-10T12:00:00.000Z" }),
    manualItem({ key: "older", relevantAt: "2026-09-01T12:00:00.000Z" }),
  ]);
  assert.deepEqual(sorted.map((item) => item.key), ["older", "newer"]);
});

test("stable key breaks exact priority/timestamp ties", () => {
  const sorted = sortAdminAttentionItems([
    manualItem({ key: "news-tip:b" }),
    manualItem({ key: "news-tip:a" }),
  ]);
  assert.deepEqual(sorted.map((item) => item.key), ["news-tip:a", "news-tip:b"]);
});

test("source and priority filters compose", () => {
  const items = [
    manualItem({ key: "n1", sourceType: "NEWS_TIP", priority: "MEDIUM" }),
    manualItem({ key: "i1", sourceType: "DIRECTORY_INQUIRY", priority: "HIGH" }),
    manualItem({ key: "i2", sourceType: "DIRECTORY_INQUIRY", priority: "MEDIUM" }),
  ];
  assert.deepEqual(filterAdminAttentionItems(items, { sourceType: "DIRECTORY_INQUIRY", priority: "all" }).map((item) => item.key), ["i1", "i2"]);
  assert.deepEqual(filterAdminAttentionItems(items, { sourceType: "all", priority: "HIGH" }).map((item) => item.key), ["i1"]);
  assert.deepEqual(filterAdminAttentionItems(items, { sourceType: "DIRECTORY_INQUIRY", priority: "MEDIUM" }).map((item) => item.key), ["i2"]);
});

test("empty queue summary has deterministic zero counts", () => {
  const summary = summarizeAdminAttention([]);
  assert.equal(summary.total, 0);
  assert.deepEqual(summary.byPriority, { HIGH: 0, MEDIUM: 0, LOW: 0 });
  assert.ok(Object.values(summary.bySource).every((count) => count === 0));
});

test("all source queries are bounded and the store is read-only", () => {
  assert.equal(ADMIN_ATTENTION_SOURCE_LIMIT, 50);
  const store = readFileSync(new URL("../lib/admin-attention-queue-store.ts", import.meta.url), "utf8");
  assert.equal((store.match(/LIMIT \?/g) ?? []).length, ADMIN_ATTENTION_QUERY_COUNT);
  assert.doesNotMatch(store, /\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i);
  assert.doesNotMatch(store, /sender_email|requester_email|proposed_patch_json|source_data_json/i);
});

test("target hrefs point to existing admin route patterns", () => {
  const routes = [
    "../app/admin/tipy/page.tsx",
    "../app/admin/adresar/navrhy/page.tsx",
    "../app/admin/dopyty/page.tsx",
    "../app/admin/adopcie/[id]/page.tsx",
    "../app/admin/stratene-najdene/page.tsx",
  ];
  for (const route of routes) assert.equal(existsSync(new URL(route, import.meta.url)), true, route);
});

test("operations page stays behind admin auth and exposes no mutation endpoint", () => {
  const page = readFileSync(new URL("../app/admin/operations/page.tsx", import.meta.url), "utf8");
  const component = readFileSync(new URL("../components/admin-attention-queue.tsx", import.meta.url), "utf8");
  assert.match(page, /requireAdminPageUser\("\/admin\/operations"\)/);
  assert.match(component, /<form[^>]+method="get"/);
  assert.doesNotMatch(page + component, /fetch\(|method=["'](?:post|put|patch|delete)["']/i);
  assert.equal(existsSync(new URL("../app/api/admin/operations", import.meta.url)), false);
});
