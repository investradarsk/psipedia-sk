import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
const view=read("lib/service-catalog-admin-editor-view.ts");
const page=read("app/admin/sluzby-pre-psov/katalog/page.tsx");
const profile=read("components/admin-service-profile-values.tsx");
const catalog=read("components/admin-service-catalog-workspace.tsx");
const directory=read("app/admin/adresar/[id]/page.tsx");
test("catalog and profile are separate authenticated Admin V3 surfaces",()=>{
 assert.match(page,/requireAdminPageUser/);
 assert.match(page,/AdminShell/);
 assert.match(directory,/requireAdminPageUser/);
 assert.match(directory,/AdminServiceProfileValues/);
 assert.match(catalog,/EditorWorkspace/);
 assert.match(view,/source:"built_in"/);
 assert.match(view,/source:"admin"/);
});
test("both write gates are mandatory and 0133 is never migrated from the editor",()=>{
 for(const p of [page,directory]){
  assert.match(p,/SERVICE_CATALOG_ADMIN_WRITES_ENABLED/);
  assert.match(p,/SERVICE_CATALOG_NOTION_MIRROR_READY/);
  assert.match(p,/=== "true"|==="true"/);
 }
 for(const p of [page,directory,profile,catalog]){
  assert.doesNotMatch(p,/migrations apply|wrangler deploy|notion.*(push|write)|\bDELETE FROM\b/i);
 }
 assert.match(catalog,/disabled={!writeEnabled/);
 assert.match(profile,/disabled={!writeEnabled/);
});
test("unknown remains absent and cannot be reset by unsupported writes",()=>{
 assert.match(profile,/selectionForEditor\(savedValue\)/);
 assert.match(profile,/if\(choice==="unknown"\)continue/);
 assert.match(profile,/disabled={Boolean\(savedValue\)}/);
 assert.match(profile,/expectedVersion:saved\[item.id\]\?\.version\?\?0/);
});
test("draft/conflicted/retired dynamics are excluded on profile",()=>{
 assert.match(view,/item.status==="ACTIVE"&&item.mirror==="SYNCED"/);
 assert.match(profile,/x.kind==="service"/);
 assert.match(catalog,/DRAFT/);
 assert.match(catalog,/CONFLICT/);
 assert.match(catalog,/RETIRED/);
});
test("navigation and cancel do not silently discard draft values",()=>{assert.match(catalog,/Zahodiť neuložený koncept/);assert.match(profile,/Zahodiť neuložené hodnoty služieb/);});
test("no lifecycle controls invoke unsupported mutation endpoint",()=>{
 assert.match(catalog,/Upraviť/);
 assert.match(catalog,/Schváliť/);
 assert.match(catalog,/Archivovať/);
 assert.doesNotMatch(catalog,/fetch\([^)]*retire|fetch\([^)]*approve/);
});
