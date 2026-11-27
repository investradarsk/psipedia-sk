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

test("all 12 controlled fields match the captured schema plus the approved Kazakhstan option",()=>{
  assert.equal(BREED_CONTROLLED_FIELDS.length,12);
  const keys=new Set();
  for(const field of BREED_CONTROLLED_FIELDS){
    assert.ok(!keys.has(field.notion),"Duplicate typed field "+field.notion);
    keys.add(field.notion);
    assert.equal(notion[field.notion]?.type,field.type,field.notion);
    if(field.options){
      const expected=field.key==="originCountries"?[...new Set([...notion[field.notion].options,"Kazachstan"])]:notion[field.notion].options;
      assert.deepEqual(sorted(expected),sorted(field.options));
    }
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
    // Existing Notion URL properties remain compatible during a gradual
    // conversion to ordinary text. Each physical cell is still independent.
    if(spec.type==="url") {
      assert.ok(["url","text"].includes(notion[spec.notion]?.type),
        spec.id+" -> "+spec.notion);
    } else {
      assert.equal(notion[spec.notion]?.type,spec.type,spec.id+" -> "+spec.notion);
    }
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


test("new breed properties are encoded against actual schema types without a remote page or baseline",async()=>{
 const {encodeBreedWorkCopyCreateProperty:encode}=await import("../lib/notion-breed-workcopy-patch-bridge.mjs");
 const schema=BREED_NOTION_SCHEMA;
 const properties=Object.fromEntries(Object.entries(notion).map(([name,p])=>[name,{type:p.type==="text"?"rich_text":p.type}]));
 const title=encode({schema,properties,fieldId:"name",value:"Nové plemeno"});
 assert.equal(title.property,"Názov plemena");
 assert.equal(title.desiredProperty.title[0].text.content,"Nové plemeno");
 const empty=encode({schema,properties,fieldId:"seo.title",value:""});
 assert.deepEqual(empty.desiredProperty,{rich_text:[]});
 assert.throws(()=>encode({schema,properties:{},fieldId:"name",value:"Nové plemeno"}),/PROPERTY_TYPE_MISMATCH/);
 assert.throws(()=>encode({schema,properties,fieldId:"status",value:"published"}),/FIELD_NOT_EDITABLE/);
 assert.throws(()=>encode({schema,properties,fieldId:"name",value:null}),/TEXT_REQUIRED/);
});


test("a new Notion breed can be an incomplete private draft without fabricated ratings",async()=>{
  const {readInboundBreedDraft,readInboundBreedIdentity}=await import("../lib/notion-breed-inbound-draft.mjs");
  const page={properties:Object.fromEntries(Object.entries(notion).map(([name,definition])=>{
    const type=definition.type==="text"?"rich_text":definition.type;
    return [name,{type,[type]:["title","rich_text","multi_select"].includes(type)?[]:type==="checkbox"?false:null}];
  }))};
  page.properties["Odkontrolované"]={type:"checkbox",checkbox:false};
  const rich=(value,type="rich_text")=>({type,[type]:[{type:"text",plain_text:value,text:{content:value}}]});
  page.properties["Názov plemena"]=rich("Nové skúšobné plemeno","title");
  page.properties["Energia"]={type:"number",number:4};
  page.properties["Krajiny pôvodu"]={type:"multi_select",multi_select:[{name:"Kazachstan"}]};
  const draft=readInboundBreedDraft(page,BREED_NOTION_SCHEMA);
  assert.equal(draft.payload.slug,"nove-skusobne-plemeno");
  assert.equal(draft.payload.status,"draft");
  assert.equal(draft.payload.editorialComplete,false);
  assert.equal(draft.payload.fciNumber,null);
  assert.equal(draft.payload.fciGroup,0);
  assert.equal(draft.payload.energy,4);
  assert.equal(draft.payload.trainability,0);
  assert.equal(draft.payload.children,0);
  assert.equal(draft.payload.family,0);
  assert.equal(draft.controlled.fciGroupSelect,null);
  assert.deepEqual(draft.controlled.originCountries,["Kazachstan"]);
  assert.deepEqual(readInboundBreedIdentity(page),{id:"",source:null,reviewed:false});
  const missing=structuredClone(page);
  delete missing.properties["Energia"].number;
  assert.throws(()=>readInboundBreedDraft(missing,BREED_NOTION_SCHEMA),/PROPERTY_MISSING/);
  const invalid=structuredClone(page);
  invalid.properties["Energia"].number=6;
  assert.throws(()=>readInboundBreedDraft(invalid,BREED_NOTION_SCHEMA),/RATING_INVALID/);
  const old=structuredClone(page);
  old.properties["Psipedia ID"]=rich("42");
  assert.throws(()=>readInboundBreedDraft(old,BREED_NOTION_SCHEMA),/IDENTITY_REVIEW/);
  const original=structuredClone(page);
  original.properties["Zdrojový profil Notion"]={type:"url",url:"https://www.notion.so/old"};
  assert.throws(()=>readInboundBreedDraft(original,BREED_NOTION_SCHEMA),/IDENTITY_REVIEW/);
  const checked=structuredClone(page);
  checked.properties["Odkontrolované"].checkbox=true;
  assert.throws(()=>readInboundBreedDraft(checked,BREED_NOTION_SCHEMA),/IDENTITY_REVIEW/);
  const badSlug=structuredClone(page);
  badSlug.properties["URL profil / slug"]=rich("../old");
  assert.throws(()=>readInboundBreedDraft(badSlug,BREED_NOTION_SCHEMA),/SLUG_INVALID/);
  const untitled=structuredClone(page);
  untitled.properties["Názov plemena"]={type:"title",title:[]};
  assert.equal(readInboundBreedDraft(untitled,BREED_NOTION_SCHEMA),null);
});
