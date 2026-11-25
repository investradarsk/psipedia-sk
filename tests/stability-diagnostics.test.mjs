import assert from "node:assert/strict";
import test from "node:test";
import { logStability, observeWorkerResponse, requestStabilityContext } from "../lib/stability-diagnostics.ts";
import { retryTransientPublicRead } from "../lib/public-read-retry.ts";
import { settleOptionalRead, matchOptionalPublicCache } from "../lib/optional-read-recovery.ts";

async function capture(run) {
  const records = [];
  const originals = { info: console.info, warn: console.warn, error: console.error };
  for (const level of Object.keys(originals)) {
    console[level] = (line) => records.push({ level, ...JSON.parse(line) });
  }
  try { await run(records); }
  finally { Object.assign(console, originals); }
}

test("retry logs only failures and recovery, not successful first reads", async () => {
  await capture(async (records) => {
    assert.equal(await retryTransientPublicRead(async () => 1), 1);
    assert.equal(records.length, 0);
    let attempts = 0;
    const result = await retryTransientPublicRead(async () => {
      if (++attempts === 1) throw new Error("Network connection lost. SECRET");
      return 42;
    }, { stage: "directory_listing" });
    assert.equal(result, 42);
    assert.deepEqual(records.map(r => [r.outcome, r.attempt, r.stage]), [
      ["retrying", 1, "directory_listing"], ["recovered", 2, "directory_listing"],
    ]);
    assert.ok(records.every(r => r.durationMs >= 0));
    assert.doesNotMatch(JSON.stringify(records), /SECRET/);
  });
});

test("persistent failures preserve the exception and record exhausted", async () => {
  await capture(async (records) => {
    const failure = new Error("Network connection lost. secret");
    await assert.rejects(retryTransientPublicRead(async () => { throw failure; }), e => e === failure);
    assert.deepEqual(records.map(r => r.outcome), ["retrying", "exhausted"]);
    assert.equal(records[1].attempt, 2);
    assert.doesNotMatch(JSON.stringify(records), /secret/);
  });
});

test("optional read and cache failures are distinct degraded events", async () => {
  await capture(async (records) => {
    assert.equal(await settleOptionalRead("home_help", Promise.reject(new Error("Network connection lost")), null), null);
    assert.equal(await matchOptionalPublicCache({ match: async () => { throw new Error("cache secret"); } }, new Request("https://example.test/private?secret=1"), "html"), undefined);
    assert.deepEqual(records.map(r => [r.dependency, r.outcome, r.stage]), [
      ["read", "degraded", "home_help"], ["cache", "degraded", "html"],
    ]);
    assert.equal(records[1].operation, "match");
    assert.doesNotMatch(JSON.stringify(records), /secret|example.test/);
  });
});

test("worker response observation never replaces or repeats the response", async () => {
  await capture(async (records) => {
    const request = new Request("https://example.test/adresar.rsc?_rsc=SECRET");
    const response = new Response("body", { status: 503 });
    let calls = 0;
    assert.equal(await observeWorkerResponse(request, async () => { calls++; return response; }), response);
    assert.equal(calls, 1);
    assert.equal(records[0].status, 503);
    assert.equal(records[0].kind, "rsc");
    assert.equal(records[0].area, "public");
    assert.doesNotMatch(JSON.stringify(records), /SECRET|example.test/);
    const error = new Error("SECRET");
    await assert.rejects(observeWorkerResponse(request, async () => { throw error; }), e => e === error);
    assert.equal(records[1].outcome, "failed");
  });
});

test("cancellation and unexpected stage labels do not disclose private inputs", async () => {
  await capture(async (records) => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(retryTransientPublicRead(async () => assert.fail("unexpected read"), { signal: controller.signal }));
    assert.equal(records[0].outcome, "aborted");
    assert.equal(records[0].attempt, 0);
    logStability({ stage: "private@example.test", dependency: "read", outcome: "degraded", durationMs: 0 });
    assert.equal(records[1].stage, "unspecified");
    assert.doesNotMatch(JSON.stringify(records), /private@example.test/);
    assert.deepEqual(requestStabilityContext(new Request("https://example.test/admin/secret.rsc")), { kind: "rsc", area: "admin" });
    assert.deepEqual(requestStabilityContext(new Request("https://example.test/api/secret")), { kind: "api", area: "api" });
  });
});
