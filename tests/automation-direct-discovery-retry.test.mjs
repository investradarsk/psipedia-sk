import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("explicit DIRECT_ENTITY retry retires stale success and empty cooldown fingerprints", async () => {
  const recovery = await read("lib/data-automation-direct-discovery-recovery.ts");
  assert.match(recovery, /status IN \('SUCCESS','EMPTY'\)/);
  assert.match(recovery, /query_fingerprint=query_fingerprint \|\| ':admin-retry:' \|\| id/);
  assert.doesNotMatch(recovery, /status IN \('PARTIAL','FAILED'\)/);
});

test("explicit retry preserves provider accounting and bounded daily budgets", async () => {
  const [recovery, runner, store] = await Promise.all([
    read("lib/data-automation-direct-discovery-recovery.ts"),
    read("lib/data-automation-discovery-runner.ts"),
    read("lib/data-automation-discovery-store.ts"),
  ]);
  assert.doesNotMatch(recovery, /SET[\s\S]*request_count\s*=/i);
  assert.doesNotMatch(recovery, /SET[\s\S]*day_bucket\s*=/i);
  assert.match(runner, /reserveAutomationSearchRequest/);
  assert.match(store, /ROOT_BUDGET_EXHAUSTED/);
  assert.match(store, /SUM\(request_count\)/);
});

test("scheduled discovery still uses normal cooldown while admin save invokes retry recovery", async () => {
  const [route, runner] = await Promise.all([
    read("app/api/admin/automation-categories/[category]/route.ts"),
    read("lib/data-automation-discovery-runner.ts"),
  ]);
  assert.match(route, /releaseFailedDirectDiscoveryCooldowns/);
  assert.match(route, /category\.mode === "DIRECT_ENTITY"/);
  assert.match(runner, /getAutomationSearchCooldownState/);
  assert.match(runner, /if \(cooldown\.blocked\)/);
});
