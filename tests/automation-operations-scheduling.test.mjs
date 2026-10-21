import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register("./cloudflare-loader.mjs", import.meta.url);
const { getAutomationOperationsOverview } = await import("../lib/data-automation-operations.ts");
const now = new Date("2026-10-21T08:00:00.000Z");

function database({ roots = [], sources = [], runs = [] } = {}) {
  return {
    prepare(sql) {
      assert.match(sql, /^SELECT /, "overview must remain read-only");
      return {
        bind() { return this; },
        async all() {
          if (sql.includes("FROM automation_discovery_roots ORDER BY")) {
            assert.match(sql, /enabled,review_status,/, "review state must be loaded from D1");
            return { results: roots };
          }
          if (sql.includes("FROM automation_sources ORDER BY")) return { results: sources };
          if (sql.includes("FROM automation_runs r")) return { results: runs };
          return { results: [] };
        },
        async first() { return null; },
      };
    },
  };
}
const source = (extra = {}) => ({
  id: 1, entity_type: "EVENT", config_json: "{}", enabled: 1,
  review_status: "APPROVED", next_check_at: "2026-10-21T10:00:00.000Z", ...extra,
});
async function events(input) {
  const overview = await getAutomationOperationsOverview("7d", database(input), now);
  assert.notEqual(overview.reliability.status, "UNAVAILABLE");
  return overview.categories.find((category) => category.slug === "podujatia");
}

test("disabled and unreviewed timestamps cannot become the advertised next run", async () => {
  const category = await events({ sources: [
    source({ id: 2, enabled: 0, next_check_at: "2026-10-20T10:00:00.000Z" }),
    source({ id: 3, review_status: "PENDING", next_check_at: "2026-10-21T09:00:00.000Z" }),
    source(),
  ] });
  assert.equal(category.status, "V poriadku");
  assert.equal(category.nextRunAt, "2026-10-21T10:00:00.000Z");
});

test("a category without an approved enabled job has no scheduled next run", async () => {
  const category = await events({ sources: [source({ enabled: 0 }), source({ review_status: "REJECTED" })] });
  assert.equal(category.status, "Vypnuté");
  assert.equal(category.nextRunAt, null);
});

test("feed discovery roots use the same approval gate as source jobs", async () => {
  const disabled = await events({ roots: [source({ enabled: 0 })] });
  assert.equal(disabled.nextRunAt, null);
  const active = await events({ roots: [source()], sources: [source({ enabled: 0 })] });
  assert.equal(active.status, "V poriadku");
  assert.equal(active.nextRunAt, "2026-10-21T10:00:00.000Z");
});

test("latest failed run cannot look healthy merely because source error code is absent", async () => {
  const category = await events({ sources: [source()], runs: [{
    id: 1, source_entity_type: "EVENT", source_config_json: "{}",
    status: "FAILED", started_at: "2026-10-21T07:00:00.000Z", error_count: 1,
  }] });
  assert.equal(category.status, "Problém");
  assert.equal(category.recentRuns[0].status, "FAILED");
});
