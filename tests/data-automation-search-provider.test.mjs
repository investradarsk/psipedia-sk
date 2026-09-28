import assert from "node:assert/strict";
import test from "node:test";
import { TavilyAutomationSearchProvider, tavilySearchProviderContract } from "../lib/data-automation-search-tavily.ts";
import {
  AUTOMATION_SEARCH_DEFAULT_MAX_RESULTS,
  AUTOMATION_SEARCH_MAX_RESULTS,
  AutomationSearchProviderError,
  automationSearchQueryFingerprint,
  automationSearchResultsToCandidates,
  normalizeAutomationSearchRequest,
  requireConfiguredSearchProvider,
} from "../lib/data-automation-discovery.ts";

test("DISCOVERY-2A normalizes and bounds search requests", () => {
  const request = normalizeAutomationSearchRequest({
    query: "  Psie   podujatia Slovensko ",
    locale: " SK-sk ",
    country: " sk ",
    allowDomains: ["Example.sk", "www.klub.sk", "example.sk"],
    blockDomains: ["spam.sk"],
  });
  assert.equal(request.query, "psie podujatia slovensko");
  assert.equal(request.maxResults, AUTOMATION_SEARCH_DEFAULT_MAX_RESULTS);
  assert.equal(request.locale, "sk-sk");
  assert.equal(request.country, "SK");
  assert.deepEqual(request.allowDomains, ["example.sk", "klub.sk"]);
  assert.throws(
    () => normalizeAutomationSearchRequest({ query: "dogs", maxResults: AUTOMATION_SEARCH_MAX_RESULTS + 1 }),
    (error) => error instanceof AutomationSearchProviderError && error.code === "CONFIG_MISSING",
  );
});

test("DISCOVERY-2A query fingerprint is deterministic and request-sensitive", async () => {
  const a = normalizeAutomationSearchRequest({
    query: " Dog   events ",
    maxResults: 10,
    country: "sk",
    allowDomains: ["b.sk", "a.sk"],
  });
  const b = normalizeAutomationSearchRequest({
    query: "dog events",
    maxResults: 10,
    country: "SK",
    allowDomains: ["a.sk", "b.sk"],
  });
  const c = normalizeAutomationSearchRequest({
    query: "dog events",
    maxResults: 10,
    country: "CZ",
    allowDomains: ["a.sk", "b.sk"],
  });
  assert.equal(await automationSearchQueryFingerprint("provider-x", a), await automationSearchQueryFingerprint("provider-x", b));
  assert.notEqual(await automationSearchQueryFingerprint("provider-x", a), await automationSearchQueryFingerprint("provider-x", c));
});

test("DISCOVERY-2A provider binding fails closed without runtime credentials", () => {
  assert.throws(
    () => requireConfiguredSearchProvider(undefined, "provider-x"),
    (error) => error instanceof AutomationSearchProviderError && error.code === "CONFIG_MISSING",
  );
  assert.throws(
    () => requireConfiguredSearchProvider({
      key: "provider-x",
      credentialConfigured: false,
      async search() { return []; },
    }, "provider-x"),
    (error) => error instanceof AutomationSearchProviderError && error.code === "CONFIG_MISSING",
  );
});

test("DISCOVERY-2A maps bounded results to candidates and preserves evidence fields", async () => {
  const request = normalizeAutomationSearchRequest({
    query: "dog events",
    maxResults: 2,
    allowDomains: ["example.sk"],
    blockDomains: ["blocked.example.sk"],
  });
  const fingerprint = await automationSearchQueryFingerprint("provider-x", request);
  const candidates = automationSearchResultsToCandidates({
    providerKey: "provider-x",
    request,
    fingerprint,
    entityType: "EVENT",
    suggestedConnectorType: "CONTROLLED_HTML",
    results: [
      {
        url: "https://example.sk/event?utm_source=test&id=2#details",
        title: "  Event   title ",
        snippet: " useful   snippet ",
        rank: 1,
        externalId: "abc-1",
        metadata: { score: 0.9, debug: "x".repeat(700), nested: { ignored: true } },
      },
      {
        url: "https://blocked.example.sk/other",
        title: "Blocked",
        rank: 2,
      },
      {
        url: "https://example.sk/third",
        title: "Third",
        rank: 3,
      },
    ],
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].sourceUrl, "https://example.sk/event?id=2");
  assert.equal(candidates[0].label, "Event title");
  assert.equal(candidates[0].entityType, "EVENT");
  assert.equal(candidates[0].metadata?.queryFingerprint, fingerprint);
  assert.equal(candidates[0].metadata?.resultRank, 1);
  assert.equal(candidates[0].metadata?.externalId, "abc-1");
});

