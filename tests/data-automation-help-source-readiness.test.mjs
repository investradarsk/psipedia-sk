import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  automationHelpRecordShapeError,
  automationHelpSourceReadiness,
  helpCandidateProvisioningConfigFor,
  isAutomationHelpEntityType,
  productionAutomationHelpAdapterRegistry,
} from "../lib/data-automation-help-source-readiness.ts";
import { candidateProvisioningConfigFor } from "../lib/data-automation-source-provisioning.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

const registry = {
  "test-adoption-detail": {
    entityType: "ADOPTION",
    sourceShape: "SINGLE_ITEM",
    label: "Test adoption detail",
  },
  "test-foster-list": {
    entityType: "FOSTER",
    sourceShape: "MULTI_ITEM_LIST",
    label: "Test foster list",
  },
};

function source(overrides = {}) {
  return {
    entityType: "ADOPTION",
    connectorType: "CONTROLLED_HTML",
    config: {},
    ...overrides,
  };
}

test("HELP-INGEST-1A recognizes only the three shared HELP entity types", () => {
  assert.equal(isAutomationHelpEntityType("ADOPTION"), true);
  assert.equal(isAutomationHelpEntityType("FOSTER"), true);
  assert.equal(isAutomationHelpEntityType("LOST_FOUND"), true);
  assert.equal(isAutomationHelpEntityType("HELP_ITEM"), false);
  assert.equal(isAutomationHelpEntityType("EVENT"), false);
  assert.equal(isAutomationHelpEntityType("ORGANIZATION"), false);
  assert.equal(isAutomationHelpEntityType("DIRECTORY"), false);
});

test("HELP-INGEST-1A keeps production HELP adapter registry empty until entity parsers exist", () => {
  assert.deepEqual(productionAutomationHelpAdapterRegistry, {});
});

test("HELP source without sourceShape or adapter fails closed", () => {
  assert.equal(automationHelpSourceReadiness(source()).reason, "MISSING_SOURCE_SHAPE");
  assert.equal(automationHelpSourceReadiness(source()).ready, false);

  const shapeOnly = automationHelpSourceReadiness(source({
    config: { sourceShape: "SINGLE_ITEM" },
  }));
  assert.equal(shapeOnly.reason, "MISSING_ADAPTER");
  assert.equal(shapeOnly.ready, false);
});

test("unknown adapter key is not production-ready", () => {
  const result = automationHelpSourceReadiness(source({
    config: { sourceShape: "SINGLE_ITEM", htmlAdapterKey: "unknown-help-adapter" },
  }), registry);
  assert.equal(result.reason, "UNSUPPORTED_ADAPTER");
  assert.equal(result.ready, false);
});

test("registered adapter with matching entity and shape is READY", () => {
  const result = automationHelpSourceReadiness(source({
    config: { sourceShape: "SINGLE_ITEM", htmlAdapterKey: "test-adoption-detail" },
  }), registry);
  assert.equal(result.reason, "READY");
  assert.equal(result.ready, true);
  assert.equal(result.adapterLabel, "Test adoption detail");
});

test("adapter entity and shape mismatch both fail closed", () => {
  const entityMismatch = automationHelpSourceReadiness(source({
    entityType: "ADOPTION",
    config: { sourceShape: "MULTI_ITEM_LIST", htmlAdapterKey: "test-foster-list" },
  }), registry);
  assert.equal(entityMismatch.reason, "ADAPTER_ENTITY_MISMATCH");
  assert.equal(entityMismatch.ready, false);

  const shapeMismatch = automationHelpSourceReadiness(source({
    entityType: "FOSTER",
    config: { sourceShape: "SINGLE_ITEM", htmlAdapterKey: "test-foster-list" },
  }), registry);
  assert.equal(shapeMismatch.reason, "ADAPTER_SHAPE_MISMATCH");
  assert.equal(shapeMismatch.ready, false);
});

test("SINGLE_ITEM rejects multiple records and MULTI_ITEM_LIST accepts N records", () => {
  assert.equal(automationHelpRecordShapeError({
    entityType: "ADOPTION",
    config: { sourceShape: "SINGLE_ITEM" },
  }, 2), "help_single_item_multiple_records");
  assert.equal(automationHelpRecordShapeError({
    entityType: "ADOPTION",
    config: { sourceShape: "SINGLE_ITEM" },
  }, 1), null);
  assert.equal(automationHelpRecordShapeError({
    entityType: "FOSTER",
    config: { sourceShape: "MULTI_ITEM_LIST" },
  }, 3), null);
  assert.equal(automationHelpRecordShapeError({
    entityType: "FOSTER",
    config: { sourceShape: "MULTI_ITEM_LIST" },
  }, 0), "help_multi_item_no_records");
});

