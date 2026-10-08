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
        { type: "google_search_call", arguments: { queries: ["Psia skola Slovensko", "treneri psov Nitra"] } },
        { type: "google_search_result", result: [{ search_suggestions: "<not-persisted>" }] },
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

test("E-F: Interactions API uses only built-in Google Search and strict JSON schema, no store", async () => {
  const { result, calls } = await discoverWith(envelope(), {
    inspect(endpoint, init) {
      assert.equal(endpoint, "https://generativelanguage.googleapis.com/v1beta/interactions");
      assert.equal(init.method, "POST");
      assert.equal(new Headers(init.headers).get("x-goog-api-key"), secret);
      const body = JSON.parse(init.body);
      assert.equal(init.body.includes(secret), false);
      assert.equal(body.model, env.GEMINI_MODEL);
      assert.equal(body.store, false);
      assert.deepEqual(body.tools, [{ type: "google_search" }]);
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
