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

  assert.match(presentation, /automation_source_not_ready/);
  assert.match(presentation, /automation_source_governance_blocked/);
  assert.match(presentation, /automation_source_activation_blocked/);
  assert.match(presentation, /automation_candidate_source_not_ready:/);
  assert.match(presentation, /automation_candidate_source_provisioning_conflict/);
  assert.match(presentation, /Tento zdroj zatiaľ nemožno automaticky kontrolovať\./);

  assert.match(settings, /automationSourceOnlyErrorMessage/);
  assert.match(category, /automationSourceOnlyErrorMessage/);
  assert.doesNotMatch(settings, /throw new Error\(payload\.error\s*\|\|/);
  assert.doesNotMatch(category, /throw new Error\(payload\.error\s*\|\|/);

  assert.match(page, /automationSourceActivationReadiness/);
  assert.doesNotMatch(page, /automationSourceReadiness\(/);
  assert.match(page, /monitoringReady/);
  assert.match(page, /automationSourceTechnicalGovernanceRetryable/);
  assert.match(page, /monitoringRetryable/);
  assert.match(settings, /monitoringCanEnable = monitoringReady \|\| monitoringRetryable/);
  assert.match(settings, /<option value="on" disabled=\{!monitoringCanEnable\}>/);
  assert.match(settings, /disabled=\{busy \|\| \(enabled && !monitoringCanEnable\)\}/);
  assert.match(settings, /Pri zapnutí sa bezpečnosť zdroja znova overí\./);
  assert.doesNotMatch(settings, /MISSING_ADAPTER|UNSUPPORTED_ADAPTER|ADAPTER_ENTITY_MISMATCH|ADAPTER_SHAPE_MISMATCH|MISSING_PARSER|GOVERNANCE_MISSING|ACCESS_NOT_ALLOWED|ROBOTS_NOT_ALLOWED|TERMS_NOT_ALLOWED|RECURRING_USE_NOT_APPROVED|RETENTION_/);
  assert.doesNotMatch(settings, /Pokročilé|adapter key|readiness/i);
});


test("source configure is validation-first and preserves immediate run only after successful OFF to ON", async () => {
  const route = await read("app/api/admin/automation-sources/[id]/route.ts");
  const store = await read("lib/data-automation-source-store.ts");
  assert.match(route, /configureAutomationSource/);
  assert.doesNotMatch(route, /setAutomationSourceCadence/);
  assert.match(route, /technicalGovernanceRefresh: enabled \? \{ actor: auth\.user\.email \} : undefined/);
  assert.match(route, /immediateRun = enabled && !before\.enabled/);
  assert.match(route, /if \(immediateRun\)[\s\S]*runAutomationSourceNow/);
  assert.match(store, /sourceActivationReadinessForEnable/);
  assert.match(store, /automationSourceTechnicalGovernanceRefreshNeeded/);
  assert.match(store, /refreshAutomationSourceTechnicalGovernance/);
  assert.match(store, /SET cadence_minutes=\?,enabled=\?,next_check_at=\?,updated_at=\?/);

  const configureIndex = route.indexOf("const source = await configureAutomationSource");
  const immediateRunIndex = route.indexOf("const immediateRun = enabled && !before.enabled");
  const runIndex = route.indexOf("runAutomationSourceNow(id");
  assert.ok(configureIndex >= 0 && configureIndex < immediateRunIndex);
  assert.ok(immediateRunIndex < runIndex, "source run is only scheduled after successful configure");
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
