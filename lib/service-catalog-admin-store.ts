/**
 * SERVICES V3, phase 2: canonical D1 store only.
 * A caller MUST first enforce trusted Admin authorization and the rollout gates.
 * No Notion mutations, public projections, implicit changes or free-text inference.
 */
import {serviceCatalog,normalizeCatalogLabel} from "./service-catalog-contract.ts";
import {validateCatalogOptionDraft,type CatalogOptionDraft} from "./service-option-governance-contract.ts";
import type {ServiceFilterCategory} from "./directory-filter-contract.ts";

export class ServiceCatalogInputError extends Error {}
export class ServiceCatalogConflictError extends Error {}
export class ServiceCatalogSchemaError extends Error {}
type DB=Pick<D1Database,"prepare">;
type AdminOptionRow={id:string;kind:"service"|"attribute";label:string;normalized_label:string;group_name:string;meaning:string;primary_category:string;categories_json:string;status:string;notion_mirror_status:string;version:number};
type ProfileRow={id:number;category:string;status:string};
type ChoiceRow={profile_id:number;option_id:string;choice:string;version:number};
export type ServiceChoiceInput={profileId:number;optionId:string;choice:"yes"|"no";expectedVersion:number};
function actorEmail(raw:string){
  const actor=raw.trim().toLowerCase();
  if(!actor||actor.length>254||!actor.includes("@"))throw new ServiceCatalogInputError("Authenticated Admin actor missing.");
  return actor;
}
function categories(raw:string):string[]{
  try{const a=JSON.parse(raw);return Array.isArray(a)&&a.every(x=>typeof x==="string")?a:[];}
  catch{return [];}
}
function mapOption(row:AdminOptionRow){
  return {id:row.id,kind:row.kind,label:row.label,group:row.group_name,meaning:row.meaning,
    categories:categories(row.categories_json),status:row.status,notionMirrorStatus:row.notion_mirror_status,version:row.version};
}
function handleDbError(error:unknown):never{
  const message=error instanceof Error?error.message:String(error);
  if(/UNIQUE constraint|constraint failed/i.test(message))
    throw new ServiceCatalogConflictError("Option already exists or violates an integrity constraint.");
  if(/no such table|no such column/i.test(message))
    throw new ServiceCatalogSchemaError("Schema 0132 is not provisioned.");
  throw error;
}
function validateNewOption(value:unknown){
  if(!value||typeof value!=="object"||Array.isArray(value))
    throw new ServiceCatalogInputError("Invalid option payload.");
  const data=value as Record<string,unknown>;
  if(Object.keys(data).some(x=>!["name","category","kind","group","meaning"].includes(x)))
    throw new ServiceCatalogInputError("Server-controlled fields are forbidden.");
  if(typeof data.name!=="string"||typeof data.category!=="string"||typeof data.kind!=="string"
      ||typeof data.group!=="string"||typeof data.meaning!=="string")
    throw new ServiceCatalogInputError("Invalid option fields.");
  let result:ReturnType<typeof validateCatalogOptionDraft>;
  try{result=validateCatalogOptionDraft(data as unknown as CatalogOptionDraft);}
  catch(e){throw new ServiceCatalogInputError(e instanceof Error?e.message:"Invalid option.");}
  const meaning=data.meaning.normalize("NFC").trim().replace(/\s+/g," ");
  if(meaning.length<10||meaning.length>500)throw new ServiceCatalogInputError("Meaning must contain 10 to 500 characters.");
  return {...result,meaning,normalizedLabel:normalizeCatalogLabel(result.name)};
}
export async function listAdminCatalogOptions(db:DB){
  try{const rows=await db.prepare("SELECT * FROM service_catalog_admin_options ORDER BY label,id").all<AdminOptionRow>();
    return rows.results.map(mapOption);}
  catch(e){return handleDbError(e);}
}
/** Creates an inert DRAFT/PENDING catalog entry, never a public option or Notion item. */
export async function createAdminCatalogOption(db:DB,raw:unknown,actorRaw:string,now=new Date()){
  const actor=actorEmail(actorRaw),input=validateNewOption(raw);
  let duplicate:{id:string}|null;
  try{duplicate=await db.prepare("SELECT id FROM service_catalog_admin_options WHERE normalized_label=?1 LIMIT 1")
    .bind(input.normalizedLabel).first<{id:string}>();}
  catch(e){return handleDbError(e);}
  if(duplicate)throw new ServiceCatalogConflictError("Option already exists; reuse the canonical ID.");
  const id=(input.kind==="service"?"svc.admin.":"attr.admin.")+crypto.randomUUID().replace(/-/g,"");
  const time=now.toISOString();
  try{
    const sql=[
      "INSERT INTO service_catalog_admin_options",
      "(id,kind,label,normalized_label,group_name,meaning,primary_category,categories_json,value_kind,status,notion_mirror_status,version,created_at,updated_at,created_by,updated_by)",
      "VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'tri_state','DRAFT','PENDING',1,?9,?9,?10,?10) RETURNING *"
    ].join(" ");
    const created=await db.prepare(sql).bind(id,input.kind,input.name,input.normalizedLabel,input.group,input.meaning,input.category,
      JSON.stringify([input.category]),time,actor).first<AdminOptionRow>();
    if(!created)throw new ServiceCatalogConflictError("No option row was created.");
    return mapOption(created);
  }catch(e){return handleDbError(e);}
}
async function allowedCategories(db:DB,id:string):Promise<readonly string[]|null>{
  const item=serviceCatalog.find(x=>x.id===id);
  if(item)return item.categories;
  const row=await db.prepare("SELECT kind,status,notion_mirror_status,categories_json FROM service_catalog_admin_options WHERE id=?1 LIMIT 1")
    .bind(id).first<{kind:string;status:string;notion_mirror_status:string;categories_json:string}>();
  return row?.kind==="service"&&row.status==="ACTIVE"&&row.notion_mirror_status==="SYNCED"?categories(row.categories_json):null;
}
/** An explicit yes/no write with version=0 insert-if-absent and CAS updates. */
export async function saveAdminServiceChoice(db:DB,input:ServiceChoiceInput,actorRaw:string,now=new Date()){
  const actor=actorEmail(actorRaw);
  if(!input||!Number.isSafeInteger(input.profileId)||input.profileId<=0
     ||!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0
     ||typeof input.optionId!=="string"||!["yes","no"].includes(input.choice))
    throw new ServiceCatalogInputError("Invalid explicit service choice.");
  let profile:ProfileRow|null,allowed:readonly string[]|null;
  try{
    profile=await db.prepare("SELECT id,category,status FROM directory_profiles WHERE id=?1 LIMIT 1")
      .bind(input.profileId).first<ProfileRow>();
    if(!profile||profile.status==="archived")throw new ServiceCatalogConflictError("Profile is missing or archived.");
    allowed=await allowedCategories(db,input.optionId);
  }catch(e){return handleDbError(e);}
  if(!allowed||!allowed.includes(profile.category as ServiceFilterCategory))
    throw new ServiceCatalogInputError("Service is unknown, inactive or not eligible for this category.");
  const time=now.toISOString();
  let saved:ChoiceRow|null;
  try{
    if(input.expectedVersion===0){
      const sql=[
        "INSERT INTO service_profile_option_choices",
        "(profile_id,option_id,choice,version,created_at,updated_at,created_by,updated_by)",
        "SELECT ?1,?2,?3,1,?4,?4,?5,?5 WHERE EXISTS",
        "(SELECT 1 FROM directory_profiles WHERE id=?1 AND category=?6 AND status<>'archived')",
        "ON CONFLICT (profile_id,option_id) DO NOTHING RETURNING profile_id,option_id,choice,version"
      ].join(" ");
      saved=await db.prepare(sql).bind(input.profileId,input.optionId,input.choice,time,actor,profile.category).first<ChoiceRow>();
    }else{
      const sql=[
        "UPDATE service_profile_option_choices SET choice=?1,version=version+1,updated_at=?2,updated_by=?3",
        "WHERE profile_id=?4 AND option_id=?5 AND version=?6",
        "AND EXISTS (SELECT 1 FROM directory_profiles WHERE id=?4 AND category=?7 AND status<>'archived')",
        "RETURNING profile_id,option_id,choice,version"
      ].join(" ");
      saved=await db.prepare(sql).bind(input.choice,time,actor,input.profileId,input.optionId,input.expectedVersion,profile.category).first<ChoiceRow>();
    }
  }catch(e){return handleDbError(e);}
  if(!saved)throw new ServiceCatalogConflictError("Selection changed concurrently; reload before saving.");
  return {profileId:saved.profile_id,optionId:saved.option_id,choice:saved.choice,version:saved.version};
}
