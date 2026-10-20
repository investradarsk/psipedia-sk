import test from "node:test";
import assert from "node:assert/strict";
import { classifyGeminiNotionIdentity, geminiDedupeCandidate } from "../scripts/gemini-notion-preflight.mjs";
import { externalWorkerCategorySupported } from "../scripts/gemini-notion-category.mjs";
const sections = {
  directory: ["veterinari","treneri","kynologicke-kluby","chovatelske-kluby","chovatelske-stanice",
    "salony-a-sluzby","hotely-a-opatrovanie","vencenie","fyzioterapia","dalsie-sluzby"],
  events: ["vystavy","preteky","seminare","treningy","stretnutia","dalsie"],
  help: ["docasna-opatera","zbierky","dobrovolnictvo","utulky","adopcia","stratene-a-najdene"],
};
const keys = Object.entries(sections).flatMap(([section,slugs]) => slugs.map(slug => section+"."+slug));
const t = v => ({title:[{plain_text:v}]});
const r = v => ({rich_text:[{plain_text:v}]});
const u = v => ({url:v});
const d = v => ({date:{start:v}});
function data(key, { name="Stastny pes", city="Nitra", date="2026-10-20", organizer="Klub",
  source="https://example.org/pes-1", website="https://example.org", type="LOST" }={}) {
  return {
    [key==="help.adopcia" ? "Meno" : "Názov"]:t(name),Mesto:r(city),
    Web:u(website), "Zdroj dát":u(source), "Zdroj URL":u(source),
    "Začiatok":d(date), "Dátum udalosti":d(date),
    "Organizátor":r(organizer),"Organizácia":r(organizer),Typ:r(type),
  };
}
test("22 exact worker categories covered",()=>{
  assert.equal(keys.length,22);assert.equal(new Set(keys).size,22);
  keys.forEach(key=>assert.ok(externalWorkerCategorySupported(key)));
});
for(const key of keys){
  test(key+" fresh Notion identity permits only subsequent D1 verification",()=>{
    assert.equal(classifyGeminiNotionIdentity(key,data(key),[]),"NEW");
    const payload=geminiDedupeCandidate(key,data(key));
    assert.deepEqual(Object.keys(payload),["name","city","website","source","start_date","organizer","venue","type"]);
    assert.ok(!JSON.stringify(payload).includes("latitude"));
  });
  test(key+" identical recorded identity is never silently created",()=>{
    const result=classifyGeminiNotionIdentity(key,data(key),[{properties:data(key)}]);
    assert.notEqual(result,"NEW");
  });
}
test("directory same name in different towns and different websites remains distinct",()=>{
  const old=data("directory.veterinari",{city:"Nitra",website:"https://nitra.example.sk",source:"https://nitra.example.sk"});
  const next=data("directory.veterinari",{city:"Košice",website:"https://kosice.example.sk",source:"https://kosice.example.sk"});
  assert.equal(classifyGeminiNotionIdentity("directory.veterinari",next,[{properties:old}]),"NEW");
});
test("event repeated title on different dates remains distinct",()=>{
  const previous=data("events.vystavy",{date:"2026-10-20"});
  const next=data("events.vystavy",{date:"2026-11-20"});
  assert.equal(classifyGeminiNotionIdentity("events.vystavy",next,[{properties:previous}]),"NEW");
});
test("adoption common dog name requires manual review without cross-dog merge",()=>{
  const old=data("help.adopcia",{source:"https://example.org/dog-a",organizer:"Azyl A"});
  const next=data("help.adopcia",{source:"https://example.org/dog-b",organizer:"Azyl B"});
  assert.equal(classifyGeminiNotionIdentity("help.adopcia",next,[{properties:old}]),"POSSIBLE_DUPLICATE");
});
test("lost and found different case type or date cannot be merged",()=>{
  const old=data("help.stratene-a-najdene",{type:"LOST"});
  const next=data("help.stratene-a-najdene",{type:"FOUND"});
  assert.equal(classifyGeminiNotionIdentity("help.stratene-a-najdene",next,[{properties:old}]),"NEW");
});
test("invalid scope and incomplete Notion rows fail closed",()=>{
  assert.equal(classifyGeminiNotionIdentity("help.fake",{},[]),"BLOCKED");
  assert.equal(classifyGeminiNotionIdentity("directory.veterinari",data("directory.veterinari"),[{}]),"BLOCKED");
});
