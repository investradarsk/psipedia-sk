import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizeAutomationEventRecord,
  parseAutomationEventDateRange,
} from "../lib/data-automation-event-normalize.ts";
import { validateDynamicAutomationIngestion } from "../lib/data-automation-dynamic-identity.ts";
import {
  classifyAutomationFinding,
} from "../lib/data-automation.ts";
import { selectSafeAutomationMatch } from "../lib/data-automation-matching.ts";
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
import { normalizeAutomationLifecycleSignals } from "../lib/data-automation-lifecycle.ts";
import {
  automationSourceActivationReadiness,
} from "../lib/data-automation-source-activation.ts";
import {
  fetchAutomationSourceRecords,
} from "../lib/data-automation-connectors.ts";
import { productionAutomationHtmlAdapters } from "../lib/data-automation-real-sources.ts";

const NOW = new Date("2026-10-05T10:00:00.000Z");

function source(overrides = {}) {
  return {
    id: 701,
    sourceKey: "event-pilot-source",
    label: "EVENT pilot source",
    entityType: "EVENT",
    connectorType: "CONTROLLED_HTML",
    sourceUrl: "https://events.example.sk/events",
    config: { sourceShape: "MULTI_ITEM_LIST" },
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

function contract(src = source(), scope = "/events/**") {
  const result = buildSourceScopedExtractionContract(src, {
    pathScope: scope,
    maxRequestsPerDay: 12,
  });
  assert.equal(result.ready, true);
  return result.contract;
}

function eventItemListHtml() {
  return `<!doctype html><html><head>
    <script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ItemList",
      numberOfItems: 1,
      itemListElement: [{
        "@type": "ListItem",
        position: 1,
        item: {
          "@type": "Event",
          "@id": "evt-2027-01",
          name: "Výstava ABC",
          startDate: "2027-03-10T09:30:00+01:00",
          endDate: "2027-03-10T16:00:00+01:00",
          url: "https://events.example.sk/events/vystava-abc",
          organizer: { "@type": "Organization", name: "Klub ABC" },
          location: {
            "@type": "Place",
            name: "Agrokomplex, Nitra",
            address: {
              "@type": "PostalAddress",
              streetAddress: "Výstavná 4",
              addressLocality: "Nitra",
              addressRegion: "Nitriansky kraj",
              postalCode: "949 01",
            },
          },
        },
      }],
    })}</script>
  </head><body><h1>Kalendár</h1></body></html>`;
}

function gate(allowed = true) {
  const calls = [];
  return {
    calls,
    value: {
      async reserve(operation) {
        calls.push(operation);
        return allowed ? { operationKey: "event-pilot-" + operation.toLowerCase() } : null;
      },
      async finalize() {},
    },
  };
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
    response_time: 0.2,
    usage: { credits: 1 },
  };
}

function noMatch(entityType = "EVENT") {
  return {
    entityType,
    entityId: null,
    entityKey: null,
    quality: "NONE",
    before: null,
  };
}

function decision(src, record, match = noMatch()) {
  return validateDynamicAutomationIngestion({ source: src, record, match });
}

function governanceRow(overrides = {}) {
  return {
    id: 1,
    subject_type: "AUTOMATION_SOURCE",
    subject_id: 701,
    access_status: "ALLOWED",
    robots_status: "ALLOWED",
    terms_status: "ALLOWED",
    recurring_status: "APPROVED",
    retention_status: "APPROVED",
    retain_url: 1,
    retain_title: 0,
    retain_snippet: 0,
    retain_metadata: 1,
    retention_days: null,
    min_cadence_minutes: null,
    max_requests_per_day: 12,
    manual_only: 0,
    path_scope: "/events/**",
    restrictions_note: null,
    terms_url: null,
    privacy_url: null,
    robots_url: null,
    evidence_url: null,
    reviewed_at: "2026-10-05T09:00:00.000Z",
    reviewed_by: "admin@example.com",
    rationale: "approved",
    expires_at: null,
    review_due_at: null,
    created_at: "2026-10-05T09:00:00.000Z",
    updated_at: "2026-10-05T09:00:00.000Z",
    ...overrides,
  };
}

function activationDb({ governance = governanceRow(), usageTable = true } = {}) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              if (sql.includes("automation_governance_reviews")) return governance;
              if (sql.includes("sqlite_master") && sql.includes("automation_source_provider_usage")) {
                return usageTable ? { name: "automation_source_provider_usage" } : null;
              }
              throw new Error("unexpected first query: " + sql.replace(/\s+/g, " ").trim());
            },
          };
        },
      };
    },
    async batch() { return []; },
  };
}

