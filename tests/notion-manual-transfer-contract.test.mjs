import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  NOTION_MANUAL_TRANSFER_AREAS,
  areaOfManualTransferScope,
  manualTransferCatalog,
  validateManualTransferRequest,
  previewManualTransferRecord,
} from "../lib/notion-manual-transfer-contract.ts";

const groups = [
  {scope:"breeds",title:"Plemená",active:true,fields:[
    {id:"character",label:"Charakter"},
    {id:"health",label:"Zdravie"},
    {id:"image",label:"Hlavný obrázok"},
    {id:"gallery",label:"Galéria"},
    {id:"status",label:"Stav",locked:true},
  ]},
  {scope:"directory:veterinari",title:"Veterinári",active:true,fields:[
    {id:"description",label:"O službe"},{id:"services",label:"Services V3",locked:true},
  ]},
  {scope:"directory:salony",title:"Salóny",active:true,fields:[{id:"name",label:"Názov"}]},
  {scope:"events",title:"Podujatia",active:true,fields:[{id:"Popis",label:"Popis"}]},
  {scope:"organizations",title:"Organizácie",active:true,fields:[{id:"Popis",label:"Popis"}]},
  {scope:"adoptions",title:"Adopcie",active:true,fields:[{id:"Popis",label:"Popis"}]},
  {scope:"help-cases",title:"Pomoc psom",active:true,fields:[{id:"Popis",label:"Popis"}]},
  {scope:"lost-found",title:"Stratené",active:true,fields:[{id:"Popis",label:"Popis"}]},
  {scope:"eshops",title:"E-shopy",active:true,fields:[{id:"description",label:"Popis"}]},
  {scope:"articles",title:"Články",active:true,fields:[{id:"intro",label:"Úvod"}]},
  {scope:"service-catalog",title:"Katalóg V3",active:false,fields:[{id:"name",label:"Názov"}]},
  {scope:"facebook-images",title:"Facebook obrázky",active:false,fields:[{id:"title",label:"Text"}]},
];

const pageId = "01234567-89ab-4cde-8f01-234567890abc";

test("only five agreed areas appear; Help includes four separate agendas",()=>{
  assert.deepEqual(NOTION_MANUAL_TRANSFER_AREAS.map(x=>x.id),
    ["breeds","directory","events","help","eshops"]);
  assert.equal(areaOfManualTransferScope("directory:salony"),"directory");
  assert.equal(areaOfManualTransferScope("directory"),null);
  assert.equal(areaOfManualTransferScope("service-catalog"),null);
  assert.equal(areaOfManualTransferScope("articles"),null);
  const catalog=manualTransferCatalog(groups);
  assert.deepEqual(catalog.find(x=>x.area==="help").scopes.map(x=>x.id),
    ["organizations","adoptions","help-cases","lost-found"]);
  assert.equal(catalog.find(x=>x.area==="directory").scopes.length,2);
  assert.equal(catalog.find(x=>x.area==="breeds").scopes[0].editable,4);
  assert.equal(catalog.find(x=>x.area==="breeds").scopes[0].locked,1);
  assert.ok(catalog.every(x=>x.executable===false));
});

test("input uses strict scope, direction, one/all and numeric profile ID",()=>{
  assert.deepEqual(validateManualTransferRequest({
    area:"breeds", direction:"NOTION_TO_ADMIN",selection:"ONE",profileId:3214,
  },groups),{area:"breeds",direction:"NOTION_TO_ADMIN",selection:"ONE",profileId:3214});
  assert.deepEqual(validateManualTransferRequest({
    area:"directory", direction:"ADMIN_TO_NOTION",selection:"ALL",scope:"directory:veterinari",
  },groups),{area:"directory",direction:"ADMIN_TO_NOTION",selection:"ALL",scope:"directory:veterinari"});
  for(const bad of [
    {area:"articles",direction:"NOTION_TO_ADMIN",selection:"ALL"},
    {area:"help",direction:"NOTION_TO_ADMIN",selection:"ALL",scope:"directory:veterinari"},
    {area:"breeds",direction:"BOTH",selection:"ALL"},
    {area:"breeds",direction:"NOTION_TO_ADMIN",selection:"ONE",profileId:0},
    {area:"breeds",direction:"NOTION_TO_ADMIN",selection:"ALL",profileId:3214},
  ])assert.throws(()=>validateManualTransferRequest(bad,groups));
});

