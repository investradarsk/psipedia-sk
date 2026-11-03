import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { planOwnerDirectedFields } from "../lib/notion-manual-transfer-plan.ts";

test("explicit Notion winner repairs old differences irrespective of baseline receipts",()=>{
  const admin={character:"Old",intro:"Already",seo:{title:"Canonical",noindex:true},
    status:"published",image:"local"};
  const notion={character:"New",intro:"Already",seo:{title:"Fresh",noindex:false},
    status:"draft",image:"remote"};
  const plan=planOwnerDirectedFields({admin,notion,direction:"NOTION_TO_ADMIN",
    editablePaths:["character","intro","seo.title","seo.noindex","status","image"],
    protectedPaths:new Set(["status","seo.noindex","image"])});
  assert.deepEqual(plan.changes,["character","seo.title"]);
  assert.equal(plan.desired.character,"New");
  assert.equal(plan.desired.seo.title,"Fresh");
  assert.equal(plan.desired.seo.noindex,true);
  assert.equal(plan.desired.status,"published");
  assert.equal(plan.desired.image,"local");
  assert.equal(admin.character,"Old");
});

test("reverse winner restores Admin values into Notion without changing permanent priorities",()=>{
  const admin={name:"Psipedia",description:"Admin opis",status:"published"};
  const notion={name:"Notion",description:"Notion opis",status:"draft"};
  const plan=planOwnerDirectedFields({admin,notion,direction:"ADMIN_TO_NOTION",
    editablePaths:["name","description","status"],protectedPaths:new Set(["status"])});
  assert.deepEqual(plan.changes,["name","description"]);
  assert.equal(plan.desired.description,"Admin opis");
  assert.equal(plan.desired.status,"draft");
});

test("present blank values are explicit while absent keys never fabricate a deletion",()=>{
  const result=planOwnerDirectedFields({
    notion:{description:"",SEO:{title:null}},
    admin:{description:"Old",SEO:{title:"A"},other:"Safe"},
    direction:"NOTION_TO_ADMIN",
    editablePaths:["description","SEO.title","other"],
    protectedPaths:new Set(),
  });
  assert.deepEqual(result.changes,["description","SEO.title"]);
  assert.equal(result.desired.description,"");
  assert.equal(result.desired.SEO.title,null);
  assert.equal(result.desired.other,"Safe");
  assert.equal(result.results.find(f=>f.field==="other").reason,"MISSING_VALUE");
});

test("nested protected parent rejects child and prototype pollution is rejected",()=>{
  const input={notion:{seo:{title:"N"}},admin:{seo:{title:"A"}},
    direction:"NOTION_TO_ADMIN",editablePaths:["seo.title"],protectedPaths:new Set(["seo"])};
  assert.equal(planOwnerDirectedFields(input).results[0].reason,"PROTECTED_FIELD");
  assert.throws(()=>planOwnerDirectedFields({
    ...input,editablePaths:["__proto__.admin"],protectedPaths:new Set(),
  }),/TRANSFER_FIELD_INVALID/);
  assert.throws(()=>planOwnerDirectedFields({
    ...input,direction:"UNSUPPORTED",protectedPaths:new Set(),
  }),/TRANSFER_DIRECTION_INVALID/);
});

test("manual reconciliation paths are explicit and normal cron paths remain unforced",()=>{
  for(const file of ["notion-breed-sync.ts","notion-directory-sync.ts",
    "notion-events-help-sync.ts","notion-eshop-sync.ts"]){
    const code=readFileSync(new URL("../lib/"+file,import.meta.url),"utf8");
    assert.match(code,/manualDirection/);
    assert.match(code,/planOwnerDirectedFields|planBreedNotionFieldDelta/);
  }
  const worker=readFileSync(new URL("../worker/index.ts",import.meta.url),"utf8");
  assert.match(worker,/NOTION_MANUAL_TRANSFER_ENABLED/);
  assert.match(worker,/runManualTransferQueueBatch/);
  const endpoint=readFileSync(new URL("../app/api/admin/notion-manual-transfer/route.ts",import.meta.url),"utf8");
  assert.match(endpoint,/strictProvenance:true/);
  assert.match(endpoint,/CONFIRM_NOTION_MANUAL_TRANSFER/);
});


test("readonly breed JSON aggregate does not lock separately editable FCI and editorial leaves",()=>{
  const notion={
    "fciStandard.oci":"Tmavé oči",
    "editorial.coatCare":"Nová redakčná starostlivosť",
    "system.Psipedia ID":"9999",
    "status":"draft",
  };
  const admin={
    "fciStandard.oci":"Hnedé oči",
    "editorial.coatCare":"Starší redakčný text",
    "system.Psipedia ID":"3214",
    "status":"published",
  };
  const input={
    notion,admin,direction:"NOTION_TO_ADMIN",
    editablePaths:["fciStandard","fciStandard.oci","editorial",
      "editorial.coatCare","system.Psipedia ID","status"],
    protectedPaths:new Set(["fciStandard","editorial",
      "system.Psipedia ID","status"]),
    aggregateOnlyPaths:new Set(["fciStandard","editorial"]),
  };
  const plan=planOwnerDirectedFields(input);
  assert.deepEqual(plan.changes,["fciStandard.oci","editorial.coatCare"]);
  assert.equal(plan.desired["fciStandard.oci"],notion["fciStandard.oci"]);
  assert.equal(plan.desired["editorial.coatCare"],notion["editorial.coatCare"]);
  assert.equal(plan.desired["system.Psipedia ID"],"3214");
  assert.equal(plan.desired.status,"published");
  assert.equal(Object.hasOwn(plan.desired,"fciStandard"),false);
  assert.equal(Object.hasOwn(plan.desired,"editorial"),false);
  for(const path of ["fciStandard","editorial","system.Psipedia ID","status"]){
    const field=plan.results.find(item=>item.field===path);
    assert.equal(field.state,"SKIPPED");
    assert.equal(field.reason,"PROTECTED_FIELD");
  }
  const reverse=planOwnerDirectedFields({...input,direction:"ADMIN_TO_NOTION"});
  assert.deepEqual(reverse.changes,["fciStandard.oci","editorial.coatCare"]);
  assert.equal(reverse.desired["fciStandard.oci"],admin["fciStandard.oci"]);
  assert.equal(reverse.desired["editorial.coatCare"],admin["editorial.coatCare"]);
});

test("only explicitly declared readonly aggregates allow their children",()=>{
  const result=planOwnerDirectedFields({
    notion:{"fciStandard.oci":"N","seo.noindex":true},
    admin:{"fciStandard.oci":"A","seo.noindex":false},
    direction:"NOTION_TO_ADMIN",
    editablePaths:["fciStandard.oci","seo.noindex"],
    protectedPaths:new Set(["fciStandard","seo"]),
    aggregateOnlyPaths:new Set(["fciStandard"]),
  });
  assert.equal(result.results.find(x=>x.field==="fciStandard.oci").state,"CHANGE");
  assert.equal(result.results.find(x=>x.field==="seo.noindex").reason,"PROTECTED_FIELD");
});
