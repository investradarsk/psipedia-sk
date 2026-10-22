import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { canonicalPublicServiceWhere } from "../lib/service-catalog-public-service-filter.ts";
import { serviceCatalog } from "../lib/service-catalog-contract.ts";
import { parseMapQuery,MapQueryValidationError } from "../lib/map-contract.ts";
import {
  EMPTY_MAP_FILTERS, MAP_DEFAULT_BBOX,buildMapApiUrl,
  mapFiltersFromSearchParams,mapFiltersForCategory,mapQueryInputPreview,
  serializeMapUiFilters
} from "../lib/map-public-ui.ts";

const category="veterinari";
const staticId=serviceCatalog.find(s=>s.categories.includes(category)).id;
const dynamicId="svc.admin."+"a".repeat(32);
const badId="svc.admin."+"b".repeat(32);
function apiParams(extra={}){
 return new URLSearchParams({north:"50",south:"47",east:"23",west:"16",zoom:"12",
  category:"services",subcategory:category,...extra});
}
function fixture(){
 const db=new DatabaseSync(":memory:");
 db.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, category TEXT, status TEXT)");
 db.exec("CREATE TABLE service_profile_option_choices (profile_id INTEGER, option_id TEXT, choice TEXT)");
 db.exec("CREATE TABLE service_catalog_admin_options (id TEXT PRIMARY KEY,kind TEXT,status TEXT,notion_mirror_status TEXT,categories_json TEXT)");
 const profile=db.prepare("INSERT INTO directory_profiles VALUES(?,?,?)");
 const choice=db.prepare("INSERT INTO service_profile_option_choices VALUES(?,?,?)");
 const option=db.prepare("INSERT INTO service_catalog_admin_options VALUES(?,?,?,?,?)");
 profile.run(1,category,"published");choice.run(1,staticId,"yes");
 profile.run(2,category,"published");choice.run(2,staticId,"no");
 profile.run(3,category,"published");
 profile.run(4,category,"published");choice.run(4,dynamicId,"yes");
 profile.run(5,category,"published");choice.run(5,badId,"yes");
 profile.run(6,"treneri","published");choice.run(6,staticId,"yes");
 profile.run(7,category,"draft");choice.run(7,staticId,"yes");
 option.run(dynamicId,"service","ACTIVE","SYNCED",'["veterinari"]');
 option.run(badId,"service","DRAFT","PENDING",'["veterinari"]');
 return db;
}
test("map SQL uses exact same canonical YES predicate for d.id; flags/missing/NO fail closed",()=>{
 const db=fixture();
 try {
  const get=(id,enabled=true)=>{
   const filter=canonicalPublicServiceWhere(category,id,enabled,"d");
   return db.prepare("SELECT d.id FROM directory_profiles d WHERE d.status='published' AND d.category=? AND "+
     filter.clauses.join(" AND ")+" ORDER BY d.id").all(category,...filter.bindings).map(x=>x.id);
  };
  assert.deepEqual(get(staticId),[1]);
  assert.deepEqual(get(dynamicId),[4]);
  assert.deepEqual(get(badId),[]);
  assert.deepEqual(get(staticId,false),[]);
  assert.deepEqual(get("attr.admin."+"c".repeat(32)),[]);
  assert.deepEqual(get("unknown; DROP TABLE x;"),[]);
  db.prepare("UPDATE service_catalog_admin_options SET notion_mirror_status='CONFLICT' WHERE id=?").run(dynamicId);
  assert.deepEqual(get(dynamicId),[4]);
 }finally{db.close();}
});
test("map API rejects ambiguous svc, unrelated map category or unscoped option",()=>{
 const good=parseMapQuery(apiParams({svc:staticId}));
 assert.equal(good.canonicalService,staticId);
 for(const params of [
  apiParams({category:"events",svc:staticId}),
  apiParams({category:"organizations",svc:staticId}),
  apiParams({subcategory:"",svc:staticId}),
  apiParams({svc:""}),
  apiParams({svc:"a".repeat(101)}),
 ]){
  assert.throws(()=>parseMapQuery(params),MapQueryValidationError);
 }
 const dup=apiParams({svc:staticId});dup.append("svc",staticId);
 assert.throws(()=>parseMapQuery(dup),MapQueryValidationError);
 const noService=parseMapQuery(apiParams());
 assert.equal(noService.canonicalService,undefined);
});
test("directory -> map -> API -> sharing preserves canonical service only for scoped service category",()=>{
 const filters={...EMPTY_MAP_FILTERS,category:"services",subcategory:category,
  canonicalService:staticId,region:"Nitriansky kraj"};
 const share=serializeMapUiFilters(filters);
 assert.equal(share.get("svc"),staticId);
 const restored=mapFiltersFromSearchParams(share);
 assert.equal(restored.canonicalService,staticId);
 const apiUrl=buildMapApiUrl({bbox:MAP_DEFAULT_BBOX,zoom:12},restored);
 const parsed=parseMapQuery(new URL(apiUrl,"https://psipedia.sk").searchParams);
 assert.equal(parsed.canonicalService,staticId);
 assert.equal(mapQueryInputPreview({bbox:MAP_DEFAULT_BBOX,zoom:12},restored).canonicalService,staticId);
 const switched=mapFiltersForCategory(restored,"events");
 assert.equal(switched.canonicalService,"");
 assert.equal(serializeMapUiFilters(switched).has("svc"),false);
 assert.equal(buildMapApiUrl({bbox:MAP_DEFAULT_BBOX,zoom:12},switched).includes("svc="),false);
 const dup=new URLSearchParams(share);dup.append("svc",staticId);
 assert.equal(mapFiltersFromSearchParams(dup).canonicalService,"__invalid__");
});
test("map public endpoint applies SQL BEFORE its bound and preserves default OFF",()=>{
 const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
 const query=read("lib/map-query.ts");
 const contract=read("lib/map-contract.ts");
 const page=read("components/directory-page.tsx");
 const ui=read("components/map/map-experience.tsx");
 const directoryForm=read("components/directory-filter-form.tsx");
 const publicAdapter=read("lib/service-catalog-public-service-filter.ts");
 assert.match(query,/canonicalPublicServiceWhere\(/);
 assert.match(query,/SERVICE_CATALOG_PUBLIC_FILTERS_ENABLED==="true"/);
 assert.match(query,/query\.canonicalService\?\?""/);
 assert.match(query,/canonicalService\.clauses\.map/);
 assert.match(query,/\.\.\.canonicalService\.bindings, MAP_INTERNAL_ROW_LIMIT/);
 assert.match(query,/canonicalCategory\.clause/);
 assert.match(contract,/"limit", "svc"/);
 assert.match(page,/canonicalService: filters\.canonicalService\?\?""/);
 assert.match(page,/Mapa používa rovnaký filter potvrdenej služby ako zoznam/);
 assert.doesNotMatch(directoryForm,/Mapa \(bez filtra služby\)/);
 assert.match(ui,/Zrušiť filter služby/);
 assert.match(ui,/canonicalService: ""/);
 assert.match(publicAdapter,/profileAlias:"directory_profiles"\|"d"/);
 assert.equal(JSON.parse(read("wrangler.jsonc")).vars.SERVICE_CATALOG_PUBLIC_FILTERS_ENABLED,"true");
 assert.doesNotMatch(query,/INSERT INTO service_profile_option_choices|UPDATE service_catalog_admin_options|DELETE FROM service_profile_option_choices/);
});
