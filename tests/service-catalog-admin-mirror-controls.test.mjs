import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {manualCatalogMirrorAction,manualCatalogMirrorConfirmation}
  from "../lib/service-catalog-admin-mirror-controls.ts";

const id="svc.admin."+"a".repeat(32);
const attrId="attr.admin."+"b".repeat(32);
const option=(overrides={})=>({
 id,label:"Explicit test service",kind:"service",valueKind:"tri_state",group:"Test",
 meaning:"Explicit mock-only concept.",categories:["veterinari"],
 source:"admin",status:"DRAFT",mirror:"PENDING",version:1,
 ...overrides
});
const inventory=(disposition,overrides={})=>({
 mode:"READ_ONLY",blocked:false,
 items:[{optionId:id,version:1,disposition}],
 ...overrides
});
const enabled={mirrorEnabled:true,pageCreationEnabled:true};

test("missing, blocked, stale, duplicate or forged inventory never enables a Notion mutation",()=>{
 for(const snap of [
  null,
  inventory("NEEDS_PAGE",{blocked:true}),
  inventory("NEEDS_PAGE",{items:[]}),
  inventory("NEEDS_PAGE",{items:[{optionId:id,version:2,disposition:"NEEDS_PAGE"}]}),
  inventory("NEEDS_PAGE",{items:[
   {optionId:id,version:1,disposition:"NEEDS_PAGE"},
   {optionId:id,version:1,disposition:"NEEDS_PAGE"}
  ]}),
  inventory("BLOCKED"),
  inventory("SYNCED_VERIFIED"),
 ]){
  assert.equal(manualCatalogMirrorAction(option(),snap,enabled),null);
 }
 assert.equal(manualCatalogMirrorAction(option(),inventory("NEEDS_PAGE"),{mirrorEnabled:false,pageCreationEnabled:true}),null);
 assert.equal(manualCatalogMirrorAction(option(),inventory("NEEDS_PAGE"),{mirrorEnabled:true,pageCreationEnabled:false}),null);
 assert.equal(manualCatalogMirrorAction(option(),inventory("NEEDS_PAGE"),enabled),"PROVISION_ONE");
 assert.equal(manualCatalogMirrorAction(option(),inventory("MAPPED_PENDING"),{mirrorEnabled:true,pageCreationEnabled:false}),"MIRROR_ONE");
});
test("only DRAFT/PENDING dynamic canonical options with current versions are eligible",()=>{
 const snap=inventory("MAPPED_PENDING");
 for(const invalid of [
  {source:"built_in"},{status:"ACTIVE"},{status:"RETIRED"},
  {mirror:"SYNCED"},{mirror:"CONFLICT"},{version:2},
  {id:"svc.vet.vaccination"},{id:"svc.admin."+("Z".repeat(32))},
  {version:null},{version:0}
 ])assert.equal(manualCatalogMirrorAction(option(invalid),snap,enabled),null);
 assert.equal(manualCatalogMirrorAction(null,snap,enabled),null);
 assert.equal(manualCatalogMirrorAction(option(),snap,enabled),"MIRROR_ONE");
 const attr={...option(),id:attrId,kind:"attribute"};
 assert.equal(manualCatalogMirrorAction(attr,inventory("MAPPED_PENDING",{
  items:[{optionId:attrId,version:1,disposition:"MAPPED_PENDING"}]
 }),enabled),"MIRROR_ONE");
});
test("confirmation binds exactly one action and one dynamic canonical ID",()=>{
 assert.equal(manualCatalogMirrorConfirmation("PROVISION_ONE",id),"SERVICES-V3-PROVISION_ONE-"+id);
 assert.equal(manualCatalogMirrorConfirmation("MIRROR_ONE",id),"SERVICES-V3-MIRROR_ONE-"+id);
 assert.notEqual(manualCatalogMirrorConfirmation("PROVISION_ONE",id),manualCatalogMirrorConfirmation("MIRROR_ONE",id));
});
test("simple catalog has no manual Notion write UX; legacy route stays protected",()=>{
 const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
 const ui=read("components/admin-service-catalog-workspace.tsx");
 const route=read("app/api/admin/service-catalog/notion-mirror/route.ts");
 const worker=read("worker/index.ts");
 assert.doesNotMatch(ui,/manualCatalogMirrorAction|PROVISION_ONE|MIRROR_ONE/);
 assert.match(ui,/\+ Nová služba/);
 // Use the deployed owner-gated D1-first runner; the deprecated simple sync
 // must never execute in parallel from the scheduled Worker.
 assert.match(worker,/runServicesV3CatalogAutoSweep/);
 assert.doesNotMatch(worker,/runSimpleServiceCatalogSync/);
 assert.match(route,/strictProvenance:true/);
 assert.match(route,/size>1024/);
});
