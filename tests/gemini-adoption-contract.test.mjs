import test from "node:test";
import assert from "node:assert/strict";
import {buildAdoptionDraft} from "../scripts/gemini-notion-adoption-fields.mjs";
const p={"Meno":{type:"title"},"Stav":{type:"select",select:{options:[{name:"Nápad"},{name:"Ready"}]}},
  "Organizácia":{type:"rich_text"},"Krátky popis":{type:"rich_text"},"Popis":{type:"rich_text"},
  "Mesto":{type:"rich_text"},"Kraj":{type:"rich_text"},"Zdroj dát":{type:"url"},
  "Psipedia ID":{type:"rich_text"},"Slug":{type:"rich_text"}};
const args=()=>({name:"Dorka",organization:"Útulok Nádej",summary:"Fenka hľadá domov.",
 description:"Fenka sa nachádza v starostlivosti útulku a hľadá nový domov po preverení dostupných informácií.",
 city:"Nitra",source_url:"https://example.org/psy/dorka",
 evidence:[{source_url:"https://example.org/psy/dorka",fields:["name","organization","summary","description","city"]}]});
const check=(a=args(),rows=[],schema=p,complete=true)=>buildAdoptionDraft({args:a,rows,properties:schema,
 scanComplete:complete,groundedSources:["https://example.org/psy/dorka"]});
const row=(name,org,source)=>({properties:{"Meno":{title:[{plain_text:name}]},
 "Organizácia":{rich_text:[{plain_text:org}]},"Zdroj dát":{url:source}}});
test("canonical draft uses Meno and Nápad, without Slug or published fields",()=>{
 const draft=check();assert.equal(draft.Meno.title[0].text.content,"Dorka");
 assert.equal(draft.Stav.select.name,"Nápad");
 for(const key of ["Slug","Psipedia ID","Latitude","Kontakt"])assert.equal(draft[key],undefined);
});
test("schema and draft gate must match real Adopcie",()=>{
 assert.throws(()=>check(args(),[],{...p,Meno:{type:"rich_text"}}),/SCHEMA_INVALID/);
 assert.throws(()=>check(args(),[],{...p,Stav:{type:"select",select:{options:[{name:"Ready"}]}}}),/DRAFT_OPTION_MISSING/);
});
test("identity blocks same dog/org or source, but not separate org/source",()=>{
 assert.throws(()=>check(args(),[row("Dorka","Útulok Nádej","https://another.example/dog")]),/DUPLICATE/);
 assert.throws(()=>check(args(),[row("Iný","Iné OZ","https://example.org/psy/dorka")]),/DUPLICATE/);
 assert.doesNotThrow(()=>check(args(),[row("Dorka","Iný útulok","https://another.example/dog")]));
});
test("incomplete scan fails closed",()=>assert.throws(()=>check(args(),[],p,false),/SCAN_INCOMPLETE/));
for(const extra of [{phone:"+421 905 123 456"},{email:"person@example.org"},
 {latitude:48.1234},{address:"Hlavná 42"},{organization:""},{evidence:[]},
 {source_url:"https://unverified.example/dog"}]){
 test("reject unsafe input "+JSON.stringify(extra),()=>assert.throws(()=>check({...args(),...extra})));
}
