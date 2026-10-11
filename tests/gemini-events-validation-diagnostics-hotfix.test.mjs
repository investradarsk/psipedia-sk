import assert from "node:assert/strict";
import test from "node:test";
import {
  createGeminiEventRequest, parseGeminiEventEnvelope,
} from "../lib/gemini-automation-event-contract.ts";
import { classifyGeminiEventValidationFailure } from "../lib/gemini-automation-event-diagnostics.ts";
import { discoverGeminiEventCandidates } from "../lib/gemini-automation-discovery.ts";

const stableKey = "events.vystavy";
const request = createGeminiEventRequest({ stableKey, maxCandidates: 2 });
const url = "https://example.org/events?reference=SECRET_URL_VALUE";
const secretMarkers = [
  "SECRET_EVENT_TITLE","SECRET_ORGANIZER","SECRET_ADDRESS","SECRET_URL_VALUE",
  "SECRET_SEARCH_QUERY","SECRET_PROVIDER_PAYLOAD","SECRET_API_KEY","SECRET_UNKNOWN_KEY",
];
const env = { GEMINI_API_KEY: "SECRET_API_KEY", GEMINI_MODEL: "gemini-3.8-flash" };

function candidate(changes = {}) {
  return {
    title: "SECRET_EVENT_TITLE", organizer: "SECRET_ORGANIZER",
    start_date: "2030-05-01", start_time: "09:00", end_date: null, end_time: null,
    all_day: false, venue: "SECRET_ADDRESS", city: "Nitra", region: null, online: false,
    event_url: null, registration_url: null,
    description: "Official dog exhibition with a confirmed date and a source-backed venue.",
    source_urls: [url],
    evidence: [{ source_url: url, fields: ["title","organizer","start_date","city"] }],
    cancelled: false, ...changes,
  };
}
function envelope(value = candidate()) {
  return { schema_version: 1, category_key: stableKey, candidates: [value] };
}
function without(field) {
  const value = candidate();
  delete value[field];
  return value;
}
function groundedPayload(output) {
  return {
    status: "completed", providerPrivate: "SECRET_PROVIDER_PAYLOAD",
    steps: [
      { type: "google_search_call", id: "gs", arguments: { queries: ["SECRET_SEARCH_QUERY"] } },
      { type: "google_search_result", call_id: "gs", result: [{ private: "SECRET_PROVIDER_PAYLOAD" }] },
      { type: "model_output", content: [{ type: "text", text: JSON.stringify(output) }] },
    ],
  };
}
function parse(output) {
  return parseGeminiEventEnvelope(output,request,"2026-10-10");
}
async function assertSafeRejection(output, expected, field, index) {
  const invalid = error => error?.code === "INVALID_RESPONSE";
  assert.throws(() => parse(output),invalid,"authoritative parser must still reject");
  const classification = classifyGeminiEventValidationFailure(output,request,"2026-10-10");
  assert.deepEqual(classification, {
    schemaFailure: expected,
    ...(field === undefined ? {} : { schemaField: field }),
    ...(index === undefined ? {} : { candidateIndex: index }),
  });
  const warnings = [];
  const original = console.warn;
  let requests = 0;
  try {
    console.warn = (...args) => warnings.push(args);
    await assert.rejects(discoverGeminiEventCandidates({
      env, stableKey, maxCandidates: 2,
      fetchImpl: async () => {
        requests++;
        return new Response(JSON.stringify(groundedPayload(output)), { status: 200 });
      },
    }), invalid);
  } finally {
    console.warn = original;
  }
  assert.equal(requests,1,"no retries or extra Gemini requests");
  assert.equal(warnings.length,1);
  assert.equal(warnings[0][0],"gemini_discovery_invalid_response");
  const diagnostic = warnings[0][1];
  assert.equal(diagnostic.reason,"DISCOVERY_SCHEMA_INVALID");
  assert.equal(diagnostic.jsonParsed,true);
  assert.equal(diagnostic.schemaValid,false);
  assert.equal(diagnostic.schemaFailure,expected);
  assert.equal(diagnostic.schemaField,field);
  assert.equal(diagnostic.candidateIndex,index);
  assert.equal(diagnostic.googleSearchCalls,1);
  assert.equal(diagnostic.googleSearchResults,1);
  const serialized = JSON.stringify(warnings);
  for (const secret of secretMarkers) assert.equal(serialized.includes(secret),false,secret);
  assert.deepEqual(Object.keys(diagnostic).filter(k => k.startsWith("schema") || k==="candidateIndex"),
    ["schemaValid","schemaFailure",...(field === undefined ? [] : ["schemaField"]),
      ...(index === undefined ? [] : ["candidateIndex"])]);
  assert.ok(diagnostic.candidateIndex === undefined ||
    (Number.isSafeInteger(diagnostic.candidateIndex) && diagnostic.candidateIndex >= 0 && diagnostic.candidateIndex < 5));
}

