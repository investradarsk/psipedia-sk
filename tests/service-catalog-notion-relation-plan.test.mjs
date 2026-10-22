import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {planCatalogRelationSync as plan} from "../lib/service-catalog-notion-relation-plan.ts";

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
test("concurrent divergent edits refuse last-write-wins",()=>{
 assert.deepEqual(plan([a,b],[a,c],[a]),{action:"conflict",target:[]});
 assert.deepEqual(plan([a],[b],null),{action:"conflict",target:[]});
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
