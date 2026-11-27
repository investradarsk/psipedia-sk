import { directoryAuthorityWriteGuard } from "./notion-profile-authority.ts";
import type { FieldReservation } from "./notion-unified-field-transfer.ts";
/**
 * Services V3: Notion catalogue relations only update canonical service choices.
 * Legacy Notion "Služby" text and directory_profiles.services_json stay independent.
 */
import {loadResolvedServiceDefinitions} from "./service-catalog-resolved.ts";
import {serviceFilterCategories} from "./directory-filter-contract.ts";
import {loadServiceProfileMembership} from "./service-catalog-profile-membership.ts";
import {saveAdminServiceChoice,resetAdminServiceChoice,requireServiceCatalogAuditSchema} from "./service-catalog-admin-store.ts";
type DB=D1Database;
type ChoiceRow={option_id:string;choice:"yes"|"no";version:number};
const actor="notion-service-choices@psipedia.sk";
const categories=new Set<string>(serviceFilterCategories);
async function allowedCatalog(db:DB,category:string,profileId:number,
  resolved?:Awaited<ReturnType<typeof loadResolvedServiceDefinitions>>){
  const membership=await loadServiceProfileMembership(db,profileId);
  if(!membership||membership.status==="archived"||membership.primary!==category)
    throw Error("SERVICES_RELATION_PROFILE_CATEGORY_CHANGED");
  return (resolved??await loadResolvedServiceDefinitions(db))
    .filter(item=>item.categories.some(value=>membership.categories.includes(value)));
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
  const available=await allowedCatalog(db,category,profileId,resolved);
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


/** Atomic authoritative set replacement. Reuse the canonical choices and audit
 * ledger, not the legacy per-ID partial merge. No attribute or explicit NO is
 * removed; only a formerly selected service absent from the new set resets. */
export async function importAuthoritativeNotionServiceIds(db:DB,input:{
  profileId:number;category:string;categories:readonly string[];ids:readonly string[];
  expectedYes:readonly string[];reservation:FieldReservation;
}){
  const {profileId,category,reservation}=input;
  if(!reservation.profileAuthority||!Array.isArray(reservation.value)||
    JSON.stringify([...reservation.value].sort())!==JSON.stringify([...input.ids].sort()))
    throw Error("SERVICES_RELATION_RESERVATION_VALUE");
  const guard=directoryAuthorityWriteGuard(reservation,profileId,"serviceIds");
  await requireServiceCatalogAuditSchema(db);
  const membership=await loadServiceProfileMembership(db,profileId);
  const profile=await db.prepare("SELECT updated_at FROM directory_profiles WHERE id=? AND category=? AND status<>'archived'").bind(profileId,category).first<{updated_at:string}>();
  if(!profile||!membership||membership.primary!==category||
    JSON.stringify(membership.categories)!==JSON.stringify(input.categories))throw Error("SERVICES_RELATION_MEMBERSHIP_CHANGED_REVIEW");
  const available=await loadResolvedServiceDefinitions(db);
  const eligible=available.filter(item=>item.categories.some(value=>input.categories.includes(value)));
  const byId=new Map(eligible.map(item=>[item.id,item]));
  const selected=[...new Set(input.ids)].sort();
  if(selected.length!==input.ids.length||selected.some(id=>!byId.has(id)))throw Error("SERVICES_RELATION_UNKNOWN_OR_WRONG_CATEGORY");
  const rows=await db.prepare("SELECT option_id,choice,version FROM service_profile_option_choices WHERE profile_id=? AND substr(option_id,1,4)='svc.' ORDER BY option_id").bind(profileId).all<ChoiceRow>();
  if(!rows.success||!Array.isArray(rows.results))throw Error("SERVICES_RELATION_LOCAL_READ_FAILED");
  const saved=rows.results;
  const yes=saved.filter(row=>row.choice==="yes").map(row=>row.option_id).sort();
  if(JSON.stringify(yes)!==JSON.stringify([...input.expectedYes].sort())||yes.some(id=>!byId.has(id)))
    throw Error("SERVICES_RELATION_LOCAL_CHANGED_BEFORE_IMPORT");
  const snapshot=JSON.stringify(saved),target=JSON.stringify(selected);
  const secondary=JSON.stringify(input.categories.filter(value=>value!==category).sort());
  const now=new Date(Math.max(Date.now(),(Date.parse(profile.updated_at)||0)+1)).toISOString();
  const verify=(sql:string,params:(string|number)[])=>db.prepare("SELECT CASE WHEN ("+sql+") THEN 1 ELSE json_extract('SERVICES_RELATION_CAS_CONFLICT','$') END AS verified").bind(...params);
  const batch=[
    db.prepare("UPDATE directory_profiles SET updated_at=?,updated_by=? WHERE id=? AND category=? AND updated_at=? AND status<>'archived'"+guard.sql+" RETURNING id")
      .bind(now,actor,profileId,category,profile.updated_at,...guard.params),
    db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('SERVICES_RELATION_CAS_CONFLICT','$') END"),
    verify("NOT EXISTS(SELECT 1 FROM directory_profile_additional_categories WHERE profile_id=? AND category NOT IN (SELECT value FROM json_each(?))) AND NOT EXISTS(SELECT 1 FROM json_each(?) c WHERE NOT EXISTS(SELECT 1 FROM directory_profile_additional_categories WHERE profile_id=? AND category=c.value))",[profileId,secondary,secondary,profileId]),
    verify("(SELECT COUNT(*) FROM service_profile_option_choices WHERE profile_id=? AND substr(option_id,1,4)='svc.')=json_array_length(?) AND NOT EXISTS(SELECT 1 FROM json_each(?) s WHERE NOT EXISTS(SELECT 1 FROM service_profile_option_choices c WHERE c.profile_id=? AND c.option_id=json_extract(s.value,'$.option_id') AND c.choice=json_extract(s.value,'$.choice') AND c.version=json_extract(s.value,'$.version')))",[profileId,snapshot,snapshot,profileId]),
  ];
  // Catalog definitions may change independently of the profile. Validate
  // the exact currently eligible version of each selected or removed YES.
  for(const id of new Set([...selected,...yes])){
    const item=byId.get(id)!;
    if(item.source==="admin")batch.push(verify("EXISTS(SELECT 1 FROM service_catalog_admin_options WHERE id=? AND kind='service' AND status='ACTIVE' AND version=?)",[id,item.version]));
    else if(item.overridden)batch.push(verify("EXISTS(SELECT 1 FROM service_catalog_builtin_overrides WHERE option_id=? AND version=?)",[id,item.version]));
    else batch.push(verify("NOT EXISTS(SELECT 1 FROM service_catalog_builtin_overrides WHERE option_id=?)",[id]));
  }
  batch.push(
    db.prepare("INSERT INTO service_catalog_admin_change_audit(entity_type,operation,option_id,profile_id,actor,occurred_at,prior_version,prior_json) SELECT 'choice','RESET',option_id,profile_id,?,?,version,json_object('choice',choice) FROM service_profile_option_choices WHERE profile_id=? AND substr(option_id,1,4)='svc.' AND choice='yes' AND option_id NOT IN (SELECT value FROM json_each(?))").bind(actor,now,profileId,target),
    db.prepare("DELETE FROM service_profile_option_choices WHERE profile_id=? AND substr(option_id,1,4)='svc.' AND choice='yes' AND option_id NOT IN (SELECT value FROM json_each(?))").bind(profileId,target),
    db.prepare("UPDATE service_profile_option_choices SET choice='yes',version=version+1,updated_at=?,updated_by=? WHERE profile_id=? AND choice<>'yes' AND option_id IN (SELECT value FROM json_each(?))").bind(now,actor,profileId,target),
    db.prepare("INSERT INTO service_profile_option_choices(profile_id,option_id,choice,version,created_at,updated_at,created_by,updated_by) SELECT ?,j.value,'yes',(SELECT COALESCE(MAX(COALESCE(next_version,prior_version)),0)+1 FROM service_catalog_admin_change_audit WHERE entity_type='choice' AND profile_id=? AND option_id=j.value),?,?,?,? FROM json_each(?) j WHERE NOT EXISTS(SELECT 1 FROM service_profile_option_choices WHERE profile_id=? AND option_id=j.value)").bind(profileId,profileId,now,now,actor,actor,target,profileId),
    verify("(SELECT COUNT(*) FROM service_profile_option_choices WHERE profile_id=? AND substr(option_id,1,4)='svc.' AND choice='yes')=json_array_length(?) AND NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE NOT EXISTS(SELECT 1 FROM service_profile_option_choices WHERE profile_id=? AND option_id=j.value AND choice='yes'))",[profileId,target,target,profileId]),
  );
  // D1 has a bounded batch size. Never split this atomic logical field.
  if(batch.length>95)throw Error("SERVICES_RELATION_BATCH_LIMIT_REVIEW");
  const result=await db.batch(batch);
  if(!result[0]?.results?.length||result.some(item=>item.success!==true))throw Error("SERVICES_RELATION_ATOMIC_WRITE_FAILED");
}
