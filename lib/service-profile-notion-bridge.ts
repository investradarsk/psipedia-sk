/**
 * Services V3: Notion catalogue relations only update canonical service choices.
 * Legacy Notion "Služby" text and directory_profiles.services_json stay independent.
 */
import {loadResolvedServiceDefinitions} from "./service-catalog-resolved.ts";
import {serviceFilterCategories} from "./directory-filter-contract.ts";
import {saveAdminServiceChoice,resetAdminServiceChoice} from "./service-catalog-admin-store.ts";
type DB=D1Database;
type ChoiceRow={option_id:string;choice:"yes"|"no";version:number};
const actor="notion-service-choices@psipedia.sk";
const categories=new Set<string>(serviceFilterCategories);
async function allowedCatalog(db:DB,category:string){
  if(!categories.has(category))return [];
  return loadResolvedServiceDefinitions(db,category);
}

/**
 * Apply exact canonical Notion relation IDs through independent CAS/audit
 * writes. Absence of an explicit YES resets it to unknown, never to NO.
 */
export async function importNotionServiceIds(
  db:DB,profileId:number,category:string,ids:readonly string[],
  resolved?:Awaited<ReturnType<typeof allowedCatalog>>,
){
  if(!categories.has(category))throw Error("SERVICES_RELATION_INVALID_CATEGORY");
  const available=resolved??await allowedCatalog(db,category);
  const availableIds=new Set(available.map(x=>x.id));
  const selected=new Set(ids);
  if([...selected].some(id=>!availableIds.has(id)))
    throw Error("SERVICES_RELATION_UNKNOWN_OR_WRONG_CATEGORY");
  const rows=await db.prepare(
    "SELECT option_id,choice,version FROM service_profile_option_choices WHERE profile_id=?1"
  ).bind(profileId).all<ChoiceRow>();
  const saved=new Map((rows.results??[]).map(row=>[row.option_id,row]));
  let added=0,removed=0;
  const failedIds:string[]=[];
  for(const id of selected){
    const prior=saved.get(id);
    if(prior?.choice==="yes")continue;
    try{
      await saveAdminServiceChoice(db,{profileId,optionId:id,choice:"yes",expectedVersion:prior?.version??0},actor);
      added++;
    }catch{
      // An unrelated service version conflict cannot block other independent
      // service IDs. The caller must NOT acknowledge a full relation baseline
      // when any item failed.
      failedIds.push(id);
    }
  }
  for(const row of rows.results??[]){
    if(row.choice!=="yes"||!availableIds.has(row.option_id)||selected.has(row.option_id))continue;
    try{
      // Only the verified relation reconciliation may reset a YES to unknown;
      // do not manufacture an explicit NO or alter unrelated choices.
      await resetAdminServiceChoice(db,{profileId,optionId:row.option_id,expectedVersion:row.version},actor);
      removed++;
    }catch{failedIds.push(row.option_id);}
  }
  if(failedIds.length)throw Error("SERVICES_RELATION_PARTIAL_CAS_FAILURE");
  return {added,removed};
}

