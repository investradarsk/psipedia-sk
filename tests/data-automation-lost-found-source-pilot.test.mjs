import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizeAutomationLostFoundRecord,
  automationLostFoundNormalizationMetadata,
} from "../lib/data-automation-lost-found-normalize.ts";
import { validateDynamicAutomationIngestion } from "../lib/data-automation-dynamic-identity.ts";
import { enrichAutomationRecordSchemaFirst } from "../lib/data-automation-entity-enrichment.ts";
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
    id: 902,
    sourceKey: "lost-found-pilot-source",
    label: "LOST_FOUND pilot source",
    entityType: "LOST_FOUND",
    connectorType: "CONTROLLED_HTML",
    sourceUrl: "https://lostfound.example/reports",
    config: {
      sourceShape: "MULTI_ITEM_LIST",
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

function contract(src = source(), scope = "/reports/**") {
  const result = buildSourceScopedExtractionContract(src, {
    pathScope: scope,
    maxRequestsPerDay: 12,
  });
  assert.equal(result.ready, true);
  return result.contract;
}

function noMatch() {
  return {
    entityType: "LOST_FOUND",
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
    <h1>Stratené a nájdené psy</h1>
    <article class="lost-found-card"><a class="dog-name" href="/reports/rex">Rex</a></article>
    <article class="lost-found-card"><a class="dog-name" href="/reports/bella">Bella</a></article>
  </body></html>`;
}

function foundDetailHtml(status = "") {
  return `<!doctype html><html><head>
    <link rel="canonical" href="https://lostfound.example/reports/rex">
    <meta name="description" content="Nájdený pes v Nitre.">
  </head><body>
    <h1>Nájdený pes Rex</h1>
    <p>Nájdený pes</p>
    <p>Meno: Rex</p>
    <p>Dátum nálezu: 05.10.2026</p>
    <p>Mesto: Nitra</p>
    <p>Plemeno: Labrador</p>
    <p>Pohlavie: pes</p>
    <p>Farba: čierna</p>
    <p>Veľkosť: veľký</p>
    ${status ? `<p>Stav: ${status}</p>` : ""}
  </body></html>`;
}

function lostDetailHtml() {
  return `<!doctype html><html><head>
    <link rel="canonical" href="https://lostfound.example/reports/bella">
  </head><body>
    <h1>Stratená fenka Bella</h1>
    <p>Stratená fenka</p>
    <p>Meno: Bella</p>
    <p>Dátum straty: 04.10.2026</p>
    <p>Mesto: Trnava</p>
    <p>Plemeno: kríženec</p>
    <p>Pohlavie: fenka</p>
    <p>Farba: hnedá</p>
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
      return { operationKey: "lost-found-pilot-" + operation.toLowerCase() };
    },
    async finalize() {},
  };
}

function normalizedRecord(text, overrides = {}) {
  const src = source({
    sourceUrl: "https://lostfound.example/reports/rex",
    config: { sourceShape: "SINGLE_ITEM" },
  });
  return normalizeAutomationLostFoundRecord({
    sourceRecordId: "url:rex",
    sourceUrl: src.sourceUrl,
    sourceTimestamp: null,
    rawRecord: { contentExcerpt: text },
    proposed: {},
    extraction: {
      itemUrl: src.sourceUrl,
      externalId: null,
      discoveredFromRoot: "https://lostfound.example/reports",
      strategy: "TAVILY_EXTRACT",
      evidenceMetadata: {},
      coverage: { classification: "DETAIL_ONLY", complete: false },
    },
    ...overrides,
  }, { sourceConfig: src.config });
}

