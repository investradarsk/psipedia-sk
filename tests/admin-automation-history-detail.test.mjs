import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  automationHistoryDetailHref,
  automationHistoryListHref,
  parseAutomationHistoryCounts,
} from "../lib/admin-automation-history-detail.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("persisted Notion run counters display exact amounts without double counting", () => {
  const message = "Kontrola dokončená s čiastočným úspechom. Skontrolovaných: 661, nových: 1, aktualizovaných: 0, preskočených: 486, chýb: 22, konfliktov na kontrolu: 11.";
  assert.deepEqual(parseAutomationHistoryCounts(message), [
    { label: "Skontrolovaných", value: 661 },
    { label: "Nových", value: 1 },
    { label: "Aktualizovaných", value: 0 },
    { label: "Preskočených", value: 486 },
    { label: "Chýb", value: 22 },
    { label: "Konfliktov na kontrolu", value: 11 },
  ]);
});

test("missing and unsafe counters are not guessed", () => {
  assert.deepEqual(parseAutomationHistoryCounts("Automatická kontrola sa začala."), []);
  assert.deepEqual(parseAutomationHistoryCounts("chýb: 9999999999999999999999."), []);
  assert.deepEqual(parseAutomationHistoryCounts("nových: 3."), [{ label: "Nových", value: 3 }]);
});

test("each alert opens its own event and supports filtered back navigation", () => {
  assert.equal(automationHistoryDetailHref(17), "/admin/operations/automaticke-udalosti/17");
  assert.throws(() => automationHistoryDetailHref(0));
  assert.throws(() => automationHistoryDetailHref(NaN));
  assert.throws(() => automationHistoryDetailHref(1.5));
  assert.equal(
    automationHistoryListHref({ system: "notion", runId: "1792947625621", actorRef: "notion/events-help" }),
    "/admin/operations/automaticke-udalosti?system=notion&period=90&run=1792947625621&automation=events-help",
  );
  assert.equal(
    automationHistoryListHref({ system: "unknown", runId: "1", actorRef: null }),
    "/admin/operations/automaticke-udalosti",
  );
});

test("history link targets a real protected, scoped detail instead of its own filtered list", () => {
  const list = read("app/admin/operations/automaticke-udalosti/page.tsx");
  const detail = read("app/admin/operations/automaticke-udalosti/[id]/page.tsx");
  assert.match(list, /href=\{automationHistoryDetailHref\(event\.id\)\}/);
  assert.doesNotMatch(list, /href=\{normalizeAdminNotificationPath\(event\.target_url\)\}/);
  assert.match(detail, /requireAdminPageUser/);
  assert.match(detail, /Number\.isSafeInteger\(id\)/);
  assert.match(detail, /source_type = 'AUTOMATION_RUN'/);
  assert.match(detail, /actor_type = 'AUTOMATION'/);
  assert.match(detail, /resource_type = \? AND resource_ref = \? AND actor_ref = \?/);
  assert.match(detail, /notFound\(\)/);
  assert.match(detail, /history\.results\.map/);
  assert.match(detail, /Neobsahuje zoznam konkrétnych/);
});
