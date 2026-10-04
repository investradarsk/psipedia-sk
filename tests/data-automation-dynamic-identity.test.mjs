import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  automationCanonicalEntityIdentity,
  automationProvenanceIdentity,
  automationSourceItemIdentity,
  automationStableSourceIdentity,
  validateDynamicAutomationIngestion,
} from "../lib/data-automation-dynamic-identity.ts";
import { selectSafeAutomationMatch } from "../lib/data-automation-matching.ts";
import {
  buildAutomationDiff,
  classifyAutomationFinding,
} from "../lib/data-automation.ts";
import {
  extractGenericFirstPartySource,
} from "../lib/data-automation-generic-source-extractor.ts";
import { buildSourceScopedExtractionContract } from "../lib/data-automation-source-scoped-extraction.ts";
import { normalizeAutomationLifecycleSignals } from "../lib/data-automation-lifecycle.ts";

function source(entityType, overrides = {}) {
  return {
    id: 41,
    sourceKey: `source-${entityType.toLowerCase()}`,
    label: "Source",
    entityType,
    connectorType: "CONTROLLED_HTML",
    sourceUrl: "https://source.example/items",
    config: {},
    enabled: true,
    cadenceMinutes: 1440,
    throttleMs: 0,
    timeoutMs: 5000,
    retryMaxAttempts: 0,
    retryBackoffMs: 100,
    maxRecordsPerRun: 100,
    nextCheckAt: null,
    reviewStatus: "APPROVED",
    ...overrides,
  };
}

function record(proposed, overrides = {}) {
  return {
    sourceRecordId: "item-123",
    sourceUrl: "https://source.example/items/item-123",
    sourceTimestamp: null,
    rawRecord: {},
    proposed,
    ...overrides,
  };
}

function candidate(overrides = {}) {
  return {
    id: 900,
    key: "candidate:900",
    before: {},
    ...overrides,
  };
}

test("source item, canonical entity and provenance identities stay explicitly separate", () => {
  const src = source("EVENT");
  const rec = record({ title: "Výstava", startDate: "2027-03-10", organizer: "Klub" });
  const match = {
    entityType: "EVENT",
    entityId: 77,
    entityKey: "event:77",
    quality: "EXACT_SOURCE_ID",
    before: {},
  };

  assert.deepEqual(automationSourceItemIdentity(src, rec), {
    sourceId: 41,
    sourceRecordId: "item-123",
  });
  assert.deepEqual(automationCanonicalEntityIdentity(match), {
    entityType: "EVENT",
    canonicalEntityId: 77,
  });
  assert.deepEqual(automationProvenanceIdentity("EVENT", rec), {
    entityType: "EVENT",
    externalSourceUrl: "https://source.example/items/item-123",
    externalRecordId: "item-123",
  });
});

test("EVENT exact source identity maps to existing canonical occurrence", () => {
  const rec = record({ title: "Výstava ABC", startDate: "2027-03-10", organizer: "Klub ABC" });
  const match = selectSafeAutomationMatch({
    entityType: "EVENT",
    record: rec,
    candidates: [candidate({
      exactSourceIdentity: true,
      name: "Iný titul po úprave",
      date: "2027-03-10",
      organizer: "Klub ABC",
    })],
  });
  assert.equal(match.quality, "EXACT_SOURCE_ID");
  assert.equal(match.entityId, 900);
});

test("EVENT same canonical detail URL maps exactly even when the date changed", () => {
  const rec = record({
    title: "Výstava ABC",
    startDate: "2027-03-11",
    organizer: "Klub ABC",
  });
  const match = selectSafeAutomationMatch({
    entityType: "EVENT",
    record: rec,
    candidates: [candidate({
      exactDetailUrl: true,
      sourceUrl: rec.sourceUrl,
      name: "Výstava ABC",
      date: "2027-03-10",
      organizer: "Klub ABC",
      before: {
        title: "Výstava ABC",
        startDate: "2027-03-10",
        organizer: "Klub ABC",
      },
    })],
  });
  assert.equal(match.quality, "EXACT_CANONICAL_KEY");
  const classified = classifyAutomationFinding({ match, proposed: rec.proposed });
  assert.equal(classified?.findingType, "POSSIBLE_UPDATE");
  assert.equal(classified?.diff.startDate?.after, "2027-03-11");
});

