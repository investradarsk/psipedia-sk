import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BREED_NOTION_SCHEMA } from "../lib/notion-breed-property-registry.ts";
import { breedWorkcopyEventValues } from "../lib/notion-breed-workcopy-field-values.mjs";
import { breedEventD1FieldPatch,breedEventIsDirectField } from "../lib/notion-breed-workcopy-field-sql.mjs";
import { breedAdminDirtyPaths,breedAdminSparseEdit } from "../lib/breed-admin-dirty-patch.mjs";

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const rich=(name,value,id=name)=>({id,type:"rich_text",
  rich_text:value?[{plain_text:value,text:{content:value}}]:[]});
const page=properties=>({id:"40f793fc-1d18-8111-a021-eb3cdc37e0ec",properties});
const readChanged=(properties,changed)=>breedWorkcopyEventValues(page(properties),changed,BREED_NOTION_SCHEMA);

test("one signed Intro property changes only Intro, including explicit blank",()=>{
  const props={"Krátky úvod v hero (2–4 vety)":rich("Krátky úvod v hero (2–4 vety)","Text x","intro-id"),Historia:rich("Historia","Nezmenené")};
  const first=readChanged(props,["intro-id"]);
  assert.deepEqual(first.values.map(x=>x.field),["intro"]);
  assert.equal(first.values[0].value,"Text x");
  assert.deepEqual(first.failures,[]);
  props["Krátky úvod v hero (2–4 vety)"]=rich("Krátky úvod v hero (2–4 vety)","","intro-id");
  const clear=readChanged(props,["intro-id"]);
  assert.equal(clear.values.length,1);
  assert.equal(clear.values[0].value,"");
  assert.equal(readChanged(props,["other-id"]).values.length,0);
});

test("90-column Notion page keeps overview and daily needs independent, including explicit clear",()=>{ 
  const props={
    "Prehľad plemena":rich("Prehľad plemena","Prehľad z Notionu","overview-id"),
    "Každodenné potreby plemena":rich("Každodenné potreby plemena","Denné potreby","needs-id"),
  };
  const overview=readChanged(props,["overview-id"]);
  assert.deepEqual(overview.values.map(x=>[x.field,x.value]),
    [["editorial.overview","Prehľad z Notionu"]]);
  const needs=readChanged(props,["needs-id"]);
  assert.deepEqual(needs.values.map(x=>[x.field,x.value]),
    [["needs","Denné potreby"]]);
  props["Prehľad plemena"]=rich("Prehľad plemena","","overview-id");
  const cleared=readChanged(props,["overview-id"]);
  assert.deepEqual(cleared.values.map(x=>[x.field,x.value]),
    [["editorial.overview",""]]);
  assert.equal(cleared.failures.length,0);
});

test("the signed webhook resolves dashed IDs against compact ACTIVE breed links",()=>{
  const webhook=read("app/api/integrations/notion/webhook/route.ts");
  const sweep=read("lib/notion-breed-workcopy-sync.ts");
  assert.match(webhook,/replace\(lower\(work_notion_page_id\),'-',''\)=replace\(lower\(\?\),'-',''\)/);
  assert.match(sweep,/replace\(lower\(work_notion_page_id\),'-',''\)=\?/);
  assert.match(sweep,/\.bind\(normalized\(args\.targetPageId\)\)/);
  // This is the failing production profile: Notion's dashed event and the
  // compact D1 link are the same ID and must never be treated as two pages.
  const compact="40f793fc1d188111a021eb3cdc37e0ec";
  const dashed="40f793fc-1d18-8111-a021-eb3cdc37e0ec";
  assert.equal(dashed.replaceAll("-",""),compact);
});

