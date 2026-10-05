import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizeAutomationFosterRecord,
  automationFosterNormalizationMetadata,
} from "../lib/data-automation-foster-normalize.ts";
import { validateDynamicAutomationIngestion } from "../lib/data-automation-dynamic-identity.ts";
import {
  automationExtractionCapabilities,
  automationSourceReadiness,
} from "../lib/data-automation-capability-registry.ts";
import { automationHelpSourceReadiness } from "../lib/data-automation-help-source-readiness.ts";
import { candidateProvisioningConfigFor } from "../lib/data-automation-source-provisioning.ts";
import { extractGenericFirstPartySource } from "../lib/data-automation-generic-source-extractor.ts";
import {
  buildSourceScopedExtractionContract,
  automationCoverageCanInferAbsence,
} from "../lib/data-automation-source-scoped-extraction.ts";
import {
  TavilyAutomationCrawlProvider,
  TavilyAutomationExtractProvider,
} from "../lib/data-automation-tavily-source-scoped.ts";
import { fetchAutomationSourceRecords } from "../lib/data-automation-connectors.ts";
import { productionAutomationHtmlAdapters } from "../lib/data-automation-real-sources.ts";
import { normalizeAutomationLifecycleSignals } from "../lib/data-automation-lifecycle.ts";
import { selectSafeAutomationMatch } from "../lib/data-automation-matching.ts";

const NOW = new Date("2026-10-05T12:00:00.000Z");

function source(overrides = {}) {
  return {
    id: 901,
    sourceKey: "foster-pilot-source",
    label: "FOSTER pilot source",
    entityType: "FOSTER",
    connectorType: "CONTROLLED_HTML",
    sourceUrl: "https://foster.example/cases",
    config: {
      sourceShape: "MULTI_ITEM_LIST",
      staticFields: { organizationName: "OZ Test" },
    },
    enabled: true,
    cadenceMinutes: 1440,
    throttleMs: 0,
    timeoutMs: 5000,
    retryMaxAttempts: 0,
    retryBackoffMs: 1,
    maxRecordsPerRun: 50,
    nextCheckAt: null,
    reviewStatus: "APPROVED",
    ...overrides,
  };
}

function contract(src = source(), scope = "/cases/**") {
  const result = buildSourceScopedExtractionContract(src, {
    pathScope: scope,
    maxRequestsPerDay: 12,
  });
  assert.equal(result.ready, true);
  return result.contract;
}

function noMatch() {
  return {
    entityType: "FOSTER",
    entityId: null,
    entityKey: null,
    quality: "NONE",
    before: null,
  };
}

function decision(src, record, match = noMatch()) {
  return validateDynamicAutomationIngestion({ source: src, record, match });
}

function listingHtml() {
  return `<!doctype html><html><body>
    <h1>Dočasná opatera</h1>
    <article class="foster-card"><a class="dog-name" href="/cases/max">Max</a></article>
  </body></html>`;
}

