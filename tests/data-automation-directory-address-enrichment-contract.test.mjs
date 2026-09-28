import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("DIRECTORY exact address enrichment is wired into both discovery and refresh", async () => {
  const runner = await read("lib/data-automation-discovery-runner.ts");
  assert.match(runner, /provenanceType: "DIRECT_ENTITY_DISCOVERY",[\s\S]*addressSearch,[\s\S]*addressEvidenceText/);
  assert.match(runner, /provenanceType: "DIRECT_ENTITY_REFRESH",[\s\S]*expectedCanonicalEntityId: candidate\.id,[\s\S]*addressSearch/);
  assert.match(runner, /addressEnrichmentSearchForRoot/);
  assert.match(runner, /reserveAutomationAddressEnrichmentRequest/);
});

test("address follow-up search has a separate bounded audited daily allowance", async () => {
  const [budget, store] = await Promise.all([
    read("lib/data-automation-search-budget.ts"),
    read("lib/data-automation-discovery-store.ts"),
  ]);
  assert.match(budget, /AUTOMATION_SEARCH_DEFAULT_ADDRESS_ENRICHMENT_DAILY_REQUESTS = 3/);
  assert.match(budget, /AUTOMATION_SEARCH_HARD_ADDRESS_ENRICHMENT_DAILY_REQUESTS = 5/);
  assert.match(store, /operation_key LIKE 'address-enrichment:%'/);
  assert.match(store, /address_enrichment_requests_today/);
  assert.match(store, /globalDailyLimit/);
  assert.match(store, /entityDailyLimit/);
});

test("verified Geoapify address can confirm a new draft without enabling canonical auto-update", async () => {
  const [direct, mapper, canonical] = await Promise.all([
    read("lib/data-automation-direct-entity.ts"),
    read("lib/data-automation-draft-mapper.ts"),
    read("lib/canonical-draft-service.ts"),
  ]);
  assert.match(direct, /verifiedDirectoryAddress/);
  assert.match(direct, /upsertDirectEntityUpdateSuggestion/);
  assert.doesNotMatch(direct, /UPDATE\s+directory_profiles/i);
  assert.match(mapper, /verifiedDirectoryAddress/);
  assert.match(canonical, /CONFIRMED_SERVICE_LOCATION/);
  assert.match(canonical, /status: "draft"/);
  assert.match(canonical, /LEGACY_UNCONFIRMED/);
});

test("automation search UI separates discovery and address-enrichment Tavily usage", async () => {
  const ui = await read("components/admin-automation-search-controls.tsx");
  assert.match(ui, /Dohľadanie presnej adresy/);
  assert.match(ui, /samostatný bounded Tavily lookup/);
  assert.match(ui, /Geoapify/);
});
