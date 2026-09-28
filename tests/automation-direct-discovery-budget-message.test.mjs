import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("unchanged DIRECT_ENTITY retry reports exhausted daily budget instead of fake immediate run", async () => {
  const route = await read("app/api/admin/automation-categories/[category]/route.ts");
  assert.match(route, /const unchangedDirectRetry = enabled/);
  assert.match(route, /remainingRootRequests <= 0/);
  assert.match(route, /SEARCH_BUDGET_BLOCKED/);
  assert.match(route, /Denný limit hľadania je dnes vyčerpaný/);
  const blockedIndex = route.indexOf("if (directRetryBudgetExhausted)");
  const immediateIndex = route.indexOf("const immediateRun = enabled");
  assert.ok(blockedIndex >= 0 && blockedIndex < immediateIndex);
});
