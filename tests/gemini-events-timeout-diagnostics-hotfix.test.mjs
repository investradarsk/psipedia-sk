import assert from "node:assert/strict";
import test from "node:test";
import {
  discoverGeminiCandidates, discoverGeminiEventCandidates,
} from "../lib/gemini-automation-discovery.ts";

const stableKey = "events.vystavy";
const env = { GEMINI_MODEL: "gemini-3.8-flash", GEMINI_API_KEY: "SECRET_API_KEY" };
const url = "https://example.org/SECRET_SOURCE_URL";
const forbidden = [
  "SECRET_API_KEY","SECRET_PROMPT","SECRET_SEARCH_QUERY","SECRET_SOURCE_URL",
  "SECRET_EVENT_TITLE","SECRET_ORGANIZER","SECRET_BODY","SECRET_PROVIDER_PAYLOAD",
  "SECRET_NETWORK_ERROR",
];
const candidate = () => ({
  title: "SECRET_EVENT_TITLE", organizer: "SECRET_ORGANIZER",
  start_date: "2030-05-01", start_time: "09:00", end_date: null, end_time: null,
  all_day: false, venue: "Nitra arena", city: "Nitra", region: null, online: false,
  event_url: null, registration_url: null,
  description: "Publicly announced exhibition with independently supported event details.",
  source_urls: [url],
  evidence: [{ source_url: url, fields: ["title","organizer","start_date","city"] }],
  cancelled: false,
});
function responsePayload(event = candidate()) {
  return {
    status: "completed", private: "SECRET_PROVIDER_PAYLOAD",
    steps: [
      { type: "google_search_call", id: "gs", arguments: { queries: ["SECRET_SEARCH_QUERY"] } },
      { type: "google_search_result", call_id: "gs", result: [{ private: "SECRET_BODY" }] },
      { type: "model_output", content: [{ type: "text", text: JSON.stringify({
        schema_version: 1, category_key: stableKey, candidates: [event],
      }) }] },
    ],
  };
}
function mocked(options = {}) {
  return discoverGeminiEventCandidates({ env, stableKey, maxCandidates: 1, ...options });
}
async function capture(run) {
  const previousInfo = console.info;
  const previousWarn = console.warn;
  const infos = [], warns = [];
  console.info = (...values) => infos.push(values);
  console.warn = (...values) => warns.push(values);
  try {
    await run({ infos, warns });
  } finally {
    console.info = previousInfo;
    console.warn = previousWarn;
  }
  const timing = infos.filter(([name]) => name === "gemini_event_discovery_timing");
  assert.equal(timing.length, infos.length, "Event info logs must be fixed timing telemetry only");
  assert.equal(timing.length, 1, "exactly one timing record per Event attempt");
  const payload = timing[0][1];
  assert.deepEqual(Object.keys(payload).sort(), [
    "abortTriggered","elapsedMs","failurePhase","httpStatus","parsingResponseMs",
    "phase","preflightMs","readingBodyMs","responseHeadersReceived",
    "validatingEventMs","waitingResponseMs",
  ].filter(key => key in payload).sort());
  assert.ok(["COMPLETED","TIMEOUT","NETWORK_ERROR","HTTP_ERROR","INVALID_RESPONSE"].includes(payload.phase));
  for (const key of ["elapsedMs","preflightMs","waitingResponseMs","readingBodyMs","parsingResponseMs","validatingEventMs"]) {
    assert.ok(Number.isSafeInteger(payload[key]) && payload[key] >= 0 && payload[key] <= 180_000, key);
  }
  assert.equal(typeof payload.responseHeadersReceived, "boolean");
  assert.equal(typeof payload.abortTriggered, "boolean");
  if (payload.httpStatus !== undefined) {
    assert.ok(Number.isSafeInteger(payload.httpStatus) && payload.httpStatus >= 100 && payload.httpStatus <= 599);
  }
  if (payload.failurePhase !== undefined) assert.ok([
    "EVENT_PREFLIGHT","WAITING_RESPONSE","RESPONSE_HEADERS","READING_BODY",
    "PARSING_RESPONSE","VALIDATING_EVENT",
  ].includes(payload.failurePhase));
  const serialized = JSON.stringify({ infos, warns });
  for (const secret of forbidden) assert.equal(serialized.includes(secret), false, secret);
  return { payload, infos, warns };
}

test("Event timeout waiting for HTTP headers captures abort and has no provider retry", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let requests = 0, signal;
  const result = await capture(async () => {
    const pending = mocked({ timeoutMs: 120_000, fetchImpl: async (_url, init) => {
      requests++;
      signal = init.signal;
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("SECRET_NETWORK_ERROR")), { once: true });
      });
    } });
    assert.equal(requests, 1);
    t.mock.timers.tick(119_999);
    assert.equal(signal.aborted, false);
    t.mock.timers.tick(1);
    await assert.rejects(pending, error => error.code === "TIMEOUT");
    assert.equal(signal.aborted, true);
  });
  assert.equal(requests, 1);
  assert.equal(result.payload.phase, "TIMEOUT");
  assert.equal(result.payload.failurePhase, "WAITING_RESPONSE");
  assert.equal(result.payload.responseHeadersReceived, false);
  assert.equal(result.payload.abortTriggered, true);
  assert.equal(result.payload.httpStatus, undefined);
});

