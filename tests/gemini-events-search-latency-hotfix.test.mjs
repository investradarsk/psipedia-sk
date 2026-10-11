import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  createGeminiEventRequest, buildGeminiEventPrompt, buildGeminiEventJsonSchema,
  parseGeminiEventEnvelope, validBratislavaWallClock,
} from "../lib/gemini-automation-event-contract.ts";
import { discoverGeminiEventCandidates } from "../lib/gemini-automation-discovery.ts";

const key = "events.vystavy";
const req = maxCandidates => createGeminiEventRequest({stableKey:key,maxCandidates});
const evidenceFields = [
  "title","organizer","start_date","city","venue","online","event_url",
  "registration_url","description","cancelled",
];
const eventFields = [
  "title","organizer","start_date","start_time","end_date","end_time","all_day",
  "venue","city","region","online","event_url","registration_url","description",
  "cancelled","source_urls","evidence",
];
const url = "https://kynologia.example.org/vystava";
const candidate = (patch={}) => ({
  title:"Jesenná výstava psov",organizer:"Kynologický klub",start_date:"2030-11-01",
  start_time:null,end_date:null,end_time:null,all_day:true,
  venue:"Výstavisko",city:"Nitra",region:null,online:false,
  event_url:url,registration_url:null,
  description:"Oficiálne ohlásené podujatie pre vystavovateľov a milovníkov psov.",
  source_urls:[url],
  evidence:[{source_url:url,fields:["title","organizer","start_date","city","venue"]}],
  cancelled:false,...patch,
});
const envelope = candidates => ({schema_version:1,category_key:key,candidates});
const parse = (items, maxCandidates=1) =>
  parseGeminiEventEnvelope(envelope(items),req(maxCandidates),"2026-10-11");

test("maxCandidates=1 prioritizes a single verified result, then stops searching",()=>{
  const prompt=buildGeminiEventPrompt(req(1),"[]");
  assert.match(prompt,/Find ONE verifiable upcoming event/);
  assert.match(prompt,/STOP searching and return it/);
  assert.match(prompt,/do not catalogue other regions, clubs or events/);
  assert.match(prompt,/few targeted Google Search queries/);
  assert.match(prompt,/official organizers/);
  assert.match(prompt,/Search across ALL of Slovakia/);
  assert.match(prompt,/not be limited to any city or example/);
  assert.match(prompt,/historical editions/);
  assert.match(prompt,/Resolve conflicting facts using current official sources/);
  assert.match(prompt,/return \[\] if insufficient evidence/);
  assert.doesNotMatch(prompt,/ONLY Bratislava|only in Bratislava/i);
});

test("larger limits and other Event categories retain nationwide bounded discovery",()=>{
  for(const limit of [2,3,4,5]){
    const prompt=buildGeminiEventPrompt(req(limit),"[]");
    assert.match(prompt,new RegExp("Find up to "+limit+" distinct verifiable upcoming events"));
    assert.match(prompt,/Stop when enough are confirmed/);
    assert.match(prompt,/Search across ALL of Slovakia/);
    assert.match(prompt,/not catalogue every club or region/);
    assert.equal(buildGeminiEventJsonSchema(req(limit)).properties.candidates.maxItems,limit);
  }
  const other=createGeminiEventRequest({stableKey:"events.preteky",maxCandidates:1});
  const prompt=buildGeminiEventPrompt(other,"[]");
  assert.match(prompt,/Find ONE verifiable upcoming event/);
  assert.match(prompt,/events\.preteky/);
  assert.match(prompt,/Search across ALL of Slovakia/);
});

test("all 17 Event fields, nullable types, booleans and exact evidence enum survive",()=>{
  for(const limit of [1,5]){
    const schema=buildGeminiEventJsonSchema(req(limit));
    assert.equal(schema.properties.schema_version.enum[0],1);
    assert.deepEqual(schema.properties.category_key.enum,[key]);
    const props=schema.properties.candidates.items.properties;
    assert.deepEqual(Object.keys(props).sort(),[...eventFields].sort());
    for(const field of ["start_time","end_date","end_time","venue","city","region","event_url","registration_url"])
      assert.deepEqual(props[field].type,["string","null"]);
    for(const field of ["all_day","online","cancelled"])assert.equal(props[field].type,"boolean");
    assert.deepEqual(props.evidence.items.properties.fields,{
      type:"array",items:{type:"string",enum:evidenceFields},
    });
    const prompt=buildGeminiEventPrompt(req(limit),"[]");
    assert.match(prompt,/fields must be an array of allowed identifier strings, NEVER a fact-value object/);
    assert.match(prompt,/Every title, organizer and exact YYYY-MM-DD start_date must have source-linked evidence/);
    assert.match(prompt,/all_day and cancelled must be booleans/);
    assert.match(prompt,/never invent, infer or relabel evidence/);
  }
});