test("EVENT title + exact date + organizer is STRONG", () => {
  const rec = record({ title: "Výstava ABC", startDate: "2027-03-10", organizer: "Klub ABC" });
  const match = selectSafeAutomationMatch({
    entityType: "EVENT",
    record: rec,
    candidates: [candidate({
      name: "Výstava ABC",
      date: "2027-03-10",
      organizer: "Klub ABC",
    })],
  });
  assert.equal(match.quality, "STRONG_IDENTITY");
});

test("EVENT same title with different occurrence date does not merge", () => {
  const rec = record({ title: "Výstava ABC", startDate: "2027-10-18", organizer: "Klub ABC" });
  const match = selectSafeAutomationMatch({
    entityType: "EVENT",
    record: rec,
    candidates: [candidate({
      name: "Výstava ABC",
      date: "2027-03-10",
      organizer: "Klub ABC",
    })],
  });
  assert.equal(match.quality, "NONE");
  assert.equal(match.entityId, null);
});

test("EVENT from two independent sources can strongly resolve to one canonical occurrence", () => {
  const canonical = candidate({
    name: "Výstava ABC",
    date: "2027-03-10",
    organizer: "Klub ABC",
  });
  for (const [sourceRecordId, sourceUrl] of [
    ["organizer-55", "https://organizer.example/events/55"],
    ["calendar-991", "https://federation.example/calendar/991"],
  ]) {
    const rec = record(
      { title: "Výstava ABC", startDate: "2027-03-10", organizer: "Klub ABC" },
      { sourceRecordId, sourceUrl },
    );
    const match = selectSafeAutomationMatch({ entityType: "EVENT", record: rec, candidates: [canonical] });
    assert.equal(match.quality, "STRONG_IDENTITY");
    assert.equal(match.entityId, 900);
  }
});

test("EVENT automatic draft requires title, date, stable identity and organizer/location context", () => {
  const src = source("EVENT");
  const strong = validateDynamicAutomationIngestion({
    source: src,
    record: record({ title: "Výstava ABC", startDate: "2027-03-10", organizer: "Klub ABC" }),
  });
  assert.equal(strong?.gate, "VALID_FOR_DRAFT");
  assert.equal(strong?.canCreateDraft, true);

  const titleOnly = validateDynamicAutomationIngestion({
    source: src,
    record: record({ title: "Výstava ABC" }),
  });
  assert.equal(titleOnly?.gate, "INSUFFICIENT");

  const titleDateOnly = validateDynamicAutomationIngestion({
    source: src,
    record: record({ title: "Výstava ABC", startDate: "2027-03-10" }),
  });
  assert.equal(titleDateOnly?.gate, "INSUFFICIENT");
  assert.ok(titleDateOnly?.reasons.includes("event_context_missing"));
});

test("ADOPTION same source identity and same detail URL are exact", () => {
  const rec = record({ name: "Max", organizationName: "Útulok A" });
  const sourceMatch = selectSafeAutomationMatch({
    entityType: "ADOPTION",
    record: rec,
    candidates: [candidate({ exactSourceIdentity: true, name: "Max", organizer: "Útulok A" })],
  });
  assert.equal(sourceMatch.quality, "EXACT_SOURCE_ID");

  const urlMatch = selectSafeAutomationMatch({
    entityType: "ADOPTION",
    record: rec,
    candidates: [candidate({ exactDetailUrl: true, sourceUrl: rec.sourceUrl, name: "Max", organizer: "Útulok A" })],
  });
  assert.equal(urlMatch.quality, "EXACT_CANONICAL_KEY");
});

test("ADOPTION same dog name in different organizations remains different", () => {
  const rec = record({ name: "Max", organizationName: "Útulok A", sex: "MALE", breedName: "Labrador", city: "Nitra" });
  const match = selectSafeAutomationMatch({
    entityType: "ADOPTION",
    record: rec,
    candidates: [candidate({
      name: "Max",
      organizer: "Útulok B",
      sex: "MALE",
      breed: "Labrador",
      city: "Nitra",
    })],
  });
  assert.equal(match.quality, "NONE");
});

