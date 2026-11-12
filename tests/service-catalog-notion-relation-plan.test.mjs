import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {planCatalogRelationSync as plan,planSignedCatalogRelationSync as signed} from "../lib/service-catalog-notion-relation-plan.ts";

const a="svc.vet.vaccination",b="svc.vet.xray",c="svc.vet.microchipping";
test("notion relation mirrors a new local YES without manual Notion receipt",()=>{
 assert.deepEqual(plan([a],[],null),{action:"push",target:[a]});
 assert.deepEqual(plan([b,a],[a,b],null),{action:"record",target:[a,b]});
});
test("notion relation imports an explicit selection when D1 is empty",()=>{
 assert.deepEqual(plan([],[a],null),{action:"pull",target:[a]});
 assert.deepEqual(plan([],[a],[a,b]),{action:"pull",target:[a]});
});
test("empty relation after a confirmed baseline means deselection, not implicit NO",()=>{
 assert.deepEqual(plan([a],[],[a]),{action:"pull",target:[]});
});
test("unilateral local changes propagate and unmodified sides remain intact",()=>{
 assert.deepEqual(plan([a,b],[a],[a]),{action:"push",target:[a,b]});
 assert.deepEqual(plan([a,b],[a,b],[a]),{action:"record",target:[a,b]});
});
test("simultaneous edits to different service IDs merge without dropping either side",()=>{
 assert.deepEqual(plan([a,b],[a,c],[a]),{action:"merge",target:[a,b,c].sort()});
 // Admin removes a while Notion independently adds c: only a disappears.
 assert.deepEqual(plan([b],[a,b,c],[a,b]),{action:"merge",target:[b,c].sort()});
 // When the combined result is already present on one side, only push or pull.
 assert.deepEqual(plan([a,b],[a],[a]),{action:"push",target:[a,b].sort()});
 assert.deepEqual(plan([a],[a,c],[a]),{action:"pull",target:[a,c].sort()});
});
test("without an acknowledged baseline, divergent populated sides are never guessed",()=>{
 assert.deepEqual(plan([a],[b],null),{action:"conflict",target:[]});
});
test("verified Notion removal affects only one service, never explicit NO",()=>{
 assert.deepEqual(plan([a,b],[b],[a,b]),{action:"pull",target:[b]});
 assert.deepEqual(plan([a,b],[],[a,b]),{action:"pull",target:[]});
 assert.deepEqual(plan([a,b],[a,b],[a,b]),{action:"record",target:[a,b]});
});
test("signed Notion relation events honor removal when baseline is verified",()=>{
 assert.deepEqual(signed([a,b],[b],[a,b]),{action:"pull",target:[b]});
 assert.deepEqual(signed([a,b],[],[a,b]),{action:"pull",target:[]});
 assert.deepEqual(signed([a,b],[a,c],[a]),{action:"merge",target:[a,b,c].sort()});
});
test("unbaselined signed events import additions but cannot infer a deletion",()=>{
 assert.deepEqual(signed([a],[a,b],null),{action:"pull",target:[a,b].sort()});
 assert.deepEqual(signed([],[a],null),{action:"pull",target:[a]});
 assert.deepEqual(signed([a],[a],null),{action:"record",target:[a]});
 assert.deepEqual(signed([a,b],[b],null),{action:"conflict",target:[]});
 assert.deepEqual(signed([a],[],null),{action:"conflict",target:[]});
});
test("Notion relations are additive and do not replace historical Služby text",()=>{
 const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
 const notion=read("lib/notion-directory-sync.ts");
 const bridge=read("lib/service-catalog-notion-relations.ts");
 const migration=read("drizzle/0140_directory_service_notion_relations.sql");
 assert.match(notion,/"Služby": richText\(snapshot\.services\.join/);
 assert.match(notion,/syncProfileCatalogRelation/);
 assert.match(bridge,/Služby z katalógu/);
 assert.match(bridge,/SERVICES_RELATION_BOTH_SIDES_CHANGED_REVIEW/);
 assert.match(migration,/CREATE TABLE IF NOT EXISTS directory_service_notion_relation_sync/);
 assert.doesNotMatch(bridge,/INSERT INTO service_catalog_admin_options/);
});
