import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("retired manual source run is denied without background dispatch", () => {
  const route = read("app/api/admin/automation-sources/[id]/run/route.ts");
  const helper = read("lib/legacy-automation-retired.ts");
  assert.match(route, /legacyAutomationRetiredResponse/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function POST/);
  assert.match(helper, /status: 410/);
  assert.doesNotMatch(route, /waitUntil|runAutomationSourceNow|canonicalDraftWrite/);
});

test("source detail polls RUNNING background jobs instead of holding one long request", () => {
  const component = read("components/admin-automation-source-detail.tsx");
  assert.match(component, /pollRunStatus/);
  assert.match(component, /setTimeout\(resolve, 2000\)/);
  assert.match(component, /source\.lastRunStatus === "RUNNING"/);
  assert.match(component, /Kontrola beží na pozadí/);
  assert.match(component, /Túto stránku môžeš pokojne opustiť/);
});

test("only one RUNNING job per source is allowed and stale jobs recover", () => {
  const migration = read("drizzle/0057_automation_background_run_lock.sql");
  const store = read("lib/data-automation-store.ts");
  assert.match(migration, /automation_runs_one_running_per_source/);
  assert.match(migration, /WHERE status='RUNNING'/);
  assert.match(store, /stale_run_recovered/);
  assert.match(store, /automation_source_already_running/);
  assert.match(store, /20 \* 60_000/);
});

test("retired background route has no remaining publication or draft writes", () => {
  const route = read("app/api/admin/automation-sources/[id]/run/route.ts");
  assert.match(route, /legacyAutomationRetiredResponse/);
  assert.doesNotMatch(route, /runAutomationSourceNow|canonicalDraftWrite|publication: true|waitUntil/);
});
