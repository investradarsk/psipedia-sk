import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_ATTENTION_PROBE_GROUP_SIZE,
  ADMIN_ATTENTION_PROBE_QUERY_COUNT,
  ADMIN_ATTENTION_REQUEST_QUERY_MAX,
  loadAdminAttentionPage,
} from "../lib/admin-attention-queue-store.ts";
import { adminAttentionQueueSourceTypes } from "../lib/admin-attention-queue.ts";

const NOW = new Date("2026-10-25T12:00:00.000Z");
const COUNT_FIELDS = [
  "total", "activeCount", "historyCount", "newCount", "inProgressCount",
  "resolvedCount", "dismissedCount", "highCount", "mediumCount", "lowCount",
  "activeHighCount", "activeMediumCount", "activeLowCount",
  "historyHighCount", "historyMediumCount", "historyLowCount",
];

function sample(source) {
  const row = Object.fromEntries(COUNT_FIELDS.map(key => [key, 0]));
  if (source === "MODERATION_SUBMISSION") Object.assign(row, {
    total: 3, activeCount: 2, historyCount: 1, newCount: 1, inProgressCount: 1,
    resolvedCount: 1, highCount: 2, lowCount: 1,
    activeHighCount: 1, activeLowCount: 1, historyHighCount: 1,
  });
  if (source === "NEWS_TIP") Object.assign(row, {
    total: 2, activeCount: 1, historyCount: 1, newCount: 1, dismissedCount: 1,
    mediumCount: 2, activeMediumCount: 1, historyMediumCount: 1,
  });
  return { sourceType: source, ...row };
}

function mockedDb({ failGroupContaining, failSingleSource, malformedGroup } = {}) {
  const calls = [];
  const db = {
    prepare(sql) {
      assert.match(sql, /^WITH params AS/);
      const group = [...sql.matchAll(/SELECT '([A-Z_]+)' AS sourceType,\s*\n\s*COUNT\(\*\) AS total/g)]
        .map(match => match[1]);
      const isPage = sql.includes("SELECT sourceType,sourceId,activeRank,attentionState,priority,priorityRank,relevantAt,payload");
      const source = adminAttentionQueueSourceTypes.find(name => sql.includes("'" + name + "' AS sourceType"));
      calls.push({ sql, group, isPage, source });
      return { bind(...args) {
        assert.ok(args.length >= 5);
        assert.equal(args[3], NOW.toISOString());
        return {
          async all() {
            if (isPage) return { results: [] };
            if (failGroupContaining && group.length > 1 && group.includes(failGroupContaining)) throw new Error("bad source table");
            const rows = group.map(sample);
            return { results: malformedGroup && group.length > 1 ? rows.slice(1) : rows };
          },
          async first() {
            if (source === failSingleSource) throw new Error("source unavailable");
            return sample(source);
          },
        };
      }};
    },
  };
  return { db, calls };
}

test("15-source queue uses three grouped exact read probes and retains counts", async () => {
  const { db, calls } = mockedDb();
  const page = await loadAdminAttentionPage({}, db, NOW);
  assert.equal(ADMIN_ATTENTION_PROBE_GROUP_SIZE, 5);
  assert.equal(ADMIN_ATTENTION_PROBE_QUERY_COUNT, 3);
  assert.equal(ADMIN_ATTENTION_REQUEST_QUERY_MAX, 33);
  assert.equal(calls.filter(x => !x.isPage).length, 3);
  assert.deepEqual(calls.filter(x => !x.isPage).map(x => x.group.length), [5, 5, 5]);
  assert.equal(page.summary.total, 5);
  assert.equal(page.summary.active, 3);
  assert.equal(page.summary.history, 2);
  assert.deepEqual(page.summary.byState, { NEW: 2, IN_PROGRESS: 1, RESOLVED: 1, DISMISSED: 1 });
  assert.deepEqual(page.summary.byPriority, { HIGH: 2, MEDIUM: 2, LOW: 1 });
  assert.equal(page.resultCount, 3);
  assert.equal(page.availability, "OK");
  assert.equal(page.sourceAvailability.length, 15);
  assert.equal(calls.filter(x => x.isPage).length, 2);
  const filtered = await loadAdminAttentionPage({ filters: { view: "history", sourceType: "all", priority: "HIGH" } }, db, NOW);
  assert.equal(filtered.resultCount, 1);
  assert.equal(filtered.summary.active, 3);
  assert.equal(filtered.summary.total, 5);
});

test("one broken source retries only its five-member group and keeps precise partial state", async () => {
  const { db, calls } = mockedDb({ failGroupContaining: "NEWS_TIP", failSingleSource: "NEWS_TIP" });
  const warn = console.warn;
  console.warn = () => {};
  let page;
  try { page = await loadAdminAttentionPage({}, db, NOW); } finally { console.warn = warn; }
  assert.equal(calls.filter(x => !x.isPage && x.group.length > 1).length, 3);
  assert.equal(calls.filter(x => !x.isPage && x.group.length === 1).length, 5);
  assert.equal(page.availability, "PARTIAL");
  assert.deepEqual(page.sourceAvailability.filter(x => x.state === "UNAVAILABLE").map(x => x.sourceType), ["NEWS_TIP"]);
  assert.equal(page.summary.bySource.NEWS_TIP, null);
  assert.equal(page.summary.active, 2);
  assert.equal(page.resultCount, 2);
  assert.equal(page.summary.total, 3);
});

test("malformed grouped rows retry each source independently", async () => {
  const { db, calls } = mockedDb({ malformedGroup: true });
  const warn = console.warn;
  console.warn = () => {};
  let page;
  try { page = await loadAdminAttentionPage({}, db, NOW); } finally { console.warn = warn; }
  assert.equal(calls.filter(x => !x.isPage && x.group.length > 1).length, 3);
  assert.equal(calls.filter(x => !x.isPage && x.group.length === 1).length, 15);
  assert.equal(page.availability, "OK");
  assert.equal(page.summary.active, 3);
  assert.equal(page.summary.total, 5);
  assert.equal(page.resultCount, 3);
});

test("groups contain no writes and make no global caches", async () => {
  const { db, calls } = mockedDb();
  await Promise.all([loadAdminAttentionPage({}, db, NOW), loadAdminAttentionPage({}, db, NOW)]);
  assert.equal(calls.filter(x => !x.isPage).length, 6);
  for (const { sql } of calls) assert.doesNotMatch(sql, /\b(?:INSERT INTO|UPDATE \w+ SET|DELETE FROM|REPLACE INTO)\b/i);
});
