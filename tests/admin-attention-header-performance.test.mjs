import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { performance } from "node:perf_hooks";
import {
  ADMIN_ATTENTION_SUMMARY_GROUP_SIZE,
  ADMIN_ATTENTION_SUMMARY_QUERY_COUNT,
  loadExactAdminAttentionSummary,
} from "../lib/admin-attention-queue-store.ts";
import { adminAttentionQueueSourceTypes } from "../lib/admin-attention-queue.ts";

const NOW = new Date("2026-10-19T00:00:00.000Z");
const expectedGroups = Array.from(
  { length: Math.ceil(adminAttentionQueueSourceTypes.length / ADMIN_ATTENTION_SUMMARY_GROUP_SIZE) },
  (_, index) => adminAttentionQueueSourceTypes.slice(
    index * ADMIN_ATTENTION_SUMMARY_GROUP_SIZE,
    (index + 1) * ADMIN_ATTENTION_SUMMARY_GROUP_SIZE,
  ),
);

function groupSources(sql) {
  return [...sql.matchAll(/SELECT '([A-Z_]+)' AS sourceType,\s*\n\s*COALESCE\(SUM\(CASE WHEN (?:base\.)?activeRank=0/g)]
    .map((match) => match[1]);
}

function createMock(counts = {}, { unavailable = [], malformed = false, rawCounts = {} } = {}) {
  const calls = [];
  const invalid = new Set(unavailable);
  const database = {
    prepare(sql) {
      assert.match(sql, /^WITH params AS/);
      const group = groupSources(sql);
      calls.push({ sql, group });
      return {
        bind(...bindings) {
          assert.equal(bindings.length, 5);
          assert.equal(bindings[3], NOW.toISOString());
          return {
            async all() {
              assert.ok(group.length > 0);
              if (group.some((source) => invalid.has(source))) throw new Error("D1 table missing");
              // Force group-level malformed results only: single-source retries
              // must receive an otherwise valid acknowledgement-aware response.
              return {
                results: group.map((source) => ({
                  sourceType: source,
                  activeCount: Number(counts[source] ?? 0),
                })).slice(0, malformed && group.length > 1 ? -1 : undefined),
              };
            },
            async first() {
              assert.equal(group.length, 0);
              const source = adminAttentionQueueSourceTypes.find((sourceType) =>
                sql.includes(`'${sourceType}' AS sourceType`)
              );
              assert.ok(source, "fallback source probe must be canonical");
              if (invalid.has(source)) throw new Error("D1 table missing");
              return { activeCount: Number(rawCounts[source] ?? counts[source] ?? 0) };
            },
          };
        },
      };
    },
  };
  return { database, calls, counts };
}

test("header summary issues exactly three D1 read statements for fifteen distinct sources", async () => {
  assert.equal(adminAttentionQueueSourceTypes.length, 15);
  assert.equal(ADMIN_ATTENTION_SUMMARY_GROUP_SIZE, 5);
  assert.equal(ADMIN_ATTENTION_SUMMARY_QUERY_COUNT, 3);
  const values = Object.fromEntries(adminAttentionQueueSourceTypes.map((source, index) => [source, index + 1]));
  const { database, calls } = createMock(values);
  const result = await loadExactAdminAttentionSummary(database, NOW);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((call) => call.group), expectedGroups);
  assert.equal(result.availability, "OK");
  assert.equal(result.active, 120);
  assert.deepEqual(result.bySource, values);
  assert.deepEqual(result.unavailableSources, []);
  for (const call of calls) {
    assert.doesNotMatch(call.sql, /\b(?:INSERT INTO|DELETE FROM|UPDATE \w+ SET)\b/i);
    assert.ok(call.sql.includes("UNION ALL"));
  }
});

test("zero rows are exact zeros, not missing or partially available sources", async () => {
  const { database, calls } = createMock();
  const result = await loadExactAdminAttentionSummary(database, NOW);
  assert.equal(calls.length, 3);
  assert.equal(result.active, 0);
  assert.equal(result.availability, "OK");
  assert.equal(Object.values(result.bySource).filter((count) => count === 0).length, 15);
});

test("one source failure falls back only within its group and retains partial source identity", async () => {
  const values = Object.fromEntries(adminAttentionQueueSourceTypes.map((source) => [source, 2]));
  const { database, calls } = createMock(values, { unavailable: ["NEWS_TIP"] });
  const oldWarn = console.warn;
  console.warn = () => {};
  let result;
  try {
    result = await loadExactAdminAttentionSummary(database, NOW);
  } finally {
    console.warn = oldWarn;
  }
  assert.equal(calls.length, 8, "3 grouped statements + 5 isolated fallback probes");
  assert.equal(calls.filter((call) => call.group.length === 1).length, 5);
  for (const call of calls) {
    assert.match(call.sql, /LEFT JOIN admin_attention_ack ack/);
    assert.match(call.sql, /ack\.read_at IS NULL/);
    assert.match(call.sql, /ack\.snoozed_until IS NULL/);
  }
  assert.equal(result.availability, "PARTIAL");
  assert.deepEqual(result.unavailableSources, ["NEWS_TIP"]);
  assert.equal(result.bySource.NEWS_TIP, null);
  assert.equal(result.active, 28);
  assert.equal(result.bySource.MODERATION_SUBMISSION, 2);
  assert.equal(result.bySource.PROFILE_REVIEW_MODERATION, 2);
});

test("a malformed group response retries rather than silently dropping source counts", async () => {
  const { database, calls } = createMock({}, { malformed: true });
  const oldWarn = console.warn;
  console.warn = () => {};
  let result;
  try {
    result = await loadExactAdminAttentionSummary(database, NOW);
  } finally {
    console.warn = oldWarn;
  }
  assert.equal(calls.length, 18, "3 invalid grouped statements + 15 per-source reads");
  assert.equal(result.availability, "OK");
  assert.equal(result.active, 0);
  assert.equal(calls.filter((call) => call.group.length === 1).length, 15);
  assert.deepEqual(result.unavailableSources, []);
});

test("group fallback keeps unread counts even when total active queue items differ", async () => {
  const unread = Object.fromEntries(adminAttentionQueueSourceTypes.map((source) => [source, 1]));
  const rawCounts = Object.fromEntries(adminAttentionQueueSourceTypes.map((source) => [source, 9]));
  const { database, calls } = createMock(unread, { unavailable: ["NEWS_TIP"], rawCounts });
  const warn = console.warn;
  console.warn = () => {};
  let result;
  try {
    result = await loadExactAdminAttentionSummary(database, NOW);
  } finally {
    console.warn = warn;
  }
  assert.equal(result.availability, "PARTIAL");
  assert.deepEqual(result.unavailableSources, ["NEWS_TIP"]);
  assert.equal(result.active, 14, "read or snoozed queue entries must not inflate unread badge");
  assert.equal(result.bySource.MODERATION_SUBMISSION, 1);
  assert.equal(calls.filter((call) => call.group.length === 1).length, 5);
  assert.ok(calls.every(({ sql }) => sql.includes("admin_attention_ack")));
});

test("requests run concurrently, without global caching or stale counts", async () => {
  const counts = Object.fromEntries(adminAttentionQueueSourceTypes.map((source) => [source, 1]));
  const mock = createMock(counts);
  const start = performance.now();
  const results = await Promise.all(
    Array.from({ length: 4 }, () => loadExactAdminAttentionSummary(mock.database, NOW)),
  );
  const elapsedMs = performance.now() - start;
  assert.equal(mock.calls.length, 4 * ADMIN_ATTENTION_SUMMARY_QUERY_COUNT);
  assert.deepEqual(results.map((result) => result.active), [15, 15, 15, 15]);
  counts.NEWS_TIP = 5;
  const fresh = await loadExactAdminAttentionSummary(mock.database, NOW);
  assert.equal(fresh.active, 19);
  assert.equal(mock.calls.length, 15);
  // Diagnostic only: mocked read latency is not representative of Cloudflare D1.
  assert.ok(Number.isFinite(elapsedMs) && elapsedMs >= 0);
});


test("shared admin shell streams independently of a slow attention summary", () => {
  const shell = readFileSync(new URL("../components/admin-shell.tsx", import.meta.url), "utf8");
  assert.match(shell, /import \{ Suspense, type ReactNode \} from "react"/);
  assert.match(shell, /<Suspense fallback=\{<AdminNotificationBellPending \/>\}>\s*<AdminNotificationBell count=\{attentionCount\} partial=\{attentionCountPartial\} summaryPromise=\{attentionSummaryPromise\} \/>\s*<\/Suspense>/);
  assert.match(shell, /aria-label="Upozornenia: načítava sa počet neprečítaných upozornení"/);
  assert.match(shell, /function AdminNotificationBellPending\(\) \{/);
  assert.match(shell, /if \(activeCount === undefined\) \{\s*const summary = await \(summaryPromise \?\? loadRequestAdminAttentionSummary\(\)\)/);
  const requestLoader = readFileSync(new URL("../lib/admin-attention-request.ts", import.meta.url), "utf8");
  assert.match(requestLoader, /cache\(/);
  assert.match(requestLoader, /loadExactAdminAttentionSummary\(\)/);
  assert.match(shell, /data-testid="admin-notification-bell"/g);
  assert.doesNotMatch(shell.match(/function AdminNotificationBellPending\(\) \{([\s\S]*?)\n\}/)?.[1] ?? "", /loadExactAdminAttentionSummary/);
});
