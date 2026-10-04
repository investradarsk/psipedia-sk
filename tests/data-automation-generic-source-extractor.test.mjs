import assert from "node:assert/strict";
import test from "node:test";
import {
  extractGenericFirstPartySource,
  GenericFirstPartyExtractionError,
} from "../lib/data-automation-generic-source-extractor.ts";
import {
  automationSourceReadiness,
} from "../lib/data-automation-capability-registry.ts";
import {
  buildSourceScopedExtractionContract,
} from "../lib/data-automation-source-scoped-extraction.ts";
import {
  AutomationConnectorError,
  fetchAutomationSourceRecords,
} from "../lib/data-automation-connectors.ts";
import { productionAutomationHtmlAdapters } from "../lib/data-automation-real-sources.ts";

function source(overrides = {}) {
  return {
    id: 31,
    sourceKey: "generic-source",
    label: "Generic source",
    entityType: "ADOPTION",
    connectorType: "CONTROLLED_HTML",
    sourceUrl: "https://example.sk/psy",
    config: { sourceShape: "MULTI_ITEM_LIST" },
    enabled: false,
    cadenceMinutes: 1440,
    throttleMs: 0,
    timeoutMs: 5000,
    retryMaxAttempts: 0,
    retryBackoffMs: 100,
    maxRecordsPerRun: 50,
    nextCheckAt: null,
    reviewStatus: "APPROVED",
    ...overrides,
  };
}

function contract(src = source(), pathScope = "/psy/**") {
  const result = buildSourceScopedExtractionContract(src, {
    pathScope,
    maxRequestsPerDay: 20,
  });
  assert.equal(result.ready, true);
  return result.contract;
}

function withLimits(value, limits) {
  return { ...value, limits: { ...value.limits, ...limits } };
}

function itemListHtml(items, numberOfItems = items.length, extra = "") {
  return `<!doctype html><html><head>
    <script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ItemList",
      numberOfItems,
      itemListElement: items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item,
      })),
    })}</script>
    ${extra}
  </head><body></body></html>`;
}

function event(name, url, startDate = "2026-11-01") {
  return {
    "@type": "Event",
    "@id": url,
    url,
    name,
    startDate,
  };
}

function detailHtml(name, url) {
  return `<!doctype html><html><head>
    <link rel="canonical" href="${url}">
    <meta name="description" content="Detail ${name}">
  </head><body><h1>${name}</h1></body></html>`;
}

test("GENERIC_FIRST_PARTY JSON-LD ItemList emits stable items and COMPLETE enumeration", async () => {
  const src = source();
  const scoped = contract(src);
  const html = itemListHtml([
    event("Rex", "https://example.sk/psy/rex"),
    event("Luna", "https://example.sk/psy/luna"),
  ]);

  const first = await extractGenericFirstPartySource({
    source: src,
    contract: scoped,
    rootHtml: html,
    rootUrl: src.sourceUrl,
    fetchPage: async () => { throw new Error("detail fetch not expected"); },
  });
  const second = await extractGenericFirstPartySource({
    source: src,
    contract: scoped,
    rootHtml: html,
    rootUrl: src.sourceUrl,
    fetchPage: async () => { throw new Error("detail fetch not expected"); },
  });

  assert.equal(first.records.length, 2);
  assert.equal(first.coverage.classification, "COMPLETE_ENUMERATION");
  assert.equal(first.coverage.complete, true);
  assert.equal(first.coverage.truncated, false);
  assert.deepEqual(
    first.records.map((record) => record.sourceRecordId),
    second.records.map((record) => record.sourceRecordId),
  );
  assert.ok(first.records.every((record) => record.extraction?.strategy === "GENERIC_FIRST_PARTY"));
});

test("generic HTML listing discovers only qualified same-scope detail links", async () => {
  const src = source();
  const scoped = contract(src, "include:/psy/**;exclude:/psy/archiv/**");
  const root = `<!doctype html><html><body>
    <article class="dog-card"><a class="detail" href="/psy/rex">Rex</a></article>
    <article class="dog-card"><a class="detail" href="/psy/archiv/old">Old</a></article>
    <article class="dog-card"><a class="detail" href="/akcie/event">Event</a></article>
    <article class="dog-card"><a class="detail" href="https://other.example/psy/x">External</a></article>
  </body></html>`;
  const fetched = [];
  const result = await extractGenericFirstPartySource({
    source: src,
    contract: scoped,
    rootHtml: root,
    rootUrl: src.sourceUrl,
    fetchPage: async (url) => {
      fetched.push(url);
      return { html: detailHtml("Rex", url), finalUrl: url };
    },
  });

  assert.deepEqual(fetched, ["https://example.sk/psy/rex"]);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].sourceUrl, "https://example.sk/psy/rex");
  assert.equal(result.coverage.classification, "BOUNDED_PARTIAL");
  assert.ok(result.diagnostics.rejectedUrls >= 3);
});

test("duplicate item URLs are deduplicated before detail fetch", async () => {
  const src = source();
  const scoped = contract(src);
  const root = `<!doctype html><html><body>
    <article class="dog-card"><a class="detail" href="/psy/rex">Rex</a></article>
    <article class="dog-card"><a class="detail" href="/psy/rex">Rex profile</a></article>
  </body></html>`;
  let fetches = 0;
  const result = await extractGenericFirstPartySource({
    source: src,
    contract: scoped,
    rootHtml: root,
    rootUrl: src.sourceUrl,
    fetchPage: async (url) => {
      fetches += 1;
      return { html: detailHtml("Rex", url), finalUrl: url };
    },
  });
  assert.equal(fetches, 1);
  assert.equal(result.records.length, 1);
});

