import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createGeminiEventRequest, buildGeminiEventJsonSchema, parseGeminiEventEnvelope, strictEventDate, strictEventTime, validBratislavaWallClock } from "../lib/gemini-automation-event-contract.ts";
import { createGeminiDiscoveryRequest, buildGeminiDiscoveryJsonSchema } from "../lib/gemini-automation-discovery-contract.ts";
import { discoverGeminiEventCandidates, discoverGeminiCandidates } from "../lib/gemini-automation-discovery.ts";

const env={GEMINI_API_KEY:"SECRET_TEST_KEY",GEMINI_MODEL:"gemini-3.8-flash"};
const stableKey="events.vystavy";
const providerKeys={
  object:new Set(["type","properties","required","additionalProperties","description","title"]),
  string:new Set(["type","enum","format","description","title"]),
  integer:new Set(["type","enum","minimum","maximum","description","title"]),
  number:new Set(["type","enum","minimum","maximum","description","title"]),
  boolean:new Set(["type","description","title"]),
  array:new Set(["type","items","prefixItems","minItems","maxItems","description","title"]),
};
function checkSubset(schema){
  const type=Array.isArray(schema.type)?schema.type.find(t=>t!=="null"):schema.type;
  assert.ok(providerKeys[type],"supported schema type");
  for(const key of Object.keys(schema))assert.ok(providerKeys[type].has(key),"unsupported "+type+"."+key);
  if(type==="object"){
    assert.ok(schema.additionalProperties===false||schema.additionalProperties===undefined);
    assert.ok(Array.isArray(schema.required));
    assert.equal(new Set(schema.required).size,schema.required.length);
    assert.ok(schema.required.every(k=>Object.hasOwn(schema.properties,k)));
    Object.values(schema.properties).forEach(checkSubset);
  }
  if(type==="array")checkSubset(schema.items);
}
test("Event provider schema uses Directory-compatible shape keywords",()=>{
  const schema=buildGeminiEventJsonSchema(createGeminiEventRequest({stableKey,maxCandidates:1}));
  checkSubset(schema);
  const candidate=schema.properties.candidates.items;
  const props=candidate.properties;
  const required=["title","organizer","start_date","all_day","online","description","source_urls","evidence","cancelled"];
  const optional=["start_time","end_date","end_time","venue","city","region","event_url","registration_url"];
  assert.deepEqual(candidate.required,required);
  assert.equal(Object.hasOwn(candidate,"additionalProperties"),false);
  assert.deepEqual(Object.keys(props).filter(k=>!required.includes(k)).sort(),optional.sort());
  assert.deepEqual(schema.required,["schema_version","category_key","candidates"]);
  assert.equal(schema.additionalProperties,false);
  assert.deepEqual(props.source_urls,{type:"array",items:{type:"string"}});
  assert.deepEqual(props.evidence,{type:"array",items:{
    type:"object",properties:{
      source_url:{type:"string"},
      fields:{type:"array",items:{type:"string"}},
    },required:["source_url","fields"],additionalProperties:false,
  }});
  assert.deepEqual(props.start_date,{type:"string"});
  for(const field of ["start_time","end_date","end_time","venue","city","region","event_url","registration_url"])
    assert.deepEqual(props[field],{type:["string","null"]});
  assert.doesNotMatch(JSON.stringify(schema),/"(?:pattern|format)"\s*:/);
  assert.equal(Object.hasOwn(props,"event_type"),false);
  assert.equal(schema.properties.candidates.maxItems,1);
});
test("authoritative strictEventDate remains YYYY-MM-DD, real calendar date, 2000–2100",()=>{
  assert.equal(strictEventDate("2026-10-20"),"2026-10-20");
  for(const bad of ["2026-02-30","20.10.2026","1999-12-31","2101-01-01","2026-10-2"])
    assert.throws(()=>strictEventDate(bad),e=>e.code==="INVALID_RESPONSE");
  assert.equal(strictEventDate("2000-02-29"),"2000-02-29");
  assert.equal(strictEventDate("2100-12-31"),"2100-12-31");
});
async function failedEventRun(fetchImpl,expectedCode,options={}){
  const warnings=[];
  let requests=0;
  const savedWarn=console.warn;
  console.warn=(...parts)=>warnings.push(parts);
  try{
    await assert.rejects(discoverGeminiEventCandidates({
      env,stableKey,maxCandidates:1,timeoutMs:options.timeoutMs,
      knownContext:{serialized:"SECRET_PROMPT_QUERY_SENTINEL"},
      fetchImpl:async (...args)=>{requests++;return fetchImpl(...args);},
    }),e=>e.code===expectedCode&&(options.status===undefined||e.httpStatus===options.status));
  }finally{console.warn=savedWarn;}
  assert.equal(requests,1,"no provider retry or fallback");
  assert.doesNotMatch(JSON.stringify(warnings),/SECRET_TEST_KEY|SECRET_PROMPT_QUERY_SENTINEL|SECRET_PROVIDER_RESPONSE|private transport detail/);
  return warnings;
}
for(const status of [400,500]){
  test("provider HTTP "+status+" remains PROVIDER_ERROR with safe numeric diagnostic",async()=>{
    const warnings=await failedEventRun(async()=>new Response("SECRET_PROVIDER_RESPONSE",{status}),"PROVIDER_ERROR",{status});
    assert.deepEqual(warnings,[["gemini_discovery_provider_error",{httpStatus:status}]]);
  });
}
test("network transport errors use safe NETWORK_ERROR diagnostic without exception leakage",async()=>{
  const warnings=await failedEventRun(async()=>{throw Error("private transport detail: SECRET_PROVIDER_RESPONSE");},"PROVIDER_ERROR");
  assert.deepEqual(warnings,[["gemini_discovery_provider_error",{reason:"NETWORK_ERROR"}]]);
});
for(const status of [401,403,429]){
  test("HTTP "+status+" keeps auth/rate-limit classification",async()=>{
    const code=status===429?"RATE_LIMITED":"AUTH_FAILED";
    const warnings=await failedEventRun(async()=>new Response("SECRET_PROVIDER_RESPONSE",{status}),code,{status});
    assert.deepEqual(warnings,[]);
  });
}
test("abort is still TIMEOUT, not PROVIDER_ERROR or NETWORK_ERROR",async()=>{
  const warnings=await failedEventRun((_url,init)=>new Promise((_resolve,reject)=>{
    init.signal.addEventListener("abort",()=>reject(Error("private transport detail")),{once:true});
  }),"TIMEOUT",{timeoutMs:5});
  assert.deepEqual(warnings,[]);
});
test("Directory discovery remains unchanged with a grounded mock response",async()=>{
  const directoryKey="directory.treneri";
  const request=createGeminiDiscoveryRequest({stableKey:directoryKey,maxCandidates:1});
  const dirSchema=buildGeminiDiscoveryJsonSchema(request);
  assert.equal(dirSchema.properties.candidates.items.properties.name.maxLength,160);
  // Full production-positive-control Directory provider schema baseline, unchanged by this Event-only PR.
  assert.equal(createHash("sha256").update(JSON.stringify(dirSchema)).digest("hex"),
    "5392204dd64cefca0845489ebb15b8b83f42ef221c5ccb538310e551c16dd7fb");
  let calls=0;
  const result=await discoverGeminiCandidates({
    env,stableKey:directoryKey,maxCandidates:1,
    fetchImpl:async(_url,init)=>{
      calls++;
      const body=JSON.parse(init.body);
      assert.deepEqual(body.tools,[{type:"google_search"}]);
      assert.equal(body.store,false);
      assert.equal(body.response_format.schema.properties.category_key.enum[0],directoryKey);
      return new Response(JSON.stringify({status:"completed",steps:[
        {type:"google_search_call",id:"gs",arguments:{queries:["dogs Slovakia"]}},
        {type:"google_search_result",call_id:"gs",result:[]},
        {type:"model_output",content:[{type:"text",text:JSON.stringify({
          schema_version:1,category_key:directoryKey,candidates:[],
        })}]},
      ]}),{status:200});
    },
  });
  assert.equal(calls,1);
  assert.equal(result.providerMetrics.requestCount,1);
  assert.equal(result.providerMetrics.groundedSearchQueryCount,1);
  assert.deepEqual(result.candidates,[]);
});