function detailHtml(status = "") {
  return `<!doctype html><html><head>
    <link rel="canonical" href="https://foster.example/cases/max">
    <meta name="description" content="Max potrebuje dočasnú opateru.">
  </head><body>
    <h1>Dočasná opatera pre Maxa</h1>
    <p>Dočasná opatera</p>
    <p>Meno: Max</p>
    <p>Plemeno: Labrador</p>
    <p>Vek: 2 roky</p>
    <p>Mesto: Nitra</p>
    <p>Kraj: Nitriansky kraj</p>
    <p>Lokalita: okolie Nitry</p>
    <p>Nahlásené: 5. 10. 2026</p>
    <p>Termín: 20. 10. 2026</p>
    <p>Kontakt: verejný kontakt organizácie</p>
    <p>Urgentné: áno</p>
    ${status ? `<p>Stav: ${status}</p>` : ""}
  </body></html>`;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function tavilyPayload(url, content) {
  return {
    results: [{ url, raw_content: content }],
    failed_results: [],
    response_time: 0.1,
    usage: { credits: 1 },
  };
}

function gate() {
  return {
    async reserve(operation) {
      return { operationKey: "foster-pilot-" + operation.toLowerCase() };
    },
    async finalize() {},
  };
}

test("FOSTER normalizer maps only explicit canonical case fields and bounded text", () => {
  const src = source({
    sourceUrl: "https://foster.example/cases/max",
    config: { sourceShape: "SINGLE_ITEM", staticFields: { organizationName: "OZ Test" } },
  });
  const normalized = normalizeAutomationFosterRecord({
    sourceRecordId: "max",
    sourceUrl: src.sourceUrl,
    sourceTimestamp: null,
    rawRecord: {
      contentExcerpt: [
        "Meno: Max",
        "Plemeno: Labrador",
        "Vek: 2 roky",
        "Mesto: Nitra",
        "Kraj: Nitriansky kraj",
        "Lokalita: okolie Nitry",
        "Nahlásené: 5. 10. 2026",
        "Termín: 20. 10. 2026",
        "Kontakt: verejný kontakt",
        "Urgentné: áno",
      ].join("\n"),
    },
    proposed: {
      title: "Dočasná opatera pre Maxa",
      description: "x".repeat(7000),
    },
    extraction: {
      itemUrl: src.sourceUrl,
      externalId: null,
      discoveredFromRoot: "https://foster.example/cases",
      strategy: "TAVILY_EXTRACT",
      evidenceMetadata: {},
      coverage: { classification: "DETAIL_ONLY", complete: false },
    },
  }, { sourceConfig: src.config });

  assert.equal(normalized.proposed.title, "Dočasná opatera pre Maxa");
  assert.equal(normalized.proposed.dogName, "Max");
  assert.equal(normalized.proposed.organization, "OZ Test");
  assert.equal(normalized.proposed.breed, "Labrador");
  assert.equal(normalized.proposed.ageNote, "2 roky");
  assert.equal(normalized.proposed.city, "Nitra");
  assert.equal(normalized.proposed.region, "Nitriansky kraj");
  assert.equal(normalized.proposed.locationNote, "okolie Nitry");
  assert.equal(normalized.proposed.reportedDate, "2026-10-05");
  assert.equal(normalized.proposed.deadlineDate, "2026-10-20");
  assert.equal(normalized.proposed.actionUrl, src.sourceUrl);
  assert.equal(normalized.proposed.contactNote, "verejný kontakt");
  assert.equal(normalized.proposed.urgent, true);
  assert.equal(String(normalized.proposed.description).length, 5000);
  assert.equal(Object.hasOwn(normalized.proposed, "verified"), false);
  assert.equal(automationFosterNormalizationMetadata(normalized)?.organizationSource, "SOURCE_STATIC");
  assert.equal(automationFosterNormalizationMetadata(normalized)?.fosterProfileEvidence, true);
  assert.equal(decision(src, normalized)?.gate, "VALID_FOR_DRAFT");
});

test("generic foster CTA is never a concrete case identity", () => {
  const src = source({
    sourceUrl: "https://foster.example/cases/help",
    config: { sourceShape: "SINGLE_ITEM", staticFields: { organizationName: "OZ Test" } },
  });
  for (const title of ["Hľadáme dočasku", "Hľadáme dočasnú opateru", "Urgentne potrebujeme dočasku", "Dočasná opatera"]) {
    const normalized = normalizeAutomationFosterRecord({
      sourceRecordId: "cta-" + title,
      sourceUrl: src.sourceUrl,
      sourceTimestamp: null,
      rawRecord: { contentExcerpt: "Plemeno: Labrador\nVek: 2 roky" },
      proposed: { title },
    }, { sourceConfig: src.config });
    assert.equal(normalized.proposed.title, undefined);
    assert.equal(decision(src, normalized)?.gate, "INSUFFICIENT");
  }
});

test("organization identity uses record, structured, labelled, then source static evidence", () => {
  const base = {
    sourceRecordId: "max",
    sourceUrl: "https://foster.example/cases/max",
    sourceTimestamp: null,
    proposed: { dogName: "Max", breed: "Labrador" },
  };
  const recordOrg = normalizeAutomationFosterRecord({
    ...base,
    rawRecord: {},
    proposed: { ...base.proposed, organization: "OZ Record" },
  }, { sourceConfig: { sourceShape: "SINGLE_ITEM", staticFields: { organizationName: "OZ Static" } } });
  assert.equal(recordOrg.proposed.organization, "OZ Record");
  assert.equal(automationFosterNormalizationMetadata(recordOrg)?.organizationSource, "RECORD");

  const structuredOrg = normalizeAutomationFosterRecord({
    ...base,
    rawRecord: { structured: { organization: { name: "OZ Structured" } } },
  }, { sourceConfig: { sourceShape: "SINGLE_ITEM", staticFields: { organizationName: "OZ Static" } } });
  assert.equal(structuredOrg.proposed.organization, "OZ Structured");
  assert.equal(automationFosterNormalizationMetadata(structuredOrg)?.organizationSource, "STRUCTURED");

  const labelledOrg = normalizeAutomationFosterRecord({
    ...base,
    rawRecord: { contentExcerpt: "Organizácia: OZ Labelled" },
  }, { sourceConfig: { sourceShape: "SINGLE_ITEM", staticFields: { organizationName: "OZ Static" } } });
  assert.equal(labelledOrg.proposed.organization, "OZ Labelled");
  assert.equal(automationFosterNormalizationMetadata(labelledOrg)?.organizationSource, "LABELLED");

  const staticOrg = normalizeAutomationFosterRecord({
    ...base,
    rawRecord: {},
  }, { sourceConfig: { sourceShape: "SINGLE_ITEM", staticFields: { organizationName: "OZ Static" } } });
  assert.equal(staticOrg.proposed.organization, "OZ Static");
  assert.equal(automationFosterNormalizationMetadata(staticOrg)?.organizationSource, "SOURCE_STATIC");
});

test("FOSTER and LOST_FOUND keep entity-specific adapter-less source-scoped readiness", () => {
  const foster = automationHelpSourceReadiness({
    entityType: "FOSTER",
    connectorType: "CONTROLLED_HTML",
    config: { sourceShape: "MULTI_ITEM_LIST", staticFields: { organizationName: "OZ Test" } },
  });
  assert.equal(foster.ready, true);
  assert.equal(foster.adapterKey, null);

  const lostFound = automationHelpSourceReadiness({
    entityType: "LOST_FOUND",
    connectorType: "CONTROLLED_HTML",
    config: { sourceShape: "MULTI_ITEM_LIST" },
  });
  assert.equal(lostFound.ready, true);
  assert.equal(lostFound.reason, "READY");

  const lfCapabilities = automationExtractionCapabilities({
    ...source(),
    entityType: "LOST_FOUND",
    config: { sourceShape: "MULTI_ITEM_LIST" },
  }, undefined, { tavilyCredentialConfigured: true });
  assert.notEqual(lfCapabilities.find((x) => x.strategy === "GENERIC_FIRST_PARTY")?.reason, "LOST_FOUND_SOURCE_SCOPED_NOT_ENABLED");
  assert.equal(automationSourceReadiness({
    ...source(),
    entityType: "LOST_FOUND",
    config: { sourceShape: "MULTI_ITEM_LIST" },
  }, undefined, { tavilyCredentialConfigured: true }).ready, true);
});

test("source-scoped FOSTER capability and provisioning require explicit shape plus organization", () => {
  const noShape = automationExtractionCapabilities(source({
    config: { staticFields: { organizationName: "OZ Test" } },
  }), undefined, { tavilyCredentialConfigured: true });
  assert.equal(noShape.find((x) => x.strategy === "GENERIC_FIRST_PARTY")?.reason, "FOSTER_SOURCE_SHAPE_REQUIRED");

  const noOrg = automationExtractionCapabilities(source({
    config: { sourceShape: "MULTI_ITEM_LIST" },
  }), undefined, { tavilyCredentialConfigured: true });
  assert.equal(noOrg.find((x) => x.strategy === "GENERIC_FIRST_PARTY")?.reason, "FOSTER_ORGANIZATION_IDENTITY_REQUIRED");

  assert.deepEqual(candidateProvisioningConfigFor({
    entityType: "FOSTER",
    canonicalUrl: "https://foster.example/cases",
    metadata: { sourceShape: "MULTI_ITEM_LIST", organizationName: "OZ Test" },
  }), {
    sourceShape: "MULTI_ITEM_LIST",
    staticFields: { organizationName: "OZ Test" },
  });
  assert.deepEqual(candidateProvisioningConfigFor({
    entityType: "FOSTER",
    canonicalUrl: "https://foster.example/cases",
    metadata: { sourceShape: "MULTI_ITEM_LIST" },
  }), {});
});

test("generic-first FOSTER listing/detail produces a strict valid draft candidate", async () => {
  const src = source();
  const result = await extractGenericFirstPartySource({
    source: src,
    contract: contract(src),
    rootHtml: listingHtml(),
    rootUrl: src.sourceUrl,
    fetchPage: async (url) => {
      assert.equal(url, "https://foster.example/cases/max");
      return { html: detailHtml(), finalUrl: url };
    },
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].extraction.strategy, "GENERIC_FIRST_PARTY");
  assert.equal(result.records[0].extraction.evidenceMetadata.discoveryMethod, "FOSTER_DETAIL_HTML");
  const normalized = normalizeAutomationFosterRecord(result.records[0], { sourceConfig: src.config });
  assert.equal(normalized.proposed.dogName, "Max");
  assert.equal(normalized.proposed.organization, "OZ Test");
  assert.equal(normalized.proposed.breed, "Labrador");
  assert.equal(decision(src, normalized)?.gate, "VALID_FOR_DRAFT");
});

test("generic SINGLE_ITEM FOSTER accepts a concrete case and rejects a marketing page", async () => {
  const src = source({
    sourceUrl: "https://foster.example/cases/max",
    config: { sourceShape: "SINGLE_ITEM", staticFields: { organizationName: "OZ Test" } },
  });
  const good = await extractGenericFirstPartySource({
    source: src,
    contract: contract(src),
    rootHtml: detailHtml(),
    rootUrl: src.sourceUrl,
    fetchPage: async () => { throw new Error("unexpected"); },
  });
  assert.equal(good.records.length, 1);
  assert.equal(decision(src, normalizeAutomationFosterRecord(good.records[0], { sourceConfig: src.config }))?.gate, "VALID_FOR_DRAFT");

  await assert.rejects(
    extractGenericFirstPartySource({
      source: { ...src, sourceUrl: "https://foster.example/cases/help" },
      contract: contract({ ...src, sourceUrl: "https://foster.example/cases/help" }),
      rootHtml: `<html><head><link rel="canonical" href="https://foster.example/cases/help"></head><body><h1>Pomôžte nám — dočasná opatera</h1><p>Pomáhame psom.</p></body></html>`,
      rootUrl: "https://foster.example/cases/help",
      fetchPage: async () => { throw new Error("unexpected"); },
    }),
    /no_items_discovered/,
  );
});

test("flattened generic FOSTER detail preserves explicit resolved lifecycle and blocks a new draft", async () => {
  const src = source({
    sourceUrl: "https://foster.example/cases/max",
    config: { sourceShape: "SINGLE_ITEM", staticFields: { organizationName: "OZ Test" } },
  });
  const extracted = await extractGenericFirstPartySource({
    source: src,
    contract: contract(src),
    rootHtml: detailHtml("dočaska zabezpečená"),
    rootUrl: src.sourceUrl,
    fetchPage: async () => { throw new Error("unexpected"); },
  });
  assert.equal(extracted.records.length, 1);
  const normalized = normalizeAutomationFosterRecord(extracted.records[0], { sourceConfig: src.config });
  assert.equal(normalizeAutomationLifecycleSignals("FOSTER", normalized)[0]?.signalType, "FOSTER_RESOLVED");
  const result = decision(src, normalized);
  assert.equal(result?.gate, "INSUFFICIENT");
  assert.ok(result?.reasons.includes("foster_resolved_new_draft_blocked"));
});

test("Tavily Crawl and Extract stay provider-neutral and share the FOSTER normalizer", async () => {
  const crawlSrc = source();
  const crawlProvider = new TavilyAutomationCrawlProvider({
    apiKey: "test-key",
    now: () => NOW,
    fetchImpl: async () => json(tavilyPayload(
      "https://foster.example/cases/max",
      "# Dočasná opatera pre Maxa\nMeno: Max\nPlemeno: Labrador\nVek: 2 roky\nMesto: Nitra\nOrganizácia: OZ Test\nUrgentné: áno",
    )),
  });
  const crawled = await crawlProvider.crawl({ source: crawlSrc, contract: contract(crawlSrc), gate: gate() });
  const crawlNormalized = normalizeAutomationFosterRecord(crawled.records[0], { sourceConfig: crawlSrc.config });
  assert.equal(crawled.coverage.classification, "BOUNDED_PARTIAL");
  assert.equal(crawlNormalized.proposed.dogName, "Max");
  assert.equal(decision(crawlSrc, crawlNormalized)?.gate, "VALID_FOR_DRAFT");

  const extractSrc = source({
    sourceUrl: "https://foster.example/cases/max",
    config: { sourceShape: "SINGLE_ITEM", staticFields: { organizationName: "OZ Test" } },
  });
  const extractProvider = new TavilyAutomationExtractProvider({
    apiKey: "test-key",
    now: () => NOW,
    fetchImpl: async () => json(tavilyPayload(
      extractSrc.sourceUrl,
      "# Dočasná opatera pre Maxa\nMeno: Max\nPlemeno: Labrador\nVek: 2 roky\nMesto: Nitra",
    )),
  });
  const extracted = await extractProvider.extract({
    source: extractSrc,
    contract: contract(extractSrc),
    gate: gate(),
    urls: [extractSrc.sourceUrl],
  });
  const extractNormalized = normalizeAutomationFosterRecord(extracted.records[0], { sourceConfig: extractSrc.config });
  assert.equal(extracted.coverage.classification, "DETAIL_ONLY");
  assert.equal(decision(extractSrc, extractNormalized)?.gate, "VALID_FOR_DRAFT");
});

test("weak generic/Tavily foster result stays insufficient even with a stable URL and source organization", () => {
  const src = source({
    sourceUrl: "https://foster.example/cases/help",
    config: { sourceShape: "SINGLE_ITEM", staticFields: { organizationName: "OZ Test" } },
  });
  const normalized = normalizeAutomationFosterRecord({
    sourceRecordId: "url:help",
    sourceUrl: src.sourceUrl,
    sourceTimestamp: null,
    rawRecord: { contentExcerpt: "Prosíme pomôžte nám." },
    proposed: { title: "Hľadáme dočasku" },
    extraction: {
      itemUrl: src.sourceUrl,
      externalId: null,
      discoveredFromRoot: "https://foster.example/cases",
      strategy: "TAVILY_EXTRACT",
      evidenceMetadata: {},
      coverage: { classification: "DETAIL_ONLY", complete: false },
    },
  }, { sourceConfig: src.config });
  const result = decision(src, normalized);
  assert.equal(result?.gate, "INSUFFICIENT");
  assert.ok(result?.reasons.includes("foster_concrete_case_identity_missing"));
  assert.ok(result?.reasons.includes("foster_profile_evidence_missing"));
});

test("explicit resolved new FOSTER is review-only, while an exact existing case permits lifecycle suggestion", () => {
  const src = source({
    sourceUrl: "https://foster.example/cases/max",
    config: { sourceShape: "SINGLE_ITEM", staticFields: { organizationName: "OZ Test" } },
  });
  for (const status of ["dočaska zabezpečená", "Adoptovaný"]) {
    const normalized = normalizeAutomationFosterRecord({
      sourceRecordId: "resolved-" + status,
      sourceUrl: src.sourceUrl,
      sourceTimestamp: null,
      rawRecord: { contentExcerpt: "Meno: Max\nPlemeno: Labrador\nVek: 2 roky\nStav: " + status },
      proposed: { title: "Dočasná opatera pre Maxa" },
      extraction: {
        itemUrl: src.sourceUrl,
        externalId: null,
        discoveredFromRoot: "https://foster.example/cases",
        strategy: "TAVILY_EXTRACT",
        evidenceMetadata: {},
        coverage: { classification: "DETAIL_ONLY", complete: false },
      },
    }, { sourceConfig: src.config });
    assert.equal(normalizeAutomationLifecycleSignals("FOSTER", normalized)[0]?.signalType, "FOSTER_RESOLVED");
    const fresh = decision(src, normalized);
    assert.equal(fresh?.gate, "INSUFFICIENT");
    assert.ok(fresh?.reasons.includes("foster_resolved_new_draft_blocked"));

    const existing = decision(src, normalized, {
      entityType: "FOSTER",
      entityId: 10,
      entityKey: "foster:10",
      quality: "EXACT_SOURCE_ID",
      before: { resolved: false },
    });
    assert.equal(existing?.gate, "VALID_FOR_UPDATE_ONLY");
    assert.equal(existing?.canAttachLifecycleSuggestion, true);
  }

  const cta = normalizeAutomationFosterRecord({
    sourceRecordId: "cta",
    sourceUrl: src.sourceUrl,
    sourceTimestamp: null,
    rawRecord: { contentExcerpt: "Meno: Max\nPlemeno: Labrador\nMožnosť adopcie a trvalá adopcia." },
    proposed: { title: "Dočasná opatera pre Maxa" },
  }, { sourceConfig: src.config });
  assert.deepEqual(normalizeAutomationLifecycleSignals("FOSTER", cta), []);
});

test("FOSTER identity separates organizations and treats stable source-ID conflicts as uncertain", () => {
  const record = {
    sourceRecordId: "case-200",
    sourceUrl: "https://foster.example/cases/max",
    sourceTimestamp: null,
    rawRecord: {},
    proposed: { dogName: "Max", title: "Dočasná opatera pre Maxa", organization: "OZ A", breed: "Labrador" },
  };
  const differentOrg = selectSafeAutomationMatch({
    entityType: "FOSTER",
    record,
    candidates: [{
      id: 1, key: "foster:1", before: {}, dogName: "Max", name: "Dočasná opatera pre Maxa",
      organizer: "OZ B", sameSourceRecordIds: [],
    }],
  });
  assert.equal(differentOrg.quality, "NONE");

  const conflict = selectSafeAutomationMatch({
    entityType: "FOSTER",
    record,
    candidates: [{
      id: 2, key: "foster:2", before: {}, dogName: "Max", name: "Dočasná opatera pre Maxa",
      organizer: "OZ A", sameSourceRecordIds: ["case-100"],
    }],
  });
  assert.equal(conflict.quality, "UNCERTAIN");

  const strong = selectSafeAutomationMatch({
    entityType: "FOSTER",
    record: { ...record, sourceRecordId: "partner-5", sourceUrl: "https://partner.example/max" },
    candidates: [{
      id: 3, key: "foster:3", before: {}, dogName: "Max", name: "Dočasná opatera pre Maxa",
      organizer: "OZ A", sameSourceRecordIds: [],
    }],
  });
  assert.equal(strong.quality, "STRONG_IDENTITY");
});

test("dedicated Šaľa foster adapter remains higher priority than generic or Tavily", async () => {
  const fixture = readFileSync(new URL("./fixtures/data-automation/zatulane-psiky-sala-foster-detail.html", import.meta.url), "utf8");
  const src = source({
    sourceKey: "sala-markyz",
    sourceUrl: "https://zatulanepsikysala.sk/pomoc/markyz",
    config: {
      sourceShape: "SINGLE_ITEM",
      htmlAdapterKey: "zatulane-psiky-sala-foster-detail",
      expectedMinRecords: 1,
    },
  });
  let tavilyCalls = 0;
  const records = await fetchAutomationSourceRecords(src, {
    htmlAdapters: productionAutomationHtmlAdapters,
    sourceScopedContract: contract(src, "/pomoc/**"),
    tavilyCrawlProvider: {
      async crawl() {
        tavilyCalls += 1;
        throw new Error("Tavily must not run");
      },
    },
    tavilyRequestGate: gate(),
    fetchImpl: async () => new Response(fixture, {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].proposed.dogName, "Markýz");
  assert.equal(records[0].proposed.organization, "Zatúlané psíky Šaľa");
  assert.equal(tavilyCalls, 0);
});

test("BOUNDED_PARTIAL absence never implies FOSTER_RESOLVED", () => {
  const record = {
    sourceRecordId: "partial-max",
    sourceUrl: "https://foster.example/cases/max",
    sourceTimestamp: null,
    rawRecord: {},
    proposed: {},
    extraction: {
      itemUrl: "https://foster.example/cases/max",
      externalId: null,
      discoveredFromRoot: "https://foster.example/cases",
      strategy: "TAVILY_CRAWL",
      evidenceMetadata: {},
      coverage: { classification: "BOUNDED_PARTIAL", complete: false },
    },
  };
  assert.equal(automationCoverageCanInferAbsence(record.extraction.coverage), false);
  assert.deepEqual(normalizeAutomationLifecycleSignals("FOSTER", record), []);
});

test("runner and preview use the same FOSTER normalizer and no migration is introduced", () => {
  const runner = readFileSync(new URL("../lib/data-automation-runner.ts", import.meta.url), "utf8");
  const preview = readFileSync(new URL("../lib/data-automation-preview.ts", import.meta.url), "utf8");
  const activation = readFileSync(new URL("../lib/data-automation-source-activation.ts", import.meta.url), "utf8");
  assert.match(runner, /normalizeAutomationFosterRecord\(record/);
  assert.match(runner, /normalizeAutomationFosterRecord\(candidateRecord/);
  assert.match(preview, /normalizeAutomationFosterRecord\(candidateRecord/);
  assert.match(activation, /automationSourceProviderUsageSchemaReady\(database\)/);
  assert.match(activation, /TAVILY_USAGE_SCHEMA_UNAVAILABLE/);
  assert.equal(existsSync(new URL("../drizzle/0109_dynamic_entity_identity_indexes.sql", import.meta.url)), true);
  assert.equal(existsSync(new URL("../drizzle/0110_tavily_source_provider_usage.sql", import.meta.url)), true);
  assert.equal(existsSync(new URL("../drizzle/0111_foster_source_scoped.sql", import.meta.url)), false);
});
