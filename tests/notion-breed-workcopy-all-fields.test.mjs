import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {BREED_NOTION_SCHEMA} from "../lib/notion-breed-property-registry.ts";
import {BREED_COMPACT_VISIBLE,BREED_COMPACT_MERGE,BREED_COMPACT_HEADINGS} from "../lib/breed-notion-compact-consolidation.mjs";
import {BREED_CONTROLLED_FIELDS,breedControlledNotionPayload,readBreedControlledNotionPage,touchedBreedControlledKeys,validateBreedControlledValue} from "../lib/breed-workcopy-controlled.mjs";
import {planBreedWorkCopyFieldWrite} from "../lib/notion-breed-workcopy-patch-bridge.mjs";
import {workCopyChangedEditorialIds,workCopyAdminChangedFields} from "../lib/notion-breed-workcopy-field-events.mjs";
import {splitBreedWorkCopyField,expandBreed60WorkPage} from "../lib/notion-breed-workcopy-adapter.mjs";
import {isBreedStructuredMeasurement} from "../lib/breed-controlled-fields.mjs";

const inventory=JSON.parse(readFileSync(new URL("./fixtures/breed-workcopy-notion-schema-20261110.json",import.meta.url),"utf8"));
const schema=BREED_NOTION_SCHEMA;
const ordinary=new Set(inventory.ordinaryVisible);
const mergeTargets=new Set(Object.values(BREED_COMPACT_MERGE));
const readText=(v)=>({type:"rich_text",rich_text:v?[{type:"text",plain_text:v,text:{content:v}}]:[]});
const readTitle=(v)=>({type:"title",title:[{type:"text",plain_text:v,text:{content:v}}]});
const emittedText=(v)=>(v?.rich_text??v?.title??[]).map(x=>x.text?.content??x.plain_text??"").join("");
const untouchedStamp="2026-11-10T10:00:00.000Z";
const entryFor=name=>schema.find(x=>x.notion===name&&x.mode==="content");
const listValues={healthRisks:["Alergie"],goodFor:["Rodiny"],consider:["Pravidelný pohyb"]};
const listAfter={healthRisks:["Koža"],goodFor:["Športovci"],consider:["Školenie"]};
function testValue(entry,stage){
  const value=stage==="old";
  if(entry.type==="number")return value?3:4;
  if(entry.type==="checkbox")return value?true:false;
  if(entry.type==="url")return value?"https://example.com/old":"https://example.com/new";
  if(entry.type==="title")return value?"Pôvodný názov":"Nový názov";
  if(entry.id==="sources")return value
    ?[{label:"FCI",url:"https://fci.be/old"}]
    :[{label:"Klub",url:"https://example.com/new"}];
  if(Object.hasOwn(listValues,entry.id))return value?listValues[entry.id]:listAfter[entry.id];
  const kind=entry.id==="weight"||entry.id.startsWith("fciStandard.hmotnost_")
    ?"kg":entry.id==="height"||entry.id.startsWith("fciStandard.vyska_")
      ?"cm":entry.id==="lifespan"?"rokov":null;
  if(kind)return value?"20–30 "+kind:"21–31 "+kind;
  return value?"Pôvodný text":"Upravený text";
}
function serialized(entry,value){
  if(entry.type==="number")return {type:"number",number:value};
  if(entry.type==="checkbox")return {type:"checkbox",checkbox:value};
  if(entry.type==="url")return {type:"url",url:value};
  if(entry.type==="title")return readTitle(value);
  if(entry.id==="sources")return readText(value.map(x=>x.label+"|"+x.url).join("; "));
  if(Object.hasOwn(listValues,entry.id))return readText(value.join("; "));
  return readText(value);
}
function workPage(properties={}){
  return {id:"40f793fc-1d18-8112-874d-dccab206d867",last_edited_time:untouchedStamp,properties:{
    "Psipedia ID":readText("3214"),
    "FCI číslo":{type:"number",number:171},
    "Zdrojový profil Notion":{type:"url",url:"https://app.notion.com/p/3f4793fc1d1881b28213dab0ae8f9280"},
    ...properties,
  }};
}
function patch(entry,page,value,baseline){
  return planBreedWorkCopyFieldWrite({
    schema,page,fieldId:entry.id,value,baseline,
    expectedPageRevision:page.last_edited_time,
  });
}
function controlledCell(field,value){
  const obj=breedControlledNotionPayload(field.key,value)[field.notion];
  return {id:"changed-"+field.key,type:field.type,...obj};
}

