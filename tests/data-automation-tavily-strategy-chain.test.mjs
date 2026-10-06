import assert from "node:assert/strict";
import test from "node:test";
import {
  automationExtractionCapabilities,
  automationSourceReadiness,
} from "../lib/data-automation-capability-registry.ts";
import {
  AutomationConnectorError,
  fetchAutomationSourceRecords,
} from "../lib/data-automation-connectors.ts";
import { automationSourceActivationReadiness } from "../lib/data-automation-source-activation.ts";
import { buildSourceScopedExtractionContract } from "../lib/data-automation-source-scoped-extraction.ts";
import { TavilySourceScopedError } from "../lib/data-automation-tavily-source-scoped.ts";
import { productionAutomationHtmlAdapters } from "../lib/data-automation-real-sources.ts";
import { validateDynamicAutomationIngestion } from "../lib/data-automation-dynamic-identity.ts";

function source(overrides = {}) {
  return {
    id: 51,
    sourceKey: "source-51",
    label: "Source",
    entityType: "ADOPTION",
    connectorType: "CONTROLLED_HTML",
    sourceUrl: "https://example.sk/psy",
    config: { sourceShape: "MULTI_ITEM_LIST", staticFields: { organizationName: "Útulok A" } },
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

function contract(src = source(), pathScope = "/psy/**") {
  const built = buildSourceScopedExtractionContract(src, {
    pathScope,
    maxRequestsPerDay: 12,
  });
  assert.equal(built.ready, true);
  return built.contract;
}

function gate(allowed = true) {
  return {
    async reserve(operation) {
      return allowed ? { operationKey: "op-" + operation.toLowerCase() } : null;
    },
    async finalize() {},
  };
}

function providerRecord(src, strategy = "TAVILY_CRAWL", proposed = {}) {
  return {
    sourceRecordId: "url:stable",
    sourceUrl: "https://example.sk/psy/max",
    sourceTimestamp: null,
    rawRecord: { provider: "tavily", contentExcerpt: "Max" },
    proposed,
    extraction: {
      itemUrl: "https://example.sk/psy/max",
      externalId: null,
      discoveredFromRoot: src.sourceUrl,
      strategy,
      evidenceMetadata: {
        provider: "tavily",
        providerEvidenceType: strategy === "TAVILY_CRAWL" ? "CRAWL_PAGE" : "EXTRACT_PAGE",
        retrievedAt: "2026-10-05T10:00:00.000Z",
      },
      coverage: {
        classification: strategy === "TAVILY_CRAWL" ? "BOUNDED_PARTIAL" : "DETAIL_ONLY",
        complete: false,
      },
      confidence: "LOW",
    },
  };
}

function itemListHtml() {
  return `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: 1,
    itemListElement: [{
      "@type": "ListItem",
      position: 1,
      item: {
        "@type": "Product",
        identifier: "dog-1",
        name: "Max",
        url: "https://example.sk/psy/max",
      },
    }],
  })}</script></head><body></body></html>`;
}

function governanceRow(overrides = {}) {
  return {
    id: 1,
    subject_type: "AUTOMATION_SOURCE",
    subject_id: 51,
    access_status: "ALLOWED",
    robots_status: "ALLOWED",
    terms_status: "ALLOWED",
    recurring_status: "APPROVED",
    retention_status: "APPROVED",
    retain_url: 1,
    retain_title: 1,
    retain_snippet: 1,
    retain_metadata: 1,
    retention_days: null,
    min_cadence_minutes: null,
    max_requests_per_day: 12,
    manual_only: 0,
    path_scope: "/psy/**",
    restrictions_note: null,
    terms_url: null,
    privacy_url: null,
    robots_url: null,
    evidence_url: null,
    reviewed_at: "2026-10-05T10:00:00.000Z",
    reviewed_by: "admin@example.com",
    rationale: "approved",
    expires_at: null,
    review_due_at: null,
    created_at: "2026-10-05T10:00:00.000Z",
    updated_at: "2026-10-05T10:00:00.000Z",
    ...overrides,
  };
}

function governanceDb(row) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              if (sql.includes("automation_governance_reviews")) return row;
              if (sql.includes("sqlite_master") && sql.includes("automation_source_provider_usage")) {
                return { name: "automation_source_provider_usage", sql: "CREATE TABLE automation_source_provider_usage (\n  provider_http_status integer,\n  provider_error_code text,\n  provider_error_detail text,\n  provider_request_id text,\n  transport_error_name text,\n  transport_error_code text,\n  transport_phase text\n)" };
              }
              throw new Error("unexpected query");
            },
          };
        },
        async first() {
          if (sql.includes("sqlite_master") && sql.includes("automation_source_provider_usage")) {
            return { name: "automation_source_provider_usage", sql: "CREATE TABLE automation_source_provider_usage (\n  provider_http_status integer,\n  provider_error_code text,\n  provider_error_detail text,\n  provider_request_id text,\n  transport_error_name text,\n  transport_error_code text,\n  transport_phase text\n)" };
          }
          throw new Error("unexpected query");
        },
      };
    },
    async batch() { return []; },
  };
}