test("a free-text or Markdown source never blocks an independently edited overview",()=>{
  const props={
    "Prehľad plemena":rich("Prehľad plemena","TEST SYNC 1","overview"),
    "Zdroje":rich("Zdroje",
      "FCI: [https://fci.be/standard.pdf](https://fci.be/standard.pdf)<br />"+
      "Poznámka bez odkazu<br />Klub|https://klub.sk/","sources"),
    "FCI štandard PDF":rich("FCI štandard PDF","voľný text, nie URL","fci-pdf"),
  };
  const result=readChanged(props,["overview","sources","fci-pdf"]);
  assert.deepEqual(result.failures,[]);
  assert.equal(result.values.find(item=>item.field==="editorial.overview")?.value,"TEST SYNC 1");
  assert.deepEqual(result.values.find(item=>item.field==="sources")?.value,[
    {label:"FCI",url:"https://fci.be/standard.pdf"},
    {label:"Poznámka bez odkazu",url:""},
    {label:"Klub",url:"https://klub.sk/"},
  ]);
  assert.equal(result.values.find(item=>item.field==="fciStandard.fci_standard_pdf")?.value,
    "voľný text, nie URL");
});

test("one bad JSON gallery cannot prevent other signed cells from being accepted",()=>{
  const props={
    "Prehľad plemena":rich("Prehľad plemena","Nový prehľad","overview"),
    "Každodenné potreby plemena":rich("Každodenné potreby plemena","Potreby","needs"),
    "Ďalšie fotografie":rich("Ďalšie fotografie","pokazený JSON","gallery"),
  };
  const result=readChanged(props,["gallery","overview","needs"]);
  assert.deepEqual(result.failures.map(item=>item.field),["gallery"]);
  assert.deepEqual(result.values.map(item=>item.field),
    ["needs","editorial.overview"].sort((a,b)=>
      // Ordering is registry-based, not event-order-based.
      BREED_NOTION_SCHEMA.findIndex(item=>item.id===a)-
      BREED_NOTION_SCHEMA.findIndex(item=>item.id===b)));
  assert.equal(result.values.find(item=>item.field==="editorial.overview")?.value,
    "Nový prehľad");
});

test("mixed Admin field saves cannot fall back to one stale whole-profile PUT",()=>{
  const route=read("app/api/admin/breeds/[id]/route.ts");
  assert.doesNotMatch(route,/dirty\.every\(breedEventIsDirectField\)/);
  assert.match(route,/for \(const field of \[\.\.\.new Set\(ordered\)\]\)/);
  assert.match(route,/const single = breedAdminSparseEdit\(selected,\[field\]\)/);
  assert.match(route,/rejectedDirtyFields\.push\(field\)/);
});

test("FCI number is mutable content, never a second profile identifier",()=>{
  const c=readChanged({"FCI číslo":{id:"fci",type:"number",number:2}},["fci"]);
  assert.deepEqual(c.values.map(x=>[x.field,x.value]),[["fciNumber",2]]);
  assert.deepEqual(c.failures,[]);
  assert.deepEqual(breedEventD1FieldPatch("fciNumber",2),{
    assignments:["fci_number=?"],params:[2],
  });
});

test("numeric 1 and 2 pass unchanged and no sibling fields are changed",()=>{
  const one=readChanged({Energia:{id:"energy",type:"number",number:1}},["energy"]);
  const two=readChanged({Energia:{id:"energy",type:"number",number:2}},["energy"]);
  assert.deepEqual(one.values.map(x=>x.value),[1]);
  assert.deepEqual(two.values.map(x=>x.value),[2]);
  assert.deepEqual(breedEventD1FieldPatch("energy",2),{
    assignments:["energy=?"],params:[2],
  });
});

