import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  automationCadenceRecommendation,
  automationMatchExplanation,
  automationOperationsCutoff,
  parseAutomationOperationsRange,
} from "../lib/data-automation-operations-model.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function healthy(overrides = {}) {
  return {
    status: "SUCCESS",
    canonicalDuplicateCount: 8,
    newEntityCount: 0,
    updateSuggestionCount: 0,
    possibleDuplicateCount: 0,
    candidateCount: 10,
    errorCount: 0,
    ...overrides,
  };
}

test("operations ranges are bounded and default to seven days", () => {
  assert.equal(parseAutomationOperationsRange("today"), "today");
  assert.equal(parseAutomationOperationsRange("30d"), "30d");
  assert.equal(parseAutomationOperationsRange("anything"), "7d");
  const now = new Date("2026-09-28T21:00:00.000Z");
  assert.equal(automationOperationsCutoff("7d", now), "2026-09-21T21:00:00.000Z");
  assert.equal(automationOperationsCutoff("30d", now), "2026-08-29T21:00:00.000Z");
  assert.equal(automationOperationsCutoff("today", now), "2026-09-27T22:00:00.000Z");
});

test("cadence recommendation requires a useful sample", () => {
  assert.equal(automationCadenceRecommendation([healthy()]), "INSUFFICIENT_DATA");
});

test("four healthy duplicate-heavy zero-yield runs may recommend slower without double-counting possible duplicates", () => {
  const duplicateDraft = healthy({ canonicalDuplicateCount: 8, newEntityCount: 1, possibleDuplicateCount: 1, candidateCount: 10 });
  assert.equal(automationCadenceRecommendation([healthy(), healthy(), healthy(), healthy()]), "CONSIDER_SLOWER");
  assert.notEqual(automationCadenceRecommendation([duplicateDraft, duplicateDraft, duplicateDraft, duplicateDraft]), "CONSIDER_SLOWER");
});

test("provider and budget failures are excluded from slower evidence", () => {
  const provider = healthy({ providerFailure: true });
  const budget = healthy({ budgetBlocked: true });
  assert.equal(automationCadenceRecommendation([provider, provider, provider, provider]), "INSUFFICIENT_DATA");
  assert.equal(automationCadenceRecommendation([budget, budget, budget, budget]), "INSUFFICIENT_DATA");
});

test("repeated healthy useful yield may recommend faster", () => {
  const productive = healthy({ canonicalDuplicateCount: 2, newEntityCount: 2, candidateCount: 5 });
  assert.equal(automationCadenceRecommendation([productive, productive, productive, healthy()]), "CONSIDER_FASTER");
});

test("match explainability uses only observable evidence and otherwise stays generic", () => {
  const sameWeb = automationMatchExplanation({
    record: {
      sourceRecordId: "abc",
      sourceUrl: "https://example.sk/contact",
      sourceTimestamp: null,
      rawRecord: {},
      proposed: { name: "Vet ABC", city: "Nitra" },
    },
    match: {
      entityType: "DIRECTORY",
      entityId: 42,
      entityKey: "directory:42",
      quality: "EXACT_CANONICAL_KEY",
      before: { websiteUrl: "https://example.sk/contact", name: "Vet ABC", city: "Nitra" },
    },
  });
  assert.equal(sameWeb.code, "SAME_WEB");
  assert.equal(sameWeb.label, "Rovnaký web");

  const generic = automationMatchExplanation({
    record: {
      sourceRecordId: "abc",
      sourceUrl: null,
      sourceTimestamp: null,
      rawRecord: {},
      proposed: { name: "A" },
    },
    match: {
      entityType: "DIRECTORY",
      entityId: 42,
      entityKey: "directory:42",
      quality: "EXACT_CANONICAL_KEY",
      before: { name: "B" },
    },
  });
  assert.equal(generic.code, "GENERIC_MATCH");
  assert.equal(generic.label, "Zhodovalo sa s existujúcim záznamom.");
});

test("migration persists extended run metrics without fake historical zero backfill", () => {
  const migration = read("drizzle/0097_automation_operations_metrics.sql");
  for (const column of [
    "search_request_count",
    "search_result_count",
    "provider_result_count",
    "canonical_duplicate_count",
    "new_entity_count",
    "update_suggestion_count",
    "possible_duplicate_count",
    "address_verified_exact_count",
    "address_no_exact_count",
    "last_batch_checked_count",
    "last_batch_update_suggestion_count",
    "last_batch_error_count",
  ]) {
    assert.match(migration, new RegExp("ADD COLUMN " + column + " integer;"));
    assert.doesNotMatch(migration, new RegExp("ADD COLUMN " + column + "[^;]*DEFAULT 0"));
  }
  assert.match(migration, /ALTER TABLE automation_direct_refresh_settings ADD COLUMN last_batch_checked_count integer/);
  assert.match(migration, /CREATE TABLE automation_discovery_outcomes/);
  assert.match(migration, /automation_discovery_outcomes_root_created_idx/);
});

test("runner propagates actual direct ingestion counts into the persisted run", () => {
  const runner = read("lib/data-automation-discovery-runner.ts");
  assert.match(runner, /possibleDuplicateCount \+= ingested\.possibleDuplicates/);
  assert.match(runner, /addressVerifiedExactCount \+= ingested\.addressVerifiedExact/);
  assert.match(runner, /addressNoExactCount \+= ingested\.addressNoExact/);
  assert.match(runner, /searchRequestCount: searchMetricsSummary\.requestCount/);
  assert.match(runner, /canonicalDuplicateCount \+= ingested\.existingCanonicalMatches/);
  assert.match(runner, /canonicalDuplicateCount,/);
  assert.match(runner, /newEntityCount,/);
  assert.match(runner, /updateSuggestionCount,/);
  assert.match(runner, /recordAutomationDiscoveryOutcomes/);
});