const cases = [
  ["wrong envelope/category", envelope(), "ENVELOPE_OR_CATEGORY","category_key",undefined,
    value => ({ ...value, category_key:"SECRET_PROVIDER_PAYLOAD" })],
  ["extra envelope key", envelope(), "ENVELOPE_OR_CATEGORY",undefined,undefined,
    value => ({ ...value, extra_private:"SECRET_PROVIDER_PAYLOAD" })],
  ["missing mandatory key", envelope(without("cancelled")), "REQUIRED_KEY_MISSING","cancelled",0],
  ["unknown candidate key", envelope(candidate({ SECRET_UNKNOWN_KEY:"SECRET_PROVIDER_PAYLOAD" })),
    "UNKNOWN_KEY",undefined,0],
  ["wrong field type", envelope(candidate({ online:"false" })), "FIELD_TYPE_OR_VALUE","online",0],
  ["malformed calendar date", envelope(candidate({ start_date:"2030-02-30" })), "DATE_TIME_OR_DST","start_date",0],
  ["malformed local time", envelope(candidate({ start_time:"25:30" })), "DATE_TIME_OR_DST","start_time",0],
  ["DST spring gap", envelope(candidate({ start_date:"2030-03-31",start_time:"02:30" })),
    "DATE_TIME_OR_DST","start_time",0],
  ["conflicting all-day fields", envelope(candidate({ all_day:true })),
    "FIELD_COMBINATION","all_day",0],
  ["end date before start", envelope(candidate({ end_date:"2030-04-30" })),
    "FIELD_COMBINATION","end_date",0],
  ["offline event without city", envelope(candidate({ city:null })),
    "OFFLINE_LOCATION_MISSING","city",0],
  ["forbidden URL", envelope(candidate({ event_url:"javascript:SECRET_URL_VALUE" })),
    "URL_INVALID_OR_FORBIDDEN","event_url",0],
  ["private-source URL", envelope(candidate({ source_urls:["http://127.0.0.1/SECRET_URL_VALUE"] })),
    "URL_INVALID_OR_FORBIDDEN","source_urls",0],
  ["empty evidence", envelope(candidate({ evidence:[] })), "EVIDENCE_INVALID","evidence",0],
  ["inadequate source-linked evidence", envelope(candidate({ evidence:[
    { source_url:url, fields:["title","organizer","city"] },
  ] })), "EVIDENCE_INVALID","evidence",0],
  ["evidence source not in sources", envelope(candidate({ evidence:[
    { source_url:"https://other.example.org/SECRET_URL_VALUE", fields:["title","organizer","start_date","city"] },
  ] })), "EVIDENCE_INVALID","source_url",0],
  ["missing nested evidence key", envelope(candidate({ evidence:[{fields:["title"]}] })),
    "REQUIRED_KEY_MISSING","source_url",0],
  ["unknown nested evidence key", envelope(candidate({ evidence:[
    {source_url:url,fields:["title"],SECRET_UNKNOWN_KEY:"SECRET_PROVIDER_PAYLOAD"},
  ] })), "UNKNOWN_KEY",undefined,0],
  ["historical event", envelope(candidate({ start_date:"2020-05-01" })),
    "HISTORICAL_OR_CANCELLED","start_date",0],
  ["cancelled event", envelope(candidate({ cancelled:true })),
    "HISTORICAL_OR_CANCELLED","cancelled",0],
];
for (const [label, raw, category, field, index, transform] of cases) {
  test("Event diagnostics: "+label, async () => {
    const output = transform ? transform(raw) : raw;
    await assertSafeRejection(output,category,field,index);
  });
}
test("Event diagnostics identify the first invalid candidate by a bounded zero-based index",async () => {
  const output = {schema_version:1,category_key:stableKey,
    candidates:[candidate(),candidate({online:"not a boolean"})]};
  await assertSafeRejection(output,"FIELD_TYPE_OR_VALUE","online",1);
});
test("missing #726 nullable fields continue to normalize to null and remain accepted",async () => {
  const c = candidate({online:true,city:null,
    evidence:[{source_url:url,fields:["title","organizer","start_date","online"]}]});
  for(const field of ["start_time","end_date","end_time","venue","city","region","event_url","registration_url"])
    delete c[field];
  const output = envelope(c);
  const parsed = parse(output);
  assert.equal(parsed.candidates.length,1);
  for(const field of ["start_time","end_date","end_time","venue","city","region","event_url","registration_url"])
    assert.equal(parsed.candidates[0][field],null,field);
  const warnings=[];
  const saved=console.warn;
  try {
    console.warn=(...args)=>warnings.push(args);
    const result=await discoverGeminiEventCandidates({
      env,stableKey,maxCandidates:2,
      fetchImpl:async()=>new Response(JSON.stringify(groundedPayload(output)),{status:200}),
    });
    assert.equal(result.candidates.length,1);
  } finally { console.warn=saved; }
  assert.deepEqual(warnings,[]);
});
test("unexpected non-JSON-compatible inputs have only an allowlisted safe fallback",()=>{
  const output={schema_version:1,category_key:stableKey,candidates:[
    new Proxy(candidate(),{get(){throw Error("SECRET_PROVIDER_PAYLOAD");}}),
  ]};
  assert.throws(()=>parse(output),/SECRET_PROVIDER_PAYLOAD/);
  assert.deepEqual(classifyGeminiEventValidationFailure(output,request,"2026-10-10"),
    {schemaFailure:"UNCLASSIFIED"});
});