test("FCI, SEO and editorial JSON keys update independently through allowlisted JSON_SET",()=>{
  assert.deepEqual(breedEventD1FieldPatch("fciStandard.oci","x"),{
    assignments:["fci_standard_json=json_set(COALESCE(fci_standard_json, '{}'), ?, json(?))"],
    params:["$.oci",JSON.stringify("x")],
  });
  assert.deepEqual(breedEventD1FieldPatch("seo.noindex",false).params,
    ["$.noindex","false"]);
  assert.deepEqual(breedEventD1FieldPatch("editorial.overview","").params,
    ["$.overview",'""']);
  assert.throws(()=>breedEventD1FieldPatch("id",2),/NOT_MAPPED/);
  assert.throws(()=>breedEventD1FieldPatch("status","published"),/NOT_MAPPED/);
  assert.throws(()=>breedEventD1FieldPatch("slug","other-slug"),/NOT_MAPPED/);
  assert.throws(()=>breedEventD1FieldPatch("seo.__proto__","x"),/NOT_MAPPED/);
});

test("missing JSON media only fails its own cell",()=>{
  const props={
    "Ďalšie fotografie":rich("Ďalšie fotografie","not-json","gallery"),
    "Krátky úvod v hero (2–4 vety)":rich("Krátky úvod v hero (2–4 vety)","x","intro"),
    "Športy a aktivity":rich("Športy a aktivity",'[{"key":"swim","label":"Plávanie","rating":2}]',"sport"),
  };
  const result=readChanged(props,["gallery","intro","sport"]);
  assert(result.failures.some(x=>x.field==="gallery"));
  assert(result.values.some(x=>x.field==="intro"&&x.value==="x"));
  assert(result.values.some(x=>x.field==="sports"&&x.value[0].rating===2));
});

test("Admin dirty paths preserve later Notion edits in every untouched field",()=>{
  const initial={intro:"Pôvodne",name:"Retriever",seo:{title:"Starý",description:"Popis"},
    editorial:{overview:"A",coatCare:"B"},fciStandard:{oci:"Tmavé"},sports:[]};
  const later={...initial,seo:{...initial.seo,title:"Nový"},
    editorial:{...initial.editorial,overview:"Nové A"}};
  assert.deepEqual(breedAdminDirtyPaths(initial,later),[
    "seo.title","editorial.overview",
  ]);
  assert.deepEqual(breedAdminSparseEdit(later,breedAdminDirtyPaths(initial,later)),{
    seo:{title:"Nový"},editorial:{overview:"Nové A"},
  });
  assert.deepEqual(breedAdminSparseEdit({...later,intro:""},["intro"]),{intro:""});
  assert.throws(()=>breedAdminSparseEdit(later,["Psipedia ID"]),/UNKNOWN/);
});

test("Admin single-field SQL path excludes publication, image upload, relation tables",()=>{
  assert(breedEventIsDirectField("intro"));
  assert(breedEventIsDirectField("fciStandard.oci"));
  assert(breedEventIsDirectField("seo.title"));
  assert(!breedEventIsDirectField("slug"));
  assert(!breedEventIsDirectField("status"));
  assert(!breedEventIsDirectField("image"));
  assert(!breedEventIsDirectField("relatedBreedIds"));
  const sql=read("lib/notion-breed-workcopy-direct-field.ts");
  assert.match(sql,/WHERE id=\? AND updated_at=\? RETURNING id/);
  assert.doesNotMatch(sql,/updateManagedBreed\(/);
  assert.doesNotMatch(sql,/breedRelationStatements/);
});

test("signed webhook and Admin save both use same per-field engine",()=>{
  const sync=read("lib/notion-breed-workcopy-sync.ts");
  const route=read("app/api/admin/breeds/[id]/route.ts");
  const editor=read("components/admin-breed-editor.tsx");
  assert.match(sync,/breedWorkcopyEventValues\(page,edited,BREED_NOTION_SCHEMA\)/);
  assert.match(sync,/saveBreedNotionField\(/);
  assert.match(route,/breedAdminSparseEdit\(patch, dirty\)/);
  assert.match(route,/saveBreedNotionField\(/);
  assert.match(editor,/changedFieldKeys=breedAdminDirtyPaths\(baseFormRef.current,submittedForm\)/);
  assert.doesNotMatch(sync,/updateManagedBreed\(canonical\.id, candidate/);
});
