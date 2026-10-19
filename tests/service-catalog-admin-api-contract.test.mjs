import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {
  CATALOG_OPTION_STATES,CATALOG_MIRROR_STATES,CATALOG_EDITOR_CHOICES,
  canTransitionCatalogStatus,canTransitionMirrorStatus,selectionForEditor,
} from "../lib/service-catalog-admin-api-contract.ts";

test("future editor keeps explicit yes/no and represents absence as unknown",()=>{
  assert.deepEqual(CATALOG_EDITOR_CHOICES,["yes","no","unknown"]);
  assert.equal(selectionForEditor(null),"unknown");
  assert.equal(selectionForEditor(undefined),"unknown");
  assert.equal(selectionForEditor({choice:"yes"}),"yes");
  assert.equal(selectionForEditor({choice:"no"}),"no");
});

test("future option lifecycle: DRAFT must be synced before ACTIVE; RETIRED is terminal",()=>{
  assert.deepEqual(CATALOG_OPTION_STATES,["DRAFT","ACTIVE","RETIRED"]);
  for(const mirror of CATALOG_MIRROR_STATES){
    assert.equal(canTransitionCatalogStatus("DRAFT","ACTIVE",mirror),mirror==="SYNCED");
    assert.equal(canTransitionCatalogStatus("DRAFT","RETIRED",mirror),true);
    assert.equal(canTransitionCatalogStatus("ACTIVE","RETIRED",mirror),true);
    assert.equal(canTransitionCatalogStatus("RETIRED","ACTIVE",mirror),false);
    assert.equal(canTransitionCatalogStatus("RETIRED","DRAFT",mirror),false);
    assert.equal(canTransitionCatalogStatus("ACTIVE","DRAFT",mirror),false);
  }
});

test("future Notion mirror lifecycle never silently resolves a conflict",()=>{
  assert.deepEqual(CATALOG_MIRROR_STATES,["PENDING","SYNCED","CONFLICT"]);
  assert.equal(canTransitionMirrorStatus("PENDING","SYNCED"),true);
  assert.equal(canTransitionMirrorStatus("PENDING","CONFLICT"),true);
  assert.equal(canTransitionMirrorStatus("SYNCED","PENDING"),true);
  assert.equal(canTransitionMirrorStatus("SYNCED","CONFLICT"),true);
  assert.equal(canTransitionMirrorStatus("CONFLICT","PENDING"),true);
  assert.equal(canTransitionMirrorStatus("CONFLICT","SYNCED"),false);
});

test("mutation APIs classify malformed JSON as 400 and keep the dual rollout gate",()=>{
  for(const path of ["app/api/admin/service-catalog/options/route.ts","app/api/admin/directory/[id]/service-options/route.ts"]){
    const source=readFileSync(new URL("../"+path,import.meta.url),"utf8");
    assert.match(source,/requireAdminMutation\(request\)/);
    assert.match(source,/SERVICE_CATALOG_ADMIN_WRITES_ENABLED/);
    assert.match(source,/SERVICE_CATALOG_NOTION_MIRROR_READY/);
    assert.match(source,/error instanceof SyntaxError\?400/);
  }
});
