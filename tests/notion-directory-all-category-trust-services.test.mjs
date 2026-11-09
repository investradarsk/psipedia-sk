import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { serviceFilterCategories } from "../lib/directory-filter-contract.ts";
import { changedTrainerTrustNotionFields, changedTrainerTrustAdminFields, preserveUneditedTrainerTrust } from "../lib/notion-trainer-trust-fields.ts";

const get = path => readFile(new URL(path, import.meta.url), "utf8");

test("all ten directory categories receive explicit trust and catalog field events", async () => {
  assert.equal(serviceFilterCategories.length, 10);
  const [sync, admin, editor, webhook] = await Promise.all([
    get("../lib/notion-directory-sync.ts"),
    get("../app/api/admin/directory/[id]/route.ts"),
    get("../components/admin-directory-editor.tsx"),
    get("../app/api/integrations/notion/webhook/route.ts"),
  ]);
  for (const category of serviceFilterCategories) {
    assert.match(webhook, new RegExp("'" + category + "'"), category + ": immediate mapped webhook");
  }
  assert.match(sync, /serviceFilterCategories\.includes\(current\.category as ServiceFilterCategory\)/);
  assert.match(sync, /serviceFilterCategories\.includes\(profile\.category as ServiceFilterCategory\)/);
  assert.match(sync, /const trustFields = changedTrainerTrustNotionFields\(page\.properties, input\.changedPropertyIds\)/);
  assert.match(sync, /onlyTrustOrServices/);
  assert.match(sync, /relationChanged\) \{\s*const relation = await syncRelation\(page\.id, mapping\.directory_profile_id, true\)/);
  assert.match(sync, /if \(!input\.targetPageId && isDirectoryFieldEventCategory\(propertyText\(candidate, "Kategória"\)\)\) \{/);
  assert.match(sync, /await syncRelation\(candidate\.id, mapped\.directory_profile_id\)/);
  assert.match(admin, /preserveUneditedTrainerTrust\(before, submittedBody, trainerTrustEditedPaths\)/);
  assert.match(admin, /mirrorTrainerTrustFieldsToNotion\(\{/);
  assert.match(editor, /changedTrainerTrustAdminFields\(breederBaseline, \{ verified, featured \}\)/);
  assert.doesNotMatch(sync.slice(sync.indexOf("async function syncBreederEvent("),sync.indexOf("export async function mirrorBreederCategoryFiltersToNotion(")), /syncProfileCatalogRelation|importNotionServiceChoices/);
});

test("only explicitly edited checkbox IDs sync, including false and stale-form protection", () => {
  const props={Overené:{id:"v-1",checkbox:false},Odporúčané:{id:"f-2",checkbox:true}};
  assert.deepEqual(changedTrainerTrustNotionFields(props,["v-1"]),["verified"]);
  assert.deepEqual(changedTrainerTrustNotionFields(props,["f-2"]),["featured"]);
  assert.deepEqual(changedTrainerTrustNotionFields(props,["unrelated"]),[]);
  assert.deepEqual(changedTrainerTrustAdminFields({verified:false,featured:true},{verified:true,featured:true}),["verified"]);
  assert.deepEqual(preserveUneditedTrainerTrust({verified:true,featured:true},{verified:false,featured:false},[]),{verified:true,featured:true});
});

test("all categories use a one-column CAS for trust, not a whole-profile write", async()=>{
  const ts=await import("typescript");
  const sync=await get("../lib/notion-directory-sync.ts");
  const start=sync.indexOf("async function saveTrainerTrustField(");
  const end=sync.indexOf("/**\n * Mapped breeder/trainer event mode:",start);
  assert.ok(start>0&&end>start);
  const js=ts.transpileModule(sync.slice(start,end)+"\nexports.save = saveTrainerTrustField;",{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  for(const category of serviceFilterCategories){
    const profile={id:42,category,status:"published",verified:false,featured:false,updatedAt:"old"};
    const queries=[];
    const db={prepare(sql){return{bind(...args){queries.push({sql,args});return{async first(){return{id:42}}}}}}};
    const exports={};
    runInNewContext(js,{exports,SYSTEM_ACTOR:"test",serviceFilterCategories,
      getManagedDirectoryProfileById:async()=>({...profile,verified:true,updatedAt:"new"})});
    await exports.save(db,profile,"verified",true);
    assert.equal(queries.length,1);
    assert.match(queries[0].sql,/SET verified = \?/);
    assert.match(queries[0].sql,/WHERE id = \? AND category = \? AND status <> 'archived' AND updated_at = \?/);
    assert.equal(queries[0].args[4],category);
    assert.doesNotMatch(queries[0].sql,/services_json|source_data_json|seo_json/);
  }
});
