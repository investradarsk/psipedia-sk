import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizeAutomationAdoptionRecord,
  normalizeAutomationAdoptionSize,
  automationAdoptionNormalizationMetadata,
} from "../lib/data-automation-adoption-normalize.ts";
import {
  validateDynamicAutomationIngestion,
} from "../lib/data-automation-dynamic-identity.ts";
import {
  automationExtractionCapabilities,
  automationSourceReadiness,
} from "../lib/data-automation-capability-registry.ts";
import {
  automationHelpSourceReadiness,
} from "../lib/data-automation-help-source-readiness.ts";
import {
  candidateProvisioningConfigFor,
} from "../lib/data-automation-source-provisioning.ts";
import {
  extractGenericFirstPartySource,
} from "../lib/data-automation-generic-source-extractor.ts";
import {
  buildSourceScopedExtractionContract,
  automationCoverageCanInferAbsence,
} from "../lib/data-automation-source-scoped-extraction.ts";
import {
  TavilyAutomationCrawlProvider,
  TavilyAutomationExtractProvider,
} from "../lib/data-automation-tavily-source-scoped.ts";
import {
  fetchAutomationSourceRecords,
} from "../lib/data-automation-connectors.ts";
import { productionAutomationHtmlAdapters } from "../lib/data-automation-real-sources.ts";
import { normalizeAutomationLifecycleSignals } from "../lib/data-automation-lifecycle.ts";
import { selectSafeAutomationMatch } from "../lib/data-automation-matching.ts";
import { classifyAutomationFinding } from "../lib/data-automation.ts";

const NOW = new Date("2026-10-05T12:00:00.000Z");

