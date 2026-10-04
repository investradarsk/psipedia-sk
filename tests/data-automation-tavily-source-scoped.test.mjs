import assert from "node:assert/strict";
import test from "node:test";
import {
  TAVILY_CRAWL_ENDPOINT,
  TAVILY_EXTRACT_ENDPOINT,
  TavilyAutomationCrawlProvider,
  TavilyAutomationExtractProvider,
  TavilySourceScopedError,
} from "../lib/data-automation-tavily-source-scoped.ts";
import {
  buildSourceScopedExtractionContract,
  automationCoverageCanInferAbsence,
} from "../lib/data-automation-source-scoped-extraction.ts";

function source(overrides = {}) {
  return {
    id: 91,
    sourceKey: "tavily-source",
    label: "Tavily source",
    entityType: "ADOPTION",
    connectorType: "CONTROLLED_HTML",
    sourceUrl: "https://example.sk/psy",
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

function contract(src = source(), pathScope = "include:/psy/**;exclude:/psy/archiv/**") {
  const built = buildSourceScopedExtractionContract(src, {
    pathScope,
    maxRequestsPerDay: 12,
  });
  assert.equal(built.ready, true);
  return built.contract;
}

function gate(allowed = true) {
  const reservations = [];
  const finalized = [];
  return {
    reservations,
    finalized,
    value: {
      async reserve(operation) {
        reservations.push(operation);
        return allowed ? { operationKey: "op-" + operation.toLowerCase() + "-" + reservations.length } : null;
      },
      async finalize(value) {
        finalized.push(value);
      },
    },
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function payload(results, extra = {}) {
  return {
    results,
    failed_results: [],
    response_time: 0.25,
    usage: { credits: 1 },
    ...extra,
  };
}

test("Tavily Crawl maps approved root, path scope, bounds and bearer auth", async () => {
  const calls = [];
  const g = gate();
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "tvly-secret",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init, body: JSON.parse(String(init?.body ?? "{}")) });
      return json(payload([{ url: "https://example.sk/psy/max", raw_content: "# Max\nPes na adopciu." }]));
    },
  });

  const result = await provider.crawl({ source: source(), contract: contract(), gate: g.value });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, TAVILY_CRAWL_ENDPOINT);
  assert.equal(new Headers(calls[0].init.headers).get("authorization"), "Bearer tvly-secret");
  assert.equal(calls[0].body.url, "https://example.sk/psy");
  assert.equal(calls[0].body.max_depth, 3);
  assert.equal(calls[0].body.max_breadth, 20);
  assert.equal(calls[0].body.limit, 10);
  assert.deepEqual(calls[0].body.select_paths, ["^/psy(?:/.*)?$"]);
  assert.deepEqual(calls[0].body.exclude_paths, ["^/psy/archiv(?:/.*)?$"]);
  assert.deepEqual(calls[0].body.select_domains, ["^example\\.sk$"]);
  assert.equal(calls[0].body.allow_external, false);
  assert.equal(calls[0].body.format, "markdown");
  assert.equal(calls[0].body.include_usage, true);
  assert.equal(result.coverage.classification, "BOUNDED_PARTIAL");
  assert.equal(result.coverage.complete, false);
  assert.equal(result.records[0].extraction.strategy, "TAVILY_CRAWL");
  assert.equal(result.records[0].sourceUrl, "https://example.sk/psy/max");
  assert.equal(g.finalized[0].status, "SUCCESS");
});

test("Tavily Crawl filters duplicates, external origins, excluded paths and invalid protocols after provider response", async () => {
  const g = gate();
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    fetchImpl: async () => json(payload([
      { url: "https://example.sk/psy/max", raw_content: "# Max" },
      { url: "https://example.sk/psy/max", raw_content: "# Max duplicate" },
      { url: "https://partner.example/psy/max", raw_content: "# External" },
      { url: "https://example.sk/akcie/event", raw_content: "# Event" },
      { url: "https://example.sk/psy/archiv/old", raw_content: "# Old" },
      { url: "ftp://example.sk/psy/bad", raw_content: "# Bad" },
    ])),
  });
  const result = await provider.crawl({ source: source(), contract: contract(), gate: g.value });
  assert.equal(result.records.length, 1);
  assert.equal(result.diagnostics.duplicateCount, 1);
  assert.equal(result.diagnostics.scopeRejectedCount, 3);
  assert.ok(result.diagnostics.invalidCount >= 1);
});

test("Tavily Crawl never reports COMPLETE_ENUMERATION, even on a small completed-looking response", async () => {
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    fetchImpl: async () => json(payload([{ url: "https://example.sk/psy/max", raw_content: "# Max" }])),
  });
  const result = await provider.crawl({ source: source(), contract: contract(), gate: gate().value });
  assert.equal(result.coverage.classification, "BOUNDED_PARTIAL");
  assert.equal(result.coverage.complete, false);
  assert.equal(automationCoverageCanInferAbsence(result.coverage), false);
});

