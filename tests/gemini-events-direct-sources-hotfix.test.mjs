import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {
  createGeminiEventRequest,parseGeminiEventEnvelope,buildGeminiEventPrompt,
  isGeminiGroundingRedirectUrl,
} from "../lib/gemini-automation-event-contract.ts";
import {loadNotionBulkEvents} from "../lib/notion-bulk-sources.ts";

const original="https://www.skchr.sk/kalendar-vystav-2026";
const redirect="https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZ-fake-token";
const req=createGeminiEventRequest({stableKey:"events.vystavy",maxCandidates:1});
const event=(overrides={})=>({
  title:"XXXII. Špeciálna výstava SKCHR",organizer:"SKCHR",start_date:"2026-10-17",
  start_time:null,end_date:null,end_time:null,all_day:true,venue:"Spoločenský dom",
  city:"Viničné",region:"Bratislavský kraj",online:false,
  event_url:original,registration_url:null,description:"Klubová výstava pre plemeno ridgeback.",
  source_urls:[original],
  evidence:[{source_url:original,fields:["title","organizer","start_date","city","venue"]}],
  cancelled:false,...overrides,
});
const parse=candidate=>parseGeminiEventEnvelope({
  schema_version:1,category_key:"events.vystavy",candidates:[candidate],
},req,"2026-10-11");

test("direct organizer source stays valid; grounding redirect evidence fails closed",()=>{
  assert.equal(parse(event()).candidates.length,1);
  assert.equal(isGeminiGroundingRedirectUrl(original),false);
  assert.equal(isGeminiGroundingRedirectUrl(redirect),true);
  assert.equal(isGeminiGroundingRedirectUrl("https://vertexaisearch.cloud.google.com/help"),false);
  assert.throws(()=>parse(event({source_urls:[redirect],
    evidence:[{source_url:redirect,fields:["title","organizer","start_date","city"]}]})),
    error=>error.code==="INVALID_RESPONSE");
  assert.throws(()=>parse(event({event_url:redirect})),error=>error.code==="INVALID_RESPONSE");
  assert.throws(()=>parse(event({registration_url:redirect})),error=>error.code==="INVALID_RESPONSE");
});

test("prompt explicitly requests direct, non-invented sources without altering source evidence semantics",()=>{
  const prompt=buildGeminiEventPrompt(req,"[]");
  assert.match(prompt,/original DIRECT public webpage URLs/);
  assert.match(prompt,/Never use vertexaisearch.cloud.google.com\/grounding-api-redirect/);
  assert.match(prompt,/if original sources cannot be established, return \[\]/);
  assert.match(prompt,/Every title, organizer and exact YYYY-MM-DD start_date must have source-linked evidence/);
  assert.match(prompt,/STOP searching and return it/);
});

function mockEventDb(sourceUrl){
  const queries=[];
  const database={prepare(sql){queries.push(sql);return{all:async()=>({results:[{
    id:184,slug:"test-skchr-184",title:"XXXII. Špeciálna výstava SKCHR",
    status:"draft",event_type:"Výstava",start_date:"2026-10-17",
    end_date:"2026-10-17",city:"Viničné",venue:"Spoločenský dom",
    region:"Bratislavský kraj",organizer:"SKCHR",description:"Klubová výstava.",
    excerpt:"Klubová výstava.",website_url:null,registration_url:null,
    geo_status:null,geo_point_id:null,seo_json:"{}",
    gemini_primary_source_url:sourceUrl,
  }]})};}};
  return {database,queries};
}

test("Notion source mapping includes direct Gemini origin, not transient Google URLs",async()=>{
  const direct=mockEventDb(original);
  const records=await loadNotionBulkEvents(direct.database);
  assert.equal(records.length,1);
  assert.equal(records[0].properties["Zdroj dát"],original);
  assert.equal(records[0].properties["Stav"],"Nápad");
  assert.ok(direct.queries[0].includes("c.canonical_entity_id = managed_events.id"));
  assert.ok(direct.queries[0].includes("'NOTION_CREATING'"));

  const proxy=mockEventDb(redirect);
  const proxyResult=await loadNotionBulkEvents(proxy.database);
  assert.equal(Object.hasOwn(proxyResult[0].properties,"Zdroj dát"),false);

  const legacy=mockEventDb(null);
  const legacyResult=await loadNotionBulkEvents(legacy.database);
  assert.equal(Object.hasOwn(legacyResult[0].properties,"Zdroj dát"),false);
});

test("Gemini review UI displays source hosts, not gigantic grounding redirect strings",()=>{
  const ui=readFileSync(new URL("../components/admin-gemini-event-concept-review.tsx",import.meta.url),"utf8");
  assert.match(ui,/destination.hostname/);
  assert.match(ui,/Google presmerovanie – overiť pôvodný zdroj/);
  assert.doesNotMatch(ui,/\{label\}: \{href\} ↗/);
});
