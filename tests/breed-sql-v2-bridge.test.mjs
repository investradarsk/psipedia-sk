import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {
  BREED_ADDITIONAL_CANONICAL_SQL_FIELDS as SQL_COLUMNS,
  BREED_CANONICAL_JSON_FIELDS as JSON_COLUMNS,
} from "../lib/breed-storage-decision.mjs";
import {
  planBreedSqlV2FieldWrite,
  breedSqlV2CompareEnabled,
  compareBreedSqlV2Rows,
  summarizeBreedSqlV2Write,
  BREED_SQL_V2_PUBLIC_KEYS,
} from "../lib/breed-sql-v2-bridge.mjs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const sample={
 id:7, fci_standard_json:JSON.stringify({celkovy_vzhlad:"FCI overview",fci_standard_pdf:"https://example.test/standard.pdf"}),
 editorial_json:JSON.stringify({overview:"Redakčný text",curiosities:"Zaujímavosť"}),
 seo_json:JSON.stringify({title:"Plemeno",noindex:true,canonicalUrl:""}),
 related_breeds_json:"[2,5]",
};

test("v2 compare defaults OFF and cannot silently turn on from a loose value",()=>{
 assert.equal(breedSqlV2CompareEnabled(undefined),false);
 assert.equal(breedSqlV2CompareEnabled({}),false);
 assert.equal(breedSqlV2CompareEnabled({BREED_SQL_V2_COMPARE_MODE:"1"}),false);
 assert.equal(breedSqlV2CompareEnabled({BREED_SQL_V2_COMPARE_MODE:"enabled"}),false);
 assert.equal(breedSqlV2CompareEnabled({BREED_SQL_V2_COMPARE_MODE:"sql"}),false);
 assert.equal(breedSqlV2CompareEnabled({BREED_SQL_V2_COMPARE_MODE:"compare"}),true);
});

test("all 33 independent FCI text keys have ONE SQL plan",()=>{
 assert.equal(BREED_SQL_V2_PUBLIC_KEYS.fciStandard.length,33);
 const observed=new Set();
 for(const col of SQL_COLUMNS.breed_fci_standard){
   const key=col.slice("fci_".length);
   const plan=planBreedSqlV2FieldWrite("fciStandard."+key,"slovenský text");
   assert.equal(plan.kind,"one-to-one");
   assert.equal(plan.table,"breed_fci_standard");
   assert.equal(plan.column,col);
   assert.equal(plan.stored,"slovenský text");
   assert.ok(!observed.has(plan.column));
   observed.add(plan.column);
 }
 assert.equal(observed.size,33);
});

test("six editorial, eight SEO and six controlled numeric values map to the correct table",()=>{
 const editorFields={
   overview:"overview",coatCare:"coat_care",familyLife:"family_life",
   otherDogsLife:"other_dogs_life",curiosities:"curiosities",
   commonOwnerMistakes:"common_owner_mistakes",
   exerciseTip:"exercise_tip",trainingTip:"training_tip",
   healthTip:"health_tip",coatTip:"coat_tip",
 };
 for(const [key,col] of Object.entries(editorFields)){
   const plan=planBreedSqlV2FieldWrite("editorial."+key,"test");
   assert.deepEqual([plan.table,plan.column,plan.stored],["breed_editorial_text",col,"test"]);
 }
 const traits=planBreedSqlV2FieldWrite("editorial.heroTraits",[{label:"Pokoj",rating:4}]);
 assert.equal(traits.table,"breed_editorial_text");
 assert.equal(traits.column,"hero_traits_json");
 assert.equal(traits.stored,'[{"label":"Pokoj","rating":4}]');
 const seoFields={
   title:"seo_title",description:"seo_description",focusKeyword:"seo_focus_keyword",
   canonicalUrl:"seo_canonical_url",ogTitle:"seo_og_title",
   ogDescription:"seo_og_description",ogImage:"seo_og_image",
 };
 for(const [key,col] of Object.entries(seoFields)){
   const plan=planBreedSqlV2FieldWrite("seo."+key,"test");
   assert.deepEqual([plan.table,plan.column,plan.stored],["managed_breeds",col,"test"]);
 }
 assert.equal(planBreedSqlV2FieldWrite("seo.noindex",true).stored,1);
 assert.equal(planBreedSqlV2FieldWrite("seo.noindex",false).stored,0);
 assert.equal(planBreedSqlV2FieldWrite("seo.noindex",null).stored,null);
 for(const field of ["heightMinCm","heightMaxCm","weightMinKg","weightMaxKg",
   "lifespanMinYears","lifespanMaxYears"]){
   const p=planBreedSqlV2FieldWrite("controlled."+field,25.5);
   assert.equal(p.table,"breed_public_facts");
   assert.ok(SQL_COLUMNS.breed_public_facts.includes(p.column));
   assert.equal(p.stored,25.5);
 }
});

