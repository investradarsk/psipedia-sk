import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { reconcileProfileFields } from "../lib/notion-profile-field-reconciliation.ts";

const load=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const registry=load("../lib/notion-field-authority.ts");
const api=load("../app/api/admin/notion-field-authority/route.ts");
const ui=load("../components/admin-notion-field-settings.tsx");
const agendas=["events","organizations","adoptions","help-cases","lost-found"];
const exported={};
const compiled=ts.transpileModule(registry,{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
}).outputText;
runInNewContext(compiled,{
  exports:exported,module:{exports:exported},
  require(name){
    if(name==="@/lib/directory")return {directoryCategories:[
      {slug:"veterinari",label:"Veterinári"},{slug:"fyzioterapia",label:"Fyzioterapia"}]};
    if(name==="@/lib/notion-breed-field-delta")return {BREED_NOTION_EDITABLE_FIELDS:["name","intro"]};
    if(name==="@/lib/notion-events-help-adapters")return {agendaEditableFields:
      Object.fromEntries(agendas.map(a=>[a,["Názov","Slug","Stav","Perex","Popis","Adresa"]]))};
    throw Error("Unexpected import: "+name);
  },
});
const groups=exported.NOTION_AUTHORITY_GROUPS;
const scope=name=>groups.find(g=>g.scope===name);
test("every supported editorial category has per-field modes; Facebook and services never do",()=>{
  for(const key of ["breeds","articles","eshops","directory:veterinari","directory:fyzioterapia",...agendas]){
    assert.equal(scope(key)?.active,true,key);
    assert.ok(scope(key).fields.some(f=>!f.locked),key);
  }
  for(const key of ["service-catalog","facebook-images"]){
    assert.equal(scope(key)?.active,false,key);
    assert.ok(scope(key).fields.every(f=>f.locked),key);
    assert.equal(exported.editableNotionField(key,scope(key).fields[0].id),false);
  }
  for(const key of agendas){
    assert.equal(exported.editableNotionField(key,"Popis"),true,key);
    assert.equal(exported.editableNotionField(key,"Slug"),false,key);
    assert.equal(exported.editableNotionField(key,"Adresa"),false,key);
  }
  assert.equal(exported.editableNotionField("directory:veterinari","services"),false);
  assert.equal(exported.editableNotionField("articles","Stav"),false);
});
test("one category bulk save is server-authorized, atomic and never changes unrelated scope",()=>{
  assert.match(api,/requireAdminMutation\(request,\{strictProvenance:true\}\)/);
  assert.match(api,/all===true/);
  assert.match(api,/find\(g=>g.scope===scope && g.active\)/);
  assert.match(api,/group\.fields\.filter\(f=>editableNotionField\(scope,f.id\)\)/);
  assert.match(api,/db\.batch\(editable\.map/);
  assert.match(api,/DELETE FROM notion_field_authority WHERE scope=\?/);
  assert.match(api,/mode===\"safe\"/);
  assert.match(ui,/Použiť na všetky polia tejto kategórie/);
  assert.match(ui,/group\.scope/);
  assert.match(ui,/all:true/);
  assert.match(ui,/window\.confirm/);
});
test("per-field Notion resolution preserves protected fields and refuses unsafe deletion",()=>{
  const base={description:"Pôvodný",status:"published",services:["Vyšetrenie"]};
  const result=reconcileProfileFields({
    baseline:base,
    notion:{description:"Nový popis",status:"draft",services:[]},
    psipedia:base,
    protectedFields:new Set(["status","services"]),
    authorities:{description:"notion",status:"notion",services:"notion"},
    canonicalFieldsWin:true,
  });
  assert.equal(result.kind,"MERGE");
  assert.equal(result.merged.description,"Nový popis");
  assert.equal(result.merged.status,"published");
  assert.deepEqual(result.merged.services,["Vyšetrenie"]);
  const del=reconcileProfileFields({
    baseline:base,
    notion:{...base,description:""},
    psipedia:base,protectedFields:new Set(),
    authorities:{description:"notion"},
  });
  assert.equal(del.kind,"CONFLICT");
  assert.ok(del.conflicts.some(x=>x.reason==="UNVERIFIED_DELETE"));
});
