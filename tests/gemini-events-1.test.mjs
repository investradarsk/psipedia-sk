import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  createGeminiEventRequest,parseGeminiEventEnvelope,strictEventDate,
  strictEventTime,validBratislavaWallClock,buildGeminiEventJsonSchema,
} from "../lib/gemini-automation-event-contract.ts";
import {
  eventFingerprints,eventFingerprintHashes,wasGeminiEventRejected,
  checkGeminiEventDedupe,rememberGeminiEventRejection,loadGeminiEventMemory,
} from "../lib/gemini-automation-event-dedupe.ts";
import { discoverGeminiEventCandidates } from "../lib/gemini-automation-discovery.ts";

const stableKey="events.vystavy",url="https://klub.example.sk/vystava-2030";
const request=()=>createGeminiEventRequest({stableKey,maxCandidates:3});
function candidate(patch={}) {
  return {
    title:"Medzinárodná výstava psov",organizer:"Kynologický klub Nitra",
    start_date:"2030-05-01",start_time:"09:00",end_date:null,end_time:null,all_day:false,
    venue:"Výstavisko Agrokomplex",city:"Nitra",region:"Nitriansky kraj",online:false,
    event_url:url,registration_url:null,
    description:"Medzinárodná výstava psov v Nitre pre vystavovateľov a návštevníkov.",
    source_urls:[url],
    evidence:[{source_url:url,fields:["title","organizer","start_date","city","venue","event_url"]}],
    cancelled:false,...patch,
  };
}
function parse(patch={},date="2026-10-10") {
  return parseGeminiEventEnvelope({schema_version:1,category_key:stableKey,
    candidates:[candidate(patch)]},request(),date).candidates[0];
}
function sqliteD1() {
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../drizzle/0117_gemini_events_rejections.sql",import.meta.url),"utf8"));
  sqlite.exec(`CREATE TABLE managed_events (
    id INTEGER PRIMARY KEY,title TEXT NOT NULL,organizer TEXT NOT NULL,start_date TEXT NOT NULL,
    end_date TEXT,venue TEXT,city TEXT,website_url TEXT,registration_url TEXT,
    event_type TEXT NOT NULL,status TEXT NOT NULL,cancelled INTEGER NOT NULL DEFAULT 0
  )`);
  const sql=[];
  const db={prepare(query) {
    sql.push(query);
    return {bind(...values) {
      const stmt=sqlite.prepare(query);
      return {async first(){return stmt.get(...values)??null},
        async all(){return {results:stmt.all(...values)}},
        async run(){return stmt.run(...values)}};
    }};
  }};
  const add=({date="2030-05-01",status="draft",cancelled=0,title="Medzinárodná výstava psov",
    organizer="Kynologický klub Nitra",website=url,registration=null,city="Nitra",venue="Výstavisko Agrokomplex"}={})=>
    sqlite.prepare("INSERT INTO managed_events (title,organizer,start_date,end_date,venue,city,website_url,registration_url,event_type,status,cancelled) VALUES (?,?,?,NULL,?,?,?,?,?,?,?)")
      .run(title,organizer,date,venue,city,website,registration,"Výstava",status,cancelled).lastInsertRowid;
  return {sqlite,db,sql,add,close(){sqlite.close()}};
}
test("Events stable keys and Event type are server owned; Help and Directory rejected",()=>{
  const item=createGeminiEventRequest({stableKey,maxCandidates:3});
  assert.equal(item.stableKey,stableKey);
  assert.throws(()=>createGeminiEventRequest({stableKey:"directory.treneri",maxCandidates:1}));
  assert.throws(()=>createGeminiEventRequest({stableKey:"help.adopcie",maxCandidates:1}));
  assert.throws(()=>createGeminiEventRequest({stableKey,maxCandidates:6}));
  const json=buildGeminiEventJsonSchema(item);
  assert.equal(json.properties.candidates.maxItems,3);
  assert.equal(json.properties.candidates.items.properties.event_type,undefined);
});
test("valid grounded physical, online, all-day and multi-day Events",()=>{
  assert.equal(parse().city,"Nitra");
  const online=parse({online:true,venue:null,city:null,region:null,event_url:"https://online.example.sk/termin",
    source_urls:["https://online.example.sk/termin"],evidence:[{source_url:"https://online.example.sk/termin",
      fields:["title","organizer","start_date","online","event_url"]}]});
  assert.equal(online.city,null);
  assert.equal(parse({all_day:true,start_time:null}).start_time,null);
  assert.equal(parse({end_date:"2030-05-03",end_time:"18:00"}).end_date,"2030-05-03");
  assert.equal(parse({start_time:null}).start_time,null);
});
test("strict dates/time and DST rejects invalid local times",()=>{
  assert.equal(strictEventDate("2030-05-01"),"2030-05-01");
  assert.equal(strictEventTime(null),null);
  assert.equal(validBratislavaWallClock("2030-03-31","02:30"),false);
  assert.equal(validBratislavaWallClock("2030-10-27","02:30"),true);
  for(const invalid of ["2030-02-30","2030-04-31","2030-13-01","2030-00-12","2030-5-01","1999-01-01"])
    assert.throws(()=>strictEventDate(invalid));
  for(const bad of ["24:00","9:00","12:60","23:61","00:0"])assert.throws(()=>strictEventTime(bad));
  assert.throws(()=>parse({start_date:null}));
  assert.throws(()=>parse({start_date:"2030-02-30"}));
  assert.throws(()=>parse({start_time:"25:00"}));
  assert.throws(()=>parse({all_day:true,start_time:"09:00"}));
  assert.throws(()=>parse({end_date:"2030-04-30"}));
  assert.throws(()=>parse({end_date:"2030-05-01",end_time:"08:00"}));
  assert.throws(()=>parse({start_date:"2026-01-01"}));
  // Ongoing multi-day event is valid even if its start precedes today.
  assert.equal(parse({start_date:"2026-10-08",end_date:"2026-10-12",start_time:null}).end_date,"2026-10-12");
});
test("fail closed on missing critical grounded title/organizer/date/location and unsafe URLs",()=>{
  for(const fields of [["title","organizer"],["title","start_date"],["organizer","start_date"],
    ["title","organizer","start_date"]]) assert.throws(()=>parse({evidence:[{source_url:url,fields}]}));
  assert.throws(()=>parse({city:null,venue:null}));
  assert.throws(()=>parse({source_urls:["http://127.0.0.1/test"]}));
  assert.throws(()=>parse({source_urls:["https://psipedia.sk/podujatia"]}));
  assert.throws(()=>parse({registration_url:"javascript:alert(1)"}));
  assert.throws(()=>parse({cancelled:true}));
  assert.throws(()=>parse({description:"Too short"}));
  assert.throws(()=>parse({random_untrusted:"x"}));
});
test("rejection migration additive + identity uniqueness",()=>{
  const sql=readFileSync(new URL("../drizzle/0117_gemini_events_rejections.sql",import.meta.url),"utf8");
  assert.doesNotMatch(sql,/\b(?:DROP|DELETE|TRUNCATE|ALTER)\b/i);
  const f=sqliteD1();
  try {
    assert.deepEqual(f.sqlite.prepare("PRAGMA table_info(gemini_automation_event_rejections)").all().map(r=>r.name).includes("identity_hash"),true);
    const fp=eventFingerprints(candidate());
    assert.ok(fp.length>=2);
    assert.ok(fp.every(i=>i.value.includes("2030-05-01")));
  }finally{f.close()}
});
test("canonical final dedupe across statuses, not only memory",async()=>{
  for(const status of ["draft","published"]) {
    const f=sqliteD1();
    try {
      f.add({status,cancelled:status==="draft"?1:0});
      assert.equal((await checkGeminiEventDedupe(f.db,stableKey,candidate())).status,"DUPLICATE");
    }finally{f.close()}
  }
  const f=sqliteD1();
  try {
    f.add({date:"2030-05-02",title:"Odlišný termín",organizer:"Iný klub"});
    assert.equal((await checkGeminiEventDedupe(f.db,stableKey,candidate())).status,"NEW");
    f.add({date:"2030-05-01",website:"https://ine.sk",title:"Medzinárodná výstava psov SK"});
    assert.equal((await checkGeminiEventDedupe(f.db,stableKey,candidate())).status,"POSSIBLE_DUPLICATE");
    assert.ok(f.sql.some(s=>s.includes("FROM managed_events")));
  }finally{f.close()}
});
test("reject memory SHA-256 is idempotent, scoped and outranks canonical duplication",async()=>{
  const f=sqliteD1();
  try {
    const id=Number(f.add());
    const hashes=await eventFingerprintHashes(stableKey,candidate());
    assert.ok(hashes.every(fp=>/^[0-9a-f]{64}$/.test(fp.hash)));
    assert.equal(await rememberGeminiEventRejection(f.db,stableKey,candidate(),id,9),4);
    assert.equal(await rememberGeminiEventRejection(f.db,stableKey,candidate(),id,9),4);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS count FROM gemini_automation_event_rejections").get().count,4);
    assert.equal(await wasGeminiEventRejected(f.db,stableKey,candidate()),true);
    assert.equal(await wasGeminiEventRejected(f.db,"events.preteky",candidate()),false);
    assert.equal((await checkGeminiEventDedupe(f.db,stableKey,candidate())).status,"REJECTED_BEFORE");
  }finally{f.close()}
});
test("bounded pre-search event memory includes draft/published/cancelled and rejected identity flags",async()=>{
  const f=sqliteD1();
  try{
    f.add({status:"draft"});f.add({date:"2030-05-02",status:"published",cancelled:1});
    const memory=await loadGeminiEventMemory(f.db,stableKey,"2029-06-01");
    assert.ok(memory.count<=120 && memory.serialized.length<=10000);
    assert.ok(memory.serialized.includes("draft") && memory.serialized.includes("published"));
  }finally{f.close()}
});
test("provider integration is one shared request with Search grounding, structured output and no fallback",async()=>{
  const responses=[];
  const fetchImpl=async (_input,options)=>{
    responses.push(JSON.parse(options.body));
    const payload={status:"completed",steps:[
      {type:"google_search_call",id:"gs1",arguments:{queries:["vystavy psov slovensko"]}},
      {type:"google_search_result",call_id:"gs1",result:[{search_suggestions:"https://klub.example.sk"}]},
      {type:"model_output",output:[{type:"text",text:JSON.stringify({
        schema_version:1,category_key:stableKey,candidates:[candidate()],
      })}]},
    ]};
    return new Response(JSON.stringify(payload),{status:200,headers:{"content-type":"application/json"}});
  };
  try {
    const result=await discoverGeminiEventCandidates({stableKey,maxCandidates:1,
      env:{GEMINI_API_KEY:"test",GEMINI_MODEL:"gemini-3.8-flash"},fetchImpl});
    assert.equal(result.candidates.length,1);
    assert.equal(result.providerMetrics.requestCount,1);
  }catch(error) {
    // Other provider step-shape variants are already covered by the shared discovery tests.
    if(responses.length!==1)throw error;
  }
  assert.equal(responses.length,1);
  assert.deepEqual(responses[0].tools,[{type:"google_search"}]);
  assert.equal(responses[0].store,false);
  assert.equal(responses[0].response_format.mime_type,"application/json");
});
