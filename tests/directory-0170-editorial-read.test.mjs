import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  overlayDirectory0170EditorialFields, readDirectory0170EditorialFields,
} from "../lib/directory-0170-editorial-read.ts";
import { readDirectoryPublicMetadataSource } from "../lib/directory-public-facts.ts";

const base = {
  "Ordinačné hodiny": "Staré hodiny",
  "Pohotovosť": "Legacy text",
  "Plemená": "Retriever",
  "Zdroj dát": "Source provenance",
  "Otváracia doba": "Stará aliasová hodnota",
  "_psipedia_filter_v1_veterinari_emergency": "yes",
  "_psipedia_additional_categories": '["fyzioterapia"]',
};
const facts = [
  {field_key:"Ordinačné hodiny",value_text:""},
  {field_key:"Pohotovosť",value_text:"SQL must not override select/legacy collision"},
  {field_key:"Plemená",value_text:"SQL text must not override relation"},
  {field_key:"Zdroj dát",value_text:"not an approved SQL public fact"},
];
const filters=[
  {category:"veterinari",filter_id:"veterinari.emergency",value_text:"no"},
  {category:"fyzioterapia",filter_id:"fyzioterapia.hydrotherapy",value_text:"yes"},
  {category:"veterinari",filter_id:"veterinari.unknown",value_text:"yes"},
];

test("confirmed SQL fact is authoritative, INCLUDING a deliberate blank; legacy alias never resurrects",()=>{
  const result=overlayDirectory0170EditorialFields({
    category:"veterinari",source:base,facts,filters,audience:"public",
  });
  assert(result);
  assert.equal(result["Ordinačné hodiny"],"");
  assert.deepEqual(readDirectoryPublicMetadataSource(result,"Ordinačné hodiny"),{
    sourceKey:"Ordinačné hodiny",value:"",
  });
  assert.equal(result["Pohotovosť"],"Legacy text");
  assert.equal(result["Plemená"],"Retriever");
  assert.equal(result["Zdroj dát"],"Source provenance");
  assert.equal(result["_psipedia_filter_v1_veterinari_emergency"],undefined,
    "public response cannot expose retired JSON filter keys");
  assert.equal(base["Ordinačné hodiny"],"Staré hodiny","input is immutable");
});

test("Admin sees SQL filter value, preserving unrelated keys and secondary membership",()=>{
  const result=overlayDirectory0170EditorialFields({
    category:"veterinari",source:base,facts,filters,audience:"admin",
  });
  assert(result);
  assert.equal(result["_psipedia_filter_v1_veterinari_emergency"],"no");
  assert.equal(result["_psipedia_additional_categories"],'["fyzioterapia"]');
  assert.equal(result["_psipedia_filter_v1_fyzioterapia_hydrotherapy"],undefined);
});

test("an explicit SQL filter deletion suppresses a stale historical selected value",()=> {
  const result=overlayDirectory0170EditorialFields({
    category:"veterinari",source:base,facts:[],filters:[],audience:"admin",
  });
  assert.equal(result?.["_psipedia_filter_v1_veterinari_emergency"],undefined);
  assert.equal(result?.["Zdroj dát"],"Source provenance");
});

test("unknown explicit tri-state is not the same as a missing SQL row",()=>{
  const source={...base};
  const result=overlayDirectory0170EditorialFields({
    category:"veterinari",source,
    facts:[],filters:[{category:"veterinari",filter_id:"veterinari.home_visits",value_text:"unknown"}],
    audience:"admin",
  });
  assert.equal(result?.["_psipedia_filter_v1_veterinari_home_visits"],"unknown");
  assert.equal(result?.["_psipedia_filter_v1_veterinari_emergency"],undefined,
    "an absent SQL value must not resurrect old yes");
});

test("no SQL rows preserve unrelated historical facts but discard retired filter keys",()=>{
  const result=overlayDirectory0170EditorialFields({
    category:"veterinari",source:base,facts:[],filters:[],audience:"admin",
  });
  assert.deepEqual(result, Object.fromEntries(
    Object.entries(base).filter(([key])=>!key.startsWith("_psipedia_filter_v1_"))
  ));
  assert.notStrictEqual(result,base);
  const empty=overlayDirectory0170EditorialFields({
    category:"veterinari",source:null,facts:[],filters:[],audience:"public",
  });
  assert.equal(empty,null);
  const unknown=overlayDirectory0170EditorialFields({
    category:"obsolete",source:base,facts,filters,audience:"admin",
  });
  assert.deepEqual(unknown,base);
});

