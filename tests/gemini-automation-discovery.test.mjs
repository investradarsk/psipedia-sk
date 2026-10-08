import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { geminiAutomationCatalog } from "../lib/gemini-automation-catalog.ts";
import { GeminiAutomationError } from "../lib/gemini-automation-types.ts";
import {
  GEMINI_DISCOVERY_MAX_CANDIDATES,
  createGeminiDiscoveryRequest,
  buildGeminiDiscoveryPrompt,
  buildGeminiDiscoveryJsonSchema,
  parseGeminiDiscoveryEnvelope,
} from "../lib/gemini-automation-discovery-contract.ts";
import { discoverGeminiCandidates } from "../lib/gemini-automation-discovery.ts";
import { classifyChangedFiles } from "../scripts/ci-scope.mjs";

const stableKey = geminiAutomationCatalog.find((x) => x.section === "directory").stableKey;
const url = "https://example.sk/dogschool";
const secret = "key-is-not-for-logs";
const env = { GEMINI_API_KEY: secret, GEMINI_MODEL: "gemini-3.8-flash" };
const request = () => createGeminiDiscoveryRequest({ stableKey, maxCandidates: 3 });
const candidate = () => ({
  name: "Psia škola", primary_url: url,
  source_urls: [url, "https://example.sk/contact"],
  description: "Verejná kynologická škola.",
  location: { country: "Slovakia", region: "Nitriansky kraj", district: null, city: "Nitra", address: null },
  contacts: { phone: null, email: "info@example.sk", website: url, facebook: null, instagram: null },
  confidence: 0.9,
  evidence: [{ source_url: url, fields: ["name", "location", "contacts"] }],
});
const envelope = () => ({ schema_version: 1, category_key: stableKey, candidates: [candidate()] });
function mockResponse(value = envelope(), options = {}) {
  return {
    status: options.status || "completed",
    steps: [
      ...(options.search === false ? [] : [
        { type: "google_search_call", id: "gs_1", arguments: { queries: ["Psia skola Slovensko", "treneri psov Nitra"] } },
        { type: "google_search_result", call_id: "gs_1", result: [{ search_suggestions: "<not-persisted>" }] },
      ]),
      { type: "model_output", content: [{
        type: "text",
        text: typeof value === "string" ? value : JSON.stringify(value),
        annotations: options.citations === false ? [] : [
          { type: "url_citation", url: options.citationUrl || url, title: "Example" },
        ],
      }] },
    ],
  };
}
async function discoverWith(value = envelope(), extra = {}) {
  let calls = 0;
  const result = await discoverGeminiCandidates({
    env, stableKey, maxCandidates: 3,
    fetchImpl: async (endpoint, init) => {
      calls++;
      if (typeof extra.inspect === "function") extra.inspect(endpoint, init);
      return new Response(JSON.stringify(mockResponse(value, extra)), { status: 200 });
    },
    ...extra.options,
  });
  return { result, calls };
}
const isInvalid = (error) => error instanceof GeminiAutomationError && error.code === "INVALID_RESPONSE";

test("A-C: known catalog key produces canonical immutable category, unknown key fails before fetch", async () => {
  const entry = geminiAutomationCatalog.find((x) => x.stableKey === stableKey);
  assert.deepEqual(request(), {
    schemaVersion: 1, stableKey, section: entry.section, subcategory: entry.subcategory,
    categoryLabel: entry.label, country: "Slovakia", maxCandidates: 3,
  });
  for (const input of [
    { stableKey: "directory.unknown", maxCandidates: 3 },
    { stableKey, maxCandidates: 0 },
    { stableKey, maxCandidates: GEMINI_DISCOVERY_MAX_CANDIDATES + 1 },
    { stableKey, maxCandidates: 1.5 },
    { stableKey, maxCandidates: 3, section: "help" },
  ]) assert.throws(() => createGeminiDiscoveryRequest(input), isInvalid);
  for (const change of [{ section: "help" }, { subcategory: "x" }, { categoryLabel: "spoof" }, { country: "Other" }]) {
    assert.throws(() => buildGeminiDiscoveryPrompt({ ...request(), ...change }), isInvalid);
  }
  let calls = 0;
  await assert.rejects(discoverGeminiCandidates({ env, stableKey: "unknown", maxCandidates: 2,
    fetchImpl: async () => { calls++; throw Error("no"); } }), isInvalid);
  assert.equal(calls, 0);
});