test("Event timeout after HTTP headers while reading response body", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let requests = 0;
  let bodyRead;
  const bodyReadPromise = new Promise(resolve => { bodyRead = resolve; });
  const result = await capture(async () => {
    const pending = mocked({ timeoutMs: 120_000, fetchImpl: async (_url, init) => {
      requests++;
      // A minimal fetch Response double signals the exact body.read boundary.
      // Its read rejects on abort, matching the real fetch body's semantics.
      return {
        status: 200, ok: true, headers: new Headers(),
        text() {
          bodyRead();
          return new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () =>
              reject(new Error("SECRET_BODY")), { once: true });
          });
        },
      };
    } });
    await bodyReadPromise;
    t.mock.timers.tick(120_000);
    await assert.rejects(pending, error => error.code === "TIMEOUT");
  });
  assert.equal(requests, 1);
  assert.equal(result.payload.phase, "TIMEOUT");
  assert.equal(result.payload.failurePhase, "READING_BODY");
  assert.equal(result.payload.responseHeadersReceived, true);
  assert.equal(result.payload.httpStatus, 200);
  assert.equal(result.payload.abortTriggered, true);
});

test("valid grounded Event is accepted, with complete timing and no schema changes", async () => {
  let requests = 0;
  const result = await capture(async ({ warns }) => {
    const found = await mocked({ fetchImpl: async () => {
      requests++;
      return new Response(JSON.stringify(responsePayload()), { status: 200 });
    } });
    assert.equal(found.providerMetrics.requestCount, 1);
    assert.equal(found.candidates.length, 1);
    assert.deepEqual(warns, []);
  });
  assert.equal(requests, 1);
  assert.equal(result.payload.phase, "COMPLETED");
  assert.equal(result.payload.responseHeadersReceived, true);
  assert.equal(result.payload.httpStatus, 200);
  assert.equal(result.payload.abortTriggered, false);
  assert.equal(result.payload.failurePhase, undefined);
});

test("invalid Event retains PR #727 reason and records the validation phase only", async () => {
  const result = await capture(async ({ warns }) => {
    await assert.rejects(mocked({ fetchImpl: async () =>
      new Response(JSON.stringify(responsePayload({ ...candidate(), online: "SECRET_BODY" })), { status: 200 }),
    }), error => error.code === "INVALID_RESPONSE");
    assert.equal(warns.length, 1);
    assert.equal(warns[0][0], "gemini_discovery_invalid_response");
    assert.equal(warns[0][1].reason, "DISCOVERY_SCHEMA_INVALID");
    assert.equal(warns[0][1].schemaFailure, "FIELD_TYPE_OR_VALUE");
    assert.equal(warns[0][1].schemaField, "online");
    assert.equal(warns[0][1].candidateIndex, 0);
  });
  assert.equal(result.payload.phase, "INVALID_RESPONSE");
  assert.equal(result.payload.failurePhase, "VALIDATING_EVENT");
  assert.equal(result.payload.responseHeadersReceived, true);
});

test("unparseable HTTP JSON is classified at PARSING_RESPONSE without payload leakage", async () => {
  const result = await capture(async () => {
    await assert.rejects(mocked({ fetchImpl: async () =>
      new Response("SECRET_BODY not-json", { status: 200 }),
    }), error => error.code === "INVALID_RESPONSE");
  });
  assert.equal(result.payload.phase, "INVALID_RESPONSE");
  assert.equal(result.payload.failurePhase, "PARSING_RESPONSE");
  assert.equal(result.payload.responseHeadersReceived, true);
});

test("network errors before headers do not masquerade as timeouts", async () => {
  let requests = 0;
  const result = await capture(async ({ warns }) => {
    await assert.rejects(mocked({ fetchImpl: async () => {
      requests++;
      throw new Error("SECRET_NETWORK_ERROR");
    } }), error => error.code === "PROVIDER_ERROR");
    assert.deepEqual(warns, [["gemini_discovery_provider_error", { reason: "NETWORK_ERROR" }]]);
  });
  assert.equal(requests, 1);
  assert.equal(result.payload.phase, "NETWORK_ERROR");
  assert.equal(result.payload.failurePhase, "WAITING_RESPONSE");
  assert.equal(result.payload.responseHeadersReceived, false);
  assert.equal(result.payload.abortTriggered, false);
});

test("Event preflight failure occurs without provider request or unsafe values", async () => {
  let requests = 0;
  const result = await capture(async () => {
    await assert.rejects(mocked({
      stableKey: "events.invalid",
      fetchImpl: async () => { requests++; throw new Error("SECRET_PROVIDER_PAYLOAD"); },
    }));
  });
  assert.equal(requests, 0);
  assert.equal(result.payload.phase, "INVALID_RESPONSE");
  assert.equal(result.payload.failurePhase, "EVENT_PREFLIGHT");
  assert.equal(result.payload.responseHeadersReceived, false);
});

test("Directory remains silent on Event telemetry and retains prior transport handling", async () => {
  let requests = 0;
  const infos = [], warns = [];
  const oldInfo = console.info, oldWarn = console.warn;
  console.info = (...args) => infos.push(args);
  console.warn = (...args) => warns.push(args);
  try {
    await assert.rejects(discoverGeminiCandidates({
      env, stableKey: "directory.fyzioterapia", maxCandidates: 1,
      fetchImpl: async () => { requests++; throw new Error("SECRET_NETWORK_ERROR"); },
    }), error => error.code === "PROVIDER_ERROR");
  } finally {
    console.info = oldInfo;
    console.warn = oldWarn;
  }
  assert.equal(requests, 1);
  assert.deepEqual(infos, []);
  assert.deepEqual(warns, [["gemini_discovery_provider_error", { reason: "NETWORK_ERROR" }]]);
});
