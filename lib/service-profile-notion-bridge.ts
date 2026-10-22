/**
 * Services V3 ↔ existing Directory Notion "Služby" bridge.
 * The canonical D1 choice table is authoritative; the legacy services_json
 * list is only a textual transport for the EXISTING directory sync pipeline.
 * Preserve unrelated free-text values: never infer "no" from missing legacy data.
 */
import {serviceCatalog,normalizeCatalogLabel} from "./service-catalog-contract.ts";
import {serviceFilterCategories} from "./directory-filter-contract.ts";
import {saveAdminServiceChoice,resetAdminServiceChoice} from "./service-catalog-admin-store.ts";

type DB=D1Database;
type ChoiceRow={option_id:string;choice:"yes"|"no";version:number};
type Profile={id:number;category:string;services_json:string|null;updated_at:string|null};
type DynamicRow={id:string;label:string;categories_json:string;status:string;kind:string};
const actor="notion-service-choices@psipedia.sk";
const categories=new Set<string>(serviceFilterCategories);
function parseServices(input:string|null):string[]{
  if(!input)return [];
  try{
    const parsed=JSON.parse(input);
    return Array.isArray(parsed)&&parsed.every(x=>typeof x==="string")?parsed:[];
  }catch{return [];}
}
async function allowedCatalog(db:DB,category:string){
  if(!categories.has(category))return [];
  const statics=serviceCatalog.filter(s=>s.categories.includes(category as typeof serviceFilterCategories[number]))
    .map(s=>({id:s.id,label:s.label,aliases:s.aliases}));
  const {results}=await db.prepare(
    "SELECT id,label,categories_json,status,kind FROM service_catalog_admin_options WHERE status='ACTIVE' AND kind='service'"
  ).all<DynamicRow>();
  const dynamic=(results??[]).filter(x=>{
    try{return (JSON.parse(x.categories_json) as string[]).includes(category);}
    catch{return false;}
  }).map(x=>({id:x.id,label:x.label,aliases:[] as readonly string[]}));
  return [...statics,...dynamic];
}
/** After an explicit Admin checkbox write, make its matching legacy Notion text
 * reflect the same choice without deleting unrelated historic service names.
 * Called only after canonical CAS succeeds; a failed projection is reported.
 */
export async function projectServiceChoiceToDirectoryNotion(db:DB,profileId:number,optionId:string,choice:"yes"|"no"|"unknown"){
  const profile=await db.prepare(
    "SELECT id,category,services_json,updated_at FROM directory_profiles WHERE id=?1 LIMIT 1"
  ).bind(profileId).first<Profile>();
  if(!profile)throw Error("SERVICE_PROFILE_NOT_FOUND");
  const item=(await allowedCatalog(db,profile.category)).find(s=>s.id===optionId);
  if(!item)return "unchanged" as const; // unrelated typed attribute, not a service
  const existing=parseServices(profile.services_json);
  const normalized=normalizeCatalogLabel(item.label);
  const filtered=existing.filter(s=>normalizeCatalogLabel(s)!==normalized);
  if(choice==="yes")filtered.push(item.label);
  if(JSON.stringify(filtered)===JSON.stringify(existing))return "unchanged" as const;
  const now=new Date().toISOString();
  const updated=await db.prepare(
    "UPDATE directory_profiles SET services_json=?1,updated_at=?2 "+
    "WHERE id=?3 AND COALESCE(services_json,'[]')=?4 AND updated_at IS ?5 RETURNING id"
  ).bind(JSON.stringify(filtered),now,profileId,profile.services_json??"[]",profile.updated_at)
    .first<{id:number}>();
  if(!updated)throw Error("SERVICE_NOTION_PROJECTION_CONCURRENT_CHANGE");
  return "updated" as const;
}
/**
 * Called only when the existing Directory Notion reconciler accepts a real
 * changed "Služby" field, after its protected three-way merge / D1 commit.
 * Exact catalog labels or aliases only; ambiguous aliases do not auto-map.
 * Unrecognized historic free text stays in directory_profiles.services_json.
 */
export async function importNotionServiceChoices(db:DB,profileId:number,category:string,names:readonly string[]){
  if(!categories.has(category))return {added:0,removed:0};
  const available=await allowedCatalog(db,category);
  const terms=new Map<string,string|null>();
  for(const entry of available){
    for(const label of [entry.label,...entry.aliases]){
      const key=normalizeCatalogLabel(label);
      if(!key)continue;
      const old=terms.get(key);
      terms.set(key,old===undefined?entry.id:old===entry.id?entry.id:null);
    }
  }
  const selected=new Set<string>();
  for(const name of names){
    const id=terms.get(normalizeCatalogLabel(name));
    if(id)selected.add(id);
  }
  const rows=await db.prepare(
    "SELECT option_id,choice,version FROM service_profile_option_choices WHERE profile_id=?1"
  ).bind(profileId).all<ChoiceRow>();
  const saved=new Map((rows.results??[]).map(row=>[row.option_id,row]));
  let added=0,removed=0;
  const availableIds=new Set(available.map(x=>x.id));
  for(const id of selected){
    const prior=saved.get(id);
    if(prior?.choice==="yes")continue;
    await saveAdminServiceChoice(db,{profileId,optionId:id,choice:"yes",expectedVersion:prior?.version??0},actor);
    added++;
  }
  for(const row of rows.results??[]){
    if(row.choice!=="yes"||!availableIds.has(row.option_id)||selected.has(row.option_id))continue;
    // Only a deliberate Notion "Služby" field change enters this function.
    // Reset to unknown, never manufacture an explicit NO selection.
    await resetAdminServiceChoice(db,{profileId,optionId:row.option_id,expectedVersion:row.version},actor);
    removed++;
  }
  return {added,removed};
}
