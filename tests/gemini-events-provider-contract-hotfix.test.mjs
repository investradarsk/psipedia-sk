import assert from "node:assert/strict";
import test from "node:test";
import { createGeminiEventRequest, buildGeminiEventJsonSchema, strictEventDate } from "../lib/gemini-automation-event-contract.ts";
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
    assert.equal(schema.additionalProperties,false);
    assert.deepEqual(Object.keys(schema.properties),schema.required);
    Object.values(schema.properties).forEach(checkSubset);
  }
  if(type==="array")checkSubset(schema.items);
}
test("Event provider schema uses documented Interactions subset; nullable end stays simple",()=>{
  const schema=buildGeminiEventJsonSchema(createGeminiEventRequest({stableKey,maxCandidates:1}));
  checkSubset(schema);
  const props=schema.properties.candidates.items.properties;
  assert.deepEqual(props.start_date,{type:"string",format:"date"});
  assert.deepEqual(props.end_date.type,["string","null"]);
  assert.equal(Object.hasOwn(props.end_date,"format"),false);
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
    assert.deepEqual(warnings,[["gemini_discovery_provider_error",{status}]]);
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
