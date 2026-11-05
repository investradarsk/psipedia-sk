import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  inspectNotionStagedBreedField, readNotionStagedBreedField,
  invalidNotionStagedBreedTargets, NOTION_BREED_STAGED_MERGE_KEYS,
} from "../lib/notion-breed-stage-read.ts";
import { BREED_COMPACT_MERGE, BREED_COMPACT_HEADINGS } from "../lib/breed-notion-compact-consolidation.mjs";

const rich=(value)=>({type:"rich_text",rich_text:[{type:"text",plain_text:value,text:{content:value}}]});
const page=(props)=>({properties:Object.fromEntries(
  Object.entries(props).map(([key,value])=>[key,rich(value)])
)});
test("all 23 migration source fields are covered by independent sync-read guards",()=>{
  const pairs=Object.entries(NOTION_BREED_STAGED_MERGE_KEYS)
    .flatMap(([target,defs])=>defs.map(([source,heading])=>({source,target,heading})));
  assert.equal(pairs.length,23);
  for(const [source,target] of Object.entries(BREED_COMPACT_MERGE)){
    const found=pairs.find(item=>item.source===source);
    assert.equal(found?.target,target,source);
    assert.equal(found?.heading,BREED_COMPACT_HEADINGS[source],source);
  }
});
test("single verified FCI section is not imported again into Admin",()=>{
  const p=page({"FCI lebka":"Silná lebka. — Oči podľa FCI: Tmavé oči.",
    "FCI oči":"Tmavé oči."});
  const result=inspectNotionStagedBreedField(p,"FCI lebka");
  assert.deepEqual(result,{value:"Silná lebka.",staged:true,valid:true});
  assert.equal(readNotionStagedBreedField(p,"FCI lebka"),"Silná lebka.");
  assert.deepEqual(invalidNotionStagedBreedTargets(p),[]);
});
test("multiple verified sections retain the canonical text and independent sources",()=>{
  const p=page({
    "FCI telo":"Pevný chrbát. — Chvost podľa FCI: Dlhý chvost. — Krk podľa FCI: Svalnatý krk.",
    "FCI chvost":"Dlhý chvost.","FCI krk":"Svalnatý krk.",
    "Potreby":"Primerané vychádzky.",
    "Redakcia prehľad":"Stručný súhrn. — Každodenné potreby: Primerané vychádzky.",
    "Zdravie":"Pôvodné zdravie. — Praktický tip k zdraviu: Odborná prevencia.",
    "Redakcia tip zdravie":"Odborná prevencia.",
  });
  assert.equal(readNotionStagedBreedField(p,"FCI telo"),"Pevný chrbát.");
  assert.equal(readNotionStagedBreedField(p,"Redakcia prehľad"),"Stručný súhrn.");
  assert.equal(readNotionStagedBreedField(p,"Zdravie"),"Pôvodné zdravie.");
  assert.deepEqual(invalidNotionStagedBreedTargets(p),[]);
});
test("missing legacy source or changed subsection produces a field-level conflict",()=>{
  const missing=page({"FCI lebka":"Hlava. — Oči podľa FCI: Oči."});
  assert.deepEqual(invalidNotionStagedBreedTargets(missing),["FCI lebka"]);
  assert.equal(readNotionStagedBreedField(missing,"FCI lebka"),
    "Hlava. — Oči podľa FCI: Oči.");
  const changed=page({"FCI lebka":"Hlava. — Oči podľa FCI: Oči.","FCI oči":"Úplne iné oči."});
  assert.equal(inspectNotionStagedBreedField(changed,"FCI lebka").valid,false);
});
test("a Notion auto-linked URL is equivalent only to its matching exact URL",()=>{
  const source="https://fci.be/en/nomenclature/AFFENPINSCHER-186.html";
  const p=page({
    "FCI nomenklatúra URL":source,
    "FCI zdroj poznámka":"Zdroj. — FCI nomenklatúra – zdroj: ["+source+"]("+source+")",
  });
  assert.equal(readNotionStagedBreedField(p,"FCI zdroj poznámka"),"Zdroj.");
  p.properties["FCI zdroj poznámka"]=rich(
    "Zdroj. — FCI nomenklatúra – zdroj: ["+source+"](https://example.org)"
  );
  assert.deepEqual(invalidNotionStagedBreedTargets(p),["FCI zdroj poznámka"]);
});
test("unrelated hyphenated prose stays intact",()=>{
  const p=page({"Redakcia prehľad":"Povaha — priateľský pes.","Potreby":"Krátke prechádzky."});
  assert.equal(readNotionStagedBreedField(p,"Redakcia prehľad"),"Povaha — priateľský pes.");
  assert.deepEqual(invalidNotionStagedBreedTargets(p),[]);
});
test("sync adapter validates staged content instead of acknowledging conflicting text",async()=>{
  const text=await readFile(new URL("../lib/notion-breed-sync.ts",import.meta.url),"utf8");
  assert.ok(text.includes("readNotionStagedBreedField(page,column)"));
  assert.ok(text.includes("invalidNotionStagedBreedTargets(page)"));
  assert.ok(text.includes('BREED_STAGED_FIELD_REQUIRES_REVIEW'));
});