test("dedicated adapter success never calls generic Tavily fallback", async () => {
  const src = source({
    sourceUrl: "https://trnava.utulok.sk/psy/triny",
    config: {
      sourceShape: "SINGLE_ITEM",
      htmlAdapterKey: "trnava-adoption-detail",
      expectedMinRecords: 1,
    },
  });
  let crawlCalls = 0;
  let extractCalls = 0;
  const records = await fetchAutomationSourceRecords(src, {
    sourceScopedContract: buildSourceScopedExtractionContract(src, {
      pathScope: "/psy/**",
      maxRequestsPerDay: 12,
    }).contract,
    htmlAdapters: productionAutomationHtmlAdapters,
    tavilyCrawlProvider: { async crawl() { crawlCalls += 1; return { records: [], coverage: {}, diagnostics: {} }; } },
    tavilyExtractProvider: { async extract() { extractCalls += 1; return { records: [], coverage: {}, diagnostics: {} }; } },
    tavilyRequestGate: gate(),
    fetchImpl: async () => new Response(
      '<html><head><meta property="og:title" content="Triny"><meta property="og:url" content="https://trnava.utulok.sk/psy/triny"></head><body><h1>Triny</h1><p>Triny hľadá domov.</p></body></html>',
      { status: 200, headers: { "content-type": "text/html" } },
    ),
  });
  assert.equal(records.length, 1);
  assert.equal(crawlCalls, 0);
  assert.equal(extractCalls, 0);
});