test("Tavily Crawl auth failure is stable and does not leak the API key", async () => {
  const secret = "tvly-super-secret";
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: secret,
    fetchImpl: async () => json({ detail: secret }, 401),
  });
  await assert.rejects(
    provider.crawl({ source: source(), contract: contract(), gate: gate().value }),
    (error) => error instanceof TavilySourceScopedError
      && error.code === "TAVILY_AUTH_FAILED"
      && !error.message.includes(secret),
  );
});

test("Tavily Crawl timeout is bounded", async () => {
  let calls = 0;
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    fetchImpl: async () => {
      calls += 1;
      const error = new Error("timeout");
      error.name = "AbortError";
      throw error;
    },
  });
  await assert.rejects(
    provider.crawl({ source: source(), contract: contract(), gate: gate().value }),
    (error) => error instanceof TavilySourceScopedError && error.code === "TAVILY_TIMEOUT",
  );
  assert.equal(calls, 1);
});

test("Tavily Crawl 429 is not immediately retried", async () => {
  let calls = 0;
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    fetchImpl: async () => {
      calls += 1;
      return json({}, 429);
    },
    sleep: async () => {},
  });
  await assert.rejects(
    provider.crawl({
      source: source({ retryMaxAttempts: 2 }),
      contract: contract(),
      gate: gate().value,
    }),
    (error) => error instanceof TavilySourceScopedError && error.code === "TAVILY_RATE_LIMITED",
  );
  assert.equal(calls, 1);
});

test("Tavily Crawl retries transient 5xx only within the source retry bound", async () => {
  let calls = 0;
  let sleeps = 0;
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    fetchImpl: async () => {
      calls += 1;
      if (calls < 3) return json({}, 500);
      return json(payload([{ url: "https://example.sk/psy/max", raw_content: "# Max" }]));
    },
    sleep: async () => { sleeps += 1; },
  });
  const result = await provider.crawl({
    source: source({ retryMaxAttempts: 2 }),
    contract: contract(),
    gate: gate().value,
  });
  assert.equal(result.records.length, 1);
  assert.equal(calls, 3);
  assert.equal(sleeps, 2);
});

test("Tavily Crawl rejects malformed response schema", async () => {
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    fetchImpl: async () => json({ response_time: 1 }),
  });
  await assert.rejects(
    provider.crawl({ source: source(), contract: contract(), gate: gate().value }),
    (error) => error instanceof TavilySourceScopedError && error.code === "TAVILY_INVALID_RESPONSE",
  );
});

test("Tavily provider retains only bounded normalized fields and raw excerpt", async () => {
  const long = "# Max\n" + "detail ".repeat(40000);
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    fetchImpl: async () => json(payload([{ url: "https://example.sk/psy/max", raw_content: long }])),
  });
  const result = await provider.crawl({ source: source(), contract: contract(), gate: gate().value });
  const record = result.records[0];
  assert.ok(String(record.rawRecord.contentExcerpt).length <= 4000);
  assert.ok(String(record.proposed.description).length <= 5000);
  assert.equal("raw_content" in record.rawRecord, false);
});

test("Tavily Extract sends one approved detail URL and maps DETAIL_ONLY evidence", async () => {
  const src = source({
    sourceUrl: "https://example.sk/psy/max",
    config: { sourceShape: "SINGLE_ITEM" },
  });
  const scoped = contract(src, "/psy/**");
  const calls = [];
  const provider = new TavilyAutomationExtractProvider({
    apiKey: "key",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      return json(payload([{ url: src.sourceUrl, raw_content: "# Max\nDetail psa." }]));
    },
  });
  const result = await provider.extract({
    source: src,
    contract: scoped,
    gate: gate().value,
    urls: [src.sourceUrl],
  });
  assert.equal(calls[0].url, TAVILY_EXTRACT_ENDPOINT);
  assert.deepEqual(calls[0].body.urls, [src.sourceUrl]);
  assert.equal(result.coverage.classification, "DETAIL_ONLY");
  assert.equal(result.coverage.complete, false);
  assert.equal(result.records[0].extraction.strategy, "TAVILY_EXTRACT");
});

test("Tavily Extract bounds a batch to current API maximum of 20 URLs", async () => {
  const src = source({ maxRecordsPerRun: 50 });
  const urls = Array.from({ length: 25 }, (_, i) => "https://example.sk/psy/dog-" + i);
  let body;
  const provider = new TavilyAutomationExtractProvider({
    apiKey: "key",
    fetchImpl: async (_url, init) => {
      body = JSON.parse(String(init?.body ?? "{}"));
      return json(payload(body.urls.map((url) => ({ url, raw_content: "# Dog" }))));
    },
  });
  const result = await provider.extract({ source: src, contract: contract(src), gate: gate().value, urls });
  assert.equal(body.urls.length, 20);
  assert.equal(result.records.length, 20);
  assert.equal(result.coverage.classification, "DETAIL_ONLY");
  assert.equal(result.coverage.truncated, true);
});

