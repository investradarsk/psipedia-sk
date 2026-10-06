import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { evaluateGovernanceForActivation } from "../lib/data-automation-governance.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function governanceState(overrides = {}) {
  return {
    id: 1,
    subjectType: "AUTOMATION_SOURCE",
    subjectId: 1,
    accessStatus: "UNKNOWN",
    robotsStatus: "UNKNOWN",
    termsStatus: "ALLOWED",
    recurringStatus: "APPROVED",
    retentionStatus: "RESTRICTED",
    retainUrl: true,
    retainTitle: false,
    retainSnippet: false,
    retainMetadata: true,
    retentionDays: null,
    minCadenceMinutes: null,
    maxRequestsPerDay: null,
    manualOnly: false,
    pathScope: null,
    restrictionsNote: null,
    termsUrl: null,
    privacyUrl: null,
    robotsUrl: null,
    evidenceUrl: "https://example.sk/source",
    reviewedAt: "2026-10-06T00:00:00.000Z",
    reviewedBy: "admin@example.com",
    rationale: "approved",
    expiresAt: null,
    reviewDueAt: null,
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    ...overrides,
  };
}

test("provider-managed governance does not require Psipedia access/robots probes but keeps human policy gates", () => {
  const read = { schemaAvailable: true, state: governanceState() };
  const providerManaged = evaluateGovernanceForActivation(read, {
    recurring: true,
    cadenceMinutes: 1440,
    storageFields: ["url", "metadata"],
    providerManagedAccess: true,
  });
  assert.equal(providerManaged.allowed, true);
  assert.deepEqual(providerManaged.blockingReasons, []);

  const denied = evaluateGovernanceForActivation({
    schemaAvailable: true,
    state: governanceState({ recurringStatus: "DENIED" }),
  }, {
    recurring: true,
    cadenceMinutes: 1440,
    storageFields: ["url", "metadata"],
    providerManagedAccess: true,
  });
  assert.equal(denied.allowed, false);
  assert.ok(denied.blockingReasons.includes("RECURRING_USE_NOT_APPROVED"));
});

test("production automation entrypoints explicitly select TAVILY_ONLY and do not inject first-party web adapters", async () => {
  const [worker, sourceRunRoute, sourceConfigureRoute, searchRoute] = await Promise.all([
    readFile(path.join(repoRoot, "worker/index.ts"), "utf8"),
    readFile(path.join(repoRoot, "app/api/admin/automation-sources/[id]/run/route.ts"), "utf8"),
    readFile(path.join(repoRoot, "app/api/admin/automation-sources/[id]/route.ts"), "utf8"),
    readFile(path.join(repoRoot, "app/api/admin/automation-categories/[category]/search/route.ts"), "utf8"),
  ]);

  const sourceSweeps = [...worker.matchAll(/runDataAutomationSweep\(\{([\s\S]*?)\}\)\.catch/g)];
  const discoverySweeps = [...worker.matchAll(/runDataAutomationDiscoverySweep\(\{([\s\S]*?)\}\)\.catch/g)];
  assert.equal(sourceSweeps.length, 2, "five-minute and hourly source sweeps must both be covered");
  assert.equal(discoverySweeps.length, 2, "five-minute and hourly discovery sweeps must both be covered");
  assert.ok(sourceSweeps.every((match) => /internetTransport:\s*"TAVILY_ONLY"/.test(match[1])));
  assert.ok(discoverySweeps.every((match) => /internetTransport:\s*"TAVILY_ONLY"/.test(match[1])));
  assert.ok(discoverySweeps.every((match) => /tavilyApiKey:\s*env\.TAVILY_API_KEY/.test(match[1])));
  assert.doesNotMatch(worker, /productionAutomationHtmlAdapters|createProductionOrganizationEnricher/);

  assert.match(sourceRunRoute, /internetTransport:\s*"TAVILY_ONLY"/);
  assert.doesNotMatch(sourceRunRoute, /productionAutomationHtmlAdapters|createProductionOrganizationEnricher/);

  assert.match(sourceConfigureRoute, /internetTransport:\s*"TAVILY_ONLY"/);
  assert.doesNotMatch(sourceConfigureRoute, /productionAutomationHtmlAdapters|createProductionOrganizationEnricher/);

  assert.match(searchRoute, /TavilyAutomationSearchProvider/);
  assert.match(searchRoute, /internetTransport:\s*"TAVILY_ONLY"/);
  assert.match(searchRoute, /tavilyApiKey:\s*bindings\.TAVILY_API_KEY/);
});

test("Tavily-only source execution uses explicit provider strategy instead of direct source transport", async () => {
  const [runner, preview, direct] = await Promise.all([
    readFile(path.join(repoRoot, "lib/data-automation-runner.ts"), "utf8"),
    readFile(path.join(repoRoot, "lib/data-automation-preview.ts"), "utf8"),
    readFile(path.join(repoRoot, "lib/data-automation-direct-entity.ts"), "utf8"),
  ]);

  for (const source of [runner, preview]) {
    assert.match(source, /strategyOverride:\s*tavilyStrategy/);
    assert.match(source, /"TAVILY_EXTRACT"/);
    assert.match(source, /"TAVILY_CRAWL"/);
  }
  assert.match(direct, /strategyOverride:\s*"TAVILY_EXTRACT"/);
  assert.match(direct, /internetTransport !== "TAVILY_ONLY"/);
});