test("all fields of a linked profile are compared independently, no phantom overwrite",()=>{
  const result=previewManualTransferRecord({
    group:groups[0],direction:"NOTION_TO_ADMIN",
    canonicalId:3214,linkedCanonicalId:3214,notionPageId:pageId,
    notion:{character:"\nNový charakter",health:null,image:"https://example.org/p.jpg",
      gallery:["img"],status:"Published"},
    admin:{character:"Nový charakter",health:"Pôvodný text",image:"a",gallery:["old"],status:"Draft"},
  });
  assert.equal(result.totalChanged,2);
  assert.equal(result.same,0);
  assert.equal(result.skipped,3);
  assert.deepEqual(result.fields.find(x=>x.field==="health"),
    {field:"health",label:"Zdravie",status:"CHANGE"});
  assert.equal(result.fields.find(x=>x.field==="gallery").reason,"SPECIAL_ADAPTER_REQUIRED");
  assert.equal(result.fields.find(x=>x.field==="status").reason,"PROTECTED_FIELD");
});

test("a missing property is not treated as an intentional empty value",()=>{
  const result=previewManualTransferRecord({
    group:groups[0],direction:"ADMIN_TO_NOTION",
    canonicalId:3214,linkedCanonicalId:3214,notionPageId:pageId,
    notion:{character:"A",health:""},
    admin:{character:"A"},
  });
  assert.equal(result.fields.find(x=>x.field==="character").status,"SAME");
  assert.equal(result.fields.find(x=>x.field==="health").reason,"FIELD_MISSING");
});

test("different JSON key order is equivalent, array order remains material",()=>{
  const group={scope:"events",title:"Podujatia",active:true,fields:[{id:"Popis",label:"Popis"}]};
  const common={group,direction:"NOTION_TO_ADMIN",canonicalId:3,
    linkedCanonicalId:3,notionPageId:pageId};
  const same=previewManualTransferRecord({
    ...common,notion:{"Popis":{a:1,b:{d:3,c:2}}},admin:{"Popis":{b:{c:2,d:3},a:1}},
  });
  assert.equal(same.totalChanged,0);
  const changed=previewManualTransferRecord({
    ...common,notion:{"Popis":["A","B"]},admin:{"Popis":["B","A"]},
  });
  assert.equal(changed.totalChanged,1);
});

test("incorrect identity skips the record, even with mismatched editorial values",()=>{
  const result=previewManualTransferRecord({
    group:groups[0],direction:"NOTION_TO_ADMIN",canonicalId:3214,
    linkedCanonicalId:987,notionPageId:pageId,
    notion:{character:"N"},admin:{character:"A"},
  });
  assert.equal(result.totalChanged,0);
  assert.equal(result.fields.find(x=>x.field==="character").reason,"IDENTITY_MISMATCH");
});