test("LOST_FOUND normalizer maps canonical fields, enum values and deterministic dates", () => {
  const normalized = normalizedRecord([
    "Nájdený pes",
    "Meno: Rex",
    "Pohlavie: pes",
    "Plemeno: Labrador",
    "Farba: čierna",
    "Vek: cca 2 roky",
    "Veľkosť: stredný",
    "Dátum nálezu: 5. 10. 2026",
    "Mesto: Nitra",
    "Okres: Nitra",
    "Kraj: Nitriansky kraj",
    "Lokalita: Chrenová",
    "Zdroj: Mestská polícia",
  ].join("\n"));

  assert.deepEqual(normalized.proposed, {
    type: "FOUND",
    dogName: "Rex",
    sex: "MALE",
    breed: "Labrador",
    color: "čierna",
    approximateAge: "cca 2 roky",
    size: "MEDIUM",
    eventDate: "2026-10-05",
    region: "Nitriansky kraj",
    district: "Nitra",
    city: "Nitra",
    locationDescription: "Chrenová",
    source: "Mestská polícia",
    sourceUrl: "https://lostfound.example/reports/rex",
  });
  assert.equal(automationLostFoundNormalizationMetadata(normalized)?.explicitType, "FOUND");
  assert.equal(automationLostFoundNormalizationMetadata(normalized)?.dogProfileEvidence, true);
  assert.equal(decision(source(), normalized)?.gate, "VALID_FOR_DRAFT");
});

test("LOST and FOUND type evidence is conservative and conflicts fail closed", () => {
  const lost = normalizedRecord("Stratená fenka\nMeno: Bella\nDátum straty: 04.10.2026\nMesto: Trnava\nPlemeno: kríženec");
  assert.equal(lost.proposed.type, "LOST");

  const abandonedOnly = normalizedRecord("Opustený pes\nMeno: Rex\nDátum nálezu: 05.10.2026\nMesto: Nitra\nPlemeno: Labrador");
  assert.equal(abandonedOnly.proposed.type, undefined);
  assert.ok(decision(source(), abandonedOnly)?.reasons.includes("lost_found_type_missing"));

  const conflict = normalizedRecord("Stratený pes, neskôr nájdený pes\nMeno: Rex\nDátum nálezu: 05.10.2026\nMesto: Nitra\nPlemeno: Labrador");
  assert.equal(conflict.proposed.type, undefined);
  assert.equal(automationLostFoundNormalizationMetadata(conflict)?.typeConflict, true);
  assert.ok(decision(source(), conflict)?.reasons.includes("lost_found_type_conflict"));

  const staticFound = normalizeAutomationLostFoundRecord({
    sourceRecordId: "static-found",
    sourceUrl: "https://lostfound.example/reports/static",
    sourceTimestamp: null,
    rawRecord: { contentExcerpt: "Meno: Rex\nDátum nálezu: 05.10.2026\nMesto: Nitra\nPlemeno: Labrador" },
    proposed: {},
  }, { sourceConfig: { sourceShape: "SINGLE_ITEM", staticFields: { type: "FOUND" } } });
  assert.equal(staticFound.proposed.type, "FOUND");
});

test("eventDate accepts only exact valid incident dates and rejects relative/published dates", () => {
  for (const [value, expected] of [
    ["09.09.2026", "2026-09-09"],
    ["9. 9. 2026", "2026-09-09"],
    ["2026-09-09", "2026-09-09"],
  ]) {
    const normalized = normalizedRecord(`Nájdený pes\nMeno: Rex\nDátum nálezu: ${value}\nMesto: Nitra\nPlemeno: Labrador`);
    assert.equal(normalized.proposed.eventDate, expected);
  }

  for (const value of ["31.02.2026", "včera", "minulý týždeň", "v septembri"]) {
    const normalized = normalizedRecord(`Nájdený pes\nMeno: Rex\nDátum nálezu: ${value}\nMesto: Nitra\nPlemeno: Labrador`);
    assert.equal(normalized.proposed.eventDate, undefined);
    assert.ok(decision(source(), normalized)?.reasons.includes("lost_found_incident_date_missing"));
  }

  const published = normalizeAutomationLostFoundRecord({
    sourceRecordId: "published-only",
    sourceUrl: "https://lostfound.example/reports/published",
    sourceTimestamp: null,
    rawRecord: { structured: { datePublished: "2026-10-05", type: "FOUND", city: "Nitra", breed: "Labrador" } },
    proposed: {},
  });
  assert.equal(published.proposed.eventDate, undefined);
});