test("Notion physical schema is exactly 74: 56 editable + 3 special + 12 controlled + 3 identity",()=>{
  const names=Object.keys(inventory.properties);
  assert.equal(names.length,74);
  const group=[...inventory.ordinaryVisible,...inventory.special,...inventory.controlled,...inventory.identity];
  assert.equal(group.length,74);
  assert.equal(new Set(group).size,74);
  assert.deepEqual([...group].sort(),[...names].sort());
  assert.equal(BREED_COMPACT_VISIBLE.length,60);
  assert.equal(inventory.ordinaryVisible.length,56);
  assert.equal(BREED_CONTROLLED_FIELDS.length,12);
  assert.deepEqual(inventory.controlled,BREED_CONTROLLED_FIELDS.map(x=>x.notion));
  for(const name of BREED_COMPACT_VISIBLE){
    const match=schema.find(x=>x.notion===name);
    assert.ok(match,"Missing registry entry: "+name);
    assert.equal(match.type,inventory.properties[name],"Type drift in "+name);
  }
  for(const f of BREED_CONTROLLED_FIELDS){
    assert.equal(f.type,inventory.properties[f.notion],"Controlled type drift: "+f.notion);
    assert.equal(schema.some(x=>x.notion===f.notion),false,"Controlled field must not be rerouted through legacy prose");
  }
  assert.deepEqual(inventory.identity.sort(),["FCI číslo","Psipedia ID","Zdrojový profil Notion"].sort());
});

test("all 56 ordinary physical fields independently plan Admin → Notion, revert, and clear",()=>{
  const exercised=[];
  for(const name of inventory.ordinaryVisible){
    const entry=entryFor(name);
    assert.ok(entry,"No writable entry for "+name);
    const old=testValue(entry,"old"),next=testValue(entry,"new");
    const sections=Object.entries(BREED_COMPACT_MERGE)
      .filter(([,target])=>target===name).slice(0,2)
      .map(([source],i)=>" — "+BREED_COMPACT_HEADINGS[source]+": Strážny údaj "+i+".").join("");
    const original=serialized(entry,old);
    if(mergeTargets.has(name))original.rich_text=readText(emittedText(original)+sections).rich_text;
    const page=workPage({[name]:{id:"changed-prop",...original}});
    const first=patch(entry,page,next,old);
    assert.equal(first.property,name,"Wrong outbound target "+name);
    assert.deepEqual(Object.keys(first.properties),[name],"Touched another property "+name);
    assert.equal(first.changed,true,"No change planned for "+name);
    if(entry.type==="rich_text" || entry.type==="text")assert.ok(first.properties[name].rich_text!==undefined);
    const before=JSON.stringify(page.properties);
    if(mergeTargets.has(name)){
      const prev=splitBreedWorkCopyField(name,emittedText(original));
      const after=splitBreedWorkCopyField(name,first.nextText);
      assert.deepEqual(after.sources,prev.sources,"Lost merged sibling for "+name);
    }
    assert.ok(JSON.stringify(page.properties)===before,"Planner mutated input "+name);
    page.properties[name]={...original,...first.properties[name]};
    const back=patch(entry,page,old,next);
    assert.equal(back.changed,true,"Cannot plan reversal for "+name);
    assert.deepEqual(Object.keys(back.properties),[name]);
    const cleared=entry.type==="number"?null:entry.type==="checkbox"?false:entry.type==="title"?"":Object.hasOwn(listValues,entry.id)||entry.id==="sources"?[]:"";
    if(entry.type!=="title"){
      const clearedCell=patch(entry,page,cleared,next);
      assert.deepEqual(Object.keys(clearedCell.properties),[name],"Cannot clear "+name);
    }
    const inbound=workCopyChangedEditorialIds(page,["changed-prop"],schema);
    assert.ok(inbound.includes(entry.id),"Signed inbound event misses "+name);
    const only=workCopyAdminChangedFields({[entry.id]:old},{[entry.id]:next},[entry.id],[entry.id]);
    assert.deepEqual(only,[entry.id],"Admin change not detected for "+name);
    exercised.push(name);
  }
  assert.equal(exercised.length,56);
  console.log("ORDINARY_56_FIELD_PURE_ROUNDTRIPS=56");
});

test("all 23 merged historic FCI/editorial subfields preserve unrelated original sections",()=>{
  let count=0;
  for(const [source,target] of Object.entries(BREED_COMPACT_MERGE)){
    const entry=schema.find(x=>x.notion===source&&x.mode==="content");
    assert.ok(entry,"Missing source registry: "+source);
    assert.equal(mergeTargets.has(target),true);
    const old=entry.type==="url"?"https://example.com/old":entry.type==="date"?"2026-10-31":"Pôvodný pododdiel";
    const next=entry.type==="url"?"https://example.com/new":entry.type==="date"?"2026-11-10":"Nový pododdiel";
    const siblings=Object.keys(BREED_COMPACT_MERGE).filter(x=>BREED_COMPACT_MERGE[x]===target&&x!==source);
    const sibling=siblings[0];
    const suffix=sibling?" — "+BREED_COMPACT_HEADINGS[sibling]+": Sesterská hodnota":"";
    const txt="Základný opis"+ " — "+BREED_COMPACT_HEADINGS[source]+": "+old+suffix;
    const page=workPage({[target]:{id:"merged-prop",...readText(txt)}});
    const nextPatch=patch(entry,page,next,old);
    assert.deepEqual(Object.keys(nextPatch.properties),[target],"Merged edit touched siblings "+source);
    const parsed=splitBreedWorkCopyField(target,nextPatch.nextText);
    assert.equal(parsed.sources[source],next,"Wrong source replacement "+source);
    assert.equal(parsed.base,"Základný opis");
    if(sibling)assert.equal(parsed.sources[sibling],"Sesterská hodnota","Sibling changed "+source);
    page.properties[target]={id:"merged-prop",...readText(nextPatch.nextText)};
    const clear=patch(entry,page,"",next);
    assert.deepEqual(Object.keys(clear.properties),[target],"No source clear "+source);
    const cleared=splitBreedWorkCopyField(target,clear.nextText);
    assert.equal(cleared.sources[source],undefined,"Cleared section remains "+source);
    assert.equal(cleared.base,"Základný opis");
    if(sibling)assert.equal(cleared.sources[sibling],"Sesterská hodnota");
    assert.ok(workCopyChangedEditorialIds(page,["merged-prop"],schema).includes(entry.id));
    count++;
  }
  assert.equal(count,23);
  console.log("MERGED_SUBFIELD_PURE_ROUNDTRIPS=23");
});