test("Tavily Extract rejects an outside-scope URL before provider network call", async () => {
  let calls = 0;
  const provider = new TavilyAutomationExtractProvider({
    apiKey: "key",
    fetchImpl: async () => { calls += 1; return json(payload([])); },
  });
  await assert.rejects(
    provider.extract({
      source: source(),
      contract: contract(),
      gate: gate().value,
      urls: ["https://example.sk/akcie/event"],
    }),
    (error) => error instanceof TavilySourceScopedError && error.code === "TAVILY_SCOPE_VIOLATION",
  );
  assert.equal(calls, 0);
});

test("Tavily Extract rejects external origin before provider network call", async () => {
  let calls = 0;
  const provider = new TavilyAutomationExtractProvider({
    apiKey: "key",
    fetchImpl: async () => { calls += 1; return json(payload([])); },
  });
  await assert.rejects(
    provider.extract({
      source: source(),
      contract: contract(),
      gate: gate().value,
      urls: ["https://other.example/psy/max"],
    }),
    TavilySourceScopedError,
  );
  assert.equal(calls, 0);
});

test("Tavily Extract tolerates partial batch failure when usable scoped results remain", async () => {
  const provider = new TavilyAutomationExtractProvider({
    apiKey: "key",
    fetchImpl: async () => json(payload(
      [{ url: "https://example.sk/psy/max", raw_content: "# Max" }],
      { failed_results: [{ url: "https://example.sk/psy/rex", error: "blocked" }] },
    )),
  });
  const result = await provider.extract({
    source: source(),
    contract: contract(),
    gate: gate().value,
    urls: ["https://example.sk/psy/max", "https://example.sk/psy/rex"],
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.diagnostics.failedCount, 1);
});

test("Tavily Extract timeout and rate limit stay bounded with no 429 retry storm", async () => {
  for (const mode of ["timeout", "rate"]) {
    let calls = 0;
    const provider = new TavilyAutomationExtractProvider({
      apiKey: "key",
      fetchImpl: async () => {
        calls += 1;
        if (mode === "rate") return json({}, 429);
        const error = new Error("timeout");
        error.name = "AbortError";
        throw error;
      },
      sleep: async () => {},
    });
    await assert.rejects(
      provider.extract({
        source: source({ retryMaxAttempts: 2 }),
        contract: contract(),
        gate: gate().value,
        urls: ["https://example.sk/psy/max"],
      }),
      (error) => error instanceof TavilySourceScopedError
        && (error.code === "TAVILY_RATE_LIMITED" || error.code === "TAVILY_TIMEOUT"),
    );
    assert.equal(calls, mode === "rate" ? 1 : 3);
  }
});

test("same Tavily detail URL produces a stable provider-neutral sourceRecordId", async () => {
  const make = () => new TavilyAutomationExtractProvider({
    apiKey: "key",
    fetchImpl: async () => json(payload([{ url: "https://example.sk/psy/max", raw_content: "# Max" }])),
  });
  const first = await make().extract({
    source: source(),
    contract: contract(),
    gate: gate().value,
    urls: ["https://example.sk/psy/max"],
  });
  const second = await make().extract({
    source: source(),
    contract: contract(),
    gate: gate().value,
    urls: ["https://example.sk/psy/max"],
  });
  assert.equal(first.records[0].sourceRecordId, second.records[0].sourceRecordId);
  assert.match(first.records[0].sourceRecordId, /^url:/);
  assert.equal(first.records[0].extraction.evidenceMetadata.provider, "tavily");
});

test("provider budget denial prevents network request", async () => {
  let calls = 0;
  const provider = new TavilyAutomationCrawlProvider({
    apiKey: "key",
    fetchImpl: async () => { calls += 1; return json(payload([])); },
  });
  await assert.rejects(
    provider.crawl({ source: source(), contract: contract(), gate: gate(false).value }),
    (error) => error instanceof TavilySourceScopedError && error.code === "TAVILY_BUDGET_EXHAUSTED",
  );
  assert.equal(calls, 0);
});

test("Tavily Crawl and Extract coverage can never drive missing semantics", async () => {
  assert.equal(automationCoverageCanInferAbsence({ classification: "RANKED_SEARCH", complete: false }), false);
  assert.equal(automationCoverageCanInferAbsence({ classification: "BOUNDED_PARTIAL", complete: false }), false);
  assert.equal(automationCoverageCanInferAbsence({ classification: "DETAIL_ONLY", complete: false }), false);
});