function source(overrides = {}) {
  return {
    id: 801,
    sourceKey: "adoption-pilot-source",
    label: "ADOPTION pilot source",
    entityType: "ADOPTION",
    connectorType: "CONTROLLED_HTML",
    sourceUrl: "https://adopt.example/adoption",
    config: {
      sourceShape: "MULTI_ITEM_LIST",
      staticFields: { organizationName: "Útulok ABC" },
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

function contract(src = source(), scope = "/adoption/**") {
  const result = buildSourceScopedExtractionContract(src, {
    pathScope: scope,
    maxRequestsPerDay: 12,
  });
  assert.equal(result.ready, true);
  return result.contract;
}

function noMatch() {
  return {
    entityType: "ADOPTION",
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
    <h1>Psy na adopciu</h1>
    <article class="dog-card"><a class="dog-name" href="/adoption/max">Max</a></article>
  </body></html>`;
}

function detailHtml(status = "") {
  return `<!doctype html><html><head>
    <link rel="canonical" href="https://adopt.example/adoption/max">
    <meta name="description" content="Max hľadá nový domov.">
  </head><body>
    <h1>Max</h1>
    <p>Pohlavie: pes</p>
    <p>Vek: 2 roky</p>
    <p>Rasa: Labrador</p>
    <p>Váha: 28,5 kg</p>
    <p>Farba: čierna</p>
    <p>Mesto: Nitra</p>
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
      return { operationKey: "adoption-pilot-" + operation.toLowerCase() };
    },
    async finalize() {},
  };
}

test("ADOPTION size normalizer only emits canonical enum values from explicit evidence", () => {
  const cases = [
    ["malý", "SMALL"],
    ["stredný", "MEDIUM"],
    ["veľký", "LARGE"],
    ["obrovský", "GIANT"],
    ["SMALL", "SMALL"],
    ["MEDIUM", "MEDIUM"],
    ["LARGE", "LARGE"],
    ["GIANT", "GIANT"],
    ["neuvedené", "UNKNOWN"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(normalizeAutomationAdoptionSize(input), expected, input);
  }
  assert.equal(normalizeAutomationAdoptionSize("stredne veľký"), null);
  assert.equal(normalizeAutomationAdoptionSize("cca 25 kg"), null);
  assert.equal(normalizeAutomationAdoptionSize("Labrador"), null);

  const ambiguous = normalizeAutomationAdoptionRecord({
    sourceRecordId: "dog-ambiguous-size",
    sourceUrl: "https://adopt.example/adoption/mia",
    sourceTimestamp: null,
    rawRecord: {},
    proposed: { name: "Mia", size: "stredne veľký" },
  }, { sourceConfig: { sourceShape: "SINGLE_ITEM", staticFields: { organizationName: "Útulok ABC" } } });
  assert.equal(Object.hasOwn(ambiguous.proposed, "size"), false);
  assert.notEqual(ambiguous.proposed.size, "stredne veľký");
});

test("ADOPTION normalizer maps explicit canonical fields conservatively", () => {
  const src = source({
    sourceUrl: "https://adopt.example/adoption/max",
    config: { sourceShape: "SINGLE_ITEM", staticFields: { organizationName: "Útulok ABC" } },
  });
  const normalized = normalizeAutomationAdoptionRecord({
    sourceRecordId: "dog-max",
    sourceUrl: src.sourceUrl,
    sourceTimestamp: null,
    rawRecord: {
      contentExcerpt: [
        "# Max",
        "Pohlavie: pes",
        "Dátum narodenia: 1. 2. 2024",
        "Vek: 2 roky 6 mesiacov",
        "Plemeno: kríženec Labradora",
        "Veľkosť: stredná",
        "Hmotnosť: 28,5 kg",
        "Farba: čierna",
        "Mesto: Nitra",
        "Okres: Nitra",
        "Kraj: Nitriansky kraj",
      ].join("\n"),
    },
    proposed: { name: "Max", description: "Pokojný pes vhodný do rodiny." },
    extraction: {
      itemUrl: src.sourceUrl,
      externalId: null,
      discoveredFromRoot: "https://adopt.example/adoption",
      strategy: "TAVILY_EXTRACT",
      evidenceMetadata: { retrievedAt: NOW.toISOString() },
      coverage: { classification: "DETAIL_ONLY", complete: false },
    },
  }, { sourceConfig: src.config });

  assert.equal(normalized.proposed.name, "Max");
  assert.equal(normalized.proposed.sex, "MALE");
  assert.equal(normalized.proposed.birthDate, "2024-02-01");
  assert.equal(normalized.proposed.approximateAgeMonths, 30);
  assert.equal(normalized.proposed.breedName, "kríženec Labradora");
  assert.equal(normalized.proposed.breedMix, true);
  assert.equal(normalized.proposed.size, "MEDIUM");
  assert.equal(normalized.proposed.weight, 28.5);
  assert.equal(normalized.proposed.color, "čierna");
  assert.equal(normalized.proposed.city, "Nitra");
  assert.equal(normalized.proposed.district, "Nitra");
  assert.equal(normalized.proposed.region, "Nitriansky kraj");
  assert.equal(normalized.proposed.organizationName, "Útulok ABC");
  assert.equal(normalized.proposed.externalSourceUrl, src.sourceUrl);
  assert.equal(normalized.proposed.lastVerifiedAt, NOW.toISOString());
  assert.equal(automationAdoptionNormalizationMetadata(normalized)?.profileEvidence, true);
});

test("generic adoption headings are never accepted as dog names", () => {
  const src = source({
    sourceUrl: "https://adopt.example/adoption",
    config: { sourceShape: "SINGLE_ITEM", staticFields: { organizationName: "Útulok ABC" } },
  });
  for (const name of ["Psy na adopciu", "Hľadáme domov", "Adoptujte psíka", "Naši zverenci"]) {
    const normalized = normalizeAutomationAdoptionRecord({
      sourceRecordId: "generic-" + name,
      sourceUrl: src.sourceUrl,
      sourceTimestamp: null,
      rawRecord: { contentExcerpt: "Pohlavie: pes\nVek: 2 roky" },
      proposed: { name },
    }, { sourceConfig: src.config });
    assert.equal(normalized.proposed.name, undefined);
    assert.equal(decision(src, normalized)?.gate, "INSUFFICIENT");
  }
});

test("source-level organization identity is inherited only from explicit approved config", () => {
  const src = source({
    sourceUrl: "https://adopt.example/adoption/max",
    config: { sourceShape: "SINGLE_ITEM", staticFields: { organizationName: "Útulok ABC" } },
  });
  const normalized = normalizeAutomationAdoptionRecord({
    sourceRecordId: "max",
    sourceUrl: src.sourceUrl,
    sourceTimestamp: null,
    rawRecord: { contentExcerpt: "Pohlavie: pes\nVek: 2 roky" },
    proposed: { name: "Max" },
  }, { sourceConfig: src.config });
  assert.equal(normalized.proposed.organizationName, "Útulok ABC");
  assert.equal(automationAdoptionNormalizationMetadata(normalized)?.organizationSource, "SOURCE_STATIC");

  const withoutStatic = normalizeAutomationAdoptionRecord({
    ...normalized,
    proposed: { name: "Max" },
  }, { sourceConfig: { sourceShape: "SINGLE_ITEM" } });
  assert.equal(withoutStatic.proposed.organizationName, undefined);
});

test("legacy HELP readiness unlocks ADOPTION and FOSTER while LOST_FOUND stays adapter-only", () => {
  for (const entityType of ["ADOPTION", "FOSTER"]) {
    const result = automationHelpSourceReadiness({
      entityType,
      connectorType: "CONTROLLED_HTML",
      config: { sourceShape: "MULTI_ITEM_LIST", staticFields: { organizationName: "OZ ABC" } },
    });
    assert.equal(result.ready, true);
    assert.equal(result.adapterKey, null);
  }

  const lostFound = automationHelpSourceReadiness({
    entityType: "LOST_FOUND",
    connectorType: "CONTROLLED_HTML",
    config: { sourceShape: "MULTI_ITEM_LIST", staticFields: { organizationName: "OZ ABC" } },
  });
  assert.equal(lostFound.ready, false);
  assert.equal(lostFound.reason, "MISSING_ADAPTER");
});

test("source-scoped ADOPTION readiness requires explicit sourceShape and organization identity", () => {
  const noShape = automationExtractionCapabilities(source({
    config: { staticFields: { organizationName: "Útulok ABC" } },
  }), undefined, { tavilyCredentialConfigured: true });
  assert.equal(noShape.find((item) => item.strategy === "GENERIC_FIRST_PARTY")?.reason, "ADOPTION_SOURCE_SHAPE_REQUIRED");

  const noOrganization = automationExtractionCapabilities(source({
    config: { sourceShape: "MULTI_ITEM_LIST" },
  }), undefined, { tavilyCredentialConfigured: true });
  assert.equal(noOrganization.find((item) => item.strategy === "GENERIC_FIRST_PARTY")?.reason, "ADOPTION_ORGANIZATION_IDENTITY_REQUIRED");

  const ready = automationSourceReadiness(source(), undefined, {
    tavilyCredentialConfigured: true,
    genericProbe: { supported: true, reason: "PROBE_CONFIRMED", sourceShape: "MULTI_ITEM_LIST" },
  });
  assert.equal(ready.ready, true);
  assert.equal(ready.strategy, "GENERIC_FIRST_PARTY");
});

test("candidate provisioning accepts generic ADOPTION only from explicit shape + organization metadata", () => {
  assert.deepEqual(candidateProvisioningConfigFor({
    entityType: "ADOPTION",
    canonicalUrl: "https://adopt.example/adoption",
    metadata: { sourceShape: "MULTI_ITEM_LIST", organizationName: "Útulok ABC" },
  }), {
    sourceShape: "MULTI_ITEM_LIST",
    staticFields: { organizationName: "Útulok ABC" },
  });
  assert.deepEqual(candidateProvisioningConfigFor({
    entityType: "ADOPTION",
    canonicalUrl: "https://adopt.example/adoption",
    metadata: { organizationName: "Útulok ABC" },
  }), {});
});

test("generic-first listing/detail discovery produces a strict valid ADOPTION draft candidate", async () => {
  const src = source();
  const result = await extractGenericFirstPartySource({
    source: src,
    contract: contract(src),
    rootHtml: listingHtml(),
    rootUrl: src.sourceUrl,
    fetchPage: async (url) => {
      assert.equal(url, "https://adopt.example/adoption/max");
      return { html: detailHtml(), finalUrl: url };
    },
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].extraction.strategy, "GENERIC_FIRST_PARTY");
  assert.equal(result.records[0].extraction.evidenceMetadata.discoveryMethod, "ADOPTION_DETAIL_HTML");

  const normalized = normalizeAutomationAdoptionRecord(result.records[0], { sourceConfig: src.config });
  assert.equal(normalized.proposed.name, "Max");
  assert.equal(normalized.proposed.organizationName, "Útulok ABC");
  assert.equal(normalized.proposed.sex, "MALE");
  assert.equal(normalized.proposed.approximateAgeMonths, 24);
  assert.equal(normalized.proposed.breedName, "Labrador");
  assert.equal(decision(src, normalized)?.gate, "VALID_FOR_DRAFT");
});

test("generic SINGLE_ITEM adoption fallback rejects generic/non-dog pages", async () => {
  const src = source({
    sourceUrl: "https://adopt.example/adoption/about",
    config: { sourceShape: "SINGLE_ITEM", staticFields: { organizationName: "Útulok ABC" } },
  });
  await assert.rejects(
    extractGenericFirstPartySource({
      source: src,
      contract: contract(src),
      rootHtml: `<html><head><link rel="canonical" href="${src.sourceUrl}"></head><body><h1>Útulok ABC</h1><p>Pomáhame psom.</p></body></html>`,
      rootUrl: src.sourceUrl,
      fetchPage: async () => { throw new Error("unexpected"); },
    }),
    /no_items_discovered/,
  );
});

test("Tavily Crawl stays provider-neutral and ADOPTION normalizer extracts labelled facts", async () => {
  const src = source();
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "test-key",
    now: () => NOW,
    fetchImpl: async () => json(tavilyPayload(
      "https://adopt.example/adoption/max",
      "# Max\nPohlavie: pes\nVek: 2 roky\nRasa: Labrador\nMesto: Nitra",
    )),
  });
  const result = await provider.crawl({ source: src, contract: contract(src), gate: gate() });
  const normalized = normalizeAutomationAdoptionRecord(result.records[0], { sourceConfig: src.config });
  assert.equal(result.coverage.classification, "BOUNDED_PARTIAL");
  assert.equal(normalized.proposed.organizationName, "Útulok ABC");
  assert.equal(normalized.proposed.sex, "MALE");
  assert.equal(decision(src, normalized)?.gate, "VALID_FOR_DRAFT");
});

test("Tavily Extract detail fallback remains DETAIL_ONLY and uses the same normalizer", async () => {
  const src = source({
    sourceUrl: "https://adopt.example/adoption/max",
    config: { sourceShape: "SINGLE_ITEM", staticFields: { organizationName: "Útulok ABC" } },
  });
  const provider = new TavilyAutomationExtractProvider({
    apiKey: "test-key",
    now: () => NOW,
    fetchImpl: async () => json(tavilyPayload(
      src.sourceUrl,
      "# Max\nPohlavie: pes\nVek: 2 roky\nRasa: Labrador",
    )),
  });
  const result = await provider.extract({
    source: src,
    contract: contract(src),
    gate: gate(),
    urls: [src.sourceUrl],
  });
  const normalized = normalizeAutomationAdoptionRecord(result.records[0], { sourceConfig: src.config });
  assert.equal(result.coverage.classification, "DETAIL_ONLY");
  assert.equal(decision(src, normalized)?.gate, "VALID_FOR_DRAFT");
});

test("weak source-scoped profile evidence remains review-only even with source-level organization", () => {
  const src = source({
    sourceUrl: "https://adopt.example/adoption/max",
    config: { sourceShape: "SINGLE_ITEM", staticFields: { organizationName: "Útulok ABC" } },
  });
  const normalized = normalizeAutomationAdoptionRecord({
    sourceRecordId: "url:max",
    sourceUrl: src.sourceUrl,
    sourceTimestamp: null,
    rawRecord: { contentExcerpt: "# Max\nMilý psík hľadá nový domov." },
    proposed: { name: "Max", description: "Milý psík hľadá nový domov." },
    extraction: {
      itemUrl: src.sourceUrl,
      externalId: null,
      discoveredFromRoot: "https://adopt.example/adoption",
      strategy: "TAVILY_EXTRACT",
      evidenceMetadata: {},
      coverage: { classification: "DETAIL_ONLY", complete: false },
    },
  }, { sourceConfig: src.config });
  const result = decision(src, normalized);
  assert.equal(result?.gate, "INSUFFICIENT");
  assert.ok(result?.reasons.includes("adoption_profile_evidence_missing"));
});

test("new explicit ADOPTED and RESERVED records are review-only; existing exact match gets lifecycle suggestion", () => {
  for (const [status, signalType, reason] of [
    ["Adoptovaný", "ADOPTION_ADOPTED", "adoption_adopted_new_draft_blocked"],
    ["Rezervovaný", "ADOPTION_RESERVED", "adoption_reserved_new_draft_blocked"],
  ]) {
    const src = source({
      sourceUrl: "https://adopt.example/adoption/max",
      config: { sourceShape: "SINGLE_ITEM", staticFields: { organizationName: "Útulok ABC" } },
    });
    const normalized = normalizeAutomationAdoptionRecord({
      sourceRecordId: "dog-" + status,
      sourceUrl: src.sourceUrl,
      sourceTimestamp: null,
      rawRecord: { contentExcerpt: "# Max\nPohlavie: pes\nVek: 2 roky\nStav: " + status },
      proposed: { name: "Max" },
      extraction: {
        itemUrl: src.sourceUrl,
        externalId: null,
        discoveredFromRoot: "https://adopt.example/adoption",
        strategy: "TAVILY_EXTRACT",
        evidenceMetadata: {},
        coverage: { classification: "DETAIL_ONLY", complete: false },
      },
    }, { sourceConfig: src.config });

    assert.equal(normalizeAutomationLifecycleSignals("ADOPTION", normalized)[0]?.signalType, signalType);
    const fresh = decision(src, normalized);
    assert.equal(fresh?.gate, "INSUFFICIENT");
    assert.ok(fresh?.reasons.includes(reason));

    const existing = decision(src, normalized, {
      entityType: "ADOPTION",
      entityId: 10,
      entityKey: "adoption:10",
      quality: "EXACT_SOURCE_ID",
      before: { status: "ACTIVE" },
    });
    assert.equal(existing?.gate, "VALID_FOR_UPDATE_ONLY");
    assert.equal(existing?.canAttachLifecycleSuggestion, true);
  }
});

test("generic CTA word adoptovať is not an ADOPTED signal", () => {
  const src = source({
    sourceUrl: "https://adopt.example/adoption/max",
    config: { sourceShape: "SINGLE_ITEM", staticFields: { organizationName: "Útulok ABC" } },
  });
  const normalized = normalizeAutomationAdoptionRecord({
    sourceRecordId: "cta",
    sourceUrl: src.sourceUrl,
    sourceTimestamp: null,
    rawRecord: { contentExcerpt: "# Max\nPohlavie: pes\nVek: 2 roky\nChcete adoptovať Maxa? Kontaktujte nás." },
    proposed: { name: "Max" },
  }, { sourceConfig: src.config });
  assert.deepEqual(normalizeAutomationLifecycleSignals("ADOPTION", normalized), []);
});

test("ADOPTION identity keeps same-name dogs separated and conflicts review-only", () => {
  const record = {
    sourceRecordId: "dog-200",
    sourceUrl: "https://adopt.example/adoption/max",
    sourceTimestamp: null,
    rawRecord: {},
    proposed: {
      name: "Max",
      organizationName: "Útulok A",
      sex: "MALE",
      breedName: "Labrador",
      city: "Nitra",
    },
  };
  const differentOrg = selectSafeAutomationMatch({
    entityType: "ADOPTION",
    record,
    candidates: [{
      id: 1, key: "adoption:1", before: {},
      name: "Max", organizer: "Útulok B", sex: "MALE", breed: "Labrador", city: "Nitra",
    }],
  });
  assert.equal(differentOrg.quality, "NONE");

  const stableConflict = selectSafeAutomationMatch({
    entityType: "ADOPTION",
    record,
    candidates: [{
      id: 2, key: "adoption:2", before: {},
      name: "Max", organizer: "Útulok A", sex: "MALE", breed: "Labrador", city: "Nitra",
      sameSourceRecordIds: ["dog-100"],
    }],
  });
  assert.equal(stableConflict.quality, "UNCERTAIN");

  const strong = selectSafeAutomationMatch({
    entityType: "ADOPTION",
    record: { ...record, sourceRecordId: "partner-5", sourceUrl: "https://partner.example/dogs/5" },
    candidates: [{
      id: 3, key: "adoption:3", before: {},
      name: "Max", organizer: "Útulok A", sex: "MALE", breed: "Labrador", city: "Nitra",
      sameSourceRecordIds: [],
    }],
  });
  assert.equal(strong.quality, "STRONG_IDENTITY");
});

test("exact existing ADOPTION match produces POSSIBLE_UPDATE instead of canonical overwrite", () => {
  const proposed = { name: "Max", organizationName: "Útulok A", weight: 30 };
  const match = {
    entityType: "ADOPTION",
    entityId: 4,
    entityKey: "adoption:4",
    quality: "EXACT_SOURCE_ID",
    before: { name: "Max", organizationName: "Útulok A", weight: 28 },
  };
  assert.equal(classifyAutomationFinding({ match, proposed })?.findingType, "POSSIBLE_UPDATE");
  const result = decision(source(), {
    sourceRecordId: "max",
    sourceUrl: "https://adopt.example/adoption/max",
    sourceTimestamp: null,
    rawRecord: {},
    proposed,
  }, match);
  assert.equal(result?.canSuggestUpdate, true);
  assert.equal(result?.canCreateDraft, false);
});

test("dedicated Trnava adapter still wins before generic or Tavily", async () => {
  const src = source({
    sourceKey: "trnava-max",
    sourceUrl: "https://trnava.utulok.sk/psy/max",
    config: {
      sourceShape: "SINGLE_ITEM",
      htmlAdapterKey: "trnava-adoption-detail",
      expectedMinRecords: 1,
    },
  });
  let tavilyCalls = 0;
  const records = await fetchAutomationSourceRecords(src, {
    htmlAdapters: productionAutomationHtmlAdapters,
    sourceScopedContract: contract(src, "/psy/**"),
    tavilyCrawlProvider: {
      async crawl() {
        tavilyCalls += 1;
        throw new Error("Tavily must not run");
      },
    },
    tavilyRequestGate: gate(),
    fetchImpl: async () => new Response(
      `<html><body><h1>Max</h1><div>Pohlavie: pes</div><div>Vek: 2 roky</div><div>Rasa: Labrador</div><div>Veľkosť: stredná</div><div>Váha: 28 kg</div><div>Farba: čierna</div><div>Kastrácia: áno</div><div>Očkovaný: áno</div><div>Hendikep: nie</div></body></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    ),
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].proposed.organizationName, "Útulok Trnava");
  assert.equal(tavilyCalls, 0);
});

test("BOUNDED_PARTIAL absence never implies ADOPTED, ARCHIVED or deletion", () => {
  const record = {
    sourceRecordId: "partial-max",
    sourceUrl: "https://adopt.example/adoption/max",
    sourceTimestamp: null,
    rawRecord: {},
    proposed: {},
    extraction: {
      itemUrl: "https://adopt.example/adoption/max",
      externalId: null,
      discoveredFromRoot: "https://adopt.example/adoption",
      strategy: "TAVILY_CRAWL",
      evidenceMetadata: {},
      coverage: { classification: "BOUNDED_PARTIAL", complete: false },
    },
  };
  assert.equal(automationCoverageCanInferAbsence(record.extraction.coverage), false);
  assert.deepEqual(normalizeAutomationLifecycleSignals("ADOPTION", record), []);
});

test("same source item remains deterministic and runtime keeps receipt/provenance idempotency path", async () => {
  const src = source();
  const run = async () => extractGenericFirstPartySource({
    source: src,
    contract: contract(src),
    rootHtml: listingHtml(),
    rootUrl: src.sourceUrl,
    fetchPage: async (url) => ({ html: detailHtml(), finalUrl: url }),
  });
  const first = await run();
  const second = await run();
  assert.equal(first.records[0].sourceRecordId, second.records[0].sourceRecordId);

  const runner = readFileSync(new URL("../lib/data-automation-runner.ts", import.meta.url), "utf8");
  assert.match(runner, /getAutomationIngestionReceipt/);
  assert.match(runner, /upsertCanonicalExternalProvenance/);
  assert.match(runner, /createCanonicalDraftForFinding/);
});

test("runner and preview use the same ADOPTION normalizer before canonical matching", () => {
  const runner = readFileSync(new URL("../lib/data-automation-runner.ts", import.meta.url), "utf8");
  const preview = readFileSync(new URL("../lib/data-automation-preview.ts", import.meta.url), "utf8");
  assert.match(runner, /normalizeAutomationAdoptionRecord\(record/);
  assert.match(runner, /normalizeAutomationAdoptionRecord\(candidateRecord/);
  assert.match(preview, /normalizeAutomationAdoptionRecord\(candidateRecord/);
});

test("automation-created adoption remains DRAFT and unpublished", () => {
  const draftService = readFileSync(new URL("../lib/canonical-draft-service.ts", import.meta.url), "utf8");
  const adoptionBranch = draftService.match(/if \(input\.entityType === "ADOPTION"\) \{([\s\S]*?)\n\s*\}\n\n\s*if \(input\.entityType === "LOST_FOUND"\)/);
  assert.ok(adoptionBranch);
  assert.match(adoptionBranch[1], /status: "DRAFT"/);
  assert.match(adoptionBranch[1], /published_at: null/);
});

test("production-applied 0110 remains a real fail-closed Tavily runtime schema gate and ADOPTION adds no migration", () => {
  const activation = readFileSync(new URL("../lib/data-automation-source-activation.ts", import.meta.url), "utf8");
  assert.match(activation, /technical\.strategy === "TAVILY_CRAWL"/);
  assert.match(activation, /technical\.strategy === "TAVILY_EXTRACT"/);
  assert.match(activation, /automationSourceProviderUsageSchemaReady\(database\)/);
  assert.match(activation, /TAVILY_USAGE_SCHEMA_UNAVAILABLE/);
  assert.equal(existsSync(new URL("../drizzle/0109_dynamic_entity_identity_indexes.sql", import.meta.url)), true);
  assert.equal(existsSync(new URL("../drizzle/0110_tavily_source_provider_usage.sql", import.meta.url)), true);
  assert.equal(existsSync(new URL("../drizzle/0111_adoption_source_scoped.sql", import.meta.url)), false);
});

test("focused CI executes the ADOPTION pilot regression suite", () => {
  for (const path of [
    "../.github/workflows/data-automation-ci.yml",
    "../.github/workflows/data-automation-v2-ci.yml",
  ]) {
    const workflow = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(workflow, /tests\/data-automation-adoption-source-pilot\.test\.mjs/);
  }
});
