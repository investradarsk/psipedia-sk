import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../components/admin-geo-operations.tsx", import.meta.url), "utf8");

test("A2 exact admin section exposes a read-only preview control", () => {
  assert.match(component, /data-admin-a2-exact-automation/);
  assert.match(component, /A2 — Exact directory automation/);
  assert.match(component, /Obnoviť A2 preview/);
  assert.match(component, /Read-only preview — nič nemení a nevolá Geoapify/);
  assert.match(component, /action:\s*"a2-preview"/);
});

test("A2 preview payload stays read-only and sends no confirmation token", () => {
  const start = component.indexOf('action({ action: "a2-preview" })');
  assert.notEqual(start, -1);
  const previewBlock = component.slice(Math.max(0, start - 250), start + 250);
  assert.doesNotMatch(previewBlock, /confirm\s*:/);
  assert.doesNotMatch(previewBlock, /targetIds\s*:/);
});

test("A2 preview renders selected IDs, status, reason and intended action", () => {
  for (const contract of [
    "eligibleCount",
    "selectedCandidateIds",
    "currentStatus",
    "action",
    "reason",
    "intendedAction",
  ]) {
    assert.match(component, new RegExp(contract));
  }
  assert.match(component, /Selected target IDs/);
  assert.match(component, /Current status/);
  assert.match(component, /Eligibility/);
  assert.match(component, /Intended action/);
});

test("A2 canary requires explicit positive IDs and caps input at ten", () => {
  assert.match(component, /function parsedA2Ids\(\)/);
  assert.match(component, /Zadaj aspoň jedno DIRECTORY_PROFILE ID/);
  assert.match(component, /najviac 10 ID/);
  assert.match(component, /Number\.isSafeInteger\(id\)/);
  assert.match(component, /id <= 0/);
  assert.match(component, /new Set\(ids\)\.size !== ids\.length/);
  assert.match(component, /!a2IdsText\.trim\(\)/);
});

test("A2 canary uses explicit confirmation and exact backend contract", () => {
  assert.match(component, /window\.confirm\("Spustiť A2 exact canary/);
  assert.match(component, /action:\s*"a2-canary"/);
  assert.match(component, /targetIds:\s*ids/);
  assert.match(component, /confirm:\s*"A2-CANARY"/);
  assert.match(component, /Canary môže volať Geoapify a zapisovať reálne GEO výsledky/);
  assert.doesNotMatch(component, /Spustiť A2 všetko|A2 process-all|a2-process-all/i);
});

test("legacy approximate onboarding remains present and clearly separated from A2", () => {
  assert.match(component, /data-admin-explicit-geo-onboarding/);
  assert.match(component, /Legacy explicit approximate onboarding/);
  assert.match(component, /Legacy approximate onboarding — nepoužíva sa pre A2 exact rollout/);
  assert.match(component, /APPROXIMATE_PUBLIC/);
  assert.match(component, /MUNICIPALITY/);
});

test("A2 controls keep mobile-safe wrapping and table overflow", () => {
  const start = component.indexOf('data-admin-a2-exact-automation');
  const end = component.indexOf('data-admin-explicit-geo-onboarding');
  assert.ok(start >= 0 && end > start);
  const a2 = component.slice(start, end);
  assert.match(a2, /overflowX:\s*"auto"/);
  assert.match(a2, /maxWidth:\s*"100%"/);
  assert.match(a2, /width:\s*"100%"/);
  assert.match(a2, /overflowWrap:\s*"anywhere"/);
});
