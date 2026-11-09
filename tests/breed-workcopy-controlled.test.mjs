import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  BREED_CONTROLLED_FIELDS,breedControlledKeys,
  emptyBreedControlledValues,parseBreedControlledValues,
  readBreedControlledNotionPage,touchedBreedControlledKeys,
  breedControlledNotionPayload,validateBreedControlledValue,
} from "../lib/breed-workcopy-controlled.mjs";

const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const fixture=()=>{
  const props={};
  for (const field of BREED_CONTROLLED_FIELDS) {
    props[field.notion]=field.type==="number"
      ? {id:"p-"+field.key,type:"number",number:null}
      : field.type==="select"
        ? {id:"p-"+field.key,type:"select",select:null}
        : {id:"p-"+field.key,type:"multi_select",multi_select:[]};
  }
  props["Srsť"]={id:"original-coat",type:"rich_text",rich_text:[
    {plain_text:"Hustá srsť s výraznou podsadou; pes potrebuje pravidelné česanie."}]};
  props["Hmotnosť"]={id:"original-weight",type:"rich_text",rich_text:[
    {plain_text:"Psy približne 26–35 kg; sučky podľa línie."}]};
  return {properties:props};
};

test("12 Notion fields have distinct keys and physical names with exact types",()=>{
  assert.equal(BREED_CONTROLLED_FIELDS.length,12);
  assert.equal(new Set(breedControlledKeys).size,12);
  assert.equal(new Set(BREED_CONTROLLED_FIELDS.map(x=>x.notion)).size,12);
  assert.deepEqual(BREED_CONTROLLED_FIELDS.filter(x=>x.type==="number").map(x=>x.key),
    ["heightMinCm","heightMaxCm","weightMinKg","weightMaxKg","lifespanMinYears","lifespanMaxYears"]);
});

test("numeric types permit null clearing but refuse AI sentences/out-of-bounds",()=>{
  assert.equal(validateBreedControlledValue("heightMinCm",56.5),56.5);
  assert.equal(validateBreedControlledValue("weightMinKg",null),null);
  assert.throws(()=>validateBreedControlledValue("weightMinKg","asi 30 kg"),/NUMBER_INVALID/);
  assert.throws(()=>validateBreedControlledValue("lifespanMaxYears",100),/NUMBER_INVALID/);
  assert.throws(()=>validateBreedControlledValue("fciGroupSelect","99"),/SELECT_INVALID/);
  assert.throws(()=>validateBreedControlledValue("useTypes",["Lovecký","Neznáme"]),/MULTI_SELECT_INVALID/);
});

test("Notion reading, exact property-ID targeting, and independent clear round trips",()=>{
  const page=fixture();
  page.properties["FCI skupina (výber)"].select={name:"8"};
  page.properties["Krajiny pôvodu (výber)"].multi_select=[{name:"Spojené kráľovstvo"}];
  page.properties["Hmotnosť od (kg)"].number=25.5;
  const found=readBreedControlledNotionPage(page);
  assert.deepEqual(found.errors,[]);
  assert.equal(found.values.fciGroupSelect,"8");
  assert.deepEqual(found.values.originCountries,["Spojené kráľovstvo"]);
  assert.equal(found.values.weightMinKg,25.5);
  assert.deepEqual(touchedBreedControlledKeys(page,["p-weightMinKg","Srsť"]),["weightMinKg"]);
  assert.deepEqual(breedControlledNotionPayload("weightMinKg",null),{"Hmotnosť od (kg)":{number:null}});
  assert.deepEqual(breedControlledNotionPayload("coatTypes",[]),{"Typ srsti (výber)":{multi_select:[]}});
  assert.deepEqual(breedControlledNotionPayload("fciGroupSelect",null),{"FCI skupina (výber)":{select:null}});
  assert.equal(page.properties["Hmotnosť"].rich_text[0].plain_text,
    "Psy približne 26–35 kg; sučky podľa línie.");
  assert.equal(page.properties["Srsť"].rich_text[0].plain_text.includes("podsadou"),true);
});

test("invalid controlled cells do not erase valid siblings",()=>{
  const page=fixture();
  page.properties["Výška od (cm)"].number="šesťdesiat";
  page.properties["Dĺžka života od (roky)"].number=10;
  const result=readBreedControlledNotionPage(page,["heightMinCm","lifespanMinYears"]);
  assert.deepEqual(result.errors.map(x=>x.key),["heightMinCm"]);
  assert.equal(result.values.lifespanMinYears,10);
});

test("stored snapshots distinguish missing keys from explicit null/empty lists",()=>{
  const old=parseBreedControlledValues("{}");
  assert.deepEqual(old,emptyBreedControlledValues());
  const newer=parseBreedControlledValues(JSON.stringify({sizeSelect:"Malé",useTypes:[]}));
  assert.equal(newer.sizeSelect,"Malé");
  assert.deepEqual(newer.useTypes,[]);
  assert.throws(()=>parseBreedControlledValues('{"heightMaxCm":"50 cm"}'),/NUMBER_INVALID/);
});

test("integration uses a separate D1 sidecar and only ACTIVE targeted links",()=>{
  const migration=source("drizzle/0162_breed_notion_controlled_values.sql");
  const runtime=source("lib/notion-breed-workcopy-controlled.ts");
  const sweep=source("lib/notion-breed-workcopy-sync.ts");
  const route=source("app/api/admin/breeds/[id]/controlled/route.ts");
  const editor=source("components/admin-breed-editor.tsx");
  assert.match(migration,/CREATE TABLE IF NOT EXISTS breed_notion_controlled_values/);
  assert.doesNotMatch(migration,/ALTER TABLE managed_breeds|DROP TABLE/);
  assert.match(runtime,/status='ACTIVE'/);
  assert.match(runtime,/revision=revision\+1/);
  assert.match(runtime,/BREED_CONTROLLED_REMOTE_CHANGED/);
  assert.match(runtime,/receiveBreedControlledNotionEdit/);
  assert.match(sweep,/receiveBreedControlledNotionEdit\(/);
  assert.match(route,/requireAdminMutation/);
  assert.match(editor,/Kontrolované údaje – Notion/);
});