test("all 12 controlled fields accept typed Notion ↔ Admin values and explicit null/empty clearing",()=>{
  for(const field of BREED_CONTROLLED_FIELDS){
    const value=field.type==="number"
      ?field.key.startsWith("lifespan")?12:field.key.startsWith("weight")?23:55
      :field.type==="select"?field.options[0]:[field.options[0]];
    const normalized=validateBreedControlledValue(field.key,value);
    const cell=controlledCell(field,normalized);
    const page=workPage({[field.notion]:cell});
    assert.deepEqual(touchedBreedControlledKeys(page,[cell.id]),[field.key]);
    const extracted=readBreedControlledNotionPage(page,[field.key]);
    assert.deepEqual(extracted.errors,[],field.notion);
    assert.deepEqual(extracted.values[field.key],normalized,field.notion);
    const clearValue=field.type==="multi_select"?[]:null;
    const cleared=controlledCell(field,clearValue);
    page.properties[field.notion]=cleared;
    assert.deepEqual(readBreedControlledNotionPage(page,[field.key]).values[field.key],clearValue);
  }
  console.log("CONTROLLED_12_FIELD_PURE_ROUNDTRIPS=12");
});

test("unsupported/immutable fields cannot silently enter editorial PATCH",()=>{
  const page=workPage({
    "Hlavný obrázok URL":{type:"url",url:"https://example.com/a"},
    "Galéria JSON":readText("[]"),
    "Športy JSON":readText("[]"),
  });
  const touched=["FCI číslo","Psipedia ID","Zdrojový profil Notion",
    "Hlavný obrázok URL","Galéria JSON","Športy JSON"];
  assert.deepEqual(workCopyChangedEditorialIds(page,touched,schema),[]);
  for(const f of ["image","gallery","sports"]){
    const entry=schema.find(x=>x.id===f);
    assert.ok(entry);
    assert.throws(()=>patch(entry,page,entry.type==="url"?"https://example.com/b":"[]",
      entry.type==="url"?"https://example.com/a":"[]"),
    /BREED_WORKCOPY_FIELD_NOT_EDITABLE/);
  }
  assert.throws(()=>patch({id:"system.FCI číslo"},page,175,171),
    /BREED_WORKCOPY_FIELD_OR_BASELINE_UNKNOWN/);
  assert.equal(Object.keys(page.properties).length,6);
});

test("all six legacy measurement leaves reject prose but allow explicit empty deletion",()=>{
  const fields=["weight","height","lifespan",
    "fciStandard.vyska_pes_cm","fciStandard.vyska_suka_cm",
    "fciStandard.hmotnost_pes_kg","fciStandard.hmotnost_suka_kg"];
  for(const field of fields){
    assert.equal(isBreedStructuredMeasurement(field,""),true,"Explicit clear blocked: "+field);
    assert.equal(isBreedStructuredMeasurement(field,"  "),true,"Blank clear blocked: "+field);
    assert.equal(isBreedStructuredMeasurement(field,"Psy sú 30 kg, sučky menej"),false,"Invalid prose accepted: "+field);
  }
});

test("read-only adapter retains 60 physical fields and never creates a second writable identity",()=>{
  const page=workPage();
  for(const name of BREED_COMPACT_VISIBLE){
    const entry=schema.find(x=>x.notion===name);
    page.properties[name]={id:"p-"+name,...serialized(entry,testValue(entry,"old"))};
  }
  const original=JSON.stringify(page);
  const projection=expandBreed60WorkPage(page);
  assert.deepEqual(projection.errors,[]);
  for(const name of BREED_COMPACT_VISIBLE)assert.ok(Object.hasOwn(projection.page.properties,name),name);
  assert.equal(Object.hasOwn(projection.page.properties,"Slug"),false);
  assert.equal(JSON.stringify(page),original);
  console.log("PHYSICAL_SCHEMA=74 ordinary=56 controlled=12 identity=3 special=3");
});
