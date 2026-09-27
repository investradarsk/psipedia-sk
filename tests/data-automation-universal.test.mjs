import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  automationSourceReadiness,
  buildAutomationCapabilityRegistry,
  productionAutomationCapabilityRegistry,
  resolveAutomationCapability,
} from "../lib/data-automation-capability-registry.ts";
import {
  genericDirectoryProfileAdapter,
  genericHelpItemPageAdapter,
  productionAutomationHtmlAdapters,
} from "../lib/data-automation-real-sources.ts";
import {
  candidateProvisioningConfigFor,
  qualifiedClubDirectoryCategory,
} from "../lib/data-automation-source-provisioning.ts";
import { universalAutomationDiscoveryRootPresets } from "../lib/data-automation-source-presets.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function source(entityType, config, sourceUrl = "https://example.sk/sluzba") {
  return {
    id: 1,
    sourceKey: "test-source",
    label: "Test",
    entityType,
    connectorType: "CONTROLLED_HTML",
    sourceUrl,
    config,
    enabled: false,
    cadenceMinutes: 1440,
    throttleMs: 0,
    timeoutMs: 5000,
    retryMaxAttempts: 0,
    retryBackoffMs: 100,
    maxRecordsPerRun: 20,
    nextCheckAt: null,
  };
}

function jsonLdPage(node, extra = "") {
  return `<!doctype html><html><head>${extra}<script type="application/ld+json">${JSON.stringify(node)}</script></head><body><h1>${node.name ?? "Profil"}</h1></body></html>`;
}

test("universal registry exposes every production parser through one capability facade", () => {
  const keys = Object.keys(productionAutomationCapabilityRegistry).sort();
  assert.deepEqual(keys, Object.keys(productionAutomationHtmlAdapters).sort());
  for (const key of keys) {
    const capability = productionAutomationCapabilityRegistry[key];
    assert.equal(capability.adapterKey, key);
    assert.equal(capability.productionReady, true);
    assert.equal(typeof capability.parser, "function");
    assert.ok(capability.entityType);
    assert.ok(capability.sourceShape);
  }
});

test("registry rejects duplicate keys and missing parsers", () => {
  const parser = () => [];
  assert.throws(() => buildAutomationCapabilityRegistry([
    { adapterKey: "same", entityType: "EVENT", sourceShape: "SINGLE_ITEM", label: "A" },
    { adapterKey: "same", entityType: "EVENT", sourceShape: "SINGLE_ITEM", label: "B" },
  ], { same: parser }), /duplicate_automation_adapter_key/);
  assert.throws(() => buildAutomationCapabilityRegistry([
    { adapterKey: "missing", entityType: "EVENT", sourceShape: "SINGLE_ITEM", label: "A" },
  ], {}), /automation_adapter_parser_missing/);
});

test("universal readiness fails closed on unsupported and mismatched adapters", () => {
  assert.equal(automationSourceReadiness(source("DIRECTORY", {})).reason, "MISSING_ADAPTER");
  assert.equal(automationSourceReadiness(source("DIRECTORY", { htmlAdapterKey: "missing" })).reason, "UNSUPPORTED_ADAPTER");
  assert.equal(automationSourceReadiness(source("EVENT", {
    htmlAdapterKey: "generic-directory-profile",
    sourceShape: "SINGLE_ITEM",
  })).reason, "ADAPTER_ENTITY_MISMATCH");
  assert.equal(resolveAutomationCapability(source("DIRECTORY", {
    htmlAdapterKey: "generic-directory-profile",
    sourceShape: "MULTI_ITEM_LIST",
  })), null);
});

test("FOSTER and LOST_FOUND supported URL families are provisioned automatically", () => {
  assert.equal(candidateProvisioningConfigFor({
    entityType: "FOSTER",
    canonicalUrl: "https://www.zatulanepsikysala.sk/pomoc/markyz/",
    metadata: {},
  }).htmlAdapterKey, "zatulane-psiky-sala-foster-detail");
  assert.equal(candidateProvisioningConfigFor({
    entityType: "LOST_FOUND",
    canonicalUrl: "https://www.kosice.sk/clanok/opusteny-pes-225",
    metadata: {},
  }).htmlAdapterKey, "kosice-found-dog-detail");
});

test("DIRECTORY category is explicit and survives into generic parser output", () => {
  const categories = [
    "veterinari",
    "treneri",
    "salony-a-sluzby",
    "hotely-a-opatrovanie",
    "fyzioterapia",
    "vencenie",
    "chovatelske-stanice",
    "dalsie-sluzby",
  ];
  for (const category of categories) {
    const config = candidateProvisioningConfigFor({
      entityType: "DIRECTORY",
      canonicalUrl: "https://example.sk/sluzba",
      metadata: { directoryCategory: category },
    });
    assert.equal(config.htmlAdapterKey, "generic-directory-profile");
    const records = genericDirectoryProfileAdapter({
      source: source("DIRECTORY", config),
      html: jsonLdPage({
        "@context": "https://schema.org",
        "@type": category === "veterinari" ? "VeterinaryCare" : "LocalBusiness",
        "@id": "https://example.sk/sluzba",
        url: "https://example.sk/sluzba",
        name: "Explicitná služba",
        description: "Explicitný popis služby.",
        address: {
          "@type": "PostalAddress",
          streetAddress: "Hlavná 1",
          postalCode: "949 01",
          addressLocality: "Nitra",
          addressRegion: "Nitriansky kraj",
        },
      }),
    });
    assert.equal(records.length, 1, category);
    assert.equal(records[0].proposed.category, category);
    assert.equal(records[0].proposed.name, "Explicitná služba");
    assert.equal(records[0].proposed.city, "Nitra");
    assert.equal(records[0].proposed.region, "Nitriansky kraj");
  }
});