test("ADOPTION same organization/name with conflicting stable ids is UNCERTAIN, never auto merge", () => {
  const rec = record(
    { name: "Max", organizationName: "Útulok A", sex: "MALE", breedName: "Labrador", city: "Nitra" },
    { sourceRecordId: "dog-200" },
  );
  const match = selectSafeAutomationMatch({
    entityType: "ADOPTION",
    record: rec,
    candidates: [candidate({
      name: "Max",
      organizer: "Útulok A",
      sex: "MALE",
      breed: "Labrador",
      city: "Nitra",
      sameSourceRecordIds: ["dog-100"],
    })],
  });
  assert.equal(match.quality, "UNCERTAIN");
  assert.equal(match.entityId, null);
});

test("ADOPTION name only is insufficient; dog + organization + stable detail URL is valid", () => {
  const src = source("ADOPTION");
  const weak = validateDynamicAutomationIngestion({
    source: src,
    record: record({ name: "Max" }, { sourceUrl: null }),
  });
  assert.equal(weak?.gate, "INSUFFICIENT");
  assert.ok(weak?.reasons.includes("adoption_organization_identity_missing"));

  const strong = validateDynamicAutomationIngestion({
    source: src,
    record: record({ name: "Max", organizationName: "Útulok A" }),
  });
  assert.equal(strong?.gate, "VALID_FOR_DRAFT");
});

test("ADOPTION cross-source strong identity needs organization/name plus multiple corroborating dog signals", () => {
  const rec = record({
    name: "Max",
    organizationName: "Útulok A",
    sex: "MALE",
    breedName: "Labrador",
    city: "Nitra",
  }, { sourceRecordId: "partner-22", sourceUrl: "https://partner.example/dogs/22" });
  const match = selectSafeAutomationMatch({
    entityType: "ADOPTION",
    record: rec,
    candidates: [candidate({
      name: "Max",
      organizer: "Útulok A",
      sex: "MALE",
      breed: "Labrador",
      city: "Nitra",
      sameSourceRecordIds: [],
    })],
  });
  assert.equal(match.quality, "STRONG_IDENTITY");
});

test("ADOPTION weak same-name candidate remains UNCERTAIN/review", () => {
  const rec = record({ name: "Max", organizationName: "Útulok A" });
  const match = selectSafeAutomationMatch({
    entityType: "ADOPTION",
    record: rec,
    candidates: [candidate({ name: "Max", organizer: "Útulok A" })],
  });
  assert.equal(match.quality, "UNCERTAIN");
});

test("FOSTER same case id/detail URL are exact", () => {
  const rec = record({ title: "Markýz", dogName: "Markýz", organization: "Zatúlané psíky Šaľa" });
  assert.equal(selectSafeAutomationMatch({
    entityType: "FOSTER",
    record: rec,
    candidates: [candidate({ exactSourceIdentity: true, name: "Markýz", dogName: "Markýz", organizer: "Zatúlané psíky Šaľa" })],
  }).quality, "EXACT_SOURCE_ID");
  assert.equal(selectSafeAutomationMatch({
    entityType: "FOSTER",
    record: rec,
    candidates: [candidate({ exactDetailUrl: true, sourceUrl: rec.sourceUrl, name: "Markýz", dogName: "Markýz", organizer: "Zatúlané psíky Šaľa" })],
  }).quality, "EXACT_CANONICAL_KEY");
});

test("FOSTER generic call-to-action is insufficient but concrete case + organization + URL is valid", () => {
  const src = source("FOSTER");
  const weak = validateDynamicAutomationIngestion({
    source: src,
    record: record({
      title: "Hľadáme dočasku",
      organization: "Zatúlané psíky Šaľa",
    }),
  });
  assert.equal(weak?.gate, "INSUFFICIENT");
  assert.ok(weak?.reasons.includes("foster_concrete_case_identity_missing"));

  const strong = validateDynamicAutomationIngestion({
    source: src,
    record: record({
      title: "Markýz",
      dogName: "Markýz",
      organization: "Zatúlané psíky Šaľa",
    }),
  });
  assert.equal(strong?.gate, "VALID_FOR_DRAFT");
});

test("FOSTER uncertain duplicate remains review-only", () => {
  const rec = record(
    { title: "Markýz", dogName: "Markýz", organization: "Zatúlané psíky Šaľa" },
    { sourceRecordId: "case-200" },
  );
  const match = selectSafeAutomationMatch({
    entityType: "FOSTER",
    record: rec,
    candidates: [candidate({
      name: "Markýz",
      dogName: "Markýz",
      organizer: "Zatúlané psíky Šaľa",
      sameSourceRecordIds: ["case-100"],
    })],
  });
  assert.equal(match.quality, "UNCERTAIN");
});

