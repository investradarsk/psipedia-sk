import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Gemini dashboard isolates history and queue read failures from STOP and settings", () => {
  const page = read("app/admin/automatizacie-gemini/page.tsx");
  const api = read("app/api/admin/gemini-automation/route.ts");

  assert.match(page, /Promise\.allSettled\(/);
  assert.match(page, /historyRead\.status === "fulfilled"/);
  assert.match(page, /queueRead\.status === "fulfilled"/);
  assert.match(page, /else ready = false;/);
  assert.match(page, /initialHistoryAvailable=\{historyAvailable\}/);
  assert.match(page, /initialQueueAvailable=\{queueAvailable\}/);

  assert.match(api, /Promise\.allSettled\(/);
  assert.match(api, /settingsRead\.status === "rejected" \|\| controlRead\.status === "rejected"/);
  assert.match(api, /historyAvailable: historyRead\.status === "fulfilled"/);
  assert.match(api, /queueAvailable: queueRead\.status === "fulfilled"/);
});

test("unavailable Gemini history is not incorrectly presented as empty", () => {
  const dashboard = read("components/admin-gemini-automation-settings.tsx");

  assert.match(dashboard, /historyAvailable \? <GeminiHistory/);
  assert.match(dashboard, /História behov je dočasne nedostupná/);
  assert.match(dashboard, /queueAvailable\s*\? <GeminiQueue/);
  assert.match(dashboard, /Stav fronty je dočasne nedostupný/);
  assert.match(dashboard, /setRefreshError\("Aktuálny stav sa nepodarilo overiť/);
  assert.match(dashboard, /controller\.abort\(\)/);
});

test("accepted paid requests are not turned into failures by readback and stalled work is visible", () => {
  const dashboard = read("components/admin-gemini-automation-settings.tsx");
  const runRequest = dashboard.slice(dashboard.indexOf("async function onPilotClick()"), dashboard.indexOf("  return (", dashboard.indexOf("async function onPilotClick()")));

  assert.match(runRequest, /const response = await fetch\("\/api\/admin\/gemini-automation\/run"/);
  assert.match(runRequest, /const settingResponse = await fetch\("\/api\/admin\/gemini-automation\?stable_key=/);
  assert.match(runRequest, /The regular read-only polling will reconcile the settings/);
  assert.match(runRequest, /duplicitná platená úloha/);
  assert.match(dashboard, /function isStalledGeminiJob/);
  assert.match(dashboard, /2 \* 60 \* 60 \* 1000/);
  assert.match(dashboard, /Neopakuj spustenie bez overenia výsledku/);
});
