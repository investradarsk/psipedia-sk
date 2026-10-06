import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTOMATION_SOURCE_PROVIDER_GLOBAL_DAILY_LIMIT,
  reserveAutomationSourceProviderRequest,
} from "../lib/data-automation-source-provider-usage.ts";

function db({ latest = null, insertChanges = 1 } = {}) {
  const calls = [];
  return {
    calls,
    value: {
      prepare(sql) {
        calls.push(sql);
        return {
          bind(...args) {
            return {
              async first() {
                if (!sql.includes("SELECT run_id,status,created_at")) throw new Error("unexpected first query");
                return latest;
              },
              async run() {
                if (!sql.includes("INSERT INTO automation_source_provider_usage")) throw new Error("unexpected run query");
                return { meta: { changes: insertChanges }, args };
              },
            };
          },
        };
      },
    },
  };
}

test("recent Tavily rate limit activates source cooldown before another provider request", async () => {
  const now = new Date("2026-10-05T12:00:00.000Z");
  const mock = db({
    latest: {
      run_id: 99,
      status: "RATE_LIMITED",
      created_at: "2026-10-05T08:00:00.000Z",
    },
  });
  const result = await reserveAutomationSourceProviderRequest({
    database: mock.value,
    operationKey: "source:1:run:2:tavily:crawl:1",
    sourceId: 1,
    runId: 2,
    providerKey: "tavily",
    operation: "CRAWL",
    maxRequestsPerDay: 12,
    maxRequestsPerRun: 3,
    now,
  });
  assert.equal(result.reserved, false);
  assert.equal(result.reason, "COOLDOWN");
  assert.equal(result.cooldownUntil, "2026-10-05T20:00:00.000Z");
  assert.equal(mock.calls.some((sql) => sql.includes("INSERT INTO automation_source_provider_usage")), false);
});

test("expired provider cooldown permits a new bounded reservation", async () => {
  const mock = db({
    latest: {
      run_id: 99,
      status: "RATE_LIMITED",
      created_at: "2026-10-04T20:00:00.000Z",
    },
    insertChanges: 1,
  });
  const result = await reserveAutomationSourceProviderRequest({
    database: mock.value,
    operationKey: "source:1:run:2:tavily:extract:1",
    sourceId: 1,
    runId: 2,
    providerKey: "tavily",
    operation: "EXTRACT",
    maxRequestsPerDay: 12,
    maxRequestsPerRun: 3,
    now: new Date("2026-10-05T12:00:00.000Z"),
  });
  assert.equal(result.reserved, true);
  assert.equal(mock.calls.some((sql) => sql.includes("INSERT INTO automation_source_provider_usage")), true);
});

test("budget exhaustion returns a bounded denial and the SQL enforces source day, run and global day limits", async () => {
  const mock = db({ latest: null, insertChanges: 0 });
  const result = await reserveAutomationSourceProviderRequest({
    database: mock.value,
    operationKey: "source:5:run:9:tavily:crawl:1",
    sourceId: 5,
    runId: 9,
    providerKey: "tavily",
    operation: "CRAWL",
    maxRequestsPerDay: 7,
    maxRequestsPerRun: 2,
    now: new Date("2026-10-05T12:00:00.000Z"),
  });
  assert.equal(result.reserved, false);
  assert.equal(result.reason, "BUDGET");
  const insert = mock.calls.find((sql) => sql.includes("INSERT INTO automation_source_provider_usage"));
  assert.ok(insert);
  assert.match(insert, /WHERE source_id=\? AND day_bucket=\?/);
  assert.match(insert, /WHERE run_id=\?/);
  assert.match(insert, /WHERE day_bucket=\?/);
  assert.equal(AUTOMATION_SOURCE_PROVIDER_GLOBAL_DAILY_LIMIT, 200);
});

test("auth/config cooldown is longer than transient provider cooldown by contract", async () => {
  const now = new Date("2026-10-05T12:00:00.000Z");
  for (const [status, createdAt, expected] of [
    ["AUTH_FAILED", "2026-10-04T20:00:00.000Z", "2026-10-05T20:00:00.000Z"],
    ["CONFIG_MISSING", "2026-10-04T20:00:00.000Z", "2026-10-05T20:00:00.000Z"],
    ["PROVIDER_ERROR", "2026-10-05T11:30:00.000Z", "2026-10-05T12:30:00.000Z"],
    ["TIMEOUT", "2026-10-05T11:30:00.000Z", "2026-10-05T12:30:00.000Z"],
  ]) {
    const mock = db({ latest: { run_id: 99, status, created_at: createdAt } });
    const result = await reserveAutomationSourceProviderRequest({
      database: mock.value,
      operationKey: "op-" + status,
      sourceId: 7,
      runId: 11,
      providerKey: "tavily",
      operation: "CRAWL",
      maxRequestsPerDay: 10,
      maxRequestsPerRun: 2,
      now,
    });
    assert.equal(result.reserved, false);
    assert.equal(result.reason, "COOLDOWN");
    assert.equal(result.cooldownUntil, expected);
  }
});


test("transient timeout from the same run does not activate cooldown before the bounded retry", async () => {
  const mock = db({
    latest: {
      run_id: 92,
      status: "TIMEOUT",
      created_at: "2026-10-06T17:16:55.474Z",
    },
    insertChanges: 1,
  });
  const result = await reserveAutomationSourceProviderRequest({
    database: mock.value,
    operationKey: "source:82:run:92:tavily:crawl:2",
    sourceId: 82,
    runId: 92,
    providerKey: "tavily",
    operation: "CRAWL",
    maxRequestsPerDay: 10,
    maxRequestsPerRun: 3,
    now: new Date("2026-10-06T17:17:05.000Z"),
  });
  assert.equal(result.reserved, true);
  assert.equal(mock.calls.some((sql) => sql.includes("INSERT INTO automation_source_provider_usage")), true);
});

test("the same transient timeout still cools down a later independent run", async () => {
  const mock = db({
    latest: {
      run_id: 92,
      status: "TIMEOUT",
      created_at: "2026-10-06T17:16:55.474Z",
    },
  });
  const result = await reserveAutomationSourceProviderRequest({
    database: mock.value,
    operationKey: "source:82:run:93:tavily:crawl:1",
    sourceId: 82,
    runId: 93,
    providerKey: "tavily",
    operation: "CRAWL",
    maxRequestsPerDay: 10,
    maxRequestsPerRun: 3,
    now: new Date("2026-10-06T17:17:05.000Z"),
  });
  assert.equal(result.reserved, false);
  assert.equal(result.reason, "COOLDOWN");
});
