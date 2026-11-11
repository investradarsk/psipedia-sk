import test from "node:test";
import assert from "node:assert/strict";
import {materializeBreedWorkCopyForRead} from "../lib/notion-breed-workcopy-compatible-page.mjs";
import {breedWorkcopyEventValues} from "../lib/notion-breed-workcopy-field-values.mjs";
import {workCopyChangedEditorialIds} from "../lib/notion-breed-workcopy-field-events.mjs";
import {BREED_NOTION_SCHEMA} from "../lib/notion-breed-property-registry.ts";

const rich=text=>({type:"rich_text",rich_text:text?[{plain_text:text,type:"text",text:{content:text}}]:[]});
const get=prop=>(prop?.rich_text??[]).map(x=>x.plain_text).join("");
const canonical={id:2,slug:"zlaty-retriever",fciNumber:111};
const fixture=()=>({
  id:"40f793fc-1d18-8111-a021-eb3cdc37e0ec",
  properties:{
    "Psipedia ID":rich("2"),
    "Zdrojový profil Notion":{type:"url",url:"https://app.notion.com/p/00000000000000000000000000000001"},
    "Názov plemena":{type:"title",title:[{plain_text:"Zlatý retriever"}]},
    "FCI číslo":{type:"number",number:111},
    "FCI lebka":rich("Lebka samostatne"),
    "FCI oči":rich("Oči samostatne"),
    "FCI uši":rich("Uši samostatne"),
    "Prehľad plemena":rich("Sociálny a aktívny retriever."),
    "Každodenné potreby plemena":rich("Kontakt, tréning, pohyb."),
    "Krátky úvod v hero (2–4 vety)":rich("Zlatý retriever je aportér."),
  },
});

test("read-only 90-field projection maps current Notion properties back to Admin parser names",()=>{
  const p=fixture(),before=JSON.stringify(p);
  const result=materializeBreedWorkCopyForRead(p,canonical);
  assert.equal(result.valid,true);
  assert.equal(result.writebackAllowed,false);
  assert.equal(get(result.page.properties.Slug),"zlaty-retriever");
  assert.equal(get(result.page.properties["Redakcia prehľad"]),"Sociálny a aktívny retriever.");
  assert.equal(get(result.page.properties.Potreby),"Kontakt, tréning, pohyb.");
  assert.equal(get(result.page.properties.Intro),"Zlatý retriever je aportér.");
  assert.equal(get(result.page.properties["FCI oči"]),"Oči samostatne");
  assert.equal(get(result.page.properties["FCI lebka"]),"Lebka samostatne");
  assert.equal(result.page.properties.Stav,undefined);
  assert.equal(result.sourcePropertyNames.includes("Slug"),false);
  assert.equal(result.derivedPropertyNames.includes("Slug"),true);
  assert.equal(JSON.stringify(p),before);
});

test("Psipedia ID is the only profile identity and FCI remains separately editable",()=>{
  const wrong=fixture();
  wrong.properties["Psipedia ID"]=rich("3");
  assert.throws(()=>materializeBreedWorkCopyForRead(wrong,canonical),/BREED_WORKCOPY_PSI_ID_MISMATCH/);
  const p=fixture();
  p.properties["FCI číslo"].number=123;
  assert.equal(materializeBreedWorkCopyForRead(p,canonical).page.properties["FCI číslo"].number,123);
});

test("Notion changes to overview, everyday needs and FCI eyes stay independent",()=>{
  const p=fixture();
  p.properties["Prehľad plemena"].id="overview-id";
  p.properties["Každodenné potreby plemena"].id="needs-id";
  p.properties["FCI oči"].id="eyes-id";
  const touched=["overview-id","needs-id","eyes-id"];
  assert.deepEqual(workCopyChangedEditorialIds(p,touched,BREED_NOTION_SCHEMA),
    ["fciStandard.oci","needs","editorial.overview"]);
  const incoming=breedWorkcopyEventValues(p,touched,BREED_NOTION_SCHEMA);
  assert.deepEqual(incoming.failures,[]);
  const map=Object.fromEntries(incoming.values.map(x=>[x.field,x.value]));
  assert.equal(map["editorial.overview"],"Sociálny a aktívny retriever.");
  assert.equal(map.needs,"Kontakt, tréning, pohyb.");
  assert.equal(map["fciStandard.oci"],"Oči samostatne");
  assert.equal(Object.keys(map).length,3);
  const blank=fixture();
  blank.properties["Prehľad plemena"]=rich("");
  blank.properties["Prehľad plemena"].id="overview-id";
  const clear=breedWorkcopyEventValues(blank,["overview-id"],BREED_NOTION_SCHEMA);
  assert.deepEqual(clear.values.map(v=>[v.field,v.value]),[["editorial.overview",""]]);
});
