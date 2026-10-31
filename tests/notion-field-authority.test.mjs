import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { reconcileProfileFields } from "../lib/notion-profile-field-reconciliation.ts";
import { breedFieldSnapshot, planBreedNotionFieldDelta } from "../lib/notion-breed-field-delta.ts";

const baseline={name:"Vet",description:"Old",city:"Nitra",status:"published"};
function choose(notion,admin,authorities={},protectedFields=new Set(["status"])){
  return reconcileProfileFields({baseline,notion:{...baseline,...notion},
    psipedia:{...baseline,...admin},protectedFields,canonicalFieldsWin:true,authorities});
}
test("directory per-field authority: default and latest refuse ambiguous double edits",()=>{
  assert.equal(choose({description:"N"},{description:"A"}).kind,"CONFLICT");
  assert.equal(choose({description:"N"},{description:"A"},{description:"latest"}).kind,"CONFLICT");
});
test("directory Admin/Notion selections resolve only their allowed field",()=>{
  const admin=choose({description:"N",city:"Trnava"},{description:"A"},{description:"admin"});
  assert.equal(admin.kind,"MERGE");
  assert.equal(admin.merged.description,"A");
  assert.equal(admin.merged.city,"Trnava");
  const notion=choose({description:"N"},{description:"A"},{description:"notion"});
  assert.equal(notion.kind,"MERGE");
  assert.equal(notion.merged.description,"N");
  const forced=choose({}, {description:"A"}, {description:"notion"});
  assert.equal(forced.merged.description,"Old");
});
test("confirmed Google address and publication remain protected even when Notion wins",()=>{
  const locked=choose({city:"Bratislava",status:"draft"},{},
    {city:"notion",status:"notion"},new Set(["city","status"]));
  assert.equal(locked.kind,"MERGE");
  assert.equal(locked.merged.city,"Nitra");
  assert.equal(locked.merged.status,"published");
  const geo=choose({city:"Bratislava"},{},{city:"notion"},new Set(["city"]));
  assert.equal(geo.merged.city,"Nitra");
});
const breed=(patch={})=>({id:3129,status:"published",name:"Affenpinscher",slug:"affenpinscher",
  intro:"Original",children:2,seo:{title:"Original",description:"Meta",ogTitle:"Original OG"},
  image:"old.webp",gallery:[],...patch});
test("breed field authority blocks inbound Admin fields and allows explicit Notion conflicts",()=>{
  const old=breedFieldSnapshot(breed());
  const incoming=breed({intro:"Notion"});
  const admin=breed({intro:"Admin"});
  const protectedMode=planBreedNotionFieldDelta(admin,incoming,old,old,{intro:"admin"});
  assert.equal(protectedMode.patch.intro,undefined);
  assert.deepEqual(protectedMode.conflicts,[]);
  const safe=planBreedNotionFieldDelta(admin,incoming,old,old,{intro:"latest"});
  assert.deepEqual(safe.conflicts,["intro"]);
  const notion=planBreedNotionFieldDelta(admin,incoming,old,old,{intro:"notion"});
  assert.equal(notion.patch.intro,"Notion");
  assert.equal(notion.patch.status,undefined);
  assert.equal(notion.patch.image,undefined);
  assert.equal(notion.patch.slug,undefined);
});
test("migration 0147 records only allowlisted mode values, no existing data rewrite",async()=>{
  const sql=await readFile(new URL("../drizzle/0147_notion_field_authority.sql",import.meta.url),"utf8");
  const db=new DatabaseSync(":memory:");
  db.exec(sql);
  db.prepare("INSERT INTO notion_field_authority(scope,field_key,mode,updated_by) VALUES(?,?,?,?)")
    .run("directory:veterinari","description","notion","owner@psipedia.sk");
  assert.equal(db.prepare("SELECT mode FROM notion_field_authority").get().mode,"notion");
  assert.throws(()=>db.prepare("INSERT INTO notion_field_authority(scope,field_key,mode,updated_by) VALUES('breeds','intro','override','owner')").run());
  assert.throws(()=>db.prepare("INSERT INTO notion_field_authority(scope,field_key,mode,updated_by) VALUES('directory:veterinari','description','admin','owner')").run());
  db.close();
});
test("settings API allowlists both scope and field, requires admin, writes D1 only",async()=>{
  const [registry,route,app,breedSync,directory,diagnostic,ui]=await Promise.all([
    "../lib/notion-field-authority.ts","../app/api/admin/notion-field-authority/route.ts",
    "../app/admin/nastavenia/notion/page.tsx","../lib/notion-breed-sync.ts",
    "../lib/notion-directory-sync.ts","../app/api/admin/notion-breed-transfer/route.ts",
    "../components/admin-notion-field-settings.tsx",
  ].map(p=>readFile(new URL(p,import.meta.url),"utf8")));
  assert.match(registry,/directoryCategories\.map/);
  assert.match(registry,/lockedDirectoryFields/);
  assert.match(registry,/function editableNotionField\(scope:string,field:string\)/);
  assert.match(route,/requireAdminMutation\(request,\{strictProvenance:true\}\)/);
  assert.match(route,/editableNotionField\(scope,field\)/);
  assert.match(route,/notion_field_authority/);
  assert.match(app,/AdminNotionFieldSettings/);
  assert.match(breedSync,/readNotionFieldAuthorities\(args\.database, "breeds"\)/);
  assert.match(directory,/readNotionFieldAuthorities\(/);
  assert.match(diagnostic,/expectedNotionHash/);
  assert.match(diagnostic,/requireAdminMutation\(request,\{strictProvenance:true\}\)/);
  assert.match(ui,/Preniesť len toto pole z Notionu do Adminu/);
});
test("signed webhook IDs are passed to breed targeted runner and do not mutate unrelated profiles",async()=>{
  const [dispatch,breedSync,inbox]=await Promise.all([
    "../lib/notion-webhook-dispatch.ts","../lib/notion-breed-sync.ts",
    "../lib/notion-webhook-inbox.ts",
  ].map(p=>readFile(new URL(p,import.meta.url),"utf8")));
  assert.match(dispatch,/changedPropertyIds: event\.data\?\.updated_properties \?\? \[\]/);
  assert.match(breedSync,/signedBreedChangedFields\(page, changedPropertyIds\)/);
  assert.match(breedSync,/BREED_LEGACY_CONCURRENT_ADMIN_EDIT/);
  assert.match(breedSync,/BREED_EXPLICIT_REMOTE_CHANGED/);
  assert.match(breedSync,/args\.targetPageId/);
  assert.match(inbox,/changed_properties_json/);
});