test("dogName is explicit-only; sex and size never persist raw enum values or GIANT", () => {
  const labelled = normalizedRecord("Nájdený pes\nMeno: Rex\nPohlavie: fenka\nVeľkosť: malá\nDátum nálezu: 05.10.2026\nMesto: Nitra");
  assert.equal(labelled.proposed.dogName, "Rex");
  assert.equal(labelled.proposed.sex, "FEMALE");
  assert.equal(labelled.proposed.size, "SMALL");

  const unknown = normalizedRecord("Nájdený pes\nMeno: Rex\nPohlavie: neznáme\nVeľkosť: unknown\nDátum nálezu: 05.10.2026\nMesto: Nitra");
  assert.equal(unknown.proposed.sex, "UNKNOWN");
  assert.equal(unknown.proposed.size, "UNKNOWN");

  const giant = normalizedRecord("Nájdený pes pri Rex bare\nPohlavie: samec\nVeľkosť: GIANT\nDátum nálezu: 05.10.2026\nMesto: Nitra");
  assert.equal(giant.proposed.dogName, undefined);
  assert.equal(giant.proposed.sex, "MALE");
  assert.equal(giant.proposed.size, undefined);
  assert.notEqual(giant.proposed.size, "GIANT");
});

test("PII/contact and private-coordinate data is redacted from normalized persisted evidence", () => {
  const normalized = normalizeAutomationLostFoundRecord({
    sourceRecordId: "pii",
    sourceUrl: "https://lostfound.example/reports/rex",
    sourceTimestamp: null,
    rawRecord: {
      contentExcerpt: [
        "Nájdený pes",
        "Meno: Rex",
        "Dátum nálezu: 05.10.2026",
        "Mesto: Nitra",
        "Plemeno: Labrador",
        "Kontakt: Ján Novák",
        "Tel: 0900 111 222",
        "Email: jan@example.sk",
      ].join("\n"),
      contactName: "Ján Novák",
      phone: "0900 111 222",
      email: "jan@example.sk",
      latitude: 48.123,
      longitude: 18.456,
      structured: {
        type: "FOUND",
        eventDate: "2026-10-05",
        city: "Nitra",
        breed: "Labrador",
        contactPoint: { email: "jan@example.sk" },
        geo: { latitude: 48.123, longitude: 18.456 },
      },
    },
    proposed: {
      description: "Nájdený pes. Kontakt: Ján Novák, 0900 111 222, jan@example.sk",
      privatePhone: "0900 111 222",
      privateEmail: "jan@example.sk",
      latitude: 48.123,
      longitude: 18.456,
    },
    extraction: {
      itemUrl: "https://lostfound.example/reports/rex",
      externalId: null,
      discoveredFromRoot: "https://lostfound.example/reports",
      strategy: "TAVILY_EXTRACT",
      evidenceMetadata: {},
      coverage: { classification: "DETAIL_ONLY", complete: false },
    },
  });

  const serialized = JSON.stringify(normalized);
  assert.doesNotMatch(serialized, /0900\s*111\s*222/);
  assert.doesNotMatch(serialized, /jan@example\.sk/i);
  assert.doesNotMatch(serialized, /48\.123|18\.456/);
  assert.equal(Object.hasOwn(normalized.proposed, "privatePhone"), false);
  assert.equal(Object.hasOwn(normalized.proposed, "privateEmail"), false);
  assert.equal(Object.hasOwn(normalized.proposed, "latitude"), false);
  assert.equal(Object.hasOwn(normalized.proposed, "longitude"), false);
  assert.equal(String(normalized.proposed.description).length <= 5000, true);
});