test("EVENT date parser accepts explicit Slovak/ISO dates and rejects relative text", () => {
  assert.deepEqual(parseAutomationEventDateRange("12. 10. 2026"), {
    startDate: "2026-10-12", endDate: null, startTime: null, endTime: null,
  });
  assert.deepEqual(parseAutomationEventDateRange("12.–13. 10. 2026"), {
    startDate: "2026-10-12", endDate: "2026-10-13", startTime: null, endTime: null,
  });
  assert.deepEqual(parseAutomationEventDateRange("12.10.2026"), {
    startDate: "2026-10-12", endDate: null, startTime: null, endTime: null,
  });
  assert.deepEqual(parseAutomationEventDateRange("2026-10-12"), {
    startDate: "2026-10-12", endDate: null, startTime: null, endTime: null,
  });
  assert.equal(parseAutomationEventDateRange("budúci víkend"), null);
});

test("generic JSON-LD ItemList Event normalizes into a strict valid EVENT draft candidate", async () => {
  const src = source();
  const result = await extractGenericFirstPartySource({
    source: src,
    contract: contract(src),
    rootHtml: eventItemListHtml(),
    rootUrl: src.sourceUrl,
    fetchPage: async () => { throw new Error("unexpected detail fetch"); },
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].extraction.strategy, "GENERIC_FIRST_PARTY");

  const normalized = normalizeAutomationEventRecord(result.records[0], { now: NOW });
  assert.equal(normalized.proposed.title, "Výstava ABC");
  assert.equal(normalized.proposed.startDate, "2027-03-10");
  assert.equal(normalized.proposed.startTime, "09:30");
  assert.equal(normalized.proposed.endDate, "2027-03-10");
  assert.equal(normalized.proposed.venue, "Agrokomplex, Nitra");
  assert.equal(normalized.proposed.city, "Nitra");
  assert.equal(normalized.proposed.organizer, "Klub ABC");
  assert.equal(normalized.proposed.websiteUrl, "https://events.example.sk/events/vystava-abc");
  assert.equal(decision(src, normalized)?.gate, "VALID_FOR_DRAFT");
});

test("generic labelled HTML detail normalizes explicit date, location and organizer without AI guessing", async () => {
  const src = source({
    sourceUrl: "https://events.example.sk/events/vystava-lab",
    config: { sourceShape: "SINGLE_ITEM" },
  });
  const html = `<!doctype html><html><head>
    <link rel="canonical" href="https://events.example.sk/events/vystava-lab">
    <meta name="description" content="Oficiálna stránka podujatia">
  </head><body>
    <h1>Výstava Labradorov</h1>
    <p>Dátum: 12.–13. 10. 2026</p>
    <p>Miesto: Agrokomplex, Nitra</p>
    <p>Organizátor: Retriever klub</p>
    <p>Registrácia: <a href="https://registration.example/form/10">formulár</a></p>
  </body></html>`;
  const result = await extractGenericFirstPartySource({
    source: src,
    contract: contract(src),
    rootHtml: html,
    rootUrl: src.sourceUrl,
    fetchPage: async () => { throw new Error("unexpected detail fetch"); },
  });
  const normalized = normalizeAutomationEventRecord(result.records[0], { now: NOW });
  assert.equal(normalized.proposed.title, "Výstava Labradorov");
  assert.equal(normalized.proposed.startDate, "2026-10-12");
  assert.equal(normalized.proposed.endDate, "2026-10-13");
  assert.equal(normalized.proposed.venue, "Agrokomplex, Nitra");
  assert.equal(normalized.proposed.organizer, "Retriever klub");
  assert.equal(decision(src, normalized)?.gate, "VALID_FOR_DRAFT");
});

test("Tavily Crawl fallback stays provider-neutral and EVENT normalizer extracts explicit facts", async () => {
  const src = source();
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "test-key",
    now: () => NOW,
    fetchImpl: async () => json(tavilyPayload(
      "https://events.example.sk/events/vystava-crawl",
      "# Výstava Crawl\nDátum: 18. 10. 2026\nMiesto: Výstavisko, Nitra\nOrganizátor: Klub Crawl",
    )),
  });
  const result = await provider.crawl({ source: src, contract: contract(src), gate: gate().value });
  const normalized = normalizeAutomationEventRecord(result.records[0], { now: NOW });

  assert.equal(result.records[0].extraction.strategy, "TAVILY_CRAWL");
  assert.equal(result.coverage.classification, "BOUNDED_PARTIAL");
  assert.equal(normalized.proposed.startDate, "2026-10-18");
  assert.equal(normalized.proposed.venue, "Výstavisko, Nitra");
  assert.equal(normalized.proposed.organizer, "Klub Crawl");
  assert.equal(decision(src, normalized)?.gate, "VALID_FOR_DRAFT");
});

