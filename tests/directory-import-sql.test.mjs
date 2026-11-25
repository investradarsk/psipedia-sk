import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("retired directory bulk import cannot touch historic columns or write profiles", () => {
  const route = readFileSync(new URL("../app/api/admin/import/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /INSERT INTO directory_profiles|UPDATE directory_profiles/i);
  assert.doesNotMatch(route, /services_json|qualifications_json|source_data_json/);
  assert.match(route, /if \(profiles\.some\(\(_profile, index\) => plan\.actions\.profiles\[index\] !== "skipped"\)\) \{\s*throw new Error/);
});

test("ADMIN-CORE generic import is preview-first and requires explicit confirmation", () => {
  const component = readFileSync(new URL("../components/admin-data-import.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/admin/import/route.ts", import.meta.url), "utf8");
  const previewRoute = readFileSync(new URL("../app/api/admin/import/preview/route.ts", import.meta.url), "utf8");

  assert.match(component, /\/api\/admin\/import\/preview/);
  assert.match(component, /confirmed:\s*true/);
  assert.match(component, /1\. Skontrolovať a zobraziť Preview/);
  assert.match(component, /2\. Potvrdiť import/);
  assert.match(route, /payload\.confirmed !== true/);
  assert.match(route, /Pred importom je povinný Preview a explicitné potvrdenie/);
  assert.match(previewRoute, /buildGeneralImportPlan/);
});

test("ADMIN-CORE generic import protects publication state and reports deterministic actions", () => {
  const route = readFileSync(new URL("../app/api/admin/import/route.ts", import.meta.url), "utf8");
  const plan = readFileSync(new URL("../lib/admin-import-plan.ts", import.meta.url), "utf8");
  const component = readFileSync(new URL("../components/admin-data-import.tsx", import.meta.url), "utf8");

  assert.match(plan, /if \(existingStatus === "published"\) return \{ action: "skipped" \}/);
  assert.match(plan, /Import dopytov nie je podporovaný, kým nemá canonical idempotentný kľúč/);
  assert.match(plan, /nepodporované top-level polia/);
  assert.match(plan, /nepovolený spustiteľný alebo HTML obsah/);
  assert.match(route, /"draft", text\(row\.accent/);
  assert.match(route, /text\(row\.eventType\), "draft"/);
  assert.match(route, /required\(row\.category, "kategória pomoci"\),\s*"draft"/);
  assert.match(route, /plan\.actions\.profiles\[index\] !== "skipped"/);
  assert.doesNotMatch(route, /INSERT INTO directory_profiles/i);
  assert.match(plan, /if \(insertOnly\) return \{ action: "skipped" \}/);
  assert.match(plan, /identity\.category, null\)/);
  assert.match(component, /INSERTED/);
  assert.match(component, /UPDATED/);
  assert.match(component, /SKIPPED/);
  assert.match(component, /REJECTED/);
  assert.match(component, /CSV ani XLSX tento import nepodporuje/);
});

test("ADMIN-CORE import preview rejects ambiguous profile identities before SQL mutation", () => {
  const plan = readFileSync(new URL("../lib/admin-import-plan.ts", import.meta.url), "utf8");
  assert.match(plan, /existingBySlug && existingByImportKey !== existingBySlug/);
  assert.match(plan, /importKey nesedí s existujúcim category\+slug/);
  assert.match(plan, /validateCanonicalSlug/);
});
