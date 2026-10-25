import assert from "node:assert/strict";
import test from "node:test";
import { loadAdminAttentionPage } from "../lib/admin-attention-queue-store.ts";
import { adminAttentionQueueSourceTypes } from "../lib/admin-attention-queue.ts";

const now = new Date("2026-10-25T15:00:00Z");

function mockDatabase(activeTip = false) {
  const queries = [];
  const db = {
    prepare(sql) {
      const isPage = sql.includes("SELECT sourceType,sourceId,activeRank,attentionState,priority,priorityRank,relevantAt,payload");
      const source = adminAttentionQueueSourceTypes.find(value => sql.includes("'" + value + "' AS sourceType"));
      queries.push({sql,source,isPage});
      return {
        bind() {
          return {
            async first() {
              if (activeTip && source === "NEWS_TIP") {
                return {total:1,activeCount:1,historyCount:0,newCount:1,lowCount:1,activeLowCount:1};
              }
              return null;
            },
            async all() {
              return {results: []};
            },
          };
        },
      };
    },
  };
  return {db,queries};
}

test("empty Admin Operations queue needs snapshot probes but no empty page SQL", async () => {
  const {db,queries} = mockDatabase();
  const page = await loadAdminAttentionPage({},db,now);
  assert.equal(queries.length,adminAttentionQueueSourceTypes.length);
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
  assert.equal(queries.filter(item => item.isPage).length,1);
  assert.equal(queries.find(item => item.isPage)?.source,"NEWS_TIP");

  queries.length = 0;
  const high = await loadAdminAttentionPage({filters:{sourceType:"all",view:"active",priority:"HIGH"}},db,now);
  assert.equal(high.resultCount,0);
  assert.equal(high.summary.active,1);
  assert.equal(queries.filter(item => item.isPage).length,0);

  queries.length = 0;
  const history = await loadAdminAttentionPage({filters:{sourceType:"all",view:"history",priority:"all"}},db,now);
  assert.equal(history.resultCount,0);
  assert.equal(history.summary.active,1);
  assert.equal(queries.filter(item => item.isPage).length,0);
});
