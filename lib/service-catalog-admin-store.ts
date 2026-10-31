/**
 * SERVICES V3, phase 2: canonical D1 store only.
 * A caller MUST first enforce trusted Admin authorization and the rollout gates.
 * No Notion mutations, public projections, implicit changes or free-text inference.
 */
import {serviceCatalog,attributeCatalog,normalizeCatalogLabel} from "./service-catalog-contract.ts";
import {validateCatalogOptionDraft,type CatalogOptionDraft} from "./service-option-governance-contract.ts";
import type {ServiceFilterCategory} from "./directory-filter-contract.ts";
import type {AdminCatalogOptionDto,CatalogOptionStatus,CatalogMirrorStatus,CatalogExplicitChoice} from "./service-catalog-admin-api-contract.ts";

export class ServiceCatalogInputError extends Error {}
export class ServiceCatalogConflictError extends Error {}
export class ServiceCatalogSchemaError extends Error {}
type DB=Pick<D1Database,"prepare">;
type AdminOptionRow={id:string;kind:"service"|"attribute";label:string;normalized_label:string;group_name:string;meaning:string;primary_category:string;categories_json:string;status:CatalogOptionStatus;notion_mirror_status:CatalogMirrorStatus;version:number};
type ProfileRow={id:number;category:string;status:string};
type ChoiceRow={profile_id:number;option_id:string;choice:string;version:number};
export type ServiceChoiceInput={profileId:number;optionId:string;choice:CatalogExplicitChoice;expectedVersion:number};
function actorEmail(raw:string){
  const actor=raw.trim().toLowerCase();
  if(!actor||actor.length>254||!actor.includes("@"))throw new ServiceCatalogInputError("Authenticated Admin actor missing.");
  return actor;
}
function categories(raw:string):string[]{
  try{const a=JSON.parse(raw);return Array.isArray(a)&&a.every(x=>typeof x==="string")?a:[];}
  catch{return [];}
}
function mapOption(row:AdminOptionRow):AdminCatalogOptionDto{
  return {id:row.id,kind:row.kind,label:row.label,group:row.group_name,meaning:row.meaning,
    categories:categories(row.categories_json),status:row.status,notionMirrorStatus:row.notion_mirror_status,version:row.version};
}
function handleDbError(error:unknown):never{
  const message=error instanceof Error?error.message:String(error);
  if(/UNIQUE constraint|constraint failed/i.test(message))
    throw new ServiceCatalogConflictError("Option already exists or violates an integrity constraint.");
  if(/no such table|no such column/i.test(message))
    throw new ServiceCatalogSchemaError("Schema 0133 is not provisioned.");
  throw error;
}
function validateNewOption(value:unknown){
  if(!value||typeof value!=="object"||Array.isArray(value))
    throw new ServiceCatalogInputError("Invalid option payload.");
  const data=value as Record<string,unknown>;
  if(Object.keys(data).some(x=>!["name","category","categories","kind","group","meaning"].includes(x)))
    throw new ServiceCatalogInputError("Server-controlled fields are forbidden.");
  if(typeof data.name!=="string"||typeof data.kind!=="string"||
      (data.category!==undefined&&typeof data.category!=="string")||
      (data.categories!==undefined&&(!Array.isArray(data.categories)||!data.categories.every(x=>typeof x==="string")))||
      (data.group!==undefined&&typeof data.group!=="string")||
      (data.meaning!==undefined&&typeof data.meaning!=="string"))
    throw new ServiceCatalogInputError("Invalid option fields.");
  let result:ReturnType<typeof validateCatalogOptionDraft>;
  try{result=validateCatalogOptionDraft(data as unknown as CatalogOptionDraft);}
  catch(e){throw new ServiceCatalogInputError(e instanceof Error?e.message:"Invalid option.");}
  const meaning=(data.meaning??"Služba vedená v katalógu Psipedia.sk.") as string;
  const normalizedMeaning=meaning.normalize("NFC").trim().replace(/\s+/g," ");
  if(normalizedMeaning.length<10||normalizedMeaning.length>500)throw new ServiceCatalogInputError("Meaning must contain 10 to 500 characters.");
  return {...result,meaning:normalizedMeaning,normalizedLabel:normalizeCatalogLabel(result.name)};
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
  // Edited original labels also reserve their names for the same immutable ID.
  let builtinDuplicate:{option_id:string}|null=null;
  try{
    builtinDuplicate=await db.prepare(
      "SELECT option_id FROM service_catalog_builtin_overrides WHERE normalized_label=?1 LIMIT 1"
    ).bind(input.normalizedLabel).first<{option_id:string}>();
  }catch(error){
    // Old production schema stays available while migration 0148 is pending.
    if(!/no such table: service_catalog_builtin_overrides/i.test(String(error)))throw error;
  }
  if(builtinDuplicate)throw new ServiceCatalogConflictError("Option already exists; reuse the canonical ID.");
  const id=(input.kind==="service"?"svc.admin.":"attr.admin.")+crypto.randomUUID().replace(/-/g,"");
  const time=now.toISOString();
  try{
    const sql=[
      "INSERT INTO service_catalog_admin_options",
      "(id,kind,label,normalized_label,group_name,meaning,primary_category,categories_json,value_kind,status,notion_mirror_status,version,created_at,updated_at,created_by,updated_by)",
      "VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'tri_state','ACTIVE','PENDING',1,?9,?9,?10,?10) RETURNING *"
    ].join(" ");
    const created=await db.prepare(sql).bind(id,input.kind,input.name,input.normalizedLabel,input.group,input.meaning,input.category,
      JSON.stringify(input.categories),time,actor).first<AdminOptionRow>();
    if(!created)throw new ServiceCatalogConflictError("No option row was created.");
    return mapOption(created);
  }catch(e){return handleDbError(e);}
}
async function allowedCategories(db:DB,id:string):Promise<readonly string[]|null>{
  const item=serviceCatalog.find(x=>x.id===id);
  const attribute=attributeCatalog.find(x=>x.id===id&&x.valueKind==="tri_state");
  if(item||attribute){
    let override:{categories_json:string}|null=null;
    try{
      override=await db.prepare(
        "SELECT categories_json FROM service_catalog_builtin_overrides WHERE option_id=?1 LIMIT 1"
      ).bind(id).first<{categories_json:string}>();
    }catch(error){
      // Built-in choices already worked before 0148; preserve them through a
      // code-first deploy, then start applying Admin overrides after migration.
      if(!/no such table: service_catalog_builtin_overrides/i.test(String(error)))throw error;
    }
    return override?categories(override.categories_json):(item??attribute)!.categories;
  }
  const row=await db.prepare("SELECT kind,status,notion_mirror_status,categories_json FROM service_catalog_admin_options WHERE id=?1 LIMIT 1")
    .bind(id).first<{kind:string;status:string;notion_mirror_status:string;categories_json:string}>();
  return (row?.kind==="service"||row?.kind==="attribute")&&row.status==="ACTIVE"?categories(row.categories_json):null;
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
  const dynamicOption=/^(svc|attr)\.admin\./.test(input.optionId);
  let saved:ChoiceRow|null;
  try{
    if(input.expectedVersion===0){
      const sql=[
        "INSERT INTO service_profile_option_choices",
        "(profile_id,option_id,choice,version,created_at,updated_at,created_by,updated_by)",
        // Never recycle an old version after YES/NO -> UNKNOWN -> YES/NO.
        // The 0134 ledger survives RESET and profile deletion; stale clients must
        // not be able to overwrite a newly inserted row using an old version.
        "SELECT ?1,?2,?3,(SELECT COALESCE(MAX(COALESCE(next_version,prior_version)),0)+1",
        "FROM service_catalog_admin_change_audit WHERE entity_type='choice' AND profile_id=?1 AND option_id=?2),?4,?4,?5,?5 WHERE EXISTS",
        "(SELECT 1 FROM directory_profiles WHERE id=?1 AND category=?6 AND status<>'archived')",
        ...(dynamicOption?["AND EXISTS (SELECT 1 FROM service_catalog_admin_options WHERE id=?2 AND status='ACTIVE'",
          "AND EXISTS (SELECT 1 FROM json_each(categories_json) WHERE value=?6))"]:[]),
        "ON CONFLICT (profile_id,option_id) DO NOTHING RETURNING profile_id,option_id,choice,version"
      ].join(" ");
      saved=await db.prepare(sql).bind(input.profileId,input.optionId,input.choice,time,actor,profile.category).first<ChoiceRow>();
    }else{
      const sql=[
        "UPDATE service_profile_option_choices SET choice=?1,version=version+1,updated_at=?2,updated_by=?3",
        "WHERE profile_id=?4 AND option_id=?5 AND version=?6",
        "AND EXISTS (SELECT 1 FROM directory_profiles WHERE id=?4 AND category=?7 AND status<>'archived')",
        ...(dynamicOption?["AND EXISTS (SELECT 1 FROM service_catalog_admin_options WHERE id=?5 AND status='ACTIVE' AND notion_mirror_status='SYNCED'",
          "AND EXISTS (SELECT 1 FROM json_each(categories_json) WHERE value=?7))"]:[]),
        "RETURNING profile_id,option_id,choice,version"
      ].join(" ");
      saved=await db.prepare(sql).bind(input.choice,time,actor,input.profileId,input.optionId,input.expectedVersion,profile.category).first<ChoiceRow>();
    }
  }catch(e){return handleDbError(e);}
  if(!saved)throw new ServiceCatalogConflictError("Selection changed concurrently; reload before saving.");
  return {profileId:saved.profile_id,optionId:saved.option_id,choice:saved.choice,version:saved.version};
}