test("DISCOVERY-2A rejects unsafe/private URLs and invalid provider responses", async () => {
  const request = normalizeAutomationSearchRequest({ query: "dogs", maxResults: 10 });
  const fingerprint = await automationSearchQueryFingerprint("provider-x", request);
  const candidates = automationSearchResultsToCandidates({
    providerKey: "provider-x",
    request,
    fingerprint,
    entityType: "DIRECTORY",
    results: [
      { url: "http://example.sk/insecure", title: "HTTP", rank: 1 },
      { url: "https://127.0.0.1/private", title: "Private", rank: 2 },
      { url: "https://example.sk/good", title: "Good", rank: 3 },
    ],
  });
  assert.deepEqual(candidates.map((item) => item.sourceUrl), ["https://example.sk/good"]);
  assert.throws(
    () => automationSearchResultsToCandidates({
      providerKey: "provider-x",
      request,
      fingerprint,
      entityType: "DIRECTORY",
      results: [{ url: "https://example.sk", title: "Bad rank", rank: -1 }],
    }),
    (error) => error instanceof AutomationSearchProviderError && error.code === "INVALID_RESPONSE",
  );
});


function tavilyMockResponse(status, body) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("DISCOVERY-2C-E Tavily maps generic locale to Tavily language without strict filtering", async () => {
  const calls = [];
  const provider = new TavilyAutomationSearchProvider({
    apiKey: "test-tavily-key",
    async fetchImpl(input, init) {
      calls.push({ input: String(input), init });
      return tavilyMockResponse(200, {
        results: [
          { title: "Dog event", url: "https://example.sk/event", content: " Useful   snippet ", score: 0.91 },
        ],
      });
    },
  });

  const results = await provider.search({
    query: "psie podujatia slovensko",
    maxResults: 5,
    locale: "sk-sk",
    country: "SK",
    freshness: "week",
    allowDomains: ["example.sk"],
    blockDomains: ["blocked.sk"],
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, "https://api.tavily.com/search");
  assert.equal(calls[0].init?.method, "POST");
  assert.equal(calls[0].init?.headers.Authorization, "Bearer test-tavily-key");
  assert.equal(calls[0].init?.headers["Content-Type"], "application/json");
  const body = JSON.parse(calls[0].init?.body);
  assert.deepEqual(body, {
    query: "psie podujatia slovensko",
    max_results: 5,
    search_depth: "basic",
    country: "Slovakia",
    language: "sk",
    time_range: "week",
    include_domains: ["example.sk"],
    exclude_domains: ["blocked.sk"],
  });
  assert.equal("locale" in body, false);
  assert.equal(body.language, "sk");
  assert.equal("filter_by_language" in body, false);
  assert.deepEqual(results, [{
    url: "https://example.sk/event",
    title: "Dog event",
    snippet: "Useful snippet",
    rank: 1,
    externalId: null,
    metadata: { score: 0.91 },
  }]);
  assert.equal(tavilySearchProviderContract.timeoutMs, 8000);
});

test("DISCOVERY-2C-E Tavily locale mapping is deterministic and invalid locale fails closed", async () => {
  const bodies = [];
  const provider = new TavilyAutomationSearchProvider({
    apiKey: "test-tavily-key",
    async fetchImpl(_input, init) {
      bodies.push(JSON.parse(init?.body));
      return tavilyMockResponse(200, { results: [] });
    },
  });

  await provider.search({ query: "dogs", maxResults: 5, locale: "sk-SK" });
  await provider.search({ query: "dogs", maxResults: 5, locale: "SK_sk" });
  assert.deepEqual(bodies.map((body) => body.language), ["sk", "sk"]);
  assert.ok(bodies.every((body) => !("filter_by_language" in body)));

  await assert.rejects(
    () => provider.search({ query: "dogs", maxResults: 5, locale: "not-a-locale" }),
    (error) => error instanceof AutomationSearchProviderError && error.code === "CONFIG_MISSING",
  );
  assert.equal(bodies.length, 2);
});

test("DISCOVERY-2C-B Tavily enforces max-results hard cap and deterministic mappings", async () => {
  const bodies = [];
  const provider = new TavilyAutomationSearchProvider({
    apiKey: "test-tavily-key",
    async fetchImpl(_input, init) {
      bodies.push(JSON.parse(init?.body));
      return tavilyMockResponse(200, { results: [] });
    },
  });

  for (const freshness of ["day", "week", "month", "year"]) {
    await provider.search({ query: "dogs", maxResults: 20, country: "SK", freshness });
  }
  await provider.search({ query: "dogs", maxResults: 200, country: "CZ", freshness: "unsupported" });

  assert.deepEqual(bodies.slice(0, 4).map((body) => body.time_range), ["day", "week", "month", "year"]);
  assert.ok(bodies.slice(0, 4).every((body) => body.country === "Slovakia"));
  assert.equal(bodies[4].max_results, AUTOMATION_SEARCH_MAX_RESULTS);
  assert.equal("country" in bodies[4], false);
  assert.equal("time_range" in bodies[4], false);
});

test("DISCOVERY-2C-B Tavily skips malformed rows but rejects malformed response envelopes", async () => {
  const provider = new TavilyAutomationSearchProvider({
    apiKey: "test-tavily-key",
    async fetchImpl() {
      return tavilyMockResponse(200, {
        results: [
          { title: "", url: "https://example.sk/no-title", content: "x", score: 1 },
          { title: "No URL", url: "not-a-url", content: "x", score: 1 },
          { title: "Good", url: "https://example.sk/good", content: "x".repeat(1200), score: 0.5 },
        ],
      });
    },
  });
  const results = await provider.search({ query: "dogs", maxResults: 10 });
  assert.equal(results.length, 1);
  assert.equal(results[0].rank, 3);
  assert.equal(results[0].snippet.length, 1000);

  const badEnvelope = new TavilyAutomationSearchProvider({
    apiKey: "test-tavily-key",
    async fetchImpl() { return tavilyMockResponse(200, { results: {} }); },
  });
  await assert.rejects(
    () => badEnvelope.search({ query: "dogs", maxResults: 10 }),
    (error) => error instanceof AutomationSearchProviderError && error.code === "INVALID_RESPONSE",
  );

  const badJson = new TavilyAutomationSearchProvider({
    apiKey: "test-tavily-key",
    async fetchImpl() { return tavilyMockResponse(200, "{not-json"); },
  });
  await assert.rejects(
    () => badJson.search({ query: "dogs", maxResults: 10 }),
    (error) => error instanceof AutomationSearchProviderError && error.code === "INVALID_RESPONSE",
  );
});

test("DISCOVERY-2C-B Tavily maps provider errors and never exposes the secret", async () => {
  let noSecretNetworkCall = false;
  const noSecret = new TavilyAutomationSearchProvider({
    apiKey: "",
    async fetchImpl() {
      noSecretNetworkCall = true;
      return tavilyMockResponse(200, { results: [] });
    },
  });
  assert.equal(noSecret.credentialConfigured, false);
  await assert.rejects(
    () => noSecret.search({ query: "dogs", maxResults: 5 }),
    (error) => error instanceof AutomationSearchProviderError
      && error.code === "CONFIG_MISSING"
      && !error.message.includes("test-tavily-key"),
  );
  assert.equal(noSecretNetworkCall, false);

  for (const [status, code] of [[401, "AUTH_FAILED"], [403, "AUTH_FAILED"], [429, "RATE_LIMITED"], [500, "PROVIDER_ERROR"]]) {
    const provider = new TavilyAutomationSearchProvider({
      apiKey: "test-tavily-key",
      async fetchImpl() { return tavilyMockResponse(status, { error: "test-tavily-key should not propagate" }); },
    });
    await assert.rejects(
      () => provider.search({ query: "dogs", maxResults: 5 }),
      (error) => error instanceof AutomationSearchProviderError
        && error.code === code
        && !error.message.includes("test-tavily-key"),
    );
  }

  const network = new TavilyAutomationSearchProvider({
    apiKey: "test-tavily-key",
    async fetchImpl() { throw new Error("network includes test-tavily-key"); },
  });
  await assert.rejects(
    () => network.search({ query: "dogs", maxResults: 5 }),
    (error) => error instanceof AutomationSearchProviderError
      && error.code === "PROVIDER_ERROR"
      && !error.message.includes("test-tavily-key"),
  );

  const timeout = new TavilyAutomationSearchProvider({
    apiKey: "test-tavily-key",
    async fetchImpl() {
      const error = new Error("timeout includes test-tavily-key");
      error.name = "TimeoutError";
      throw error;
    },
  });
  await assert.rejects(
    () => timeout.search({ query: "dogs", maxResults: 5 }),
    (error) => error instanceof AutomationSearchProviderError
      && error.code === "TIMEOUT"
      && !error.message.includes("test-tavily-key"),
  );
});
