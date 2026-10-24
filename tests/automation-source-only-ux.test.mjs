import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("category discovery OFF stays unscheduled while DIRECT_ENTITY save can retry immediately — po vyradení starého systému", async () => {
  const [store,route]=await Promise.all([read("lib/data-automation-discovery-store.ts"),read("app/api/admin/automation-categories/[category]/route.ts")]);
  assert.match(store,/WHERE enabled=1 AND review_status='APPROVED'/);
  assert.match(store,/root\.schedule\.mode === "CALENDAR"/);
  assert.match(route,/legacyAutomationRetiredResponse/);
  assert.doesNotMatch(route,/runAutomationDiscoveryRootCanary|waitUntil/);
});

test("discovery candidates render as new sources and expose approve or reject only", async () => {
  const component = await read("components/admin-automation-category-sources.tsx");
  assert.match(component, /reviewStatus === "NEW" && candidate\.lifecycle === "ACTIVE"/);
  assert.match(component, /reviewCandidate\(candidate\.id, "approve"\)/);
  assert.match(component, /reviewCandidate\(candidate\.id, "reject"\)/);
  assert.doesNotMatch(component, /suppress|adapter|readiness|governance|finding|cluster|receipt/i);
});

test("approve provisions an approved but disabled source — po vyradení starého systému", async () => {
  const [route,store,helper]=await Promise.all([read("app/api/admin/automation-source-candidates/[id]/route.ts"),read("lib/data-automation-source-store.ts"),read("lib/legacy-automation-retired.ts")]);
  assert.match(store,/VALUES \(\?,\?,\?,\?,\?,\?,0,1440/);
  assert.match(route,/legacyAutomationRetiredResponse/);
  assert.match(helper,/status: 410/);
});

test("rejected URL identity is stable and cannot reappear as NEW", async () => {
  const store = await read("lib/data-automation-source-store.ts");
  assert.match(store, /ON CONFLICT\(canonical_url,entity_type\) DO UPDATE/);
  assert.match(store, /ELSE automation_source_candidates\.review_status/);
  assert.match(store, /input\.action === "reject" \? "REJECTED"/);
});

test("source monitoring OFF is unscheduled and interval ON starts immediately while calendar ON waits — po vyradení starého systému", async () => {
  const [store,route]=await Promise.all([read("lib/data-automation-source-store.ts"),read("app/api/admin/automation-sources/[id]/route.ts")]);
  assert.match(store,/schedule\.mode === "CALENDAR"/);
  assert.match(store,/else if \(!existing\.enabled\) \{\s*nextCheckAt = at;/);
  assert.match(route,/legacyAutomationRetiredResponse/);
  assert.doesNotMatch(route,/configureAutomationSource|runAutomationSourceNow/);
});

test("normal source UX contains monitoring, cadence and direct canonical content navigation", async () => {
  const source = await read("components/admin-automation-source-settings.tsx");
  assert.match(source, /Kontrolovať tento zdroj/);
  assert.match(source, /Ako často kontrolovať zdroj/);
  assert.match(source, /Nájdený obsah/);
  assert.match(source, /content\.map/);
  assert.match(source, /Otvoriť canonical sekciu/);
  assert.doesNotMatch(source, /adapter|readiness|governance|finding|observation|cluster|receipt|write counter/i);
});


test("source-only UX maps readiness internals to one user-safe Slovak message — po vyradení starého systému", async () => {
  const [presentation,settings,category,page]=await Promise.all([
    read("lib/admin-automation-presentation.ts"),
    read("components/admin-automation-source-settings.tsx"),
    read("components/admin-automation-category-sources.tsx"),
    read("app/admin/automatizacie/zdroje/[id]/page.tsx")
  ]);
  assert.match(presentation,/automation_source_not_ready/);
  assert.match(presentation,/Tento zdroj zatiaľ nemožno automaticky kontrolovať\./);
  assert.match(settings,/automationSourceOnlyErrorMessage/);
  assert.match(category,/automationSourceOnlyErrorMessage/);
  assert.match(page,/redirect\("\/admin\/automatizacie-gemini"\)/);
});

test("source configure is validation-first and preserves immediate run only after successful OFF to ON — po vyradení starého systému", async () => {
  const [route,store]=await Promise.all([read("app/api/admin/automation-sources/[id]/route.ts"),read("lib/data-automation-source-store.ts")]);
  assert.match(store,/sourceActivationReadinessForEnable/);
  assert.match(store,/automationSourceTechnicalGovernanceRefreshNeeded/);
  assert.match(route,/legacyAutomationRetiredResponse/);
  assert.doesNotMatch(route,/configureAutomationSource|runAutomationSourceNow|waitUntil/);
});

test("technical governance retry error remains source-only and user-safe", async () => {
  const presentation = await read("lib/admin-automation-presentation.ts");
  assert.match(presentation, /automation_source_technical_verification_failed/);
  assert.match(
    presentation,
    /Tento zdroj sa momentálne nepodarilo bezpečne overiť\. Skús to neskôr\./,
  );
  assert.doesNotMatch(
    await read("components/admin-automation-source-settings.tsx"),
    /ACCESS_NOT_ALLOWED|ROBOTS_NOT_ALLOWED|GOVERNANCE_BLOCKED|UNKNOWN|RESTRICTED|DISALLOWED/,
  );
});