test("LOST_FOUND same source id and same URL are exact when claim type is unchanged", () => {
  const rec = record({ type: "FOUND", eventDate: "2026-09-09", city: "Košice" });
  assert.equal(selectSafeAutomationMatch({
    entityType: "LOST_FOUND",
    record: rec,
    candidates: [candidate({ exactSourceIdentity: true, type: "FOUND", date: "2026-09-09", city: "Košice" })],
  }).quality, "EXACT_SOURCE_ID");
  assert.equal(selectSafeAutomationMatch({
    entityType: "LOST_FOUND",
    record: rec,
    candidates: [candidate({ exactDetailUrl: true, sourceUrl: rec.sourceUrl, type: "FOUND", date: "2026-09-09", city: "Košice" })],
  }).quality, "EXACT_CANONICAL_KEY");
});

test("LOST_FOUND same type/date/locality without enough dog evidence is UNCERTAIN", () => {
  const rec = record({ type: "FOUND", eventDate: "2026-09-09", city: "Košice", color: "hnedá" });
  const match = selectSafeAutomationMatch({
    entityType: "LOST_FOUND",
    record: rec,
    candidates: [candidate({ type: "FOUND", date: "2026-09-09", city: "Košice", color: "hnedá" })],
  });
  assert.equal(match.quality, "UNCERTAIN");
});

test("LOST_FOUND strong multi-signal match is existing", () => {
  const rec = record({
    type: "FOUND",
    eventDate: "2026-09-09",
    city: "Košice",
    sex: "MALE",
    breed: "Labrador",
    color: "čierna",
  });
  const match = selectSafeAutomationMatch({
    entityType: "LOST_FOUND",
    record: rec,
    candidates: [candidate({
      type: "FOUND",
      date: "2026-09-09",
      city: "Košice",
      sex: "MALE",
      breed: "Labrador",
      color: "čierna",
    })],
  });
  assert.equal(match.quality, "STRONG_IDENTITY");
});

test("LOST and FOUND claims never simple-auto-merge even on the same URL", () => {
  const rec = record({ type: "FOUND", eventDate: "2026-09-09", city: "Košice" });
  const match = selectSafeAutomationMatch({
    entityType: "LOST_FOUND",
    record: rec,
    candidates: [candidate({
      exactDetailUrl: true,
      sourceUrl: rec.sourceUrl,
      type: "LOST",
      date: "2026-09-09",
      city: "Košice",
    })],
  });
  assert.equal(match.quality, "UNCERTAIN");
});

test("LOST_FOUND different incident dates default to different cases", () => {
  const rec = record({ type: "LOST", eventDate: "2026-09-10", city: "Nitra", sex: "MALE", color: "čierna" });
  const match = selectSafeAutomationMatch({
    entityType: "LOST_FOUND",
    record: rec,
    candidates: [candidate({
      type: "LOST",
      date: "2026-09-09",
      city: "Nitra",
      sex: "MALE",
      color: "čierna",
    })],
  });
  assert.equal(match.quality, "NONE");
});

test("LOST_FOUND minimum draft gate requires type + date + locality + stable source identity", () => {
  const src = source("LOST_FOUND");
  assert.equal(validateDynamicAutomationIngestion({
    source: src,
    record: record({ type: "FOUND" }),
  })?.gate, "INSUFFICIENT");

  const weakIdentity = validateDynamicAutomationIngestion({
    source: src,
    record: record(
      { type: "FOUND", eventDate: "2026-09-09", city: "Košice" },
      {
        sourceRecordId: "fp:weak",
        sourceUrl: null,
        extraction: {
          itemUrl: null,
          externalId: null,
          discoveredFromRoot: "https://source.example/items",
          strategy: "GENERIC_FIRST_PARTY",
          evidenceMetadata: { discoveryMethod: "LISTING_TEXT" },
          coverage: { classification: "BOUNDED_PARTIAL", complete: false },
        },
      },
    ),
  });
  assert.equal(weakIdentity?.gate, "INSUFFICIENT");
  assert.ok(weakIdentity?.reasons.includes("lost_found_stable_identity_missing"));
});

