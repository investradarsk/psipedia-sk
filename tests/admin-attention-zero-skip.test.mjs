import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_ATTENTION_PROBE_GROUP_SIZE,
  ADMIN_ATTENTION_PROBE_QUERY_COUNT,
  loadAdminAttentionPage,
} from "../lib/admin-attention-queue-store.ts";
import { adminAttentionQueueSourceTypes } from "../lib/admin-attention-queue.ts";

const now = new Date("2026-10-25T15:00:00Z");

function probeRow(source, activeTip) {
  const count = Number(activeTip && source === "NEWS_TIP");
  return {
    sourceType: source, total: count, activeCount: count, historyCount: 0,
    newCount: count, inProgressCount: 0, resolvedCount: 0, dismissedCount: 0,
    highCount: 0, mediumCount: 0, lowCount: count,
    activeHighCount: 0, activeMediumCount: 0, activeLowCount: count,
    historyHighCount: 0, historyMediumCount: 0, historyLowCount: 0,
  };
}

function mockDatabase(activeTip = false) {
  const queries = [];
  const db = {
    prepare(sql) {
      const isPage = sql.includes("SELECT sourceType,sourceId,activeRank,attentionState,priority,priorityRank,relevantAt,payload");
      const group = [...sql.matchAll(/SELECT '([A-Z_]+)' AS sourceType,\s*\n\s*COUNT\(\*\) AS total/g)].map(x=>x[1]);
      const source = adminAttentionQueueSourceTypes.find(value => sql.includes("'" + value + "' AS sourceType"));
      queries.push({sql,source,isPage,group});
      return {
        bind() {
          return {
            async first() {
              if (activeTip && source === "NEWS_TIP") return probeRow(source,activeTip);
              return null;
            },
            async all() {
              return {results: isPage ? [] : group.map(s=>probeRow(s,activeTip))};
            },
          };
        },
      };
    },
  };
  return {db,queries};
}

test("empty Admin Operations queue uses 3 grouped snapshots and no empty page SQL", async () => {
  const {db,queries} = mockDatabase();
  const page = await loadAdminAttentionPage({},db,now);
  assert.equal(adminAttentionQueueSourceTypes.length,14);
  assert.equal(ADMIN_ATTENTION_PROBE_GROUP_SIZE,5);
  assert.equal(ADMIN_ATTENTION_PROBE_QUERY_COUNT,3);
  assert.equal(queries.length,3);
  assert.deepEqual(queries.map(x=>x.group.length),[5,5,4]);
  assert.equal(queries.filter(item => item.isPage).length,0);
  assert.equal(page.resultCount,0);
  assert.equal(page.summary.active,0);
  assert.equal(page.availability,"EMPTY");
  assert.equal(page.sourceAvailability.length,adminAttentionQueueSourceTypes.length);
});

test("only sources with matching view and priority execute page SQL", async () => {
  const {db,queries} = mockDatabase(true);
  const active = await loadAdminAttentionPage({},db,now);
  assert.equal(active.resultCount,1);
  assert.equal(active.summary.active,1);
  assert.equal(queries.length,ADMIN_ATTENTION_PROBE_QUERY_COUNT+1);
  assert.equal(queries.filter(item => item.isPage).length,1);
  assert.equal(queries.find(item => item.isPage)?.source,"NEWS_TIP");

  queries.length = 0;
  const high = await loadAdminAttentionPage({filters:{sourceType:"all",view:"active",priority:"HIGH"}},db,now);
  assert.equal(high.resultCount,0);
  assert.equal(high.summary.active,1);
  assert.equal(queries.length,ADMIN_ATTENTION_PROBE_QUERY_COUNT);
  assert.equal(queries.filter(item => item.isPage).length,0);

  queries.length = 0;
  const history = await loadAdminAttentionPage({filters:{sourceType:"all",view:"history",priority:"all"}},db,now);
  assert.equal(history.resultCount,0);
  assert.equal(history.summary.active,1);
  assert.equal(queries.length,ADMIN_ATTENTION_PROBE_QUERY_COUNT);
  assert.equal(queries.filter(item => item.isPage).length,0);
});
