import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {canonicalPublicServiceWhere,canonicalPublicServiceOptions} from "../lib/service-catalog-public-service-filter.ts";
import {serviceCatalog} from "../lib/service-catalog-contract.ts";
import {directoryQueryFields,directoryPageHref} from "../lib/directory-query.ts";

const c="veterinari";
const staticId=serviceCatalog.find(s=>s.categories.includes(c)).id;
const dynamicId="svc.admin."+"a".repeat(32);
const dynamicBad="svc.admin."+"b".repeat(32);
const attrId="attr.admin."+"c".repeat(32);
function fixture(){
  const db=new DatabaseSync(":memory:");
  db.exec("CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY,category TEXT,status TEXT,services_json TEXT,source_data_json TEXT)");
  db.exec("CREATE TABLE service_profile_option_choices(profile_id INTEGER,option_id TEXT,choice TEXT)");
  db.exec("CREATE TABLE service_catalog_admin_options(id TEXT PRIMARY KEY,label TEXT,kind TEXT,status TEXT,notion_mirror_status TEXT,categories_json TEXT)");
  const p=db.prepare("INSERT INTO directory_profiles VALUES (?,?,?,?,?)");
  const choice=db.prepare("INSERT INTO service_profile_option_choices VALUES (?,?,?)");
  const opt=db.prepare("INSERT INTO service_catalog_admin_options VALUES (?,?,?,?,?,?)");
  // Only published, explicitly confirmed YES counts.
  p.run(1,c,"published","[]","{}");choice.run(1,staticId,"yes");
  p.run(2,c,"published","[]","{}");choice.run(2,staticId,"no");
  p.run(3,c,"published","[]","{}");
  p.run(4,c,"published","[]","{}");choice.run(4,dynamicId,"yes");
  p.run(5,c,"draft","[]","{}");choice.run(5,dynamicId,"yes");
  p.run(6,c,"published","[]","{}");choice.run(6,dynamicBad,"yes");
  p.run(7,"treneri","published","[]","{}");choice.run(7,dynamicId,"yes");
  p.run(8,c,"archived","[]","{}");choice.run(8,dynamicId,"yes");
  p.run(9,c,"published",'["'+"Legacy marketing service"+'"]','{"Typ služby":"Legacy marketing service"}');
  p.run(10,c,"published","[]","{}");choice.run(10,attrId,"yes");
  opt.run(dynamicId,"Explicit new diagnostics","service","ACTIVE","SYNCED",'["veterinari"]');
  opt.run(dynamicBad,"Unverified diagnostics","service","DRAFT","PENDING",'["veterinari"]');
  opt.run(attrId,"A property","attribute","ACTIVE","SYNCED",'["veterinari"]');
  return {db,close:()=>db.close()};
}
function ids(db,raw,category=c,enabled=true){
  const where=canonicalPublicServiceWhere(category,raw,enabled);
  return db.prepare("SELECT id FROM directory_profiles WHERE status='published' AND category=? AND "+
    (where.clauses.length?where.clauses.join(" AND "):"1=1")+" ORDER BY id")
    .all(category,...where.bindings).map(x=>x.id);
}

