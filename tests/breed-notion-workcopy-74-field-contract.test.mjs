import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {BREED_NOTION_SCHEMA} from "../lib/notion-breed-property-registry.ts";
import {BREED_CONTROLLED_FIELDS} from "../lib/breed-workcopy-controlled.mjs";
import {
  BREED_WORKCOPY_PHYSICAL_PROPERTIES,
  BREED_WORKCOPY_EDITORIAL_PROPERTIES,
  BREED_WORKCOPY_TECHNICAL_PROPERTIES,
  BREED_WORKCOPY_HISTORICAL_PROPERTIES,
  breedWorkcopyPhysicalProperty,
  breedWorkcopyPropertyKind,
} from "../lib/breed-notion-workcopy-field-contract.mjs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const fixture=JSON.parse(read("tests/fixtures/breed-notion-workcopy-90-schema.json"));
const notion=fixture.properties;
const sorted=values=>[...values].sort((a,b)=>a.localeCompare(b,"sk"));

test("current 90-column Notion schema exactly matches the declared physical contract",()=>{
  assert.equal(fixture.dataSourceId,"f460b1e5-4454-4a10-9200-3b35106f9e32");
  assert.equal(fixture.propertyCount,90);
  assert.equal(BREED_WORKCOPY_PHYSICAL_PROPERTIES.length,90);
  assert.equal(new Set(BREED_WORKCOPY_PHYSICAL_PROPERTIES).size,90);
  assert.deepEqual(sorted(BREED_WORKCOPY_PHYSICAL_PROPERTIES),sorted(Object.keys(notion)));
  assert.deepEqual(BREED_WORKCOPY_TECHNICAL_PROPERTIES,
    ["Psipedia ID","Zdrojový profil Notion","URL profil / slug"]);
  for(const name of BREED_WORKCOPY_PHYSICAL_PROPERTIES)
    assert.ok(breedWorkcopyPropertyKind(name),"Unclassified column: "+name);
});

test("all 12 controlled fields have exactly the live names, types and select options",()=>{
  assert.equal(BREED_CONTROLLED_FIELDS.length,12);
  const keys=new Set();
  for(const field of BREED_CONTROLLED_FIELDS){
    assert.ok(!keys.has(field.notion),"Duplicate typed field "+field.notion);
    keys.add(field.notion);
    assert.equal(notion[field.notion]?.type,field.type,field.notion);
    if(field.options)assert.deepEqual(sorted(notion[field.notion].options),sorted(field.options));
  }
  assert.equal(BREED_CONTROLLED_FIELDS.find(x=>x.key==="fciGroupSelect").notion,"FCI skupina");
  assert.equal(BREED_CONTROLLED_FIELDS.find(x=>x.key==="originCountries").notion,"Krajiny pôvodu");
});

test("every live editorial Admin field maps to one real Notion cell, never to a merged sibling",()=>{
  const mapped=BREED_NOTION_SCHEMA.filter(spec=>spec.mode==="content")
    .map(spec=>({id:spec.id,notion:breedWorkcopyPhysicalProperty(spec.notion),type:spec.type}))
    .filter(x=>x.notion);
  assert.equal(new Set(mapped.map(x=>x.notion)).size,mapped.length);
  assert.deepEqual(sorted(mapped.map(x=>x.notion)),sorted(BREED_WORKCOPY_EDITORIAL_PROPERTIES));
  for(const spec of mapped){
    // The new Notion source stores legacy URL-labelled editorial cells as text.
    const expected=spec.type==="url"?"text":spec.type;
    assert.equal(notion[spec.notion]?.type,expected,spec.id+" -> "+spec.notion);
  }
  const field=id=>mapped.find(x=>x.id===id)?.notion;
  assert.equal(field("editorial.overview"),"Prehľad plemena");
  assert.equal(field("needs"),"Každodenné potreby plemena");
  assert.equal(field("editorial.coatCare"),"Starostlivosť o srsť");
  assert.equal(field("grooming"),"Náročnosť starostlivosti");
  assert.equal(field("fciStandard.oci"),"FCI oči");
  assert.equal(field("fciStandard.hlava_lebecna_cast"),"FCI lebka");
  assert.equal(field("name"),"Názov plemena");
  assert.equal(field("image"),"Titulná fotografia (JPG, PNG, WebP alebo AVIF do 8 MB)");
  assert.equal(field("gallery"),"Ďalšie fotografie");
  assert.equal(field("sports"),"Športy a aktivity");
});

test("only Psipedia ID is a matching identity; historical fields are not re-imported",()=>{
  for(const field of ["Dĺžka života","Hmotnosť","Výška","Krajina pôvodu","Veľkosť","FCI skupina","FCI sekcia","Skupina"]){
    assert.equal(breedWorkcopyPhysicalProperty(field),null);
  }
  for(const field of BREED_WORKCOPY_HISTORICAL_PROPERTIES){
    assert.ok(notion[field]);
    assert.equal(breedWorkcopyPropertyKind(field),"historical");
  }
  assert.equal(breedWorkcopyPhysicalProperty("Psipedia ID"),null);
  assert.equal(breedWorkcopyPhysicalProperty("Slug"),null);
  assert.equal(breedWorkcopyPropertyKind("FCI číslo"),"content");
});

test("live event parser and Admin writer both use the same direct resolver",()=>{
  const event=read("lib/notion-breed-workcopy-field-values.mjs");
  const writer=read("lib/notion-breed-workcopy-patch-bridge.mjs");
  const preview=read("lib/notion-breed-workcopy-compatible-page.mjs");
  assert.match(event,/breedWorkcopyPhysicalProperty\(entry.notion\)/);
  assert.match(writer,/breedWorkcopyPhysicalProperty\(entry.notion\)/);
  assert.match(preview,/breedWorkcopyPhysicalProperty\(field.notion\)/);
  assert.doesNotMatch(event,/splitBreedWorkCopyField/);
  assert.doesNotMatch(writer,/splitBreedWorkCopyField|planBreedWorkCopyMergedFieldPatch/);
});