test("LOST_FOUND readiness and provisioning require shape but never organization identity", () => {
  const help = automationHelpSourceReadiness({
    entityType: "LOST_FOUND",
    connectorType: "CONTROLLED_HTML",
    config: { sourceShape: "MULTI_ITEM_LIST" },
  });
  assert.equal(help.ready, true);
  assert.equal(help.reason, "READY");

  const noShape = automationExtractionCapabilities(source({ config: {} }), undefined, { tavilyCredentialConfigured: true });
  assert.equal(noShape.find((x) => x.strategy === "GENERIC_FIRST_PARTY")?.reason, "LOST_FOUND_SOURCE_SHAPE_REQUIRED");

  const capabilities = automationExtractionCapabilities(source(), undefined, { tavilyCredentialConfigured: true });
  assert.notEqual(capabilities.find((x) => x.strategy === "GENERIC_FIRST_PARTY")?.reason, "LOST_FOUND_SOURCE_SCOPED_NOT_ENABLED");
  assert.equal(automationSourceReadiness(source(), undefined, { tavilyCredentialConfigured: true }).ready, true);

  assert.deepEqual(candidateProvisioningConfigFor({
    entityType: "LOST_FOUND",
    canonicalUrl: "https://lostfound.example/reports",
    metadata: { sourceShape: "MULTI_ITEM_LIST" },
  }), { sourceShape: "MULTI_ITEM_LIST" });
  assert.deepEqual(candidateProvisioningConfigFor({
    entityType: "LOST_FOUND",
    canonicalUrl: "https://lostfound.example/found",
    metadata: { sourceShape: "SINGLE_ITEM", type: "FOUND" },
  }), { sourceShape: "SINGLE_ITEM", staticFields: { type: "FOUND" } });
});

test("generic MULTI_ITEM_LIST extracts concrete FOUND and LOST detail reports", async () => {
  const src = source();
  const result = await extractGenericFirstPartySource({
    source: src,
    contract: contract(src),
    rootHtml: listingHtml(),
    rootUrl: src.sourceUrl,
    fetchPage: async (url) => {
      if (url === "https://lostfound.example/reports/rex") return { html: foundDetailHtml(), finalUrl: url };
      if (url === "https://lostfound.example/reports/bella") return { html: lostDetailHtml(), finalUrl: url };
      throw new Error("unexpected:" + url);
    },
  });
  assert.equal(result.records.length, 2);
  const enriched = await Promise.all(result.records.map((record) => enrichAutomationRecordSchemaFirst({
    entityType: "LOST_FOUND",
    record,
  })));
  const normalized = enriched.map((record) => normalizeAutomationLostFoundRecord(record, { sourceConfig: src.config }));
  const rex = normalized.find((record) => record.proposed.dogName === "Rex");
  const bella = normalized.find((record) => record.proposed.dogName === "Bella");
  assert.equal(rex?.proposed.type, "FOUND");
  assert.equal(rex?.proposed.eventDate, "2026-10-05");
  assert.equal(rex?.proposed.city, "Nitra");
  assert.equal(rex?.proposed.sex, "MALE");
  assert.equal(rex?.proposed.size, "LARGE");
  assert.equal(rex?.proposed.breed, "Labrador");
  assert.equal(rex?.proposed.color, "čierna");
  assert.equal(decision(src, rex)?.gate, "VALID_FOR_DRAFT");
  assert.equal(bella?.proposed.type, "LOST");
  assert.equal(decision(src, bella)?.gate, "VALID_FOR_DRAFT");
  assert.ok(result.records.every((record) => record.extraction.evidenceMetadata.lostFoundDetailEvidence === true));
});

test("generic SINGLE_ITEM accepts a concrete report and rejects a generic LOST_FOUND page", async () => {
  const src = source({
    sourceUrl: "https://lostfound.example/reports/rex",
    config: { sourceShape: "SINGLE_ITEM" },
  });
  const good = await extractGenericFirstPartySource({
    source: src,
    contract: contract(src),
    rootHtml: foundDetailHtml(),
    rootUrl: src.sourceUrl,
    fetchPage: async () => { throw new Error("unexpected"); },
  });
  assert.equal(good.records.length, 1);
  const normalized = normalizeAutomationLostFoundRecord(good.records[0], { sourceConfig: src.config });
  assert.equal(decision(src, normalized)?.gate, "VALID_FOR_DRAFT");

  const genericSrc = source({
    sourceUrl: "https://lostfound.example/reports/help",
    config: { sourceShape: "SINGLE_ITEM" },
  });
  await assert.rejects(
    extractGenericFirstPartySource({
      source: genericSrc,
      contract: contract(genericSrc),
      rootHtml: `<html><head><link rel="canonical" href="https://lostfound.example/reports/help"></head><body><h1>Stratené a nájdené psy v okolí Nitry</h1></body></html>`,
      rootUrl: genericSrc.sourceUrl,
      fetchPage: async () => { throw new Error("unexpected"); },
    }),
    /no_items_discovered/,
  );
});

