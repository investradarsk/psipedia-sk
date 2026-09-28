import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("category discovery OFF has no scheduled eligibility and ON schedules an immediate first run", async () => {
  const [store, route] = await Promise.all([
    read("lib/data-automation-discovery-store.ts"),
    read("app/api/admin/automation-categories/[category]/route.ts"),
  ]);
  assert.match(store, /WHERE enabled=1 AND review_status='APPROVED'/);
  assert.match(store, /input\.enabled \? at : null/);
  assert.match(route, /immediateRun = enabled && !wasEnabled/);
  assert.match(route, /runAutomationDiscoveryRootCanary/);
  assert.match(route, /waitUntil\(task\)/);
});

test("discovery candidates render as new sources and expose approve or reject only", async () => {
  const component = await read("components/admin-automation-category-sources.tsx");
  assert.match(component, /reviewStatus === "NEW" && candidate\.lifecycle === "ACTIVE"/);
  assert.match(component, /reviewCandidate\(candidate\.id, "approve"\)/);
  assert.match(component, /reviewCandidate\(candidate\.id, "reject"\)/);
  assert.doesNotMatch(component, /suppress|adapter|readiness|governance|finding|cluster|receipt/i);
});

test("approve provisions an approved but disabled source", async () => {
  const [candidateRoute, store] = await Promise.all([
    read("app/api/admin/automation-source-candidates/[id]/route.ts"),
    read("lib/data-automation-source-store.ts"),
  ]);
  assert.match(candidateRoute, /reviewAutomationSource/);
  assert.doesNotMatch(candidateRoute, /setAutomationSourceEnabled|previewAutomationSource/);
  assert.match(store, /VALUES \(\?,\?,\?,\?,\?,\?,0,1440/);
});

test("rejected URL identity is stable and cannot reappear as NEW", async () => {
  const store = await read("lib/data-automation-source-store.ts");
  assert.match(store, /ON CONFLICT\(canonical_url,entity_type\) DO UPDATE/);
  assert.match(store, /ELSE automation_source_candidates\.review_status/);
  assert.match(store, /input\.action === "reject" \? "REJECTED"/);
});

test("source monitoring OFF is unscheduled and ON starts immediately", async () => {
  const [sourceStore, route] = await Promise.all([
    read("lib/data-automation-source-store.ts"),
    read("app/api/admin/automation-sources/[id]/route.ts"),
  ]);
  assert.match(sourceStore, /input\.enabled \? at : null/);
  assert.match(route, /immediateRun = enabled && !before\.enabled/);
  assert.match(route, /runAutomationSourceNow/);
  assert.match(route, /waitUntil\(task\)/);
});

test("normal source UX contains only monitoring, cadence and canonical concepts CTA", async () => {
  const source = await read("components/admin-automation-source-settings.tsx");
  assert.match(source, /Kontrolovať tento zdroj/);
  assert.match(source, /Ako často kontrolovať zdroj/);
  assert.match(source, /Otvoriť koncepty/);
  assert.doesNotMatch(source, /adapter|readiness|governance|finding|observation|cluster|receipt|write counter/i);
});


test("source-only UX maps readiness internals to one user-safe Slovak message", async () => {
  const [presentation, settings, category, page] = await Promise.all([
    read("lib/admin-automation-presentation.ts"),
    read("components/admin-automation-source-settings.tsx"),
    read("components/admin-automation-category-sources.tsx"),
    read("app/admin/automatizacie/zdroje/[id]/page.tsx"),
  ]);

  assert.match(presentation, /automation_source_not_ready:/);
  assert.match(presentation, /automation_candidate_source_not_ready:/);
  assert.match(presentation, /automation_candidate_source_provisioning_conflict/);
  assert.match(presentation, /Tento zdroj zatiaľ nie je pripravený na automatické spracovanie\./);

  assert.match(settings, /automationSourceOnlyErrorMessage/);
  assert.match(category, /automationSourceOnlyErrorMessage/);
  assert.doesNotMatch(settings, /throw new Error\(payload\.error\s*\|\|/);
  assert.doesNotMatch(category, /throw new Error\(payload\.error\s*\|\|/);

  assert.match(page, /automationSourceReadiness/);
  assert.match(page, /monitoringReady/);
  assert.match(settings, /disabled=\{busy \|\| !monitoringReady\}/);
  assert.doesNotMatch(settings, /MISSING_ADAPTER|UNSUPPORTED_ADAPTER|ADAPTER_ENTITY_MISMATCH|ADAPTER_SHAPE_MISMATCH|MISSING_PARSER/);
  assert.doesNotMatch(settings, /Pokročilé|adapter key|readiness/i);
});