test("generic DIRECTORY parser extracts only explicit schema data and fails closed", () => {
  const config = candidateProvisioningConfigFor({
    entityType: "DIRECTORY",
    canonicalUrl: "https://example.sk/sluzba",
    metadata: { directoryCategory: "veterinari" },
  });
  const noAddress = genericDirectoryProfileAdapter({
    source: source("DIRECTORY", config),
    html: jsonLdPage({
      "@context": "https://schema.org",
      "@type": "VeterinaryCare",
      name: "Vet bez adresy",
      parentOrganization: {
        name: "Firma s.r.o.",
        address: { streetAddress: "Sídlo 99", addressLocality: "Bratislava" },
      },
    }),
  });
  assert.equal(noAddress.length, 1);
  assert.equal(Object.hasOwn(noAddress[0].proposed, "address"), false);
  assert.equal(Object.hasOwn(noAddress[0].proposed, "city"), false);

  assert.deepEqual(genericDirectoryProfileAdapter({
    source: source("DIRECTORY", config),
    html: "<html><body><h1>Vet text only</h1><p>Hlavná 1, Nitra</p></body></html>",
  }), []);

  const ambiguous = jsonLdPage({
    "@context": "https://schema.org", "@type": "LocalBusiness", name: "A",
  }).replace("</head>", `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org", "@type": "LocalBusiness", name: "B",
  })}</script></head>`);
  assert.deepEqual(genericDirectoryProfileAdapter({
    source: source("DIRECTORY", config),
    html: ambiguous,
  }), []);
});

test("club classification never guesses between kynological and breeder clubs", () => {
  assert.equal(qualifiedClubDirectoryCategory({ directoryCategory: "kynologicke-kluby" }), "kynologicke-kluby");
  assert.equal(qualifiedClubDirectoryCategory({ directoryCategory: "chovatelske-kluby" }), "chovatelske-kluby");
  assert.equal(qualifiedClubDirectoryCategory({ title: "Slovenský klub retrieverov" }), null);
  assert.equal(qualifiedClubDirectoryCategory({ directoryCategory: "treneri" }), null);
});

test("HELP_ITEM Zbierky and Ako pomôcť use explicit canonical category metadata", () => {
  for (const category of ["zbierky", "dobrovolnictvo"]) {
    const config = candidateProvisioningConfigFor({
      entityType: "HELP_ITEM",
      canonicalUrl: "https://example.sk/pomoc",
      metadata: { helpCategory: category },
    });
    assert.equal(config.htmlAdapterKey, "generic-help-item-page");
    const records = genericHelpItemPageAdapter({
      source: source("HELP_ITEM", config, "https://example.sk/pomoc"),
      html: '<html><head><meta name="description" content="Explicitný popis verejnej výzvy na pomoc psom."></head><body><h1>Pomôžte nám</h1></body></html>',
    });
    assert.equal(records.length, 1);
    assert.deepEqual(records[0].proposed, {
      title: "Pomôžte nám",
      category,
      description: "Explicitný popis verejnej výzvy na pomoc psom.",
      actionUrl: "https://example.sk/pomoc",
    });
  }
  assert.deepEqual(candidateProvisioningConfigFor({
    entityType: "HELP_ITEM",
    canonicalUrl: "https://example.sk/pomoc",
    metadata: {},
  }), {});
});

test("missing discovery presets cover three DIRECTORY gaps plus both HELP_ITEM categories", () => {
  const byKey = new Map(universalAutomationDiscoveryRootPresets.map((root) => [root.rootKey, root]));
  assert.equal(byKey.get("tavily-sk-dog-breeders")?.config.directoryCategory, "chovatelske-stanice");
  assert.equal(byKey.get("tavily-sk-dog-walking")?.config.directoryCategory, "vencenie");
  assert.equal(byKey.get("tavily-sk-dog-other-services")?.config.directoryCategory, "dalsie-sluzby");
  assert.equal(byKey.get("tavily-sk-dog-fundraising")?.config.helpCategory, "zbierky");
  assert.equal(byKey.get("tavily-sk-dog-volunteering")?.config.helpCategory, "dobrovolnictvo");
  for (const root of universalAutomationDiscoveryRootPresets.filter((item) => item.entityType === "DIRECTORY")) {
    assert.equal(root.cadenceMinutes, 10080);
  }
});

test("detached source-run contract keeps receipt-only memory and no UPDATE_EXISTING execution path", () => {
  const runner = read("lib/data-automation-runner.ts");
  const receipts = read("lib/data-automation-ingestion-receipts.ts");
  const draftService = read("lib/canonical-draft-service.ts");
  assert.match(runner, /SKIPPED_DUPLICATE/);
  assert.match(runner, /DUPLICATE_CANDIDATE/);
  assert.match(runner, /createAutomationIngestionReceipt/);
  assert.doesNotMatch(runner, /UPDATE_EXISTING/);
  assert.doesNotMatch(receipts, /canonical_entity_id|canonicalEntityId/);
  assert.match(receipts, /source_id=\? AND entity_type=\? AND source_record_id=\?/);
  assert.match(draftService, /status: "draft"|status: "DRAFT"/);
  assert.match(draftService, /published_at: null/);
});