test("D: prompt is server-owned, geographically bounded, source-grounded and refuses inventions/dedupe", () => {
  const prompt = buildGeminiDiscoveryPrompt(request());
  assert.ok(prompt.includes(request().categoryLabel));
  assert.match(prompt, /Slovakia/);
  assert.match(prompt, /publicly accessible web sources/);
  assert.match(prompt, /Never invent/);
  assert.match(prompt, /at most 3 candidates/);
  assert.match(prompt, /Do not deduplicate against Psipedia/);
  assert.equal(prompt.includes(secret), false);
});

test("E-F: Interactions API uses Google Search + URL Context in one request and strict JSON schema, no store", async () => {
  const { result, calls } = await discoverWith(envelope(), {
    inspect(endpoint, init) {
      assert.equal(endpoint, "https://generativelanguage.googleapis.com/v1beta/interactions");
      assert.equal(init.method, "POST");
      assert.equal(new Headers(init.headers).get("x-goog-api-key"), secret);
      const body = JSON.parse(init.body);
      assert.equal(init.body.includes(secret), false);
      assert.equal(body.model, env.GEMINI_MODEL);
      assert.equal(body.store, false);
      assert.deepEqual(body.tools, [{ type: "google_search" }, { type: "url_context" }]);
      assert.equal(body.response_format.type, "text");
      assert.equal(body.response_format.mime_type, "application/json");
      assert.equal(body.response_format.schema.additionalProperties, false);
      assert.equal(body.response_format.schema.properties.candidates.maxItems, 3);
      assert.equal(body.response_format.schema.properties.category_key.enum[0], stableKey);
      assert.equal(body.response_format.schema.properties.candidates.items.additionalProperties, false);
      assert.equal(body.response_format.schema.properties.candidates.items.properties.evidence.items.additionalProperties, false);
      assert.equal(Object.hasOwn(body, "response_mime_type"), false);
      assert.equal(Object.hasOwn(body, "generationConfig"), false);
      assert.equal(body.input.includes("admin email"), false);
      assert.ok(init.signal);
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.providerMetrics.model, env.GEMINI_MODEL);
  assert.equal(result.providerMetrics.groundedSearchQueryCount, 2);
  assert.equal(result.providerMetrics.candidateCount, 1);
  assert.deepEqual(Object.keys(result.providerMetrics), ["model", "requestCount", "groundedSearchQueryCount", "candidateCount"]);
  const schema = buildGeminiDiscoveryJsonSchema(request());
  assert.deepEqual(schema.required, ["schema_version", "category_key", "candidates"]);
});

test("G: normalized grounded response has only V1 candidate facts, no payload or raw search text", async () => {
  const { result } = await discoverWith();
  assert.deepEqual(result.candidates, [candidate()]);
  assert.equal(JSON.stringify(result).includes("not-persisted"), false);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test("H: invalid JSON, provider shape, ungrounded result fail closed", async () => {
  for (const value of ["{not json", "null", "[]", "{\"bad\":true}"]) {
    await assert.rejects(discoverWith(value), isInvalid);
  }
  for (const options of [{ search: false }, { citations: false }, { citationUrl: "https://another.sk/" },
    { status: "in_progress" }]) {
    await assert.rejects(discoverGeminiCandidates({
      env, stableKey, maxCandidates: 3,
      fetchImpl: async () => new Response(JSON.stringify(mockResponse(envelope(), options))),
    }), isInvalid);
  }
});

test("I-J: schema_version and category_key must match exactly; extra top-level fields rejected", () => {
  for (const diff of [{ schema_version: 2 }, { category_key: "directory.other" }, { extra: 1 }]) {
    assert.throws(() => parseGeminiDiscoveryEnvelope({ ...envelope(), ...diff }, request()), isInvalid);
  }
});

test("K-L: no source, non-HTTP, invalid URLs or unrelated evidence fail", () => {
  for (const changed of [
    { source_urls: [] },
    { source_urls: ["javascript:alert(1)"] },
    { source_urls: ["http://localhost/admin"] },
    { source_urls: ["https://user:pass@example.sk"] },
    { source_urls: ["not a URL"] },
    { primary_url: "ftp://example.sk" },
    { evidence: [] },
    { evidence: [{ source_url: "https://missing.sk/", fields: ["name"] }] },
    { contacts: { ...candidate().contacts, website: "file:///secret" } },
  ]) {
    const value = envelope();
    value.candidates[0] = { ...candidate(), ...changed };
    assert.throws(() => parseGeminiDiscoveryEnvelope(value, request()), isInvalid);
  }
});

test("M-N: too many candidates or out-of-range confidence rejects entire response", () => {
  assert.throws(() => parseGeminiDiscoveryEnvelope({
    ...envelope(), candidates: Array.from({ length: 4 }, candidate),
  }, request()), isInvalid);
  for (const confidence of [-0.01, 1.01, "0.8", null]) {
    const value = envelope();
    value.candidates[0].confidence = confidence;
    assert.throws(() => parseGeminiDiscoveryEnvelope(value, request()), isInvalid);
  }
});

test("O: strict nested shapes, required fields and bounded lengths and arrays", () => {
  for (const changed of [
    { name: "a".repeat(161) }, { name: " " }, { description: "a".repeat(601) },
    { source_urls: Array.from({ length: 9 }, (_, i) => "https://e.sk/" + i) },
    { evidence: Array.from({ length: 9 }, () => ({ source_url: url, fields: ["name"] })) },
    { location: { ...candidate().location, city: "x".repeat(101) } },
    { contacts: { ...candidate().contacts, email: "wrong-email" } },
    { evidence: [{ source_url: url, fields: ["unsupported"] }] },
    { evidence: [{ source_url: url, fields: [] }] },
    { contacts: { ...candidate().contacts, forbidden: "x" } },
    { other_field: true },
  ]) {
    const value = envelope();
    value.candidates[0] = { ...candidate(), ...changed };
    assert.throws(() => parseGeminiDiscoveryEnvelope(value, request()), isInvalid);
  }
  const value = envelope();
  delete value.candidates[0].contacts;
  assert.throws(() => parseGeminiDiscoveryEnvelope(value, request()), isInvalid);
});

test("P: duplicate source URLs and evidence field labels safely normalize", () => {
  const data = envelope();
  data.candidates[0].source_urls.push(" " + url + " ");
  data.candidates[0].evidence[0].fields.push("name");
  const parsed = parseGeminiDiscoveryEnvelope(data, request());
  assert.deepEqual(parsed.candidates[0].source_urls, candidate().source_urls);
  assert.deepEqual(parsed.candidates[0].evidence[0].fields, ["name", "location", "contacts"]);
});

test("Q: key appears only in the HTTP auth header; neither errors nor metrics expose it", async () => {
  const { result } = await discoverWith();
  assert.equal(JSON.stringify(result).includes(secret), false);
  const failing = async (response) => discoverGeminiCandidates({ env, stableKey, maxCandidates: 3,
    fetchImpl: async () => response });
  for (const badResponse of [
    new Response(secret, { status: 403 }),
    new Response(secret, { status: 503 }),
    new Response(secret, { status: 200 }),
  ]) await assert.rejects(failing(badResponse), (error) =>
    !JSON.stringify(error).includes(secret) && !String(error).includes(secret));
});

test("R-S: classified 401/403/429/5xx, network failure and timeout, all via injected mocks", async () => {
  for (const [status, code] of [[401, "AUTH_FAILED"], [403, "AUTH_FAILED"], [429, "RATE_LIMITED"], [500, "PROVIDER_ERROR"]]) {
    await assert.rejects(discoverGeminiCandidates({ env, stableKey, maxCandidates: 3,
      fetchImpl: async () => new Response("secret error", { status }) }),
    (error) => error.code === code && error.httpStatus === status);
  }
  await assert.rejects(discoverGeminiCandidates({ env, stableKey, maxCandidates: 3,
    fetchImpl: async () => { throw Error("unsafe private transport details"); } }),
    (error) => error.code === "PROVIDER_ERROR" && !String(error).includes("private"));
  await assert.rejects(discoverGeminiCandidates({ env, stableKey, maxCandidates: 3, timeoutMs: 1,
    fetchImpl: async (_, init) => new Promise((_, reject) => {
      init.signal.addEventListener("abort", () => reject(Error("hidden timeout message")), { once: true });
    }) }), (error) => error.code === "TIMEOUT");
});

test("grounded discovery default accepts response after simulated 13s, with one request and no real wait", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  let signal;
  const pending = discoverGeminiCandidates({
    env, stableKey, maxCandidates: 3,
    fetchImpl: async (_endpoint, init) => {
      calls++;
      signal = init.signal;
      return new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(Error("unexpected abort")), { once: true });
        setTimeout(() => resolve(new Response(JSON.stringify(mockResponse()))), 13_000);
      });
    },
  });
  assert.equal(calls, 1);
  t.mock.timers.tick(12_999);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  const result = await pending;
  assert.equal(result.providerMetrics.requestCount, 1);
  assert.equal(result.providerMetrics.groundedSearchQueryCount, 2);
  assert.equal(result.candidates.length, 1);
  assert.equal(signal.aborted, false);
  assert.equal(calls, 1);
});