test("explicit rel=next pagination is bounded and truncation downgrades COMPLETE", async () => {
  const src = source();
  const scoped = withLimits(contract(src), { maxPages: 1, maxItems: 10 });
  const html = itemListHtml(
    [event("Rex", "https://example.sk/psy/rex")],
    1,
    '<link rel="next" href="/psy/page-2">',
  );
  const result = await extractGenericFirstPartySource({
    source: src,
    contract: scoped,
    rootHtml: html,
    rootUrl: src.sourceUrl,
    fetchPage: async () => { throw new Error("next page must not be fetched past maxPages"); },
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.coverage.classification, "BOUNDED_PARTIAL");
  assert.equal(result.coverage.complete, false);
  assert.equal(result.coverage.truncated, true);
  assert.ok(result.diagnostics.warnings.includes("traversal_limit_reached"));
});

test("maxItems truncation always produces BOUNDED_PARTIAL", async () => {
  const src = source();
  const scoped = withLimits(contract(src), { maxItems: 2 });
  const html = itemListHtml([
    event("A", "https://example.sk/psy/a"),
    event("B", "https://example.sk/psy/b"),
    event("C", "https://example.sk/psy/c"),
  ]);
  const result = await extractGenericFirstPartySource({
    source: src,
    contract: scoped,
    rootHtml: html,
    rootUrl: src.sourceUrl,
    fetchPage: async () => { throw new Error("detail fetch not expected"); },
  });
  assert.equal(result.records.length, 2);
  assert.equal(result.coverage.classification, "BOUNDED_PARTIAL");
  assert.equal(result.coverage.truncated, true);
});

test("malformed structured data with no safe listing evidence fails closed", async () => {
  const src = source();
  await assert.rejects(
    extractGenericFirstPartySource({
      source: src,
      contract: contract(src),
      rootHtml: '<html><head><script type="application/ld+json">{broken</script></head><body><h1>Dogs</h1></body></html>',
      rootUrl: src.sourceUrl,
      fetchPage: async () => { throw new Error("unexpected"); },
    }),
    (error) => error instanceof GenericFirstPartyExtractionError && error.code === "unsupported_structured_data",
  );
});

test("dedicated adapter remains preferred even when generic probe is supported", () => {
  const dedicated = source({
    sourceUrl: "https://trnava.utulok.sk/psy/triny",
    config: { sourceShape: "SINGLE_ITEM", htmlAdapterKey: "trnava-adoption-detail" },
  });
  const readiness = automationSourceReadiness(dedicated, undefined, {
    genericProbe: { supported: true, reason: "PROBE_CONFIRMED", sourceShape: "SINGLE_ITEM" },
  });
  assert.equal(readiness.ready, true);
  assert.equal(readiness.strategy, "DEDICATED_ADAPTER");
});

test("generic-capable source can become supported only from explicit probe evidence", () => {
  const src = source();
  const before = automationSourceReadiness(src);
  assert.equal(before.ready, false);
  assert.equal(before.reason, "NO_RELIABLE_EXTRACTION_STRATEGY");

  const after = automationSourceReadiness(src, undefined, {
    genericProbe: { supported: true, reason: "PROBE_CONFIRMED", sourceShape: "MULTI_ITEM_LIST" },
  });
  assert.equal(after.ready, true);
  assert.equal(after.strategy, "GENERIC_FIRST_PARTY");
  assert.equal(
    after.capabilities.find((item) => item.strategy === "TAVILY_CRAWL")?.status,
    "UNAVAILABLE",
  );
});

test("generic connector blocks redirects outside approved scope before following them", async () => {
  const src = source();
  const scoped = contract(src);
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(String(url));
    return new Response(null, {
      status: 302,
      headers: { location: "https://example.sk/akcie" },
    });
  };

  await assert.rejects(
    fetchAutomationSourceRecords(src, {
      fetchImpl,
      htmlAdapters: productionAutomationHtmlAdapters,
      sourceScopedContract: scoped,
      strategyOverride: "GENERIC_FIRST_PARTY",
    }),
    (error) => error instanceof AutomationConnectorError && error.code === "source_scope_violation",
  );
  assert.equal(requested.length, 1);
});

test("dedicated controlled HTML connector still wins when a generic contract is present", async () => {
  const src = source({
    sourceUrl: "https://trnava.utulok.sk/psy/triny",
    config: {
      sourceShape: "SINGLE_ITEM",
      htmlAdapterKey: "trnava-adoption-detail",
      expectedMinRecords: 1,
    },
    maxRecordsPerRun: 10,
  });
  const scoped = buildSourceScopedExtractionContract(src, {
    pathScope: "/psy/**",
    maxRequestsPerDay: 10,
  });
  assert.equal(scoped.ready, true);

  const html = `<!doctype html><html><head>
    <meta property="og:title" content="Triny">
    <meta property="og:url" content="https://trnava.utulok.sk/psy/triny">
  </head><body><h1>Triny</h1><div>Triny hľadá domov.</div></body></html>`;
  const records = await fetchAutomationSourceRecords(src, {
    sourceScopedContract: scoped.contract,
    htmlAdapters: productionAutomationHtmlAdapters,
    fetchImpl: async () => new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].extraction, undefined);
});