test("search usage keeps discovery and address enrichment separate", () => {
  const operations = read("lib/data-automation-operations.ts");
  assert.match(operations, /operation_key NOT LIKE 'address-enrichment:%' THEN request_count/);
  assert.match(operations, /operation_key LIKE 'address-enrichment:%' THEN request_count/);
  assert.match(operations, /addressRequestCount/);
  assert.match(operations, /addressResultCount/);
});

test("direct refresh progress counts eligible rows at or below cursor rather than cursor value", () => {
  const store = read("lib/data-automation-product-store.ts");
  assert.match(store, /id<=\? THEN 1 ELSE 0 END\),0\) AS processed/);
  assert.match(store, /eligibleProcessedInCurrentCycle: processed/);
  assert.match(store, /eligibleRemaining: Math\.max\(0, withWebsite - processed\)/);
  assert.doesNotMatch(store, /eligibleProcessedInCurrentCycle:\s*setting\.cursorEntityId/);

  const ids = [1, 4, 10, 100];
  const cursor = 10;
  assert.equal(ids.filter((id) => id <= cursor).length, 3);
  assert.equal(ids.length, 4);
});

test("cursor zero after a successful cycle is presented as complete, not zero percent", () => {
  const store = read("lib/data-automation-product-store.ts");
  const page = read("app/admin/automatizacie/prehlad/page.tsx");
  assert.match(store, /latestSuccess[\s\S]*"COMPLETE"/);
  assert.match(page, /Posledný cyklus dokončený/);
  assert.doesNotMatch(page, /refresh\.state === "COMPLETE"[\s\S]{0,120}0 %/);
});

test("feed source metrics keep finding semantics honest", () => {
  const page = read("app/admin/automatizacie/prehlad/page.tsx");
  assert.match(page, /Nové zistenia/);
  assert.match(page, /Zmenené zistenia/);
  assert.doesNotMatch(page, /newFindingCount[\s\S]{0,80}Nové koncepty/);
});

test("dashboard is read-only and recommendations never mutate scheduling", () => {
  const [page, operations, model] = [
    read("app/admin/automatizacie/prehlad/page.tsx"),
    read("lib/data-automation-operations.ts"),
    read("lib/data-automation-operations-model.ts"),
  ];
  assert.doesNotMatch(page, /fetch\(|POST|PUT|PATCH|DELETE/);
  assert.doesNotMatch(operations, /UPDATE automation_|INSERT INTO automation_|DELETE FROM automation_/);
  assert.doesNotMatch(model, /UPDATE|INSERT|DELETE/);
  assert.match(page, /Odporúčanie nikdy nemení plánovanie automaticky/);
});

test("dashboard exposes all seven categories, range controls and accessible mobile layout", () => {
  const [page, css, product] = [
    read("app/admin/automatizacie/prehlad/page.tsx"),
    read("components/admin-automation-operations.module.css"),
    read("lib/data-automation-product-model.ts"),
  ];
  for (const slug of ["podujatia","veterinari","utulky-organizacie","psie-sluzby","adopcie","docasna-opatera","stratene-najdene"]) {
    assert.ok(product.includes(slug), slug);
  }
  assert.match(page, />Dnes<\/Link>/);
  assert.match(page, />7 dní<\/Link>/);
  assert.match(page, />30 dní<\/Link>/);
  assert.match(page, /aria-label="Súhrn automatizácií"/);
  assert.match(page, /Europe\/Bratislava/);
  assert.match(page, /Zatiaľ nemáme údaje z behov/);
  assert.match(css, /@media\(max-width:840px\)/);
  assert.match(css, /@media\(max-width:560px\)/);
});

test("code-before-migration compatibility degrades to reduced metrics instead of crashing", () => {
  const store = read("lib/data-automation-discovery-store.ts");
  const operations = read("lib/data-automation-operations.ts");
  const page = read("app/admin/automatizacie/prehlad/page.tsx");
  assert.match(store, /no such column:|has no column named/);
  assert.match(operations, /no such table:\\s\*automation_discovery_outcomes/);
  assert.match(page, /Rozšírené metriky zatiaľ nie sú dostupné/);
});

test("bounded outcome history can explain existing and possible duplicate results without owning canonicals", () => {
  const [migration, store, direct] = [
    read("drizzle/0097_automation_operations_metrics.sql"),
    read("lib/data-automation-discovery-store.ts"),
    read("lib/data-automation-direct-entity.ts"),
  ];
  assert.match(store, /LIMIT 500/);
  assert.match(store, /match_reason_code/);
  assert.match(direct, /EXISTING_CANONICAL/);
  assert.match(direct, /POSSIBLE_DUPLICATE/);
  assert.match(migration, /canonical_entity_id integer/);
  assert.doesNotMatch(migration, /canonical_owner|ownership/i);
});


test("empty refresh continuation preserves the last meaningful batch metrics", () => {
  const store = read("lib/data-automation-product-store.ts");
  assert.match(store, /last_batch_checked_count=CASE WHEN \?>0 THEN \? ELSE last_batch_checked_count END/);
  assert.match(store, /last_batch_update_suggestion_count=CASE WHEN \?>0 THEN \? ELSE last_batch_update_suggestion_count END/);
  assert.match(store, /last_batch_error_count=CASE WHEN \?>0 THEN \? ELSE last_batch_error_count END/);
});
