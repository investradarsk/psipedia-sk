import assert from "node:assert/strict";
import test from "node:test";
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