test("offline and online sources validate; unsupported, stale or invented facts fail closed",()=>{
  assert.equal(parse([candidate()]).candidates.length,1);
  const online=candidate({
    online:true,venue:null,city:null,event_url:url,
    evidence:[{source_url:url,fields:["title","organizer","start_date","online","event_url"]}],
  });
  assert.equal(parse([online]).candidates[0].online,true);
  const rejects=[
    candidate({evidence:[{source_url:url,fields:["title","organizer","start_date"]}]}),
    {...online,evidence:[{source_url:url,fields:["title","organizer","start_date"]}]},
    candidate({evidence:[{source_url:url,fields:{title:"invented",organizer:"invented"}}]}),
    candidate({evidence:[{source_url:url,fields:["title","organizer","start_date","city","fake"]}]}),
    candidate({evidence:[{source_url:"https://unlisted.example.org",fields:["title","organizer","start_date","city"]}]}),
    candidate({start_date:"2020-11-01"}),
    candidate({start_date:"2030-02-30"}),
    candidate({cancelled:true}),
    candidate({online:"false"}),
  ];
  for(const item of rejects)
    assert.throws(()=>parse([item]),error=>error.code==="INVALID_RESPONSE");
  assert.equal(validBratislavaWallClock("2030-03-31","02:30"),false);
  assert.equal(validBratislavaWallClock("2030-10-27","02:30"),true);
  assert.throws(()=>parse([candidate(),candidate()],1),error=>error.code==="INVALID_RESPONSE");
  assert.equal(parse([candidate(),candidate({title:"Iná výstava"})],2).candidates.length,2);
});

test("mocked shared Interactions path sends exactly one grounded request without retry",async()=>{
  let requests=0;
  const logs=[];
  const info=console.info;
  const fetchImpl=async(_url,init)=>{
    requests++;
    const body=JSON.parse(init.body);
    assert.equal(body.model,"gemini-3.8-flash");
    assert.deepEqual(body.tools,[{type:"google_search"}]);
    assert.equal(body.store,false);
    assert.deepEqual(body.generation_config,{thinking_level:"low"});
    assert.match(body.input,/STOP searching and return it/);
    assert.equal(body.response_format.schema.properties.candidates.maxItems,1);
    return new Response(JSON.stringify({
      status:"completed",
      steps:[
        {type:"google_search_call",id:"gs",arguments:{queries:["výstavy psov slovensko"]}},
        {type:"google_search_result",call_id:"gs",result:[]},
        {type:"model_output",content:[{type:"text",text:JSON.stringify(envelope([candidate()]))}]},
      ],
    }),{status:200});
  };
  try{
    console.info=(...args)=>logs.push(args);
    const result=await discoverGeminiEventCandidates({
      env:{GEMINI_MODEL:"gemini-3.8-flash",GEMINI_API_KEY:"MOCK_KEY"},
      stableKey:key,maxCandidates:1,fetchImpl,
    });
    assert.equal(requests,1);
    assert.equal(result.candidates.length,1);
    assert.equal(result.providerMetrics.requestCount,1);
    assert.ok(logs.some(([name])=>name==="gemini_event_discovery_timing"));
  }finally{console.info=info}
});

test("Directory and Notion bridge stay on their existing separate paths",()=>{
  const directory=readFileSync(new URL("../lib/gemini-automation-discovery-contract.ts",import.meta.url),"utf8");
  const bridge=readFileSync(new URL("../lib/gemini-automation-notion-bridge.ts",import.meta.url),"utf8");
  const provider=readFileSync(new URL("../lib/gemini-automation-discovery.ts",import.meta.url),"utf8");
  assert.match(directory,/GEMINI_DISCOVERY_SCHEMA_VERSION = 1/);
  assert.ok(bridge.length>100);
  assert.match(provider,/const DISCOVERY_TIMEOUT_MS = 120_000/);
  assert.match(provider,/const GEMINI_DISCOVERY_MAX_RESPONSE_BYTES = 2 \* 1024 \* 1024/);
});