test("GENERIC_FIRST_PARTY success prevents Tavily calls", async () => {
  const src = source();
  let crawlCalls = 0;
  let extractCalls = 0;
  const records = await fetchAutomationSourceRecords(src, {
    sourceScopedContract: contract(src),
    tavilyCrawlProvider: { async crawl() { crawlCalls += 1; throw new Error("unexpected"); } },
    tavilyExtractProvider: { async extract() { extractCalls += 1; throw new Error("unexpected"); } },
    tavilyRequestGate: gate(),
    fetchImpl: async () => new Response(itemListHtml(), {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].extraction.strategy, "GENERIC_FIRST_PARTY");
  assert.equal(crawlCalls, 0);
  assert.equal(extractCalls, 0);
});

test("generic unsupported multi-item source falls forward once to Crawl", async () => {
  const src = source();
  let directFetches = 0;
  let crawlCalls = 0;
  let extractCalls = 0;
  const records = await fetchAutomationSourceRecords(src, {
    sourceScopedContract: contract(src),
    tavilyCrawlProvider: {
      async crawl() {
        crawlCalls += 1;
        return { records: [providerRecord(src)], coverage: {}, diagnostics: {} };
      },
    },
    tavilyExtractProvider: { async extract() { extractCalls += 1; throw new Error("unexpected"); } },
    tavilyRequestGate: gate(),
    fetchImpl: async () => {
      directFetches += 1;
      return new Response("<html><body><h1>Psy</h1></body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    },
  });
  assert.equal(records.length, 1);
  assert.equal(crawlCalls, 1);
  assert.equal(extractCalls, 0);
  assert.equal(directFetches, 1);
});

test("known SINGLE_ITEM detail falls forward once to Extract", async () => {
  const src = source({
    sourceUrl: "https://example.sk/psy/max",
    config: { sourceShape: "SINGLE_ITEM", staticFields: { organizationName: "Útulok A" } },
  });
  let crawlCalls = 0;
  let extractCalls = 0;
  const records = await fetchAutomationSourceRecords(src, {
    sourceScopedContract: contract(src),
    tavilyCrawlProvider: { async crawl() { crawlCalls += 1; throw new Error("unexpected"); } },
    tavilyExtractProvider: {
      async extract() {
        extractCalls += 1;
        return { records: [providerRecord(src, "TAVILY_EXTRACT")], coverage: {}, diagnostics: {} };
      },
    },
    tavilyRequestGate: gate(),
    fetchImpl: async () => new Response("<html><body><h1>Max</h1></body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
  });
  assert.equal(records.length, 1);
  assert.equal(extractCalls, 1);
  assert.equal(crawlCalls, 0);
});

test("direct fetch access failure never becomes a Tavily bypass", async () => {
  const src = source();
  let crawlCalls = 0;
  await assert.rejects(
    fetchAutomationSourceRecords(src, {
      sourceScopedContract: contract(src),
      tavilyCrawlProvider: {
        async crawl() {
          crawlCalls += 1;
          return { records: [providerRecord(src)], coverage: {}, diagnostics: {} };
        },
      },
      tavilyRequestGate: gate(),
      fetchImpl: async () => new Response("Forbidden", {
        status: 403,
        headers: { "content-type": "text/html" },
      }),
    }),
    (error) => error instanceof AutomationConnectorError && error.code === "source_http_403",
  );
  assert.equal(crawlCalls, 0);
});

test("no working strategy fails closed instead of looping", async () => {
  const src = source();
  let fetches = 0;
  await assert.rejects(
    fetchAutomationSourceRecords(src, {
      sourceScopedContract: contract(src),
      fetchImpl: async () => {
        fetches += 1;
        return new Response("<html><body><h1>Psy</h1></body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      },
    }),
    (error) => error instanceof AutomationConnectorError && error.code === "no_items_discovered",
  );
  assert.equal(fetches, 1);
});

test("missing Tavily key remains UNAVAILABLE and configured capability stays source-specific", () => {
  const src = source();
  const missing = automationExtractionCapabilities(src, undefined, { tavilyCredentialConfigured: false });
  assert.equal(missing.find((x) => x.strategy === "TAVILY_CRAWL")?.status, "UNAVAILABLE");
  assert.equal(missing.find((x) => x.strategy === "TAVILY_EXTRACT")?.status, "UNAVAILABLE");

  const list = automationExtractionCapabilities(src, undefined, { tavilyCredentialConfigured: true });
  assert.equal(list.find((x) => x.strategy === "TAVILY_CRAWL")?.status, "SUPPORTED");
  assert.equal(list.find((x) => x.strategy === "TAVILY_EXTRACT")?.status, "UNSUPPORTED");

  const detail = automationExtractionCapabilities(source({
    sourceUrl: "https://example.sk/psy/max",
    config: { sourceShape: "SINGLE_ITEM", staticFields: { organizationName: "Útulok A" } },
  }), undefined, { tavilyCredentialConfigured: true });
  assert.equal(detail.find((x) => x.strategy === "TAVILY_CRAWL")?.status, "UNSUPPORTED");
  assert.equal(detail.find((x) => x.strategy === "TAVILY_EXTRACT")?.status, "SUPPORTED");
});

test("confirmed generic capability still outranks configured Tavily fallback", () => {
  const readiness = automationSourceReadiness(source(), undefined, {
    tavilyCredentialConfigured: true,
    genericProbe: { supported: true, reason: "PROBE_CONFIRMED", sourceShape: "MULTI_ITEM_LIST" },
  });
  assert.equal(readiness.ready, true);
  assert.equal(readiness.strategy, "GENERIC_FIRST_PARTY");
});

test("governance block wins before any source probe regardless of Tavily key", async () => {
  let fetches = 0;
  const blocked = await automationSourceActivationReadiness(
    source(),
    governanceDb(governanceRow({ recurring_status: "DENIED" })),
    {
      tavilyCredentialConfigured: true,
      fetchImpl: async () => {
        fetches += 1;
        throw new Error("provider/direct fetch must not run");
      },
    },
  );
  assert.equal(blocked.reason, "GOVERNANCE_BLOCKED");
  assert.equal(fetches, 0);
});

test("weak Tavily EVENT and ADOPTION evidence cannot bypass dynamic draft gate", () => {
  const adoption = source();
  const weakAdoption = providerRecord(adoption, "TAVILY_CRAWL", { name: "Max" });
  const adoptionDecision = validateDynamicAutomationIngestion({
    source: adoption,
    record: weakAdoption,
  });
  assert.equal(adoptionDecision?.gate, "INSUFFICIENT");
  assert.equal(adoptionDecision?.canCreateDraft, false);

  const eventSource = source({
    entityType: "EVENT",
    sourceKey: "event-source",
  });
  const weakEvent = providerRecord(eventSource, "TAVILY_CRAWL", { title: "Výstava ABC" });
  const eventDecision = validateDynamicAutomationIngestion({
    source: eventSource,
    record: weakEvent,
  });
  assert.equal(eventDecision?.gate, "INSUFFICIENT");
  assert.equal(eventDecision?.canCreateDraft, false);
});

test("strong normalized Tavily item is decided by existing dynamic gate without provider-specific business rules", () => {
  const src = source();
  const record = providerRecord(src, "TAVILY_EXTRACT", {
    name: "Max",
    organizationName: "Útulok A",
  });
  const decision = validateDynamicAutomationIngestion({ source: src, record });
  assert.equal(decision?.gate, "VALID_FOR_DRAFT");
  assert.equal(decision?.canCreateDraft, true);
  assert.ok(decision?.evidenceClasses.includes("CANONICAL_DETAIL_URL"));
});

test("UNCERTAIN canonical match remains review-only for Tavily evidence", () => {
  const src = source();
  const record = providerRecord(src, "TAVILY_EXTRACT", {
    name: "Max",
    organizationName: "Útulok A",
  });
  const decision = validateDynamicAutomationIngestion({
    source: src,
    record,
    match: {
      entityType: "ADOPTION",
      entityId: null,
      entityKey: null,
      quality: "UNCERTAIN",
      before: null,
      candidates: [{ id: 9, key: "adoption:9" }],
    },
  });
  assert.equal(decision?.gate, "UNCERTAIN");
  assert.equal(decision?.canCreateDraft, false);
  assert.equal(decision?.canSuggestUpdate, false);
});


test("activation never treats first-party 403 as permission to use Tavily", async () => {
  let fetches = 0;
  const readiness = await automationSourceActivationReadiness(
    source(),
    governanceDb(governanceRow()),
    {
      tavilyCredentialConfigured: true,
      fetchImpl: async () => {
        fetches += 1;
        return new Response("Forbidden", {
          status: 403,
          headers: { "content-type": "text/html" },
        });
      },
    },
  );
  assert.equal(fetches, 1);
  assert.equal(readiness.ready, false);
  assert.equal(readiness.reason, "TECHNICAL_NOT_READY");
  assert.equal(readiness.technicalReason, "source_http_403");
});

test("activation may select Tavily only after a safe generic parser insufficiency", async () => {
  const readiness = await automationSourceActivationReadiness(
    source(),
    governanceDb(governanceRow()),
    {
      tavilyCredentialConfigured: true,
      fetchImpl: async () => new Response("<html><body><h1>Psy</h1></body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    },
  );
  assert.equal(readiness.ready, true);
  assert.equal(readiness.reason, "READY");
});


test("TAVILY_ONLY activation never probes the third-party source or robots.txt", async () => {
  let fetches = 0;
  const readiness = await automationSourceActivationReadiness(
    source(),
    governanceDb(governanceRow({
      access_status: "UNKNOWN",
      robots_status: "UNKNOWN",
    })),
    {
      tavilyCredentialConfigured: true,
      internetTransport: "TAVILY_ONLY",
      fetchImpl: async () => {
        fetches += 1;
        throw new Error("third-party origin must not be fetched during Tavily-only activation");
      },
    },
  );
  assert.equal(fetches, 0);
  assert.equal(readiness.ready, true);
  assert.equal(readiness.reason, "READY");
});

test("TAVILY_ONLY activation fails closed when Tavily is not configured", async () => {
  const readiness = await automationSourceActivationReadiness(
    source(),
    governanceDb(governanceRow({
      access_status: "UNKNOWN",
      robots_status: "UNKNOWN",
    })),
    {
      tavilyCredentialConfigured: false,
      internetTransport: "TAVILY_ONLY",
    },
  );
  assert.equal(readiness.ready, false);
  assert.equal(readiness.reason, "TECHNICAL_NOT_READY");
  assert.equal(readiness.technicalReason, "TAVILY_CONFIG_MISSING");
});


test("TAVILY_CRAWL transient provider failure falls back once to TAVILY_EXTRACT without direct internet access", async () => {
  const src = source({
    entityType: "EVENT",
    sourceKey: "mushing-events",
    sourceUrl: "https://mushing.sk/preteky",
    config: { sourceShape: "MULTI_ITEM_LIST", staticFields: { eventType: "Preteky" } },
  });
  let crawlCalls = 0;
  let extractCalls = 0;
  let directFetches = 0;
  const records = await fetchAutomationSourceRecords(src, {
    sourceScopedContract: contract(src, "/preteky/**"),
    strategyOverride: "TAVILY_CRAWL",
    tavilyCrawlProvider: {
      async crawl() {
        crawlCalls += 1;
        throw new TavilySourceScopedError("TAVILY_PROVIDER_ERROR", true);
      },
    },
    tavilyExtractProvider: {
      async extract() {
        extractCalls += 1;
        return {
          records: [providerRecord(src, "TAVILY_EXTRACT", {
            title: "Mošovce",
            eventType: "Preteky",
          })],
          coverage: {},
          diagnostics: {},
        };
      },
    },
    tavilyRequestGate: gate(),
    fetchImpl: async () => {
      directFetches += 1;
      throw new Error("direct origin must never be fetched");
    },
  });
  assert.equal(records.length, 1);
  assert.equal(crawlCalls, 1);
  assert.equal(extractCalls, 1);
  assert.equal(directFetches, 0);
});

test("TAVILY_CRAWL auth/rate/budget failures do not bypass into Extract", async () => {
  for (const code of ["TAVILY_AUTH_FAILED", "TAVILY_RATE_LIMITED", "TAVILY_BUDGET_EXHAUSTED"]) {
    const src = source();
    let extractCalls = 0;
    await assert.rejects(
      fetchAutomationSourceRecords(src, {
        sourceScopedContract: contract(src),
        strategyOverride: "TAVILY_CRAWL",
        tavilyCrawlProvider: {
          async crawl() {
            throw new TavilySourceScopedError(code);
          },
        },
        tavilyExtractProvider: {
          async extract() {
            extractCalls += 1;
            return { records: [], coverage: {}, diagnostics: {} };
          },
        },
        tavilyRequestGate: gate(),
      }),
      (error) => error instanceof AutomationConnectorError
        && error.code === code.toLowerCase(),
    );
    assert.equal(extractCalls, 0);
  }
});


test("Tavily activation fails closed while transport phase migration 0112 is missing", async () => {
  const db = governanceDb(governanceRow());
  const originalPrepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    if (sql.includes("sqlite_master") && sql.includes("automation_source_provider_usage")) {
      return {
        async first() {
          return {
            name: "automation_source_provider_usage",
            sql: "CREATE TABLE automation_source_provider_usage (\n  provider_http_status integer,\n  provider_error_code text,\n  provider_error_detail text,\n  provider_request_id text,\n  transport_error_name text,\n  transport_error_code text\n)",
          };
        },
        bind() {
          return {
            async first() {
              return {
                name: "automation_source_provider_usage",
                sql: "CREATE TABLE automation_source_provider_usage (\n  provider_http_status integer,\n  provider_error_code text,\n  provider_error_detail text,\n  provider_request_id text,\n  transport_error_name text,\n  transport_error_code text\n)",
              };
            },
          };
        },
      };
    }
    return originalPrepare(sql);
  };
  const readiness = await automationSourceActivationReadiness(
    source(),
    db,
    {
      tavilyCredentialConfigured: true,
      internetTransport: "TAVILY_ONLY",
    },
  );
  assert.equal(readiness.ready, false);
  assert.equal(readiness.reason, "TECHNICAL_NOT_READY");
  assert.equal(readiness.technicalReason, "TAVILY_USAGE_SCHEMA_UNAVAILABLE");
});
