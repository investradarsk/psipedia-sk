import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { planNotionDirectoryImport, notionId, notionText } from "../lib/directory-notion-onetime-import.mjs";
const SOURCE="84e0664c-ca47-405f-9d54-31b20287bc8c";
const pageId="a1111111-2222-3333-4444-555555555555";
const text=v=>({type:"rich_text",rich_text:v?[{type:"text",text:{content:v},plain_text:v}]:[]});
const title=v=>({type:"title",title:[{type:"text",text:{content:v},plain_text:v}]});
const checked=v=>({type:"checkbox",checkbox:v});
const select=v=>({type:"select",select:v?{name:v}:null});
const options=values=>({type:"multi_select",multi_select:values.map(name=>({name}))});
function page(fields={}){
  return {id:pageId,parent:{type:"data_source_id",data_source_id:SOURCE},
    last_edited_time:"2026-11-20T05:00:00Z",archived:false,properties:{
      "Psipedia ID":text("1810"),"Kategória":text("veterinari"),"Názov":title("Vet SK"),
      "Odkontrolované":checked(false),
      "Perex":text("Nový perex"),"Popis":text("Nový obsah"),
      "Telefón":text("ľubovoľný údaj"),"Web":text("www.nevalidovana.sk"),
      "SEO title":text("SEO názov"),"Noindex":checked(false),
      "Kvalifikácie":text("Kurz A\nKurz B\nKurz A"),
      "Ordinačné hodiny":text("Po–Pi podľa dohody"),
      "Ďalšie kategórie":options(["Fyzioterapia"]),
      "Filter · veterinari.emergency":select("Áno"),
      "Kvalita · Telefón":select("Verejne nezverejnené"),
      "Kvalita skontrolované":{type:"date",date:{start:"2026-11-20"}},
      ...fields,
    }};
}
function row(changes={}){
  return {id:1810,category:"veterinari",slug:"vet-sk",status:"published",
    updated_at:"2026-11-20T03:00:00Z",notion_page_id:pageId,
    name:"Old Vet",excerpt:"Old",description:"Old",website_url:"https://old.example.sk",
    public_phone:null,region:"Nitra",city:"Nitra",
    sql_review_locked:0,legacy_review_locked:0,partner_active:0,
    confirmed_google:0,tombstone:0,...changes};
}
test("source identity must match actual D1 and canonical notion mapping",()=>{
  assert.equal(notionId(page()),1810);
  assert.equal(notionId(page({"Psipedia ID":text("")})),null);
  assert.equal(planNotionDirectoryImport(page(),row(),SOURCE).ok,true);
  assert.equal(planNotionDirectoryImport(page(),row({id:1811}),SOURCE).reason,"id_not_mapped");
  assert.equal(planNotionDirectoryImport(page(),row({notion_page_id:"wrong"}),SOURCE).reason,"wrong_notion_page");
  assert.equal(planNotionDirectoryImport(page({"Kategória":text("treneri")}),row(),SOURCE).reason,"category_mismatch");
  assert.equal(planNotionDirectoryImport(page(),row({status:"archived"}),SOURCE).reason,"archived");
});
test("reviewed, pending unlock, partner and Notion checkbox stay protected",()=>{
  for(const key of ["partner_active","sql_review_locked","legacy_review_locked","tombstone"]){
    assert.equal(planNotionDirectoryImport(page(),row({[key]:1}),SOURCE).reason,
      "protected_owner_or_review",key);
  }
  assert.equal(planNotionDirectoryImport(page({"Odkontrolované":checked(true)}),row(),SOURCE)
    .reason,"protected_owner_or_review");
  assert.equal(planNotionDirectoryImport(page({"Odkontrolované":undefined}),row(),SOURCE)
    .reason,"protected_owner_or_review");
});
test("nonempty Notion fields own SQL, free text contacts have no URL/email validators",()=>{
  const p=planNotionDirectoryImport(page(),row(),SOURCE);
  assert.equal(p.fields.name,"Vet SK");
  assert.equal(p.fields.public_phone,"ľubovoľný údaj");
  assert.equal(p.fields.website_url,"www.nevalidovana.sk");
  assert.equal(p.fields.description,"Nový obsah");
  assert.equal(p.seo.title,"SEO názov");
  assert.equal(p.noindex,false);
  assert.deepEqual(p.qualifications,["Kurz A","Kurz B"]);
  assert.equal(p.hoursText,"Po–Pi podľa dohody");
  assert.deepEqual(p.secondary,["fyzioterapia"]);
  assert.deepEqual(p.filters,[{id:"veterinari.emergency",category:"veterinari",value:"yes"}]);
  assert.deepEqual(p.quality,[{field:"phone",status:"NOT_PUBLIC",checkedAt:"2026-11-20"}]);
});
test("missing/blank Notion properties never implicitly erase an existing SQL value",()=>{
  const p=planNotionDirectoryImport(page({
    "Web":text(""),"Telefón":undefined,"Názov":title("Vet SK"),
    "Kvalifikácie":text(""),"Ordinačné hodiny":text(""),
    "Ďalšie kategórie":undefined,
  }),row(),SOURCE);
  assert.equal(p.fields.website_url,undefined);
  assert.equal(p.fields.public_phone,undefined);
  assert.equal(p.qualifications,null);
  assert.equal(p.hoursText,null);
  assert.equal(p.secondary,null);
  assert(p.issues.includes("missing:Telefón"));
  assert(p.issues.includes("missing:Ďalšie kategórie"));
});
test("confirmed Google Place blocks address overwrite but allows unrelated editorial fields",()=>{
  const p=planNotionDirectoryImport(page({"Adresa":text("Notion different address"),
    "Mesto":text("Bratislava"),"Perex":text("New perex")}),
    row({confirmed_google:1}),SOURCE);
  assert.equal(p.ok,true);
  assert.equal(p.fields.address,undefined);
  assert.equal(p.fields.city,undefined);
  assert.equal(p.fields.excerpt,"New perex");
});
test("Notion relation services and old gallery JSON never become fabricated values",()=>{
  const p=planNotionDirectoryImport(page({
    "Služby":text("Kúpanie"),"Služby z katalógu":{type:"relation",relation:[{id:"id"}]},
    "_psipedia_breeder_gallery_urls":text("/media/old.webp"),
  }),row(),SOURCE);
  assert.equal(p.fields.services_json,undefined);
  assert.equal(p.fields.source_data_json,undefined);
  assert.equal(p.gallery,undefined);
  assert.equal(p.serviceChoices,undefined);
});
test("source importer is owner-only, never patches Notion, never deletes profiles or JSON",()=>{
  const runner=readFileSync(new URL("../scripts/production-directory-onetime-notion-import.mjs",import.meta.url),"utf8");
  const wf=readFileSync(new URL("../.github/workflows/production-directory-onetime-notion-import.yml",import.meta.url),"utf8");
  assert.match(runner,/workflow_dispatch/);
  assert.match(runner,/NOTION_ONE_TIME_CONFIRMATION/);
  assert.match(runner,/NOTION_DUPLICATE_ID/);
  assert.match(runner,/directory_profile_review_state/);
  assert.match(runner,/partner_memberships/);
  assert.match(runner,/last_edited_time!==revisionByPage/);
  assert.match(runner,/expectedUpdatedAt/);
  assert.match(runner,/time-travel/);
  assert.match(runner,/ON CONFLICT/);
  assert.doesNotMatch(runner,/DELETE FROM directory_profiles/);
  assert.doesNotMatch(runner,/\/pages\/.*PATCH/);
  assert.match(wf,/environment: production/);
  assert.match(wf,/secrets.CLOUDFLARE_D1_API_TOKEN/);
  assert.match(wf,/secrets.GEMINI_AGENT_NOTION_TOKEN/);
  assert.match(wf,/mode:\s*\n\s*description:[^\n]*\n\s*type:\s*choice/);
});