test("production candidate provisioning leaves arbitrary HELP pages unsupported", () => {
  for (const entityType of ["ADOPTION", "FOSTER", "LOST_FOUND"]) {
    assert.deepEqual(candidateProvisioningConfigFor({
      entityType,
      canonicalUrl: "https://utulok.example/",
      metadata: { title: "Psíkovia na adopciu" },
    }), {});
  }
  assert.deepEqual(helpCandidateProvisioningConfigFor({
    entityType: "ADOPTION",
    canonicalUrl: "https://utulok.example/na-adopciu/falco",
  }), {});
});

test("future supported host/path provisioning requires matching adapter registry metadata", () => {
  const rules = [{
    entityType: "ADOPTION",
    hostname: "utulok.example",
    pathPattern: /^\/na-adopciu\/[^/]+$/,
    sourceShape: "SINGLE_ITEM",
    adapterKey: "test-adoption-detail",
    expectedMinRecords: 1,
  }];
  assert.deepEqual(helpCandidateProvisioningConfigFor({
    entityType: "ADOPTION",
    canonicalUrl: "https://utulok.example/na-adopciu/falco",
    registry,
    rules,
  }), {
    sourceShape: "SINGLE_ITEM",
    htmlAdapterKey: "test-adoption-detail",
    expectedMinRecords: 1,
  });
  assert.deepEqual(helpCandidateProvisioningConfigFor({
    entityType: "ADOPTION",
    canonicalUrl: "https://utulok.example/",
    registry,
    rules,
  }), {});
});

test("EVENT ORGANIZATION and DIRECTORY provisioning semantics remain isolated", () => {
  assert.deepEqual(candidateProvisioningConfigFor({
    entityType: "EVENT",
    canonicalUrl: "https://example.sk/",
    metadata: {},
  }), {});
  assert.deepEqual(candidateProvisioningConfigFor({
    entityType: "DIRECTORY",
    canonicalUrl: "https://example.sk/",
    metadata: { directoryCategory: "VETERINARIAN" },
  }), {
    staticFields: {
      category: "VETERINARIAN",
      semanticKind: "FACILITY_OR_SERVICE_PROFILE",
    },
  });
  assert.equal(typeof candidateProvisioningConfigFor({
    entityType: "ORGANIZATION",
    canonicalUrl: "https://example.sk/",
    metadata: {},
  }).htmlAdapterKey, "string");
});

test("candidate preview, source test, enable and manual run share fail-closed HELP readiness", () => {
  const candidateRoute = read("app/api/admin/automation-source-candidates/[id]/route.ts");
  const testRoute = read("app/api/admin/automation-sources/[id]/test/route.ts");
  const runRoute = read("app/api/admin/automation-sources/[id]/run/route.ts");
  const store = read("lib/data-automation-source-store.ts");

  assert.match(candidateRoute, /automationHelpSourceReadiness\(source\)/);
  assert.match(candidateRoute, /if \(helpReadiness\.applicable\) return helpReadiness\.ready/);
  assert.match(testRoute, /Zdroj zatiaľ nie je pripravený na automatické spracovanie/);
  assert.match(runRoute, /Zdroj zatiaľ nie je pripravený na automatické spracovanie/);
  assert.match(store, /automation_help_source_not_ready:/);
  assert.match(store, /findRelevantAutomationSourceForCandidate/);
  assert.doesNotMatch(store, /UPDATE automation_sources SET enabled=1[\s\S]*reviewAutomationSourceCandidate/);
});

test("candidate and source UI expose HELP readiness without asking for a technical adapter key", () => {
  const candidate = read("components/admin-automation-candidate-review.tsx");
  const sourceDetail = read("components/admin-automation-source-detail.tsx");

  for (const ui of [candidate, sourceDetail]) {
    assert.match(ui, /Pripravenosť HELP zdroja/);
    assert.match(ui, /Typ zdroja/);
    assert.match(ui, /Technická pripravenosť/);
    assert.match(ui, /Potrebuje podporovaný adapter/);
    assert.match(ui, /Pokročilé — readiness detail/);
  }
  assert.doesNotMatch(candidate, /input[^>]+htmlAdapterKey/i);
});

test("preview remains read-only and matching/canonical stores are untouched by HELP readiness", () => {
  const preview = read("lib/data-automation-preview.ts");
  const connectors = read("lib/data-automation-connectors.ts");
  assert.match(preview, /writes:\s*\{ observations: 0, findings: 0, canonical: 0, publications: 0 \}/);
  assert.match(connectors, /automationHelpRecordShapeError/);
  assert.match(connectors, /helpShapeError/);
});