test("published canonical filter includes only explicit YES with an eligible static service ID",()=>{
  const f=fixture();try{
    assert.deepEqual(ids(f.db,staticId),[1]);
    assert.deepEqual(ids(f.db,staticId,c,false),[]);
    assert.deepEqual(ids(f.db,staticId,"treneri"),[]);
    assert.deepEqual(ids(f.db,"svc.bad"),[]);
    assert.deepEqual(ids(f.db,"not real; DROP TABLE directory_profiles;"),[]);
    assert.deepEqual(ids(f.db,dynamicId,c,false),[]);
    assert.deepEqual(ids(f.db,"__invalid__"),[]);
  }finally{f.close();}
});
test("dynamic YES requires canonical ACTIVE/SYNCED service and approved category",()=>{
  const f=fixture();try{
    assert.deepEqual(ids(f.db,dynamicId),[4]);
    assert.deepEqual(ids(f.db,dynamicBad),[]);
    assert.deepEqual(ids(f.db,attrId),[]);
    // Changing mirror receipt state immediately removes dynamic option from results.
    f.db.prepare("UPDATE service_catalog_admin_options SET notion_mirror_status='CONFLICT' WHERE id=?").run(dynamicId);
    assert.deepEqual(ids(f.db,dynamicId),[]);
    f.db.prepare("UPDATE service_catalog_admin_options SET notion_mirror_status='SYNCED',categories_json='[\"treneri\"]' WHERE id=?").run(dynamicId);
    assert.deepEqual(ids(f.db,dynamicId),[]);
  }finally{f.close();}
});
test("available dropdown options only come from published profile explicit YES; no unknown, NO or legacy text",()=>{
  const f=fixture();try{
    const rows=f.db.prepare(`
      SELECT DISTINCT choice.option_id AS optionId,opt.label AS label,opt.kind AS kind,opt.status AS status,
        opt.notion_mirror_status AS mirrorStatus,opt.categories_json AS categoriesJson
      FROM service_profile_option_choices AS choice
      JOIN directory_profiles AS profile ON profile.id=choice.profile_id
      LEFT JOIN service_catalog_admin_options AS opt ON opt.id=choice.option_id
      WHERE profile.status='published' AND profile.category=? AND choice.choice='yes' ORDER BY choice.option_id
    `).all(c);
    const result=canonicalPublicServiceOptions(c,rows);
    assert.deepEqual(result.map(x=>x.id).sort(),[staticId,dynamicId].sort());
    assert.ok(result.some(x=>x.id===dynamicId&&x.label==="Explicit new diagnostics"));
    assert.deepEqual(canonicalPublicServiceOptions("utulky-a-zachrana",rows),[]);
  }finally{f.close();}
});
test("svc canonical ID survives search, paging and removal without mutating legacy service filter",()=>{
 const filters={query:"pes",category:"",region:"",district:"",city:"",service:"Staršia služba",
   canonicalService:staticId,breed:"",fciGroup:"",organization:"",profileType:"",
   sort:"recommended",page:2,facets:{}};
 const url=new URL(directoryPageHref("/adresar/veterinari",filters,3),"https://psipedia.sk");
 assert.equal(url.searchParams.get("svc"),staticId);
 assert.equal(url.searchParams.get("service"),"Staršia služba");
 assert.equal(url.searchParams.get("page"),"3");
 assert.equal(directoryQueryFields(filters,["svc"]).some(x=>x.name==="svc"),false);
});
test("actual public list uses opt-in read-only SQL adapter and never writes to D1 or Notion",()=>{
 const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
 const store=read("lib/directory-store.ts");
 const form=read("components/directory-filter-form.tsx");
 const page=read("components/directory-page.tsx");
 const adapter=read("lib/service-catalog-public-service-filter.ts");
 assert.match(store,/SERVICE_CATALOG_PUBLIC_FILTERS_ENABLED==="true"/);
 assert.match(store,/canonicalPublicServiceWhere\(category\?\?""/);
 assert.match(store,/baseClauses\.push\(\.\.\.canonicalService\.clauses\)/);
 assert.match(store,/choice\.choice='yes'/);
 assert.ok(form.includes("const { filters, options, basePath, category, mapHref } = props;"));
 assert.match(form,/name="svc"/);
 assert.match(form,/data-services-v3-canonical-filter/);
 assert.match(form,/directoryQueryFields\(filters, \["page"\]\)/);
 assert.match(page,/Mapa používa rovnaký filter potvrdenej služby ako zoznam/);
 assert.match(page,/canonicalService: filters\.canonicalService\?\?""/);
 assert.doesNotMatch(adapter,/UPDATE |INSERT |DELETE |NOTION_API_TOKEN/);
 const wrangler=read("wrangler.jsonc");
 assert.doesNotMatch(wrangler,/SERVICE_CATALOG_PUBLIC_FILTERS_ENABLED/);
});
