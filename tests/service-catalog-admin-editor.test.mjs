import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
import {catalogEditorItems,eligibleProfileServiceItems} from "../lib/service-catalog-admin-editor-view.ts";
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
test("unknown remains absent and can be reset only by the guarded CAS endpoint",()=>{
 assert.match(profile,/selectionForEditor\(savedValue\)/);
 assert.match(profile,/json\.selection!\.choice==="unknown"/);
 assert.match(profile,/<option value="unknown">Neznáme<\/option>/);
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
test("Services profile delegates its single feedback status to shared EditorActionBar",()=>{const workspace=read("components/admin-editor-workspace.tsx");assert.doesNotMatch(profile,/<span role="status">|<span aria-live="polite" aria-atomic="true">/);assert.match(profile,/<EditorActionBar message=\{message\}/);assert.match(workspace,/className=\{styles\.actionMessage\} role="status" aria-live="polite"/);});
test("catalog lifecycle controls use existing Admin CAS route; never forge Notion receipt",()=>{
 const route=read("app/api/admin/service-catalog/options/[id]/route.ts");
 assert.match(catalog,/fetch\("\/api\/admin\/service-catalog\/options\/"\+encodeURIComponent\(item\.id\)/);
 assert.match(catalog,/expectedVersion:item\.version/);
 assert.match(catalog,/action:"edit"/);
 assert.match(catalog,/changeLifecycle\("approve",selected\)/);
 assert.match(catalog,/changeLifecycle\("retire",selected\)/);
 assert.match(catalog,/changeLifecycle\("retryMirror",selected\)/);
 assert.match(catalog,/item\.source==="admin"/);
 assert.match(catalog,/item\.mirror==="SYNCED"/);
 assert.match(catalog,/window\.confirm\("Natrvalo vyradiť/);
 assert.match(catalog,/Schválenie je možné až po overenom zrkadlení/);
 assert.doesNotMatch(catalog,/recordCatalogMirrorOutcome|service_catalog_admin_notion_receipts|notion\.pages\.update/);
 assert.match(route,/requireAdminMutation\(request\)/);
 assert.match(route,/requireServiceCatalogAuditSchema\(cfg\.DB\)/);
});
test("only ACTIVE/SYNCED dynamic services and attributes are selectable on profiles",()=>{
 assert.match(view,/item\.source==="built_in" \|\| \(item\.status==="ACTIVE"&&item\.mirror==="SYNCED"\)/);
 assert.match(view,/valueKind:option\.valueKind/);
 assert.match(view,/valueKind:"tri_state" as const/);
 assert.match(profile,/x\.kind==="attribute"&&x\.valueKind==="tri_state"/);
 assert.match(profile,/structuredAttributes=entries\.filter/);
 assert.match(profile,/const changed=entries\.filter/);
 assert.match(profile,/item\.id,choice,expectedVersion:saved\[item\.id\]/);
 assert.match(profile,/Hodnoty s výberom viacerých možností/);
});

test("runtime dynamic attribute eligibility is fail-closed until ACTIVE and SYNCED",()=>{
 const dynamic=(id,status,mirror)=>({
  id:"attr.admin."+id.repeat(32),kind:"attribute",label:"Test attribute "+id,
  group:"Audit",meaning:"Explicit test-only tri-state property.",
  categories:["veterinari"],status,notionMirrorStatus:mirror,version:1,
 });
 const draft=dynamic("a","DRAFT","PENDING");
 const pending=dynamic("b","ACTIVE","PENDING");
 const approved=dynamic("c","ACTIVE","SYNCED");
 const retired=dynamic("d","RETIRED","SYNCED");
 const different={...dynamic("e","ACTIVE","SYNCED"),categories:["treneri"]};
 const eligible=eligibleProfileServiceItems(catalogEditorItems([draft,pending,approved,retired,different]),"veterinari");
 assert.equal(eligible.some(x=>x.id===draft.id),false);
 assert.equal(eligible.some(x=>x.id===pending.id),false);
 assert.equal(eligible.some(x=>x.id===approved.id),true);
 assert.equal(eligible.some(x=>x.id===retired.id),false);
 assert.equal(eligible.some(x=>x.id===different.id),false);
 assert.equal(eligible.find(x=>x.id===approved.id)?.valueKind,"tri_state");
 assert.ok(eligible.some(x=>x.source==="built_in"&&x.kind==="attribute"));
});