test("Tavily Extract detail fallback normalizes explicit facts and remains DETAIL_ONLY", async () => {
  const src = source({
    sourceUrl: "https://events.example.sk/events/vystava-extract",
    config: { sourceShape: "SINGLE_ITEM" },
  });
  const provider = new TavilyAutomationExtractProvider({
    apiKey: "test-key",
    now: () => NOW,
    fetchImpl: async () => json(tavilyPayload(
      src.sourceUrl,
      "# Výstava Extract\nTermín: 20. 10. 2026\nLokalita: Nitra\nOrganizátor: Klub Extract",
    )),
  });
  const result = await provider.extract({
    source: src,
    contract: contract(src),
    gate: gate().value,
    urls: [src.sourceUrl],
  });
  const normalized = normalizeAutomationEventRecord(result.records[0], { now: NOW });

  assert.equal(result.coverage.classification, "DETAIL_ONLY");
  assert.equal(normalized.proposed.startDate, "2026-10-20");
  assert.equal(normalized.proposed.venue, "Nitra");
  assert.equal(normalized.proposed.organizer, "Klub Extract");
  assert.equal(decision(src, normalized)?.gate, "VALID_FOR_DRAFT");
});

test("weak Tavily marketing content and missing EVENT evidence stay review-only", () => {
  const src = source();
  const weak = normalizeAutomationEventRecord({
    sourceRecordId: "url:weak",
    sourceUrl: "https://events.example.sk/events/weak",
    sourceTimestamp: null,
    rawRecord: {
      provider: "tavily",
      contentExcerpt: "# Najlepší psí deň\nPríďte sa zabaviť s celou rodinou.",
    },
    proposed: {
      title: "Najlepší psí deň",
      websiteUrl: "https://events.example.sk/events/weak",
    },
    extraction: {
      itemUrl: "https://events.example.sk/events/weak",
      externalId: null,
      discoveredFromRoot: src.sourceUrl,
      strategy: "TAVILY_CRAWL",
      evidenceMetadata: { provider: "tavily" },
      coverage: { classification: "BOUNDED_PARTIAL", complete: false },
    },
  }, { now: NOW });
  const result = decision(src, weak);
  assert.equal(result?.gate, "INSUFFICIENT");
  assert.equal(result?.canCreateDraft, false);
  assert.ok(result?.reasons.includes("event_start_date_missing"));
  assert.ok(result?.reasons.includes("event_context_missing"));
});

test("EVENT registration URL remains optional while organizer/location minimum remains mandatory", () => {
  const src = source();
  const valid = normalizeAutomationEventRecord({
    sourceRecordId: "evt-no-registration",
    sourceUrl: "https://events.example.sk/events/no-registration",
    sourceTimestamp: null,
    rawRecord: {},
    proposed: {
      title: "Seminár ABC",
      startDate: "2027-02-10",
      organizer: "Klub ABC",
    },
  }, { now: NOW });
  assert.equal(valid.proposed.registrationUrl, undefined);
  assert.equal(decision(src, valid)?.gate, "VALID_FOR_DRAFT");

  const missingContext = normalizeAutomationEventRecord({
    ...valid,
    sourceRecordId: "evt-no-context",
    proposed: { title: "Seminár ABC", startDate: "2027-02-10" },
  }, { now: NOW });
  const missing = decision(src, missingContext);
  assert.equal(missing?.gate, "INSUFFICIENT");
  assert.ok(missing?.reasons.includes("event_context_missing"));
});

test("same title on different dates remains separate EVENT occurrences", () => {
  const record = {
    sourceRecordId: "occurrence-october",
    sourceUrl: "https://events.example.sk/events/october",
    sourceTimestamp: null,
    rawRecord: {},
    proposed: {
      title: "Výstava ABC",
      startDate: "2027-10-18",
      organizer: "Klub ABC",
    },
  };
  const match = selectSafeAutomationMatch({
    entityType: "EVENT",
    record,
    candidates: [{
      id: 10,
      key: "event:10",
      before: {},
      name: "Výstava ABC",
      date: "2027-03-10",
      organizer: "Klub ABC",
    }],
  });
  assert.equal(match.quality, "NONE");
});