test("dynamic UNCERTAIN match is review-only and cannot create an automatic draft", () => {
  const src = source("ADOPTION");
  const rec = record({ name: "Max", organizationName: "Útulok A" });
  const match = {
    entityType: "ADOPTION",
    entityId: null,
    entityKey: null,
    quality: "UNCERTAIN",
    before: null,
    candidates: [{ id: 10, key: "adoption:10" }],
  };
  const decision = validateDynamicAutomationIngestion({ source: src, record: rec, match });
  assert.equal(decision?.gate, "UNCERTAIN");
  assert.equal(decision?.canCreateDraft, false);
  assert.equal(decision?.canSuggestUpdate, false);
});

test("exact/strong existing match is update/lifecycle-safe but never treated as new draft evidence", () => {
  const src = source("EVENT");
  const rec = record({
    title: "Výstava ABC",
    startDate: "2027-03-10",
    organizer: "Klub ABC",
    description: "Nový opis",
  });
  const match = {
    entityType: "EVENT",
    entityId: 77,
    entityKey: "event:77",
    quality: "STRONG_IDENTITY",
    before: { title: "Výstava ABC", startDate: "2027-03-10", organizer: "Klub ABC", description: "Starý opis" },
  };
  const decision = validateDynamicAutomationIngestion({ source: src, record: rec, match });
  assert.equal(decision?.gate, "VALID_FOR_UPDATE_ONLY");
  assert.equal(decision?.canSuggestUpdate, true);
  assert.equal(decision?.canAttachLifecycleSuggestion, true);
  assert.equal(decision?.canCreateDraft, false);
});

test("existing lifecycle signal remains explicit and only attaches after safe canonical identity", () => {
  const src = source("ADOPTION");
  const rec = record(
    { name: "Max", organizationName: "Útulok A" },
    {
      rawRecord: { adopted: true, adoptedEvidence: "Adoptovaný" },
      lifecycleSignals: [{
        signalType: "ADOPTION_ADOPTED",
        targetState: "ADOPTED",
        evidenceText: "Adoptovaný",
        confidenceClass: "EXPLICIT",
      }],
    },
  );
  const match = {
    entityType: "ADOPTION",
    entityId: 12,
    entityKey: "adoption:12",
    quality: "EXACT_SOURCE_ID",
    before: { status: "ACTIVE" },
  };
  const decision = validateDynamicAutomationIngestion({ source: src, record: rec, match });
  assert.equal(decision?.canAttachLifecycleSuggestion, true);
  assert.equal(normalizeAutomationLifecycleSignals("ADOPTION", rec)[0]?.signalType, "ADOPTION_ADOPTED");
});

test("BOUNDED_PARTIAL coverage never becomes absence evidence; COMPLETE only enables identity-safe future absence semantics", () => {
  const src = source("EVENT");
  const base = {
    title: "Výstava ABC",
    startDate: "2027-03-10",
    organizer: "Klub ABC",
  };
  const partial = validateDynamicAutomationIngestion({
    source: src,
    record: record(base, {
      extraction: {
        itemUrl: "https://source.example/items/item-123",
        externalId: "evt-123",
        discoveredFromRoot: "https://source.example/items",
        strategy: "GENERIC_FIRST_PARTY",
        evidenceMetadata: { discoveryMethod: "JSON_LD_ITEM_LIST" },
        coverage: { classification: "BOUNDED_PARTIAL", complete: false },
      },
    }),
  });
  assert.equal(partial?.canUseCoverageForAbsence, false);

  const completeRecord = record(base, {
    extraction: {
      itemUrl: "https://source.example/items/item-123",
      externalId: "evt-123",
      discoveredFromRoot: "https://source.example/items",
      strategy: "GENERIC_FIRST_PARTY",
      evidenceMetadata: { discoveryMethod: "JSON_LD_ITEM_LIST" },
      coverage: { classification: "COMPLETE_ENUMERATION", complete: true },
    },
  });
  const complete = validateDynamicAutomationIngestion({ source: src, record: completeRecord });
  assert.equal(complete?.canUseCoverageForAbsence, true);
  assert.deepEqual(normalizeAutomationLifecycleSignals("EVENT", completeRecord), []);
});