test("proposed manual journal is isolated and has per-field retry/error metadata",()=>{
  const sql=readFileSync(new URL("../docs/proposals/notion_manual_transfer_jobs_UNNUMBERED_PROPOSAL.sql",import.meta.url),"utf8");
  const db=new DatabaseSync(":memory:");
  try{
    db.exec("PRAGMA foreign_keys=ON;");
    db.exec(sql);
    db.prepare("INSERT INTO notion_manual_transfer_runs(id,area,direction,selection,requested_profile_id,requested_by) VALUES(?,?,?,?,?,?)")
      .run("test-1","breeds","NOTION_TO_ADMIN","ONE",3214,"editor");
    db.prepare("INSERT INTO notion_manual_transfer_items(run_id,scope,profile_id,notion_page_id) VALUES(?,?,?,?)")
      .run("test-1","breeds",3214,pageId);
    const item=db.prepare("SELECT id FROM notion_manual_transfer_items WHERE run_id=?").get("test-1");
    db.prepare("INSERT INTO notion_manual_transfer_field_results(item_id,field_key,status,reason_code) VALUES(?,?,?,?)")
      .run(item.id,"character","FAILED","API_429");
    assert.equal(db.prepare("SELECT reason_code FROM notion_manual_transfer_field_results").get().reason_code,"API_429");
    assert.throws(()=>db.prepare("INSERT INTO notion_manual_transfer_runs(id,area,direction,selection,requested_by) VALUES('invalid','breeds','NOTION_TO_ADMIN','ONE','editor')").run());
    assert.throws(()=>db.prepare("INSERT INTO notion_manual_transfer_items(run_id,scope,profile_id,notion_page_id) VALUES(?,?,?,?)")
      .run("test-1","breeds",3214,pageId));
    db.prepare("DELETE FROM notion_manual_transfer_runs WHERE id=?").run("test-1");
    assert.equal(db.prepare("SELECT count(*) AS n FROM notion_manual_transfer_field_results").get().n,0);
  }finally{db.close()}
});

test("capabilities route is admin-only, read-only and truthfully feature-gated",()=>{
  const route=readFileSync(new URL("../app/api/admin/notion-manual-transfer/capabilities/route.ts",import.meta.url),"utf8");
  assert.match(route,/getAdminApiUser\(\)/);
  assert.match(route,/executable:active/);
  assert.match(route,/manualTransferSchemaReady/);
  assert.doesNotMatch(route,/export async function POST/);
  assert.doesNotMatch(route,/runNotion.*Sweep/);
});

test("one-shot journal cannot execute until PREVIEW_READY is explicitly confirmed",()=>{
  const sql=readFileSync(new URL("../docs/proposals/notion_manual_transfer_jobs_UNNUMBERED_PROPOSAL.sql",import.meta.url),"utf8");
  const db=new DatabaseSync(":memory:");
  try{
    db.exec(sql);
    db.prepare("INSERT INTO notion_manual_transfer_runs "+
      "(id,area,direction,selection,requested_by) VALUES (?,?,?,?,?)")
      .run("preview-1","breeds","NOTION_TO_ADMIN","ALL","owner");
    db.prepare("INSERT INTO notion_manual_transfer_items "+
      "(run_id,scope,profile_id,notion_page_id) VALUES (?,?,?,?)")
      .run("preview-1","breeds",3214,pageId);
    const run=db.prepare("SELECT status FROM notion_manual_transfer_runs").get();
    const item=db.prepare("SELECT status FROM notion_manual_transfer_items").get();
    assert.equal(run.status,"PREVIEW");
    assert.equal(item.status,"PENDING");
    assert.throws(()=>db.prepare("UPDATE notion_manual_transfer_runs SET status='UNKNOWN' WHERE id='preview-1'").run());
    db.prepare("UPDATE notion_manual_transfer_runs SET status='PREVIEW_READY' WHERE id='preview-1'").run();
    db.prepare("UPDATE notion_manual_transfer_items SET status='PREVIEWED',preview_hash=? WHERE run_id='preview-1'").run("a".repeat(64));
    assert.equal(db.prepare("SELECT preview_hash FROM notion_manual_transfer_items").get().preview_hash.length,64);
    const itemId=db.prepare("SELECT id FROM notion_manual_transfer_items WHERE run_id='preview-1'").get().id;
    assert.throws(()=>db.prepare("INSERT INTO notion_manual_transfer_field_results (item_id,field_key,status) VALUES (?,?,?)")
      .run(itemId,"character","NOT_REAL"));
  }finally{db.close()}
});