test("exact EVENT source identity with changed date produces POSSIBLE_UPDATE, not a new occurrence", () => {
  const record = {
    sourceRecordId: "evt-100",
    sourceUrl: "https://events.example.sk/events/100",
    sourceTimestamp: null,
    rawRecord: {},
    proposed: {
      title: "Event ABC",
      startDate: "2026-10-13",
      venue: "Nitra",
    },
  };
  const match = selectSafeAutomationMatch({
    entityType: "EVENT",
    record,
    candidates: [{
      id: 11,
      key: "event:11",
      before: { title: "Event ABC", startDate: "2026-10-12", venue: "Nitra" },
      exactSourceIdentity: true,
      name: "Event ABC",
      date: "2026-10-12",
      venue: "Nitra",
    }],
  });
  assert.equal(match.quality, "EXACT_SOURCE_ID");
  assert.equal(classifyAutomationFinding({ match, proposed: record.proposed })?.findingType, "POSSIBLE_UPDATE");
});

test("same EVENT from two sources can strong-match one canonical occurrence", () => {
  const candidate = {
    id: 12,
    key: "event:12",
    before: {},
    name: "Výstava ABC",
    date: "2027-03-10",
    organizer: "Klub ABC",
  };
  for (const [sourceRecordId, sourceUrl] of [
    ["organizer-1", "https://organizer.example/event/1"],
    ["federation-55", "https://federation.example/calendar/55"],
  ]) {
    const match = selectSafeAutomationMatch({
      entityType: "EVENT",
      record: {
        sourceRecordId,
        sourceUrl,
        sourceTimestamp: null,
        rawRecord: {},
        proposed: { title: "Výstava ABC", startDate: "2027-03-10", organizer: "Klub ABC" },
      },
      candidates: [candidate],
    });
    assert.equal(match.quality, "STRONG_IDENTITY");
    assert.equal(match.entityId, 12);
  }
});

test("UNCERTAIN EVENT stays review-only and cannot create automatic draft", () => {
  const src = source();
  const record = {
    sourceRecordId: "uncertain-1",
    sourceUrl: "https://events.example.sk/events/uncertain-1",
    sourceTimestamp: null,
    rawRecord: {},
    proposed: { title: "Výstava ABC", startDate: "2027-03-10", organizer: "Klub ABC" },
  };
  const result = decision(src, record, {
    entityType: "EVENT",
    entityId: null,
    entityKey: null,
    quality: "UNCERTAIN",
    before: null,
    candidates: [{ id: 13, key: "event:13" }],
  });
  assert.equal(result?.gate, "UNCERTAIN");
  assert.equal(result?.canCreateDraft, false);
  assert.equal(result?.canSuggestUpdate, false);
});

test("explicit EVENT cancellation becomes lifecycle suggestion only; new cancelled draft is blocked", () => {
  const src = source();
  const record = normalizeAutomationEventRecord({
    sourceRecordId: "cancelled-1",
    sourceUrl: "https://events.example.sk/events/cancelled-1",
    sourceTimestamp: null,
    rawRecord: {
      contentExcerpt: "# Výstava ABC\nDátum: 18. 10. 2026\nMiesto: Nitra\nPodujatie sa ruší",
    },
    proposed: { title: "Výstava ABC" },
    extraction: {
      itemUrl: "https://events.example.sk/events/cancelled-1",
      externalId: null,
      discoveredFromRoot: src.sourceUrl,
      strategy: "TAVILY_CRAWL",
      evidenceMetadata: {},
      coverage: { classification: "BOUNDED_PARTIAL", complete: false },
    },
  }, { now: NOW });

  assert.equal(record.proposed.cancelled, true);
  assert.equal(normalizeAutomationLifecycleSignals("EVENT", record)[0]?.signalType, "EVENT_CANCELLED");
  const newDecision = decision(src, record);
  assert.equal(newDecision?.gate, "INSUFFICIENT");
  assert.ok(newDecision?.reasons.includes("event_cancelled_new_draft_blocked"));

  const existingDecision = decision(src, record, {
    entityType: "EVENT",
    entityId: 20,
    entityKey: "event:20",
    quality: "EXACT_SOURCE_ID",
    before: { cancelled: false },
  });
  assert.equal(existingDecision?.gate, "VALID_FOR_UPDATE_ONLY");
  assert.equal(existingDecision?.canAttachLifecycleSuggestion, true);
});

