import test from "node:test";
import assert from "node:assert/strict";
import { NOTION_SCHEMA_CONTRACTS } from "../scripts/notion-schema-contract.mjs";
import { verifyNotionSchemas } from "../scripts/notion-schema-verify.mjs";
test("all 11 Psipedia Notion sources have independent field contracts",()=>{
 assert.equal(NOTION_SCHEMA_CONTRACTS.length,11);
 assert.equal(new Set(NOTION_SCHEMA_CONTRACTS.map(x=>x.id)).size,11);
 assert.ok(NOTION_SCHEMA_CONTRACTS.every(x=>Object.keys(x.properties).length>=9));
 const help=NOTION_SCHEMA_CONTRACTS.find(x=>x.name==="Pomoc psom");
 assert.equal(help.properties["Zdroj dát"],"url");
 assert.equal(help.properties["CTA URL"],"url");
 assert.equal(help.properties["Gemini kontrola"],"select");
 assert.equal(help.properties["Psipedia stav"],"rich_text");
});
const sample=[{name:"Pomoc psom",id:"00000000-0000-4000-8000-000000000001",
 properties:{"Zdroj dát":"url","Psipedia stav":"rich_text","Gemini kontrola":"select"},
 options:{"Gemini kontrola":["Na kontrolu","Schválené","Odmietnuté"]}}];
const good={properties:{"Zdroj dát":{type:"url"},"Psipedia stav":{type:"rich_text"},
 "Gemini kontrola":{type:"select",select:{options:[{name:"Na kontrolu"},{name:"Schválené"},{name:"Odmietnuté"}]}}}};
function fake(data=good,status=200){
 const calls=[];return {calls,fetcher:async(url,opts)=>{
  calls.push({url,opts});
  return new Response(JSON.stringify({id:sample[0].id,...data}),{status});
 }};
}
test("schema guard issues GET only and accepts matching types/options",async()=>{
 const {fetcher,calls}=fake();
 assert.deepEqual(await verifyNotionSchemas({token:"secret",fetcher,contracts:sample}),
  {checked:1,expected:1,issues:[]});
 assert.equal(calls.length,1);assert.equal(calls[0].opts.method,"GET");
 assert.equal(calls[0].opts.headers.Authorization,"Bearer secret");
 assert.match(calls[0].url,/\/data_sources\//);
});
test("schema guard detects removed fields, changed types and lost statuses",async()=>{
 const bad={properties:{"Zdroj dát":{type:"rich_text"},
  "Gemini kontrola":{type:"select",select:{options:[]}}}};
 const result=await verifyNotionSchemas({token:"secret",fetcher:fake(bad).fetcher,contracts:sample});
 assert.equal(result.issues.length,5);
 assert.ok(result.issues.some(x=>x.includes("WRONG_TYPE Zdroj dát")));
 assert.ok(result.issues.some(x=>x.includes("MISSING_PROPERTY Psipedia stav")));
 assert.ok(result.issues.some(x=>x.includes("MISSING_OPTION Gemini kontrola/Odmietnuté")));
});
test("unavailable and incorrect targets cannot silently pass",async()=>{
 const fail=await verifyNotionSchemas({token:"secret",fetcher:fake({},403).fetcher,contracts:sample});
 assert.equal(fail.checked,0);assert.match(fail.issues[0],/NOTION_HTTP_403/);
 const wrong=await verifyNotionSchemas({token:"secret",fetcher:async()=>Response.json({id:"wrong",...good}),contracts:sample});
 assert.match(wrong.issues[0],/WRONG_DATA_SOURCE_OR_SCHEMA/);
 await assert.rejects(verifyNotionSchemas({token:"",fetcher:fake().fetcher,contracts:sample}),/TOKEN_MISSING/);
});

test("schema guard retries an inaccessible data source with a second integration",async()=>{
 const calls=[];const recovered=[];
 const fetcher=async(_url,opts)=>{
  calls.push(opts.headers.Authorization);
  if(opts.headers.Authorization==="Bearer primary")return new Response("",{status:404});
  return Response.json({id:sample[0].id,...good});
 };
 const result=await verifyNotionSchemas({token:"primary",fallbackToken:"secondary",
  contracts:sample,fetcher,onFallback:name=>recovered.push(name)});
 assert.deepEqual(result,{checked:1,expected:1,issues:[]});
 assert.deepEqual(calls,["Bearer primary","Bearer secondary"]);
 assert.deepEqual(recovered,["Pomoc psom"]);
});
test("schema guard does not hide missing access or invalid schemas behind fallback",async()=>{
 const denied=await verifyNotionSchemas({token:"primary",fallbackToken:"secondary",
  contracts:sample,fetcher:async()=>new Response("",{status:404})});
 assert.equal(denied.checked,0);
 assert.match(denied.issues[0],/NOTION_HTTP_404/);
 const changed=await verifyNotionSchemas({token:"primary",fallbackToken:"secondary",
  contracts:sample,fetcher:async(_url,opts)=>opts.headers.Authorization==="Bearer primary"
   ? new Response("",{status:404})
   : Response.json({id:sample[0].id,properties:{"Zdroj dát":{type:"rich_text"}}})});
 assert.equal(changed.checked,1);
 assert.ok(changed.issues.some(issue=>issue.includes("WRONG_TYPE Zdroj dát")));
 assert.ok(changed.issues.some(issue=>issue.includes("MISSING_PROPERTY Psipedia stav")));
});
test("identical primary/fallback token never triggers duplicate Notion requests",async()=>{
 let calls=0;
 const result=await verifyNotionSchemas({token:"same",fallbackToken:"same",contracts:sample,
  fetcher:async()=>{calls++;return new Response("",{status:404});}});
 assert.equal(calls,1);
 assert.match(result.issues[0],/NOTION_HTTP_404/);
});
