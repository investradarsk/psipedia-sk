import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import {DIRECTORY_FIELD_EVENT_CATEGORIES,isDirectoryFieldEventCategory,isDirectoryEventPilotCategory}
 from "../lib/notion-directory-field-event-scope.ts";

const directory=await readFile(new URL("../lib/notion-directory-sync.ts",import.meta.url),"utf8");
const start=directory.indexOf("const breederScalarColumns:");
const end=directory.indexOf("/**\n * Mapped breeder/trainer event mode:",start);
assert.ok(start>0&&end>start,"per-field saved-source extraction must remain available");
const js=ts.transpileModule(directory.slice(start,end)+
 "\nexports.saveBreederEditorialValue = saveBreederEditorialValue;",{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;

function setup(category){
 const writes=[];
 const record={id:1826,category,status:"draft",updatedAt:"2026-11-12T12:00:00.000Z"};
 const db={prepare(sql){return {bind(...args){
   writes.push({sql,args});
   return {async first(){return {id:1826}}};
 }}}};
 const out={};
 runInNewContext(js,{
   exports:out,SYSTEM_ACTOR:"directory-sync-contract-test",
   directoryFilterRegistry:[],
   TRAINER_SERVICES_TEXT_METADATA_KEY:"_psipedia_trainer_services_text",
   isDirectoryFieldEventCategory,isDirectoryEventPilotCategory,
   breederReadPath:(snapshot,path)=>path.split(".").reduce((v,key)=>v?.[key],snapshot),
   normalizeDirectorySearchText:value=>value,
   getManagedDirectoryProfileById:async()=>record,
 });
 return {record,writes,db,save:out.saveBreederEditorialValue};
}
function desired(){
 return {
   name:"Testovací profil",description:"x",excerpt:"",services:[],qualifications:[],
   city:"",region:"",district:"",address:"",postalCode:"",street:"",houseNumber:"",
   seo:{title:"Test SEO"},
   publicPhone:"0912345678",
 };
}
test("all ten Directory categories save Popis, SEO and contacts independently with CAS",async()=>{
 assert.equal(DIRECTORY_FIELD_EVENT_CATEGORIES.length,10);
 for(const category of DIRECTORY_FIELD_EVENT_CATEGORIES){
   const ctx=setup(category);
   const next=desired();
   await ctx.save(ctx.db,ctx.record,next,"description");
   await ctx.save(ctx.db,ctx.record,next,"seo.title");
   await ctx.save(ctx.db,ctx.record,next,"publicPhone");
   assert.equal(ctx.writes.length,3,category);
   assert.match(ctx.writes[0].sql,/description = \?/);
   assert.equal(ctx.writes[0].args[0],"x");
   assert.match(ctx.writes[1].sql,/seo_json = json_set/);
   assert.equal(ctx.writes[1].args[1],"Test SEO");
   assert.match(ctx.writes[2].sql,/source_data_json = json_set/);
   assert.equal(ctx.writes[2].args[1],"0912345678");
   for(const write of ctx.writes){
     assert.match(write.sql,/updated_at = \?/);
     assert.match(write.sql,/status <> 'archived'/);
     assert.doesNotMatch(write.sql,/services_json\s*=/);
     assert.doesNotMatch(write.sql,/DELETE FROM/);
   }
 }
});
test("explicit blank Popis saves as empty string in every Directory category",async()=>{
 for(const category of DIRECTORY_FIELD_EVENT_CATEGORIES){
   const ctx=setup(category);
   await ctx.save(ctx.db,ctx.record,{...desired(),description:""},"description");
   assert.equal(ctx.writes[0].args[0],"",category);
   assert.doesNotMatch(ctx.writes[0].sql,/services_json\s*=|seo_json\s*=/);
 }
});
test("legacy free-text service writes never reach V3 and pilot categories reject them",async()=>{
 for(const category of DIRECTORY_FIELD_EVENT_CATEGORIES){
   const ctx=setup(category);
   const request={...desired(),services:["Individuálny výcvik"]};
   if(isDirectoryEventPilotCategory(category)){
     await assert.rejects(()=>ctx.save(ctx.db,ctx.record,request,"services"),
      /DIRECTORY_PILOT_LEGACY_SERVICES_READ_ONLY/,category);
     assert.equal(ctx.writes.length,0,category);
   }else{
     await ctx.save(ctx.db,ctx.record,request,"services");
     assert.equal(ctx.writes.length,1,category);
     assert.doesNotMatch(ctx.writes[0].sql,/directory_service_notion_relation_sync|service_profile_option_choices/);
     if(category==="treneri"){
       assert.match(ctx.writes[0].sql,/source_data_json = json_set/);
       assert.equal(ctx.writes[0].args[1],"Individuálny výcvik");
       assert.doesNotMatch(ctx.writes[0].sql,/services_json\s*=/);
     }else{
       assert.match(ctx.writes[0].sql,/services_json = \?/);
     }
   }
 }
});