test("missing date, locality, dog profile and weak identity remain insufficient", () => {
  const missingDate = normalizedRecord("Nájdený pes\nMeno: Rex\nMesto: Nitra\nPlemeno: Labrador");
  assert.ok(decision(source(), missingDate)?.reasons.includes("lost_found_incident_date_missing"));

  const missingLocality = normalizedRecord("Stratený pes\nMeno: Rex\nDátum straty: 05.10.2026\nPlemeno: Labrador");
  assert.ok(decision(source(), missingLocality)?.reasons.includes("lost_found_locality_missing"));

  const weak = normalizeAutomationLostFoundRecord({
    sourceRecordId: "fp:weak",
    sourceUrl: null,
    sourceTimestamp: null,
    rawRecord: { contentExcerpt: "Nájdený pes\nDátum nálezu: 05.10.2026\nMesto: Nitra\nPlemeno: Labrador" },
    proposed: {},
    extraction: {
      itemUrl: null,
      externalId: null,
      discoveredFromRoot: "https://lostfound.example/reports",
      strategy: "GENERIC_FIRST_PARTY",
      evidenceMetadata: {},
      coverage: { classification: "DETAIL_ONLY", complete: false },
    },
  });
  assert.ok(decision(source(), weak)?.reasons.includes("lost_found_stable_identity_missing"));

  const noDogProfile = normalizedRecord("Nájdený pes\nDátum nálezu: 05.10.2026\nMesto: Nitra");
  assert.ok(decision(source(), noDogProfile)?.reasons.includes("lost_found_dog_profile_evidence_missing"));
});

test("Tavily Crawl and Extract remain provider-neutral and pass the same strict LOST_FOUND normalizer", async () => {
  const crawlSrc = source();
  const crawlProvider = new TavilyAutomationCrawlProvider({
    apiKey: "test-key",
    now: () => NOW,
    fetchImpl: async () => json(tavilyPayload(
      "https://lostfound.example/reports/rex",
      "# Nájdený pes\nMeno: Rex\nDátum nálezu: 2026-10-05\nMesto: Žilina\nPlemeno: Border kólia\nFarba: čierno-biela",
    )),
  });
  const crawled = await crawlProvider.crawl({ source: crawlSrc, contract: contract(crawlSrc), gate: gate() });
  const crawlNormalized = normalizeAutomationLostFoundRecord(crawled.records[0], { sourceConfig: crawlSrc.config });
  assert.equal(crawled.coverage.classification, "BOUNDED_PARTIAL");
  assert.equal(crawlNormalized.proposed.type, "FOUND");
  assert.equal(crawlNormalized.proposed.dogName, "Rex");
  assert.equal(decision(crawlSrc, crawlNormalized)?.gate, "VALID_FOR_DRAFT");

  const extractSrc = source({
    sourceUrl: "https://lostfound.example/reports/bella",
    config: { sourceShape: "SINGLE_ITEM" },
  });
  const extractProvider = new TavilyAutomationExtractProvider({
    apiKey: "test-key",
    now: () => NOW,
    fetchImpl: async () => json(tavilyPayload(
      extractSrc.sourceUrl,
      "# Stratená fenka Bella\nMeno: Bella\nDátum straty: 04.10.2026\nMesto: Trnava\nPlemeno: kríženec\nFarba: hnedá",
    )),
  });
  const extracted = await extractProvider.extract({
    source: extractSrc,
    contract: contract(extractSrc),
    gate: gate(),
    urls: [extractSrc.sourceUrl],
  });
  const extractNormalized = normalizeAutomationLostFoundRecord(extracted.records[0], { sourceConfig: extractSrc.config });
  assert.equal(extracted.coverage.classification, "DETAIL_ONLY");
  assert.equal(extractNormalized.proposed.type, "LOST");
  assert.equal(decision(extractSrc, extractNormalized)?.gate, "VALID_FOR_DRAFT");
});