test("grounded discovery aborts at 60s for default and oversized override, never retries", async (t) => {
  for (const [label, timeoutOption] of [
    ["default", {}],
    ["hard max", { timeoutMs: 120_000 }],
  ]) {
    await t.test(label, async (subtest) => {
      subtest.mock.timers.enable({ apis: ["setTimeout"] });
      let calls = 0;
      let signal;
      const pending = discoverGeminiCandidates({
        env, stableKey, maxCandidates: 3, ...timeoutOption,
        fetchImpl: async (_endpoint, init) => {
          calls++;
          signal = init.signal;
          return new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(Error("mocked abort")), { once: true });
          });
        },
      });
      assert.equal(calls, 1);
      subtest.mock.timers.tick(59_999);
      assert.equal(signal.aborted, false);
      subtest.mock.timers.tick(1);
      assert.equal(signal.aborted, true);
      await assert.rejects(pending, (error) =>
        error instanceof GeminiAutomationError && error.code === "TIMEOUT");
      assert.equal(calls, 1, "TIMEOUT must never trigger a retry");
    });
  }
});

test("model compatibility and missing key fail before network (default 2.5 is not silently upgraded)", async () => {
  let calls = 0;
  for (const value of [{}, { GEMINI_API_KEY: secret }, { ...env, GEMINI_MODEL: "gemini-2.5-flash" }]) {
    await assert.rejects(discoverGeminiCandidates({ env: value, stableKey, maxCandidates: 3,
      fetchImpl: async () => { calls++; throw Error("must not run"); } }),
      (error) => error.code === "CONFIG_MISSING");
  }
  assert.equal(calls, 0);
});

