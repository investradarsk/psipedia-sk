import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("missing entity budget config uses the intended entity default instead of one request", async () => {
  const budget = await read("lib/data-automation-search-budget.ts");
  assert.match(budget, /value === null \|\| value === undefined \|\| value === ""/);
  assert.match(budget, /if \(parsed === null\) return fallback/);
  assert.match(budget, /DIRECTORY: 20/);
  assert.match(budget, /ORGANIZATION: 20/);
  assert.match(budget, /ADOPTION: 10/);
});

test("manual budget override is day-scoped, additive and capped", async () => {
  const budget = await read("lib/data-automation-search-budget.ts");
  assert.match(budget, /row\.dayBucket !== dayBucket/);
  assert.match(budget, /row\.reason !== "MANUAL_BUDGET_OVERRIDE"/);
  assert.match(budget, /AUTOMATION_SEARCH_HARD_ROOT_DAILY_REQUESTS - baseRootDailyRequests/);
  assert.match(budget, /rootDailyRequests: baseRootDailyRequests \+ manualExtraRootRequests/);
});

test("admin search actions retain usage history and record operator context", async () => {
  const admin = await read("lib/data-automation-search-admin.ts");
  assert.match(admin, /adminOverrides/);
  assert.match(admin, /actor: cleanActor\(input\.actorEmail\)/);
  assert.match(admin, /reason: input\.reason/);
  assert.doesNotMatch(admin, /DELETE FROM automation_search_usage/i);
  assert.doesNotMatch(admin, /request_count\s*=\s*0/i);
});

test("category search endpoint exposes budget extension and explicit manual run", async () => {
  const route = await read("app/api/admin/automation-categories/[category]/search/route.ts");
  assert.match(route, /action !== "extend-budget" && action !== "run"/);
  assert.match(route, /MANUAL_BUDGET_OVERRIDE/);
  assert.match(route, /MANUAL_RUN/);
  assert.match(route, /AUTOMATION_SEARCH_HARD_ROOT_DAILY_REQUESTS/);
  assert.match(route, /claimAutomationDiscoveryRootManualRun/);
  assert.match(route, /runAutomationDiscoveryRootManual/);
  assert.doesNotMatch(route, /runAutomationDiscoveryRootCanary/);
  assert.match(route, /startedRootCount:\s*claims\.length/);
  assert.match(route, /waitUntil\(task\)/);
});

test("admin category UI explains that search budget does not limit refresh scans", async () => {
  const component = await read("components/admin-automation-search-controls.tsx");
  assert.match(component, /Dnešné využitie:/);
  assert.match(component, /Obnoviť limit/);
  assert.match(component, /Spustiť hľadanie/);
  assert.match(component, /Kontrola existujúcich záznamov tento Tavily limit nepoužíva/);
});