test("explicit resolved new report is review-only; exact existing report permits lifecycle suggestion", () => {
  const resolved = normalizedRecord([
    "Nájdený pes",
    "Meno: Rex",
    "Dátum nálezu: 05.10.2026",
    "Mesto: Nitra",
    "Plemeno: Labrador",
    "Stav: pes je doma",
  ].join("\n"));
  assert.equal(normalizeAutomationLifecycleSignals("LOST_FOUND", resolved)[0]?.signalType, "LOST_FOUND_RESOLVED");
  const fresh = decision(source(), resolved);
  assert.equal(fresh?.gate, "INSUFFICIENT");
  assert.ok(fresh?.reasons.includes("lost_found_resolved_new_draft_blocked"));

  const existing = decision(source(), resolved, {
    entityType: "LOST_FOUND",
    entityId: 44,
    entityKey: "lost-found:44",
    quality: "EXACT_SOURCE_ID",
    before: { status: "ACTIVE" },
  });
  assert.equal(existing?.gate, "VALID_FOR_UPDATE_ONLY");
  assert.equal(existing?.canAttachLifecycleSuggestion, true);

  for (const phrase of [
    "Hľadá sa majiteľ",
    "Kontaktujte majiteľa",
    "Pomôžte nájsť majiteľa",
    "Pes sa zatiaľ nenašiel",
    "Ak sa majiteľ nájde, ozvite sa",
    "Nájdený pes",
  ]) {
    const normal = normalizedRecord(`${phrase}\nMeno: Rex\nDátum nálezu: 05.10.2026\nMesto: Nitra\nPlemeno: Labrador`);
    assert.equal(automationLostFoundNormalizationMetadata(normal)?.explicitResolved, false);
  }
});

test("LOST_FOUND matching remains exact/strong/uncertain without same-city/date auto merge", () => {
  const base = {
    sourceRecordId: "partner-rex",
    sourceUrl: "https://partner.example/rex",
    sourceTimestamp: null,
    rawRecord: {},
    proposed: {
      type: "FOUND",
      eventDate: "2026-10-05",
      city: "Nitra",
      dogName: "Rex",
      sex: "MALE",
      breed: "Labrador",
      color: "čierna",
    },
  };

  const exact = selectSafeAutomationMatch({
    entityType: "LOST_FOUND",
    record: base,
    candidates: [{
      id: 1, key: "lost-found:1", before: {}, type: "FOUND",
      exactSourceIdentity: true, sourceId: "partner-rex",
    }],
  });
  assert.equal(exact.quality, "EXACT_SOURCE_ID");

  const strong = selectSafeAutomationMatch({
    entityType: "LOST_FOUND",
    record: base,
    candidates: [{
      id: 2, key: "lost-found:2", before: {}, type: "FOUND",
      date: "2026-10-05", city: "Nitra", dogName: "Rex", sex: "MALE", breed: "Labrador",
      sourceUrl: "https://other.example/rex",
    }],
  });
  assert.equal(strong.quality, "STRONG_IDENTITY");

  const underCorroborated = selectSafeAutomationMatch({
    entityType: "LOST_FOUND",
    record: { ...base, proposed: { type: "FOUND", eventDate: "2026-10-05", city: "Nitra", dogName: "Rex" } },
    candidates: [{
      id: 3, key: "lost-found:3", before: {}, type: "FOUND",
      date: "2026-10-05", city: "Nitra", dogName: "Rex",
      sourceUrl: "https://other.example/one-signal",
    }],
  });
  assert.equal(underCorroborated.quality, "UNCERTAIN");

  const conflict = selectSafeAutomationMatch({
    entityType: "LOST_FOUND",
    record: base,
    candidates: [{
      id: 4, key: "lost-found:4", before: {}, type: "FOUND",
      date: "2026-10-05", city: "Nitra", dogName: "Bella", sex: "FEMALE", breed: "Labrador",
      sourceUrl: "https://other.example/different-dog",
    }],
  });
  assert.equal(conflict.quality, "UNCERTAIN");

  const typeConflict = selectSafeAutomationMatch({
    entityType: "LOST_FOUND",
    record: base,
    candidates: [{
      id: 5, key: "lost-found:5", before: {}, type: "LOST",
      sourceUrl: base.sourceUrl,
    }],
  });
  assert.equal(typeConflict.quality, "UNCERTAIN");
});

