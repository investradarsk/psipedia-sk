import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("DIRECT_ENTITY adapter_no_records has a conservative search-title fallback", async () => {
  const direct = await read("lib/data-automation-direct-entity.ts");
  assert.match(direct, /error instanceof AutomationConnectorError/);
  assert.match(direct, /error\.code !== "adapter_no_records"/);
  assert.match(direct, /SEARCH_RESULT_TITLE_FALLBACK/);
  assert.match(direct, /sourceRecordId: \("search-url:" \+ sourceUrl\)/);
  assert.match(direct, /websiteUrl: sourceUrl/);
});

test("explicit DIRECT_ENTITY retry retires only poisoned cooldown fingerprints and preserves usage rows", async () => {
  const recovery = await read("lib/data-automation-direct-discovery-recovery.ts");
  const route = await read("app/api/admin/automation-categories/[category]/route.ts");
  assert.match(recovery, /UPDATE automation_search_usage/);
  assert.doesNotMatch(recovery, /DELETE FROM automation_search_usage/i);
  assert.match(recovery, /status='SUCCESS'/);
  assert.match(recovery, /status IN \('PARTIAL','FAILED'\)/);
  assert.match(recovery, /error_count>0/);
  assert.match(recovery, /downstream-failed/);
  assert.match(route, /releaseFailedDirectDiscoveryCooldowns/);
  assert.match(route, /category\.mode === "DIRECT_ENTITY" \|\| !wasEnabled/);
});