test("repeated GENERIC_FIRST_PARTY extraction keeps deterministic source item identity", async () => {
  const src = source("ADOPTION", {
    sourceUrl: "https://source.example/items",
    maxRecordsPerRun: 10,
  });
  const built = buildSourceScopedExtractionContract(src, {
    pathScope: "/items/**",
    maxRequestsPerDay: 10,
  });
  assert.equal(built.ready, true);
  const html = `<!doctype html><html><head>
    <script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ItemList",
      numberOfItems: 1,
      itemListElement: [{
        "@type": "ListItem",
        position: 1,
        item: {
          "@type": "Product",
          identifier: "dog-123",
          name: "Max",
          url: "https://source.example/items/max",
          provider: { "@type": "Organization", name: "Útulok A" },
        },
      }],
    })}</script>
  </head><body></body></html>`;

  const parse = () => extractGenericFirstPartySource({
    source: src,
    contract: built.contract,
    rootHtml: html,
    rootUrl: src.sourceUrl,
    fetchPage: async () => { throw new Error("unexpected detail fetch"); },
  });
  const [a, b] = await Promise.all([parse(), parse()]);
  assert.equal(a.records.length, 1);
  assert.equal(b.records.length, 1);
  assert.equal(a.records[0].sourceRecordId, b.records[0].sourceRecordId);
  assert.equal(automationStableSourceIdentity(a.records[0]), "EXTERNAL_ID");
});

test("manual canonical draft validation remains separate while automation runner carries stricter dynamic gate", () => {
  const draftService = readFileSync(new URL("../lib/canonical-draft-service.ts", import.meta.url), "utf8");
  const runner = readFileSync(new URL("../lib/data-automation-runner.ts", import.meta.url), "utf8");
  assert.doesNotMatch(draftService, /validateDynamicAutomationIngestion/);
  assert.match(runner, /validateDynamicAutomationIngestion/);
  assert.match(runner, /ingestionDecision\.canCreateDraft/);
});

test("receipt/provenance contracts preserve idempotency and multiple sources per canonical entity", () => {
  const receipts = readFileSync(new URL("../lib/data-automation-ingestion-receipts.ts", import.meta.url), "utf8");
  const productStore = readFileSync(new URL("../lib/data-automation-product-store.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../drizzle/0092_automation_product_model.sql", import.meta.url), "utf8");
  const runner = readFileSync(new URL("../lib/data-automation-runner.ts", import.meta.url), "utf8");

  assert.match(receipts, /ON CONFLICT\(source_id,entity_type,source_record_id\) DO NOTHING/);
  assert.match(runner, /processedReceipt/);
  assert.match(migration, /canonical_external_provenance_identity_unique/);
  assert.match(migration, /entity_type.*external_source_url.*external_record_id/s);
  assert.doesNotMatch(migration, /UNIQUE INDEX[^\n]*canonical_external_provenance[^\n]*canonical_entity_id/i);
  assert.match(productStore, /upsertCanonicalExternalProvenance/);
});

test("DIRECT_ENTITY matching behavior remains outside the dynamic gate", () => {
  const src = source("DIRECTORY");
  const rec = record({ name: "Psí salón", category: "salony", city: "Nitra" });
  assert.equal(validateDynamicAutomationIngestion({ source: src, record: rec }), null);
  const match = selectSafeAutomationMatch({
    entityType: "DIRECTORY",
    record: rec,
    candidates: [candidate({ name: "Psí salón", category: "salony", city: "Nitra" })],
  });
  assert.equal(match.quality, "STRONG_IDENTITY");
});

test("HELP_ITEM remains an explicit follow-up and is not silently routed through dynamic gate", () => {
  const src = source("HELP_ITEM");
  const rec = record({ title: "Zbierka na operáciu", category: "zbierky", organization: "OZ Pomoc" });
  assert.equal(validateDynamicAutomationIngestion({ source: src, record: rec }), null);
});

test("new identity migration is additive indexes only", () => {
  const migration = readFileSync(new URL("../drizzle/0109_dynamic_entity_identity_indexes.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE INDEX IF NOT EXISTS managed_events_automation_identity_idx/);
  assert.match(migration, /adoption_dogs_automation_identity_idx/);
  assert.match(migration, /help_cases_automation_foster_dog_idx/);
  assert.match(migration, /lost_found_automation_city_identity_idx/);
  assert.doesNotMatch(migration, /CREATE TABLE|ALTER TABLE|DROP TABLE/i);
});