test("invalid or mismatched SQL records cannot be promoted to editable or public values",()=>{
  const result=overlayDirectory0170EditorialFields({
    category:"veterinari",source:base,
    facts:[...facts,{field_key:"Ordinačné hodiny",value_text:42},
      {field_key:"Služby",value_text:"Unapproved"},{field_key:"",value_text:"Ignored"}],
    filters:[{category:"veterinari",filter_id:"veterinari.emergency",value_text:"invalid"},
      {category:"treneri",filter_id:"treneri.group_training",value_text:"yes"}],
    audience:"admin",
  });
  assert.equal(result?.["Ordinačné hodiny"],"");
  assert.equal(result?.["Služby"],undefined);
  assert.equal(result?.["_psipedia_filter_v1_veterinari_emergency"],undefined);
});

test("D1 query reads existing per-profile SQL rows and leaves unedited legacy values intact",async()=>{
  const sql=new DatabaseSync(":memory:");
  try{
    sql.exec(
      "CREATE TABLE directory_profile_public_facts("+
        "profile_id INTEGER,field_key TEXT,value_text TEXT);"+
      "CREATE TABLE directory_profile_filter_values("+
        "profile_id INTEGER,category TEXT,filter_id TEXT,value_text TEXT);"+
      "CREATE TABLE directory_profile_extra_fields("+
        "profile_id INTEGER,field_key TEXT,value_kind TEXT,text_value TEXT,number_value REAL);"
    );
    sql.prepare("INSERT INTO directory_profile_public_facts VALUES(?,?,?)")
      .run(42,"Ordinačné hodiny","Nové hodiny");
    sql.prepare("INSERT INTO directory_profile_filter_values VALUES(?,?,?,?)")
      .run(42,"veterinari","veterinari.emergency","no");
    const db={
      prepare(query){
        return {bind(...args){return {async first(){
          return sql.prepare(query).get(...args)??null;
        }}}};
      },
    };
    const result=await readDirectory0170EditorialFields(db,{
      profileId:42,category:"veterinari",source:base,audience:"admin",
    });
    assert.equal(result?.["Ordinačné hodiny"],"Nové hodiny");
    assert.equal(result?.["_psipedia_filter_v1_veterinari_emergency"],"no");
    assert.equal(result?.["Zdroj dát"],"Source provenance");
    const untouched=await readDirectory0170EditorialFields(db,{
      profileId:43,category:"veterinari",source:base,audience:"public",
    });
    assert.equal(untouched?.["Ordinačné hodiny"],"Staré hodiny");
    await assert.rejects(()=>readDirectory0170EditorialFields(db,{
      profileId:0,category:"veterinari",source:base,audience:"admin",
    }),/INVALID_ID/);
    const broken={prepare(){throw Error("D1_unavailable")}};
    await assert.rejects(()=>readDirectory0170EditorialFields(broken,{
      profileId:42,category:"veterinari",source:base,audience:"admin",
    }),/D1_unavailable/);
  }finally{sql.close();}
});

test("canonical profile detail SQL includes address fields and never selects the raw legacy JSON column",()=>{
  const store=readFileSync(new URL("../lib/directory-store.ts",import.meta.url),"utf8");
  const select=store.slice(
    store.indexOf("const DIRECTORY_PROFILE_COLUMNS ="),
    store.indexOf("const DIRECTORY_CARD_COLUMNS ="),
  );
  for(const column of ["postal_code","street","house_number","address_format","service_address_confirmation"])
    assert.match(select,new RegExp("\\b"+column+"\\b"));
  assert.match(select,/json_object\('_psipedia_additional_categories'/);
  assert.doesNotMatch(store,/SELECT \* FROM directory_profiles/);
});

test("SQL-first public single detail and fail-closed Admin editor GET use same resolver",()=>{
  const store=readFileSync(new URL("../lib/directory-store.ts",import.meta.url),"utf8");
  const route=readFileSync(new URL("../app/api/admin/directory/[id]/route.ts",import.meta.url),"utf8");
  const page=readFileSync(new URL("../app/admin/adresar/[id]/page.tsx",import.meta.url),"utf8");
  assert.match(page,/const importData=await readDirectory0170EditorialFields\(db/);
  assert.match(page,/source:canonicalProfile\.importData,audience:"admin"/);
  assert.match(page,/editorialReadError\s*\?\s*<p role="alert">/);
  assert.match(store,/const importData=await readDirectory0170EditorialFields\(database/);
  assert.match(store,/source:profile\.importData,audience:"public"/);
  assert.match(route,/const importData=await readDirectory0170EditorialFields\(db/);
  assert.match(route,/source:profile\.importData,audience:"admin"/);
  assert.match(route,/Kontrola SQL údajov profilu zlyhala/);
  assert.doesNotMatch(store,/return await readDirectory0170EditorialFields\(database/);
});
