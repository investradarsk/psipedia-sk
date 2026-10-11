import assert from "node:assert/strict";
import test from "node:test";
import { createGeminiEventRequest, buildGeminiEventJsonSchema, parseGeminiEventEnvelope } from "../lib/gemini-automation-event-contract.ts";

const stableKey = "events.vystavy";
const req = createGeminiEventRequest({stableKey,maxCandidates:1});
const url = "https://klub.example.sk/vystava";
const nullable = ["start_time","end_date","end_time","venue","city","region","event_url","registration_url"];
const required = ["title","organizer","start_date","all_day","online","description","source_urls","evidence","cancelled"];

function fixture(online=false) {
  return {
    title:"Výstava psov",organizer:"Kynologický klub",start_date:"2026-11-20",
    start_time:"09:00",end_date:null,end_time:null,all_day:false,
    venue:null,city:online?null:"Nitra",region:null,online,
    event_url:null,registration_url:null,
    description:"Oficiálne kynologické podujatie pre majiteľov a vystavovateľov psov.",
    source_urls:[url],
    evidence:[{source_url:url,fields:["title","organizer","start_date",online?"online":"city"]}],
    cancelled:false,
  };
}
function without(value,fields) {
  const copy={...value};
  for (const field of fields) delete copy[field];
  return copy;
}
function parse(candidate) {
  return parseGeminiEventEnvelope({schema_version:1,category_key:stableKey,candidates:[candidate]},req,"2026-10-10").candidates[0];
}
function fails(candidate,label) {
  assert.throws(()=>parse(candidate),error=>error.code==="INVALID_RESPONSE",label);
}

test("complete 17-key Event candidate is accepted without factual changes",()=>{
  const full=fixture();
  assert.equal(Object.keys(full).length,17);
  assert.deepEqual(parse(full),full);
});
test("missing start_time becomes null, not an inferred time",()=>{
  const result=parse(without(fixture(),["start_time"]));
  assert.equal(result.start_time,null);
  assert.equal(result.city,"Nitra");
});
test("missing end_date becomes null, not a guessed date",()=>{
  assert.equal(parse(without(fixture(),["end_date"])).end_date,null);
});
test("all eight missing nullable fields become null for valid online evidence",()=>{
  const online=fixture(true);
  const result=parse(without(online,nullable));
  for (const field of nullable) assert.equal(result[field],null,field);
  assert.equal(result.online,true);
  assert.equal(result.cancelled,false);
  assert.equal(result.all_day,false);
});
test("explicit nullable null values are preserved",()=>{
  const online=fixture(true);
  online.start_time=null;
  const result=parse(online);
  for (const field of nullable) assert.equal(result[field],null,field);
});
test("all mandatory semantic booleans must be explicitly provided",()=>{
  for (const field of ["all_day","online","cancelled"]) {
    fails(without(fixture(),[field]),field);
  }
});
test("missing required identity, description, sources and evidence fail closed",()=>{
  for (const field of ["title","organizer","start_date","description","source_urls","evidence"]) {
    fails(without(fixture(),[field]),field);
  }
});
test("unknown keys are rejected before nullable normalization",()=>{
  fails({...without(fixture(),["start_time"]),unexpected_key:"unsafe"},"unknown key");
  fails({...fixture(),event_type:"unsafe"},"server-owned key");
});
test("invalid provided nullable values are never converted to null",()=>{
  const bad=[
    ["start_time","25:90"],["end_date","2026-02-30"],["end_time","9:00"],
    ["venue",""],["city",123],["region",""],["event_url","javascript:alert(1)"],
    ["registration_url","http://127.0.0.1/private"],
  ];
  for (const [field,value] of bad) fails({...fixture(),[field]:value},field);
});
test("Event provider schema requires exactly nine semantic and evidentiary keys",()=>{
  const candidate=buildGeminiEventJsonSchema(req).properties.candidates.items;
  assert.deepEqual(candidate.required,required);
  assert.equal(candidate.required.length,9);
  assert.equal(Object.keys(candidate.properties).length,17);
  for (const field of nullable) {
    assert.ok(Object.hasOwn(candidate.properties,field));
    assert.equal(candidate.required.includes(field),false,field);
    assert.deepEqual(candidate.properties[field],{type:["string","null"]});
  }
  assert.equal(Object.hasOwn(candidate,"additionalProperties"),false);
});
test("envelope and evidence exact keys remain strict",()=>{
  const full=fixture();
  fails({...full,evidence:[{source_url:url,fields:["title","organizer","start_date","city"],extra:true}]},"extra evidence");
  assert.throws(()=>parseGeminiEventEnvelope({schema_version:1,category_key:stableKey,candidates:[full],extra:"unsafe"},req,"2026-10-10"),e=>e.code==="INVALID_RESPONSE");
});