/**
 * Atomic audit+CAS reset to UNKNOWN (absence). D1 batch runs in one transaction.
 * Requires additive 0134 audit schema, never a blind delete or implicit NO.
 * The authenticated actor is recorded durably before the choice disappears.
 */
export async function resetAdminServiceChoice(db:DB & Pick<D1Database,"batch">,
  input:{profileId:number;optionId:string;expectedVersion:number},actorRaw:string,now=new Date()){
  const actor=actorEmail(actorRaw);
  if(!input||!Number.isSafeInteger(input.profileId)||input.profileId<=0
    ||typeof input.optionId!=="string"||!input.optionId.trim()
    ||!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<1)
    throw new ServiceCatalogInputError("Invalid reset request; persisted version required.");
  const where="profile_id=?1 AND option_id=?2 AND version=?3 AND EXISTS (SELECT 1 FROM directory_profiles WHERE id=?1 AND status<>'archived')";
  const audit=db.prepare([
    "INSERT INTO service_catalog_admin_change_audit",
    "(entity_type,operation,option_id,profile_id,actor,occurred_at,prior_version,prior_json)",
    "SELECT 'choice','RESET',option_id,profile_id,?4,?5,version,json_object('choice',choice)",
    "FROM service_profile_option_choices WHERE "+where
  ].join(" ")).bind(input.profileId,input.optionId,input.expectedVersion,actor,now.toISOString());
  const remove=db.prepare("DELETE FROM service_profile_option_choices WHERE "+where+" RETURNING profile_id,option_id,version")
    .bind(input.profileId,input.optionId,input.expectedVersion);
  try{
    const results=await db.batch([audit,remove]);
    const removed=results[1]?.results?.[0] as {profile_id:number;option_id:string;version:number}|undefined;
    if(!removed)throw new ServiceCatalogConflictError("Choice was removed or changed concurrently; reload before retry.");
    return {profileId:removed.profile_id,optionId:removed.option_id,choice:"unknown" as const,version:0};
  }catch(err){return handleDbError(err);}
}