test("T-W: pure discovery has no DB write, Notion/dedupe, scheduler or admin-run wiring", () => {
  const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
  for (const path of [
    "lib/gemini-automation-discovery.ts", "lib/gemini-automation-discovery-contract.ts",
  ]) {
    assert.doesNotMatch(source(path), /db\.prepare|notion[-_]|data-automation-|gemini_candidates|fetch\(.*https?:\/\/[^g]/i);
  }
  assert.doesNotMatch(source("app/api/admin/gemini-automation/route.ts"), /discoverGeminiCandidates|createDiscoveryInteraction/);
  assert.doesNotMatch(source("lib/gemini-automation-admin-store.ts"), /discoverGeminiCandidates|generateContent|runGeminiAutomation/);
  assert.doesNotMatch(source("lib/gemini-automation-runner.ts"), /discoverGeminiCandidates/);
  for (const path of ["lib/gemini-automation-discovery.ts", "lib/gemini-automation-discovery-contract.ts", "tests/gemini-automation-discovery.test.mjs"]) {
    const scopes = classifyChangedFiles([path]);
    assert.ok(scopes.scopes.includes("GEMINI_AUTOMATION"), path);
    assert.equal(scopes.fullCore, false);
    assert.equal(scopes.automationBroad, false);
  }
});


/** Fixtures reflect the post-May-2026 Interactions steps contract:
 * https://ai.google.dev/api/interactions-api and /api/interactions-api-v1
 * No live Gemini requests are made by this suite. */
const mockedInteraction = async (payload, onCall = () => {}) =>
  discoverGeminiCandidates({
    env, stableKey, maxCandidates: 3,
    fetchImpl: async () => {
      onCall();
      return new Response(JSON.stringify(payload), { status: 200 });
    },
  });

test("Interactions documented google_search_call arguments.queries and arguments.query both count", async () => {
  const plural = mockResponse();
  assert.equal((await mockedInteraction(plural)).providerMetrics.groundedSearchQueryCount, 2);
  const singular = mockResponse();
  singular.steps[0].arguments = { query: "treneri psov Nitra" };
  assert.equal((await mockedInteraction(singular)).providerMetrics.groundedSearchQueryCount, 1);
  for (const args of [
    {}, { query: "" }, { query: "   " }, { query: "x".repeat(301) },
    { query: 5 }, { queries: [] }, { queries: [""] },
    { queries: ["valid", "  "] }, { queries: Array.from({ length: 31 }, () => "test") },
    { queries: ["x".repeat(301)] }, { query: "valid", queries: ["also valid"] },
    { queries: ["valid"], unrecognized: true },
  ]) {
    const invalid = mockResponse();
    invalid.steps[0].arguments = args;
    await assert.rejects(mockedInteraction(invalid), isInvalid);
  }
});

test("google_search_result requires real matched successful result step, not its textual contents", async () => {
  const valid = mockResponse();
  assert.equal((await mockedInteraction(valid)).providerMetrics.candidateCount, 1);
  const wrongId = mockResponse();
  wrongId.steps[1].call_id = "search_call_not_present";
  await assert.rejects(mockedInteraction(wrongId), isInvalid);
  const noResult = mockResponse();
  delete noResult.steps[1].result;
  await assert.rejects(mockedInteraction(noResult), isInvalid);
  const errorResult = mockResponse();
  errorResult.steps[1].is_error = true;
  await assert.rejects(mockedInteraction(errorResult), isInvalid);
});

test("structured JSON can span multiple model_output text blocks and annotations can be split", async () => {
  const response = mockResponse();
  const full = response.steps[2].content[0].text;
  const midpoint = Math.floor(full.length / 2);
  response.steps[2].content = [
    { type: "text", text: full.slice(0, midpoint), annotations: [] },
    { type: "text", text: full.slice(midpoint), annotations: [{ type: "url_citation", url }] },
  ];
  const result = await mockedInteraction(response);
  assert.deepEqual(result.candidates, [candidate()]);
});

test("canonical equivalent absolute URLs match source evidence and citation without accepting alien sources", async () => {
  const data = envelope();
  data.candidates[0].primary_url = "https://example.sk";
  data.candidates[0].source_urls = ["https://example.sk/", "https://example.sk", url];
  data.candidates[0].evidence = [{ source_url: "https://example.sk", fields: ["name"] }];
  const normalized = parseGeminiDiscoveryEnvelope(data, request());
  assert.equal(normalized.candidates[0].primary_url, "https://example.sk/");
  assert.deepEqual(normalized.candidates[0].source_urls, ["https://example.sk/", url]);
  assert.deepEqual(normalized.candidates[0].evidence[0].source_url, "https://example.sk/");
  const interaction = mockResponse(data, { citationUrl: "https://example.sk/" });
  assert.equal((await mockedInteraction(interaction)).candidates.length, 1);
  const alien = mockResponse(data, { citationUrl: "https://unrelated.sk/" });
  await assert.rejects(mockedInteraction(alien), isInvalid);
});

test("INVALID_RESPONSE has bounded phase-specific diagnostics and never changes public error code", async () => {
  const base = () => mockResponse();
  const changed = (fn) => { const value = base(); fn(value); return value; };
  const cases = [
    ["INTERACTION_SHAPE", 9],
    ["INTERACTION_STATUS", changed((v) => { v.status = "requires_action"; })],
    ["STEPS_INVALID", changed((v) => { v.steps = [null]; })],
    ["SEARCH_CALL_INVALID", changed((v) => { v.steps[0].arguments = { query: "" }; })],
    ["SEARCH_RESULT_INVALID", changed((v) => { v.steps[1].result = false; })],
    ["SEARCH_RESULT_MISSING", changed((v) => { v.steps.splice(1, 1); })],
    ["MODEL_OUTPUT_INVALID", changed((v) => { v.steps[2].content = [{ type: "image", data: "private" }]; })],
    ["OUTPUT_JSON_INVALID", changed((v) => { v.steps[2].content[0].text = "{not JSON"; })],
    ["DISCOVERY_SCHEMA_INVALID", changed((v) => { v.steps[2].content[0].text = JSON.stringify({ schema_version: 1, category_key: stableKey, candidates: [{ ...candidate(), name: "" }] }); })],
    ["GROUNDING_CITATION_MISSING", changed((v) => { v.steps[2].content[0].annotations = []; })],
    ["EVIDENCE_NOT_GROUNDED", changed((v) => { v.steps[2].content[0].annotations = [{ type: "url_citation", url: "https://unrelated.sk" }]; })],
    ["RESPONSE_TOO_LARGE", changed((v) => { v.steps[2].content[0].text = "z".repeat(100_001); })],
  ];
  const warn = console.warn;
  const logs = [];
  console.warn = (...args) => { logs.push(args); };
  try {
    for (const [reason, value] of cases) {
      const before = logs.length;
      await assert.rejects(mockedInteraction(value), isInvalid);
      assert.equal(logs.length, before + 1, reason);
      const [event, metadata] = logs.at(-1);
      assert.equal(event, "gemini_discovery_invalid_response");
      assert.equal(metadata.reason, reason);
      assert.equal(metadata.schemaValid, ["GROUNDING_CITATION_MISSING", "EVIDENCE_NOT_GROUNDED"].includes(reason));
      assert.deepEqual(Object.keys(metadata), [
        "reason", "status", "stepCount", "stepTypes", "modelOutputBlocks",
        "googleSearchCalls", "googleSearchResults", "citations", "urlCitationAnnotations",
        "validCitationUrls", "searchResultUrls", "urlContextCalls", "urlContextResults",
        "successfulUrlContextUrls", "groundedEvidenceMatches", "jsonParsed", "schemaValid",
      ]);
      assert.ok(metadata.stepCount >= 0 && metadata.stepCount <= 81);
      assert.ok(metadata.stepTypes.length <= 8);
    }
  } finally {
    console.warn = warn;
  }
});

test("diagnostic logging strips provider body, prompt, search query, URL, candidate facts and API key", async () => {
  const sentinel = "PRIVATE_SENTINEL_DO_NOT_LOG";
  const response = mockResponse();
  response.steps[0].arguments = { query: sentinel };
  response.steps[1].result = [{ search_suggestions: sentinel, url: "https://private-host.sk/sensitive" }];
  const fake = envelope();
  fake.candidates[0].name = sentinel;
  fake.candidates[0].contacts.email = "private@example.sk";
  response.steps[2].content[0].text = JSON.stringify(fake);
  response.steps[2].content[0].annotations = [{ type: "url_citation", url: "https://unrelated.sk/private" }];
  const logs = [];
  const warn = console.warn;
  console.warn = (...args) => { logs.push(args); };
  let providerRequests = 0;
  try {
    await assert.rejects(mockedInteraction(response, () => { providerRequests++; }), isInvalid);
  } finally {
    console.warn = warn;
  }
  assert.equal(providerRequests, 1, "failed validation must not retry");
  assert.equal(logs.length, 1);
  const diagnostic = JSON.stringify(logs);
  for (const forbidden of [sentinel, "private@example.sk", "private-host.sk", "unrelated.sk",
    secret, "Search grounding", "source_urls", "candidate", "PRIVATE"]) {
    assert.equal(diagnostic.includes(forbidden), false, forbidden);
  }
  const original = readFileSync(new URL("../lib/gemini-automation-discovery.ts", import.meta.url), "utf8");
  assert.doesNotMatch(original, /console\.(?:log|info|warn|error)\s*\([^\n]*(?:raw|response\.text|options\.prompt|candidate\.name)/);
});


/** Wire shapes from https://ai.google.dev/api/interactions-api (v1beta URL Context steps). */
const withoutCitations = () => mockResponse(envelope(), { citations: false });
function appendContext(interaction, {
  urlToRequest = url, urlToReturn = url, status = "success",
  isError = false, callId = "uc_1",
} = {}) {
  interaction.steps.splice(-1, 0,
    { type: "url_context_call", id: callId, arguments: { urls: [urlToRequest] } },
    { type: "url_context_result", call_id: callId, is_error: isError,
      result: [{ url: urlToReturn, status }] });
  return interaction;
}
async function reasonFrom(interaction) {
  const warn = console.warn;
  const events = [];
  console.warn = (...args) => events.push(args);
  let count = 0;
  try {
    await assert.rejects(mockedInteraction(interaction, () => { count++; }),
      (e) => isInvalid(e) && !JSON.stringify(e).includes(secret));
  } finally { console.warn = warn; }
  assert.equal(count, 1, "one provider call and no retry");
  assert.equal(events.length, 1);
  assert.equal(events[0][0], "gemini_discovery_invalid_response");
  return events[0][1];
}

test("provenance: v1beta url_citation.url validates; undocumented annotation.uri is not trusted", async () => {
  assert.equal((await mockedInteraction(mockResponse())).candidates.length, 1);
  const invalid = withoutCitations();
  invalid.steps.at(-1).content[0].annotations = [{ type: "url_citation", uri: url }];
  assert.equal((await reasonFrom(invalid)).reason, "GROUNDING_CITATION_MISSING");
});

test("provenance: seven genuine search calls/results and valid JSON still fail without grounded source URL", async () => {
  const interaction = withoutCitations();
  interaction.steps = [
    ...Array.from({ length: 7 }, (_, i) => [
      { type: "google_search_call", id: "search_" + i, arguments: { query: "query " + i } },
      { type: "google_search_result", call_id: "search_" + i,
        result: [{ search_suggestions: "<a href='" + url + "'>model-untrusted</a>" }] },
    ]).flat(),
    interaction.steps.at(-1),
  ];
  const safe = await reasonFrom(interaction);
  assert.equal(safe.reason, "GROUNDING_CITATION_MISSING");
  assert.equal(safe.googleSearchCalls, 7);
  assert.equal(safe.googleSearchResults, 7);
  assert.equal(safe.searchResultUrls, 0);
  assert.equal(safe.jsonParsed, true);
  assert.equal(safe.schemaValid, true);
});

test("provenance: successful URL Context result authenticates matching evidence without inline citation", async () => {
  const data = appendContext(withoutCitations());
  let calls = 0;
  const result = await mockedInteraction(data, () => { calls++; });
  assert.equal(calls, 1);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.providerMetrics.groundedSearchQueryCount, 2);
  assert.equal(result.providerMetrics.requestCount, 1);
});

test("provenance: URL Context error, paywall, unsafe and non-public URL never authenticate candidates", async () => {
  for (const status of ["error", "paywall", "unsafe"]) {
    const details = await reasonFrom(appendContext(withoutCitations(), { status }));
    assert.equal(details.reason, "GROUNDING_CITATION_MISSING", status);
    assert.equal(details.successfulUrlContextUrls, 0, status);
  }
  for (const bad of ["http://127.0.0.1/admin", "http://localhost/private",
    "https://10.0.0.1/private", "file:///secret", "https://user:pass@example.sk/"]) {
    const details = await reasonFrom(appendContext(withoutCitations(), {
      urlToRequest: bad, urlToReturn: bad,
    }));
    assert.equal(details.reason, "URL_CONTEXT_CALL_INVALID");
  }
  const errorStep = appendContext(withoutCitations(), { isError: true });
  assert.equal((await reasonFrom(errorStep)).reason, "GROUNDING_CITATION_MISSING");
});

test("provenance: URL Context URL must match requested call_id and exact candidate evidence", async () => {
  const unrelated = appendContext(withoutCitations(), {
    urlToRequest: "https://other.sk/source", urlToReturn: "https://other.sk/source",
  });
  assert.equal((await reasonFrom(unrelated)).reason, "EVIDENCE_NOT_GROUNDED");
  const forged = appendContext(withoutCitations(), {
    urlToRequest: "https://unrelated.sk", urlToReturn: url,
  });
  assert.equal((await reasonFrom(forged)).reason, "GROUNDING_CITATION_MISSING");
  const orphan = appendContext(withoutCitations());
  orphan.steps.find((x) => x.type === "url_context_result").call_id = "unknown";
  assert.equal((await reasonFrom(orphan)).reason, "URL_CONTEXT_RESULT_INVALID");
});

test("provenance: official Google Search result only exposes HTML suggestions, never source URLs", async () => {
  const interaction = withoutCitations();
  interaction.steps.find((x) => x.type === "google_search_result").result = [
    { search_suggestions: '<a href="' + url + '">click</a>', url },
  ];
  const details = await reasonFrom(interaction);
  assert.equal(details.reason, "GROUNDING_CITATION_MISSING");
  assert.equal(details.searchResultUrls, 0);
});

test("provenance: canonical hostname and origin slash match only for provider success URLs", async () => {
  const data = envelope();
  data.candidates[0].primary_url = "https://example.sk";
  data.candidates[0].source_urls = ["https://EXAMPLE.sk/", url];
  data.candidates[0].evidence = [{ source_url: "https://EXAMPLE.sk", fields: ["name"] }];
  const output = mockResponse(data, { citations: false });
  appendContext(output, { urlToRequest: "https://example.sk/", urlToReturn: "https://example.sk" });
  assert.equal((await mockedInteraction(output)).candidates.length, 1);
});

test("provenance: diagnostic metadata does not disclose provider URLs, model output or search texts", async () => {
  const sentinel = "PRIVATE_QUERY_NEVER_LOG_ME";
  const response = appendContext(withoutCitations(), {
    urlToRequest: "https://other-private.sk/directory?secret=yes",
    urlToReturn: "https://other-private.sk/directory?secret=yes",
  });
  response.steps[0].arguments = { query: sentinel };
  response.steps[1].result = [{ search_suggestions: "<a href='" + url + "'>" + sentinel + "</a>" }];
  const details = await reasonFrom(response);
  assert.equal(details.reason, "EVIDENCE_NOT_GROUNDED");
  const diagnostic = JSON.stringify(details);
  for (const forbidden of [url, sentinel, "other-private.sk", "directory?secret=yes",
    secret, "Psia škola", "example.sk", "name", "contacts"]) {
    assert.equal(diagnostic.includes(forbidden), false, forbidden);
  }
  assert.equal(details.urlContextCalls, 1);
  assert.equal(details.urlContextResults, 1);
  assert.equal(details.successfulUrlContextUrls, 1);
  assert.equal(details.groundedEvidenceMatches, 0);
});

test("provenance: failed validation carries bounded search query count only, not provider content", async () => {
  const value = withoutCitations();
  let calls = 0;
  const warn = console.warn;
  console.warn = () => {};
  try {
    await assert.rejects(mockedInteraction(value, () => { calls++; }), (error) => {
      assert.equal(error.code, "INVALID_RESPONSE");
      assert.equal(error.groundedSearchQueryCount, 2);
      assert.equal(Object.hasOwn(error, "payload"), false);
      assert.equal(JSON.stringify(error).includes(url), false);
      return true;
    });
  } finally { console.warn = warn; }
  assert.equal(calls, 1);
});