test("controlled multi-select JSON remains single atomic field, not separate storage",()=>{
 for(const field of ["originCountries","coatTypes","useTypes"]){
   const plan=planBreedSqlV2FieldWrite("controlled."+field,["Slovensko","Česko"]);
   assert.equal(plan.kind,"one-to-one");
   assert.equal(plan.table,"breed_public_facts");
   assert.equal(plan.format,"json-array");
   assert.ok(JSON_COLUMNS.breed_public_facts.includes(plan.column));
   assert.deepEqual(JSON.parse(plan.stored),["Slovensko","Česko"]);
   assert.throws(()=>planBreedSqlV2FieldWrite("controlled."+field,["Slovensko","Slovensko"]),/INVALID_VALUE/);
   assert.throws(()=>planBreedSqlV2FieldWrite("controlled."+field,"Slovensko"),/INVALID_VALUE/);
 }
 assert.equal(planBreedSqlV2FieldWrite("controlled.fciGroupSelect",8).column,"fci_group");
 assert.equal(planBreedSqlV2FieldWrite("controlled.fciSectionSelect","1.2").column,"fci_section_number");
 assert.equal(planBreedSqlV2FieldWrite("controlled.sizeSelect","Stredné").column,"size");
});

test("legacy actively-used JSON lists remain JSON; relations remain ordered SQL IDs",()=>{
 for(const key of ["gallery","sports","healthRisks","goodFor","consider","sources"]){
   const plan=planBreedSqlV2FieldWrite(key,[]);
   assert.equal(plan.table,"managed_breeds");
   assert.equal(plan.format,"json-array");
   assert.ok(JSON_COLUMNS.managed_breeds.includes(plan.column));
 }
 const relation=planBreedSqlV2FieldWrite("relatedBreedIds",[7,3,8]);
 assert.deepEqual(relation,{kind:"relations",table:"breed_related_breeds",ids:[7,3,8]});
 assert.throws(()=>planBreedSqlV2FieldWrite("relatedBreedIds",[1,1]),/INVALID_RELATIONS/);
 assert.throws(()=>planBreedSqlV2FieldWrite("relatedBreedIds",[-1]),/INVALID_RELATIONS/);
 assert.equal(planBreedSqlV2FieldWrite("editorial.notAColumn","payload"),null);
 assert.equal(planBreedSqlV2FieldWrite("fciStandard.name; DROP TABLE managed_breeds","x"),null);
 assert.equal(summarizeBreedSqlV2Write("seo.title","SECRET").stored,undefined);
});

test("read parity never mistakes empty/unknown NULL SQL slots for verified value",()=>{
 const stats=compareBreedSqlV2Rows(sample,{
   fci:{fci_celkovy_vzhlad:"FCI overview",fci_fci_standard_pdf:"https://example.test/standard.pdf"},
   editorial:{overview:"Redakčný text",curiosities:null},
   seo:{seo_title:"Plemeno",seo_noindex:1,seo_canonical_url:""},
   related:[{related_breed_id:2},{related_breed_id:5}],
 });
 assert.equal(stats.breedId,7);
 assert.equal(stats.different,0);
 assert.ok(stats.matching>=5);
 assert.ok(stats.unfilled>0);
 assert.equal(stats.missingRows,0);
 const drift=compareBreedSqlV2Rows(sample,{
   fci:{fci_celkovy_vzhlad:"Divergent value"},
   editorial:{overview:"Something else"},
   seo:{seo_title:"Different title"},
   related:[{related_breed_id:5},{related_breed_id:2}],
 });
 assert.ok(drift.different>=4);
 const unavailable=compareBreedSqlV2Rows(sample,{fci:null,editorial:null,seo:null,related:null});
 assert.equal(unavailable.missingRows,4);
 assert.equal(unavailable.checked,0);
});

test("all three entrypoints are wired as read-only preview, without activating canonical v2",()=>{
 const store=read("lib/breed-store.ts");
 const writer=read("lib/notion-breed-workcopy-direct-field.ts");
 const preview=read("lib/breed-sql-v2-preview.ts");
 const bridge=read("lib/breed-sql-v2-bridge.mjs");
 assert.match(store,/await compareBreedSqlV2Detail\(database, row, env/);
 assert.ok(store.split("await compareBreedSqlV2Detail(database, row, env").length>=3,
   "Admin and public detail must both be protected");
 assert.match(writer,/summarizeBreedSqlV2Write\(input.field,input.value\)/);
 assert.match(preview,/if\(!breedSqlV2CompareEnabled\(bindings\)\) return/);
 assert.match(preview,/SELECT \* FROM breed_fci_standard/);
 assert.match(preview,/SELECT \* FROM breed_editorial_text/);
 assert.doesNotMatch(preview,/\b(?:UPDATE|INSERT|DELETE|DROP)\s+(?:managed_breeds|breed_)/i);
 assert.doesNotMatch(bridge,/\b(?:UPDATE|INSERT|DELETE|DROP)\s+(?:managed_breeds|breed_)/i);
 const planned=read("docs/BREEDS-SQL-JSON-STEP4-20261119.md");
 assert.match(planned,/krok 5/i);
 assert.match(planned,/0174/);
});
