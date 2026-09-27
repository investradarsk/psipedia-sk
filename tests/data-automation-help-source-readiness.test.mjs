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

test("universal HELP readiness registers production ADOPTION FOSTER and LOST_FOUND adapters", () => {
  assert.deepEqual(Object.keys(productionAutomationHelpAdapterRegistry).sort(), [
    "kosice-found-dog-detail",
    "trnava-adoption-detail",
    "zatulane-psiky-sala-foster-detail",
  ]);
  assert.equal(productionAutomationHelpAdapterRegistry["trnava-adoption-detail"].entityType, "ADOPTION");
  assert.equal(productionAutomationHelpAdapterRegistry["zatulane-psiky-sala-foster-detail"].entityType, "FOSTER");
  assert.equal(productionAutomationHelpAdapterRegistry["kosice-found-dog-detail"].entityType, "LOST_FOUND");
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

test("production candidate provisioning supports only allow-listed HELP detail pages", () => {
  assert.deepEqual(candidateProvisioningConfigFor({
    entityType: "ADOPTION",
    canonicalUrl: "https://www.trnava.utulok.sk/psy/didy",
    metadata: { title: "Didy" },
  }), {
    sourceShape: "SINGLE_ITEM",
    htmlAdapterKey: "trnava-adoption-detail",
    expectedMinRecords: 1,
  });

  assert.deepEqual(candidateProvisioningConfigFor({
    entityType: "ADOPTION",
    canonicalUrl: "https://trnava.utulok.sk/psy/",
    metadata: { title: "Psy na adopciu" },
  }), {});


  assert.deepEqual(candidateProvisioningConfigFor({
    entityType: "FOSTER",
    canonicalUrl: "https://www.zatulanepsikysala.sk/pomoc/markyz/",
    metadata: {},
  }), {
    sourceShape: "SINGLE_ITEM",
    htmlAdapterKey: "zatulane-psiky-sala-foster-detail",
    expectedMinRecords: 1,
  });
  assert.deepEqual(candidateProvisioningConfigFor({
    entityType: "LOST_FOUND",
    canonicalUrl: "https://www.kosice.sk/clanok/opusteny-pes-225",
    metadata: {},
  }), {
    sourceShape: "SINGLE_ITEM",
    htmlAdapterKey: "kosice-found-dog-detail",
    expectedMinRecords: 1,
  });
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
    metadata: { directoryCategory: "veterinari" },
  }), {
    sourceShape: "SINGLE_ITEM",
    htmlAdapterKey: "generic-directory-profile",
    expectedMinRecords: 1,
    staticFields: {
      category: "veterinari",
      semanticKind: "FACILITY_OR_SERVICE_PROFILE",
    },
  });
  assert.deepEqual(candidateProvisioningConfigFor({
    entityType: "DIRECTORY",
    canonicalUrl: "https://example.sk/",
    metadata: { directoryCategory: "VETERINARIAN" },
  }), {});
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

  assert.match(candidateRoute, /automationSourceReadiness\(source\)\.ready/);
  assert.match(testRoute, /Zdroj zatiaľ nie je pripravený na automatické spracovanie/);
  assert.match(runRoute, /Zdroj zatiaľ nie je pripravený na automatické spracovanie/);
  assert.match(store, /automation_source_not_ready:/);
  assert.match(store, /findRelevantAutomationSourceForCandidate/);
  assert.doesNotMatch(store, /UPDATE automation_sources SET enabled=1[\s\S]*reviewAutomationSourceCandidate/);
});

test("candidate and source UI expose universal readiness without asking for a technical adapter key", () => {
  const candidate = read("components/admin-automation-candidate-review.tsx");
  const sourceDetail = read("components/admin-automation-source-detail.tsx");

  assert.match(candidate, /Bezpečnostná kontrola/);
  assert.match(candidate, /Typ zdroja/);
  assert.match(candidate, /Potrebuje podporovaný adapter/);
  assert.match(candidate, /Pokročilé — technická pripravenosť/);

  assert.match(sourceDetail, /Technická pripravenosť/);
  assert.match(sourceDetail, /Typ zdroja/);
  assert.match(sourceDetail, /Pokročilé — readiness detail/);

  assert.doesNotMatch(candidate, /input[^>]+htmlAdapterKey/i);
  assert.doesNotMatch(sourceDetail, /input[^>]+htmlAdapterKey/i);
});

test("preview remains read-only and matching/canonical stores are untouched by HELP readiness", () => {
  const preview = read("lib/data-automation-preview.ts");
  const connectors = read("lib/data-automation-connectors.ts");
  assert.match(preview, /writes:\s*\{ observations: 0, findings: 0, canonical: 0, publications: 0 \}/);
  assert.match(connectors, /automationHelpRecordShapeError/);
  assert.match(connectors, /helpShapeError/);
});