test("dedicated Košice LOST_FOUND adapter remains higher priority than Generic and Tavily", async () => {
  const fixture = readFileSync(new URL("./fixtures/data-automation/kosice-found-dog-detail.html", import.meta.url), "utf8");
  const src = source({
    sourceKey: "kosice-found",
    sourceUrl: "https://www.kosice.sk/clanok/opusteny-pes-225",
    config: {
      sourceShape: "SINGLE_ITEM",
      htmlAdapterKey: "kosice-found-dog-detail",
      expectedMinRecords: 1,
    },
  });
  let tavilyCalls = 0;
  const records = await fetchAutomationSourceRecords(src, {
    htmlAdapters: productionAutomationHtmlAdapters,
    sourceScopedContract: contract(src, "/clanok/**"),
    tavilyExtractProvider: {
      async extract() {
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
  assert.equal(records[0].proposed.type, "FOUND");
  assert.equal(records[0].proposed.city, "Košice");
  assert.equal(tavilyCalls, 0);
});

test("BOUNDED_PARTIAL absence never implies LOST_FOUND_RESOLVED", () => {
  const record = {
    sourceRecordId: "partial-rex",
    sourceUrl: "https://lostfound.example/reports/rex",
    sourceTimestamp: null,
    rawRecord: {},
    proposed: {},
    extraction: {
      itemUrl: "https://lostfound.example/reports/rex",
      externalId: null,
      discoveredFromRoot: "https://lostfound.example/reports",
      strategy: "TAVILY_CRAWL",
      evidenceMetadata: {},
      coverage: { classification: "BOUNDED_PARTIAL", complete: false },
    },
  };
  assert.equal(automationCoverageCanInferAbsence(record.extraction.coverage), false);
  assert.deepEqual(normalizeAutomationLifecycleSignals("LOST_FOUND", record), []);
});

test("runner and preview share LOST_FOUND normalizer; runtime Tavily schema gate stays real; no migration is added", () => {
  const runner = readFileSync(new URL("../lib/data-automation-runner.ts", import.meta.url), "utf8");
  const preview = readFileSync(new URL("../lib/data-automation-preview.ts", import.meta.url), "utf8");
  const activation = readFileSync(new URL("../lib/data-automation-source-activation.ts", import.meta.url), "utf8");
  assert.match(runner, /normalizeAutomationLostFoundRecord\(record/);
  assert.match(runner, /normalizeAutomationLostFoundRecord\(candidateRecord/);
  assert.match(preview, /normalizeAutomationLostFoundRecord\(candidateRecord/);
  assert.match(activation, /automationSourceProviderUsageSchemaReady\(database\)/);
  assert.match(activation, /TAVILY_USAGE_SCHEMA_UNAVAILABLE/);
  assert.equal(existsSync(new URL("../drizzle/0109_dynamic_entity_identity_indexes.sql", import.meta.url)), true);
  assert.equal(existsSync(new URL("../drizzle/0110_tavily_source_provider_usage.sql", import.meta.url)), true);
  assert.equal(existsSync(new URL("../drizzle/0111_lost_found_source_scoped.sql", import.meta.url)), false);
});