test("BOUNDED_PARTIAL absence never becomes cancellation or missing semantics", () => {
  const record = {
    sourceRecordId: "event-partial",
    sourceUrl: "https://events.example.sk/events/partial",
    sourceTimestamp: null,
    rawRecord: {},
    proposed: {},
    extraction: {
      itemUrl: "https://events.example.sk/events/partial",
      externalId: null,
      discoveredFromRoot: "https://events.example.sk/events",
      strategy: "TAVILY_CRAWL",
      evidenceMetadata: {},
      coverage: { classification: "BOUNDED_PARTIAL", complete: false },
    },
  };
  assert.equal(automationCoverageCanInferAbsence(record.extraction.coverage), false);
  assert.deepEqual(normalizeAutomationLifecycleSignals("EVENT", record), []);
});

test("old ended EVENT is archive-only and cannot create a new automatic draft", () => {
  const src = source();
  const record = normalizeAutomationEventRecord({
    sourceRecordId: "old-event",
    sourceUrl: "https://events.example.sk/events/old",
    sourceTimestamp: null,
    rawRecord: {},
    proposed: { title: "Starý event", startDate: "2026-01-10", organizer: "Klub ABC" },
  }, { now: NOW });
  const result = decision(src, record);
  assert.equal(result?.gate, "INSUFFICIENT");
  assert.ok(result?.reasons.includes("event_past_archive_only"));
});

test("dedicated EVENT adapter remains higher priority than generic/Tavily", async () => {
  const src = source({
    sourceKey: "skj-exhibition-calendar",
    label: "SKJ",
    sourceUrl: "https://skj.sk/sk/vystavy/kalendar/",
    config: { htmlAdapterKey: "skj-exhibition-calendar", sourceShape: "MULTI_ITEM_LIST" },
  });
  let tavilyCalls = 0;
  const fixture = readFileSync(new URL("./fixtures/data-automation/skj-calendar.html", import.meta.url), "utf8");
  const records = await fetchAutomationSourceRecords(src, {
    sourceScopedContract: contract(src, "/sk/vystavy/kalendar/**"),
    htmlAdapters: productionAutomationHtmlAdapters,
    tavilyCrawlProvider: {
      async crawl() {
        tavilyCalls += 1;
        throw new Error("Tavily must not run");
      },
    },
    tavilyRequestGate: gate().value,
    fetchImpl: async () => new Response(fixture, {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
  });
  assert.equal(records.length, 2);
  assert.equal(records[0].proposed.city, "Nitra");
  assert.equal(tavilyCalls, 0);
});

test("Tavily-backed activation is blocked when 0110 usage schema is missing", async () => {
  const src = source();
  const readiness = await automationSourceActivationReadiness(
    src,
    activationDb({ usageTable: false }),
    {
      now: NOW,
      tavilyCredentialConfigured: true,
      fetchImpl: async () => new Response("<html><body><h1>Kalendár</h1></body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    },
  );
  assert.equal(readiness.ready, false);
  assert.equal(readiness.reason, "TECHNICAL_NOT_READY");
  assert.equal(readiness.technicalReason, "TAVILY_USAGE_SCHEMA_UNAVAILABLE");
});

test("generic-first activation does not depend on 0110 provider usage schema", async () => {
  const src = source();
  const readiness = await automationSourceActivationReadiness(
    src,
    activationDb({ usageTable: false }),
    {
      now: NOW,
      tavilyCredentialConfigured: true,
      fetchImpl: async () => new Response(eventItemListHtml(), {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    },
  );
  assert.equal(readiness.ready, true);
  assert.equal(readiness.reason, "READY");
});

test("runner and preview both use EVENT normalization before canonical matching", () => {
  const runner = readFileSync(new URL("../lib/data-automation-runner.ts", import.meta.url), "utf8");
  const preview = readFileSync(new URL("../lib/data-automation-preview.ts", import.meta.url), "utf8");
  assert.match(runner, /normalizeAutomationEventRecord\(candidateRecord/);
  assert.match(runner, /normalizeAutomationEventRecord\(record/);
  assert.match(preview, /normalizeAutomationEventRecord\(candidateRecord/);
});

test("EVENT pilot adds no new migration and preserves 0109/0110 ownership", () => {
  const migration0109 = readFileSync(new URL("../drizzle/0109_dynamic_entity_identity_indexes.sql", import.meta.url), "utf8");
  const migration0110 = readFileSync(new URL("../drizzle/0110_tavily_source_provider_usage.sql", import.meta.url), "utf8");
  assert.match(migration0109, /dynamic_entity_identity/i);
  assert.match(migration0110, /automation_source_provider_usage/);
});
