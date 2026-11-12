import test from "node:test";
import assert from "node:assert/strict";
import {
  DIRECTORY_NOTION_DATA_SOURCE_ID, planDirectoryNotionFacetColumns,
} from "../lib/directory-notion-facet-schema-plan.ts";
import { directoryFilterRegistry } from "../lib/directory-filter-contract.ts";

const options=[{name:"Áno"},{name:"Nie"},{name:"Neznáme"}];
const base={
  "Názov":{type:"title"},
  "Psipedia ID":{type:"text"},
  "Služby z katalógu":{type:"relation"},
};
const provisioned=[
 "Typ pracoviska","Pohotovosť","Návštevy doma","Návštevy po dohode",
 "Informácie o zdravotných testoch","Individuálny výcvik","Skupinový výcvik",
];
const schemaWithSeven=()=>Object.fromEntries([
  ...Object.entries(base),
  ...provisioned.map(key=>[key,{type:"select",options}]),
]);

test("the existing Directory data source has a deterministic read-only 14-column select plan",()=>{
 const plan=planDirectoryNotionFacetColumns({
  dataSourceId:DIRECTORY_NOTION_DATA_SOURCE_ID,
  schema:schemaWithSeven(),
 });
 assert.equal(plan.existing,7);
 assert.equal(plan.missing.length,14);
 assert.equal(plan.total,21);
 assert.equal(plan.noOp,false);
 for(const name of plan.missing){
   assert.ok(name.startsWith("Filter · "));
   assert.ok(directoryFilterRegistry.some(def=>def.notion.property===name));
 }
 assert.ok(plan.statements.every(sql=>sql.startsWith('ADD COLUMN "')));
 assert.ok(plan.statements.every(sql=>sql.includes("SELECT('Áno':green, 'Nie':red, 'Neznáme':gray)")));
});
test("schema plan is idempotent and cannot target an unrelated workspace database",()=>{
 const schema=schemaWithSeven();
 for(const field of directoryFilterRegistry)schema[field.notion.property]={type:"select",options};
 const noOp=planDirectoryNotionFacetColumns({
  dataSourceId:DIRECTORY_NOTION_DATA_SOURCE_ID.replaceAll("-","").toUpperCase(),schema,
 });
 assert.equal(noOp.noOp,true);
 assert.deepEqual(noOp.statements,[]);
 assert.throws(()=>planDirectoryNotionFacetColumns({
  dataSourceId:"00000000-0000-0000-0000-000000000001",schema,
 }),/DIRECTORY_NOTION_WRONG_DATA_SOURCE/);
 const bad={...schema, "Pohotovosť":{type:"text"}};
 assert.throws(()=>planDirectoryNotionFacetColumns({
  dataSourceId:DIRECTORY_NOTION_DATA_SOURCE_ID,schema:bad,
 }),/DIRECTORY_NOTION_FACET_SCHEMA_CONFLICT/);
});