function schemaKeywords(schema,found=new Set()){
  for(const [k,v] of Object.entries(schema)){
    found.add(k);
    if(k==="properties")Object.values(v).forEach(s=>schemaKeywords(s,found));
    if(k==="items")schemaKeywords(v,found);
  }
  return found;
}
test("Event provider JSON schema has no Event-only validation keywords",()=>{
  const e=buildGeminiEventJsonSchema(createGeminiEventRequest({stableKey,maxCandidates:1}));
  const d=buildGeminiDiscoveryJsonSchema(createGeminiDiscoveryRequest({stableKey:"directory.treneri",maxCandidates:1}));
  const eventOnly=[...schemaKeywords(e)].filter(k=>!schemaKeywords(d).has(k));
  assert.deepEqual(eventOnly,[]);
  assert.equal(schemaKeywords(e).has("format"),false);
  assert.equal(schemaKeywords(e).has("pattern"),false);
  assert.ok(schemaKeywords(d).has("maxLength"));
});
function json400(code,message,extra={}){
  return new Response(JSON.stringify({error:{code,message,...extra}}),{
    status:400,headers:{"content-type":"application/json"},
  });
}
test("HTTP 400 Interactions invalid_request logs allowlisted error.code and safe field path",async()=>{
  const warnings=await failedEventRun(async()=>json400("invalid_request",
    "Invalid field response_format.schema.properties.candidates.items"),"PROVIDER_ERROR",{status:400});
  assert.deepEqual(warnings,[["gemini_discovery_provider_error",{
    httpStatus:400,providerCode:"invalid_request",providerArea:"RESPONSE_FORMAT",
    fieldPath:"response_format.schema.properties.candidates.items",
  }]]);
});
test("failed_precondition and parameter_unknown expose only Interactions codes and fixed area",async()=>{
  const billing=await failedEventRun(async()=>json400("failed_precondition",
    "Billing prerequisite not met; SECRET_PROVIDER_RESPONSE"),"PROVIDER_ERROR",{status:400});
  assert.deepEqual(billing,[["gemini_discovery_provider_error",{
    httpStatus:400,providerCode:"failed_precondition",providerArea:"OTHER",
  }]]);
  const tools=await failedEventRun(async()=>json400("parameter_unknown",
    "Unknown tools[0].type parameter; SECRET_PROVIDER_RESPONSE"),"PROVIDER_ERROR",{status:400});
  assert.deepEqual(tools,[["gemini_discovery_provider_error",{
    httpStatus:400,providerCode:"parameter_unknown",providerArea:"TOOLS",fieldPath:"tools[0].type",
  }]]);
});
test("only fixed providerArea enum values are logged for schema, input and model errors",async()=>{
  for(const [message,area] of [
    ["JSON schema malformed; SECRET_PROVIDER_RESPONSE","SCHEMA"],
    ["Invalid input: SECRET_PROVIDER_RESPONSE","INPUT"],
    ["Unsupported model: SECRET_PROVIDER_RESPONSE","MODEL"],
  ]){
    const warnings=await failedEventRun(async()=>json400("invalid_request",message),
      "PROVIDER_ERROR",{status:400});
    assert.deepEqual(warnings,[["gemini_discovery_provider_error",{
      httpStatus:400,providerCode:"invalid_request",providerArea:area,
    }]]);
  }
});
test("raw provider error.message, nested details, sensitive and random values never reach logs",async()=>{
  const marker="SENSITIVE_RANDOM_6bCwXaP_VERY_PRIVATE";
  const warnings=await failedEventRun(async()=>json400("invalid_request",
    "Invalid input value "+marker+"; SECRET_PROVIDER_RESPONSE",{
      details:{schema_fragment:{secret:marker},request_field_value:marker},
    }),"PROVIDER_ERROR",{status:400});
  const diagnostic=JSON.stringify(warnings);
  for(const forbidden of [marker,"SECRET_PROVIDER_RESPONSE","schema_fragment","request_field_value","details"])
    assert.equal(diagnostic.includes(forbidden),false,forbidden);
  assert.deepEqual(warnings,[["gemini_discovery_provider_error",{
    httpStatus:400,providerCode:"invalid_request",providerArea:"INPUT",
  }]]);
});
test("unsafe paths are discarded, not silently logged as safe prefixes",async()=>{
  for(const unsafe of [
    "response_format.schema.properties.candidates/SECRET_PROVIDER_RESPONSE",
    "response_format.schema.properties.candidates[0].$unsafe",
    "response_format.schema.properties.candidates@private",
    "response_format.schema.properties.candidates$private",
    "response_format.schema.properties.candidates."+("x".repeat(300)),
  ]){
    const warnings=await failedEventRun(async()=>json400("invalid_request",
      "Invalid field "+unsafe),"PROVIDER_ERROR",{status:400});
    assert.equal(Object.hasOwn(warnings[0][1],"fieldPath"),false,unsafe.slice(0,50));
    assert.equal(JSON.stringify(warnings).includes("SECRET_PROVIDER_RESPONSE"),false);
  }
});
test("JSON error bodies above old 4 KiB and below 64 KiB retain provider code",async()=>{
  const warnings=await failedEventRun(async()=>json400("invalid_request",
    "schema invalid "+("Z".repeat(7000))),"PROVIDER_ERROR",{status:400});
  assert.deepEqual(warnings,[["gemini_discovery_provider_error",{
    httpStatus:400,providerCode:"invalid_request",providerArea:"SCHEMA",
  }]]);
});
test("JSON error bodies above 64 KiB are discarded and expose only errorBodyTooLarge",async()=>{
  const long=JSON.stringify({error:{code:"invalid_request",
    message:"SECRET_PROVIDER_RESPONSE"+("Z".repeat(70*1024))}});
  for(const makeResponse of [
    ()=>new Response(long,{status:400,headers:{
      "content-type":"application/json","content-length":String(Buffer.byteLength(long)),
    }}),
    ()=>new Response(new ReadableStream({start(controller){
      controller.enqueue(new TextEncoder().encode(long));controller.close();
    }}),{status:400,headers:{"content-type":"application/json"}}),
  ]){
    const warnings=await failedEventRun(async()=>makeResponse(),"PROVIDER_ERROR",{status:400});
    assert.deepEqual(warnings,[["gemini_discovery_provider_error",{
      httpStatus:400,errorBodyTooLarge:true,
    }]]);
  }
});
test("HTTP 400 untrusted code/status, non-JSON, and invalid JSON never leak raw provider body",async()=>{
  const cases=[
    new Response(JSON.stringify({error:{code:"USER_SECRET",status:"INVALID_ARGUMENT",
      message:"SECRET_PROVIDER_RESPONSE"}}),{status:400,headers:{"content-type":"application/json"}}),
    new Response(JSON.stringify({error:{status:"INVALID_ARGUMENT"}}),{
      status:400,headers:{"content-type":"application/json"}}),
    new Response("{bad JSON SECRET_PROVIDER_RESPONSE",{
      status:400,headers:{"content-type":"application/json"}}),
    new Response(JSON.stringify({error:{code:"invalid_request",message:"SECRET_PROVIDER_RESPONSE"}}),{
      status:400,headers:{"content-type":"text/plain"}}),
  ];
  for(const response of cases){
    const warnings=await failedEventRun(async()=>response,"PROVIDER_ERROR",{status:400});
    assert.equal(JSON.stringify(warnings).includes("SECRET_PROVIDER_RESPONSE"),false);
    assert.equal(JSON.stringify(warnings).includes("INVALID_ARGUMENT"),false);
    if(response===cases[0]){
      assert.deepEqual(warnings,[["gemini_discovery_provider_error",{
        httpStatus:400,providerArea:"OTHER",
      }]]);
    }else{
      assert.deepEqual(warnings,[["gemini_discovery_provider_error",{httpStatus:400}]]);
    }
  }
});
test("Directory HTTP 400 shares the same safe provider parser",async()=>{
  const warnings=[];
  const previous=console.warn;console.warn=(...args)=>warnings.push(args);
  try{
    await assert.rejects(discoverGeminiCandidates({env,stableKey:"directory.treneri",maxCandidates:1,
      fetchImpl:async()=>json400("parameter_unknown","Unknown tools[0].type")}),
      e=>e.code==="PROVIDER_ERROR"&&e.httpStatus===400);
  }finally{console.warn=previous;}
  assert.deepEqual(warnings,[["gemini_discovery_provider_error",{
    httpStatus:400,providerCode:"parameter_unknown",providerArea:"TOOLS",
    fieldPath:"tools[0].type",
  }]]);
});
test("runtime remains strict for Event dates, times, DST, history, evidence, cancellation and null optionals",()=>{
  const req=createGeminiEventRequest({stableKey,maxCandidates:1});
  const url="https://klub.example.sk/vystava";
  const candidate={
    title:"Výstava psov",organizer:"Kynologický klub",start_date:"2026-11-20",
    start_time:"09:00",end_date:null,end_time:null,all_day:false,
    venue:null,city:"Nitra",region:null,online:false,event_url:null,registration_url:null,
    description:"Oficiálne kynologické podujatie pre majiteľov a vystavovateľov psov.",
    source_urls:[url],evidence:[{source_url:url,fields:["title","organizer","start_date","city"]}],cancelled:false,
  };
  const parse=patch=>parseGeminiEventEnvelope({schema_version:1,category_key:stableKey,
    candidates:[{...candidate,...patch}]},req,"2026-10-10").candidates[0];
  assert.equal(parse({}).start_date,"2026-11-20");
  const parseFull=full=>parseGeminiEventEnvelope({schema_version:1,category_key:stableKey,
    candidates:[full]},req,"2026-10-10");
  // Semantic and evidence-bearing required fields still fail closed when omitted.
  for(const field of ["title","organizer","start_date","all_day","online","description",
    "source_urls","evidence","cancelled"]){
    const missing={...candidate};delete missing[field];
    assert.throws(()=>parseFull(missing),e=>e.code==="INVALID_RESPONSE",field);
  }
  assert.throws(()=>parse({unexpected_key:"unsafe"}),e=>e.code==="INVALID_RESPONSE");
  assert.throws(()=>parse({evidence:[{source_url:url,fields:["title","organizer","start_date","city","invented"]}]}),
    e=>e.code==="INVALID_RESPONSE");
  assert.throws(()=>parse({evidence:[{source_url:url,fields:["title","organizer","start_date","city"],extra:"unsafe"}]}),
    e=>e.code==="INVALID_RESPONSE");
  assert.throws(()=>parse({source_urls:[]}),e=>e.code==="INVALID_RESPONSE");
  assert.throws(()=>parse({source_urls:Array(9).fill(url)}),e=>e.code==="INVALID_RESPONSE");
  assert.throws(()=>parse({evidence:[]}),e=>e.code==="INVALID_RESPONSE");
  assert.throws(()=>parse({evidence:Array(9).fill({source_url:url,fields:["title","organizer","start_date","city"]})}),
    e=>e.code==="INVALID_RESPONSE");
  assert.throws(()=>parse({evidence:[{source_url:url,fields:["title","organizer","start_date"]}]}),
    e=>e.code==="INVALID_RESPONSE");
  assert.throws(()=>parse({all_day:true,start_time:"09:00"}),e=>e.code==="INVALID_RESPONSE");
  assert.equal(strictEventDate("2026-11-20"),"2026-11-20");
  assert.equal(strictEventTime("23:59"),"23:59");
  assert.equal(validBratislavaWallClock("2027-03-28","02:30"),false);
  assert.equal(validBratislavaWallClock("2027-10-31","02:30"),true);
  for(const start_date of ["2026-02-30","20.11.2026","2026-09-01"])
    assert.throws(()=>parse({start_date}),e=>e.code==="INVALID_RESPONSE");
  for(const start_time of ["25:90","9:00"])
    assert.throws(()=>parse({start_time}),e=>e.code==="INVALID_RESPONSE");
  assert.throws(()=>parse({start_date:"2027-03-28",start_time:"02:30"}));
  assert.throws(()=>parse({cancelled:true}));
  assert.throws(()=>parse({evidence:[{source_url:url,fields:["title","organizer","city"]}]}));
  assert.throws(()=>parse({source_urls:["http://127.0.0.1/private"]}));
  assert.throws(()=>parse({city:null,venue:null}));
  const online=parse({start_time:null,city:null,online:true,
    evidence:[{source_url:url,fields:["title","organizer","start_date","online"]}]});
  for(const field of ["start_time","end_date","end_time","venue","city","region","event_url","registration_url"])
    assert.equal(online[field],null);
});
async function snapshotRequest(key,run){
  let body=null,endpoint=null,method=null;
  const result=await run({env,stableKey:key,maxCandidates:1,fetchImpl:async(url,init)=>{
    assert.equal(body,null,"one request only");
    endpoint=url;method=init.method;body=JSON.parse(init.body);
    return new Response(JSON.stringify({status:"completed",steps:[
      {type:"google_search_call",id:"gs",arguments:{queries:["dogs Slovakia"]}},
      {type:"google_search_result",call_id:"gs",result:[]},
      {type:"model_output",content:[{type:"text",text:JSON.stringify({
        schema_version:1,category_key:key,candidates:[]})}]},
    ]}),{status:200});
  }});
  assert.equal(result.providerMetrics.requestCount,1);
  assert.equal(endpoint,"https://generativelanguage.googleapis.com/v1beta/interactions");
  assert.equal(method,"POST");
  return body;
}
test("full outgoing Directory/Event Interactions requests differ only in prompt and schema",async()=>{
  const d=await snapshotRequest("directory.treneri",discoverGeminiCandidates);
  const e=await snapshotRequest(stableKey,discoverGeminiEventCandidates);
  for(const body of [d,e]){
    assert.deepEqual(Object.keys(body),["model","input","tools","response_format","store"]);
    assert.equal(body.model,"gemini-3.8-flash");
    assert.equal(typeof body.input,"string");
    assert.deepEqual(body.tools,[{type:"google_search"}]);
    assert.deepEqual(Object.keys(body.response_format),["type","mime_type","schema"]);
    assert.equal(body.response_format.type,"text");
    assert.equal(body.response_format.mime_type,"application/json");
    assert.equal(body.store,false);
  }
  const withoutDifferences=body=>({...body,input:"<prompt>",
    response_format:{...body.response_format,schema:"<schema>"}});
  assert.deepEqual(withoutDifferences(e),withoutDifferences(d));
  assert.notDeepEqual(e.response_format.schema,d.response_format.schema);
  assert.notEqual(e.input,d.input);
  assert.deepEqual(d.response_format.schema,
    buildGeminiDiscoveryJsonSchema(createGeminiDiscoveryRequest({stableKey:"directory.treneri",maxCandidates:1})));
});
test("shared provider timeout and response boundary remain at production defaults",()=>{
  const discoverySource=readFileSync(new URL("../lib/gemini-automation-discovery.ts",import.meta.url),"utf8");
  assert.match(discoverySource,/const DISCOVERY_TIMEOUT_MS = 120_000;/);
  assert.match(discoverySource,/const GEMINI_DISCOVERY_MAX_RESPONSE_BYTES = 2 \* 1024 \* 1024;/);
});