/** Fail closed for a missing or partially applied/tampered 0134 schema. */
export async function requireServiceCatalogAuditSchema(db:DB){
  const requiredTriggers=[
    "service_catalog_admin_option_audit_insert",
    "service_catalog_admin_option_audit_update",
    "service_catalog_admin_choice_audit_insert",
    "service_catalog_admin_choice_audit_update",
    "service_catalog_admin_choice_audit_delete",
    "service_catalog_admin_audit_no_update",
    "service_catalog_admin_audit_no_delete",
    "service_catalog_admin_receipt_no_update",
    "service_catalog_admin_receipt_no_delete",
    "service_catalog_admin_option_approval_receipt",
  ];
  try{
    await db.prepare("SELECT id FROM service_catalog_admin_change_audit LIMIT 1").first<{id:number}>();
    await db.prepare("SELECT id FROM service_catalog_admin_notion_receipts LIMIT 1").first<{id:number}>();
    const placeholders=requiredTriggers.map((_,i)=>"?"+(i+1)).join(",");
    const result=await db.prepare(
      "SELECT COUNT(DISTINCT name) AS found FROM sqlite_schema WHERE type='trigger' AND name IN ("+placeholders+")"
    ).bind(...requiredTriggers).first<{found:number}>();
    if(result?.found!==requiredTriggers.length)
      throw new ServiceCatalogSchemaError("Services V3 audit schema 0134 is incomplete; write blocked.");
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    if(/no such table|no such column/i.test(message))
      throw new ServiceCatalogSchemaError("Services V3 audit schema 0134 is not provisioned.");
    throw error;
  }
}
