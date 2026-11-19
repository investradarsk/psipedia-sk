/**
 * Partneri V2: one canonical D1 draft row, one moderation workflow row.
 * New submissions never clone their draft on approval. This deliberately
 * does not replace historical pre-canonical submissions.
 */
import { env } from "cloudflare:workers";
import { createCanonicalDraft } from "./canonical-draft-service";
import { getPartnerDatabase } from "./partner-auth-store";
import { applyAtomicModerationTransition } from "./moderation-transition";
import { assertIndependentOwnershipApprover } from "./partner-ownership-approval";
import { adminAuditActorRef } from "./audit-identity";
import { partnerAdminReviewStatement } from "./admin-notion-review-lock";
import { partnerDirectoryReviewLockStatement } from "./partner-directory-review";
import { partnerDirectory0173ReviewSqlMirrorStatement } from "./directory-0173-review-state-sql";
import { deterministicCanonicalResourceId } from "./canonical-resource";
import { directoryCategories } from "./directory";
import { organizationPublicationTypes } from "./help-organization-publication";
import { partnerHelpCaseCategories } from "./partner-help-create";
import { enqueueAdminNotificationEvent } from "./admin-notifications";

type Database = D1Database;
export const partnerCanonicalTypes = [
  "DIRECTORY_PROFILE","HELP_ORGANIZATION","MANAGED_EVENT",
  "ADOPTION_DOG","LOST_FOUND_DOG","HELP_CASE",
] as const;
export type PartnerCanonicalType = typeof partnerCanonicalTypes[number];
export type PartnerDraftStatus = "DRAFT"|"SUBMITTED"|"PENDING_REVIEW"|"QUARANTINED"|"RETURNED"|"APPROVED"|"REJECTED";
type DraftKind = { table:string; type:string; reviewType:string; published:string; fields:Record<string,string> };
const textFields = (names:string[]) => Object.fromEntries(names.map(name=>[
  name,name.replace(/[A-Z]/g,letter=>"_"+letter.toLowerCase())
])) as Record<string,string>;
const kinds:Record<PartnerCanonicalType,DraftKind> = {
  DIRECTORY_PROFILE:{table:"directory_profiles",type:"DIRECTORY",reviewType:"DIRECTORY",published:"published",
    fields:{...textFields(["name","category","excerpt","description","city","district","region","address","priceNote",
      "websiteUrl","publicPhone","publicEmail","facebookUrl","instagramUrl"]),
      services:"services_json",qualifications:"qualifications_json"}},
  HELP_ORGANIZATION:{table:"help_organizations",type:"ORGANIZATION",reviewType:"ORGANIZATION",published:"PUBLISHED",
    fields:textFields(["name","type","legalName","registrationNumber","shortDescription","description","publicEmail",
      "publicPhone","websiteUrl","facebookUrl","instagramUrl","address","city","district","region","countryCode"])},
  MANAGED_EVENT:{table:"managed_events",type:"EVENT",reviewType:"EVENT",published:"published",
    fields:textFields(["title","excerpt","eventType","startDate","startTime","endDate","endTime","venue","city",
      "region","address","organizer","description","practicalInfo","websiteUrl","registrationUrl"])},
  ADOPTION_DOG:{table:"adoption_dogs",type:"ADOPTION",reviewType:"ADOPTION",published:"ACTIVE",
    fields:textFields(["name","sex","size","approximateAgeMonths","breedName","region","district","city",
      "organizationName","shortDescription","description"])},
  LOST_FOUND_DOG:{table:"lost_found_dog_reports",type:"LOST_FOUND",reviewType:"LOST_FOUND",published:"ACTIVE",
    fields:textFields(["type","dogName","sex","breed","color","size","eventDate","region","district","city",
      "locationDescription","description"])},
  HELP_CASE:{table:"help_cases",type:"HELP_ITEM",reviewType:"HELP_CASE",published:"published",
    fields:textFields(["title","category","excerpt","description","organization","city","region","actionLabel","contactNote"])},
};
const helpers:ReadonlySet<PartnerCanonicalType>=new Set(partnerCanonicalTypes);
const pendingStates=["SUBMITTED","PENDING_REVIEW","QUARANTINED"];
const editableStates=["DRAFT",...pendingStates,"RETURNED"];
const CAS_GUARD_SQL="SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('PARTNER_CANONICAL_DRAFT_REVISION_CONFLICT',char(36)) END AS accepted";
const accountActor=(id:string)=>"partner:"+id;
function database(input?:D1Database){return getPartnerDatabase(input??(env as unknown as {DB?:D1Database}).DB);}
export class PartnerCanonicalWorkflowError extends Error {
  constructor(message:string,readonly status=400,readonly code="PARTNER_CANONICAL_WORKFLOW_INVALID"){
    super(message);this.name="PartnerCanonicalWorkflowError";
  }
}
function typeOf(raw:unknown):PartnerCanonicalType {
  if(typeof raw!=="string"||!helpers.has(raw as PartnerCanonicalType))
    throw new PartnerCanonicalWorkflowError("Vyberte platnú kategóriu profilu.");
  return raw as PartnerCanonicalType;
}
function ensureTechnicalType(type:PartnerCanonicalType,data:Record<string,unknown>){
  if(type==="DIRECTORY_PROFILE"&&!directoryCategories.some(c=>c.slug===data.category))
    throw new PartnerCanonicalWorkflowError("Vyberte kategóriu služby.");
  if(type==="HELP_ORGANIZATION"&&!(organizationPublicationTypes as readonly string[]).includes(String(data.type??"")))
    throw new PartnerCanonicalWorkflowError("Vyberte typ organizácie.");
  if(type==="LOST_FOUND_DOG"&&!["LOST","FOUND"].includes(String(data.type??"")))
    throw new PartnerCanonicalWorkflowError("Vyberte, či je pes stratený alebo nájdený.");
  if(type==="HELP_CASE"&&!partnerHelpCaseCategories.includes(data.category as typeof partnerHelpCaseCategories[number]))
    throw new PartnerCanonicalWorkflowError("Vyberte kategóriu Pomoci psom.");
}
function inputObject(raw:unknown):Record<string,unknown>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new PartnerCanonicalWorkflowError("Údaje profilu musia byť objekt.");
  return raw as Record<string,unknown>;
}
function cleanFields(type:PartnerCanonicalType,raw:unknown){
  const data=inputObject(raw),mapping=kinds[type].fields;
  for(const key of Object.keys(data)){
    if(!Object.prototype.hasOwnProperty.call(mapping,key))
      throw new PartnerCanonicalWorkflowError("Pole "+key+" nie je partnerským verejným údajom.");
  }
  const clean:Record<string,unknown>={};
  for(const [key,value] of Object.entries(data)){
    if(key==="services"||key==="qualifications"){
      if(!Array.isArray(value)||value.length>100||value.some(v=>typeof v!=="string"||v.length>500))
        throw new PartnerCanonicalWorkflowError("Zoznam služieb alebo kvalifikácií je neplatný.");
      clean[key]=value.map(v=>(v as string).trim());
    }else if(key==="approximateAgeMonths"){
      if(value===null||value==="")clean[key]=null;
      else if(typeof value==="number"&&Number.isSafeInteger(value)&&value>=0&&value<=360)clean[key]=value;
      else throw new PartnerCanonicalWorkflowError("Vek musí byť celé číslo od 0 do 360.");
    }else{
      if(typeof value!=="string"||value.length>20000||/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value))
        throw new PartnerCanonicalWorkflowError("Pole "+key+" obsahuje neplatnú hodnotu.");
      clean[key]=value.trim();
    }
  }
  return clean;
}
function tableFor(type:PartnerCanonicalType){return kinds[type].table;}
function canonicalHref(type:PartnerCanonicalType,id:number){
  const paths:Record<PartnerCanonicalType,string>={
    DIRECTORY_PROFILE:"/admin/adresar/",HELP_ORGANIZATION:"/admin/organizacie/",
    MANAGED_EVENT:"/admin/podujatia/",ADOPTION_DOG:"/admin/adopcie/",
    LOST_FOUND_DOG:"/admin/stratene-najdene/",HELP_CASE:"/admin/pomoc/",
  };
  return paths[type]+id;
}
function metadataStatement(db:Database,input:{id:string;accountId:string;type:PartnerCanonicalType;name:string;category:string;nowIso:string;canonicalId:number}){
  const v=input;
  if(v.type==="DIRECTORY_PROFILE"||v.type==="HELP_ORGANIZATION"){
    return db.prepare("INSERT INTO partner_new_profile_metadata "+
      "(submission_id,partner_account_id,intended_resource_type,display_name,category_or_type,identity_fingerprint,"+
      "duplicate_confidence,duplicate_candidates_json,resolved_canonical_id,dedupe_active,created_at) "+
      "VALUES (?1,?2,?3,?4,?5,?6,'NONE','[]',?7,0,?8)")
      .bind(v.id,v.accountId,v.type,v.name,v.category,"DRAFT:"+v.id,v.canonicalId,v.nowIso);
  }
  if(v.type==="MANAGED_EVENT"){
    return db.prepare("INSERT INTO partner_event_submission_metadata "+
      "(submission_id,partner_account_id,operation,display_title,base_snapshot_json,changed_field_count,"+
      "dedupe_key,dedupe_active,duplicate_confidence,duplicate_reasons_json,resolved_event_id,created_at) "+
      "VALUES (?1,?2,'CREATE',?3,'{}',0,?4,0,'NONE','[]',?5,?6)")
      .bind(v.id,v.accountId,v.name,"DRAFT:"+v.id,v.canonicalId,v.nowIso);
  }
  return null;
}
async function assertActiveAccount(id:string,db:Database){
  const account=await db.prepare("SELECT status,email_verified_at verifiedAt FROM partner_accounts WHERE id=?1 LIMIT 1")
    .bind(id).first<{status:string;verifiedAt:string|null}>();
  if(!account||account.status!=="ACTIVE"||!account.verifiedAt)
    throw new PartnerCanonicalWorkflowError("Potrebujete aktívny overený partnerský účet.",403);
}
function isValidDraftId(id:string){return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id);}
/** Insert the real unpublished canonical row *before* any review request. */
export async function createPartnerCanonicalDraft(input:{
  accountId:string;resourceType:unknown;data:unknown;database?:D1Database;now?:Date;
}){
  const db=database(input.database),type=typeOf(input.resourceType);
  await assertActiveAccount(input.accountId,db);
  const data=cleanFields(type,input.data);ensureTechnicalType(type,data);
  const nowIso=(input.now??new Date()).toISOString(),id=crypto.randomUUID();
  const actor=accountActor(input.accountId);
  const canonical=await createCanonicalDraft(
    {entityType:kinds[type].type as Parameters<typeof createCanonicalDraft>[0]["entityType"],
      data,slugSuffix:"partner-"+id.slice(0,10)},
    {actor,createdAt:nowIso,allowIncomplete:true},db,
  );
  const canonicalId=canonical.canonicalEntityId;
  const name=String(data.name??data.title??data.dogName??"");
  const category=String(data.category??data.type??"");
  const meta=metadataStatement(db,{id,accountId:input.accountId,type,name,category,nowIso,canonicalId});
  try{
    await db.batch([
      db.prepare("INSERT INTO moderation_submissions "+
        "(id,resource_type,subject_id,operation,status,submitter_type,submitter_ref,proposed_patch_json,created_at,updated_at) "+
        "VALUES (?1,?2,?3,'CREATE','DRAFT','PARTNER_ACCOUNT',?4,?5,?6,?6)")
        .bind(id,type,String(canonicalId),input.accountId,JSON.stringify(data),nowIso),
      ...(meta?[meta]:[]),
      db.prepare("INSERT INTO moderation_events "+
        "(id,submission_id,resource_type,subject_id,action,actor_type,actor_ref,to_status,created_at) "+
        "VALUES (?1,?2,?3,?4,'DRAFT_CREATED','PARTNER',?5,'DRAFT',?6)")
        .bind(crypto.randomUUID(),id,type,String(canonicalId),input.accountId,nowIso),
    ]);
  }catch(error){
    // Compensate only this uncommitted, never-published draft. No existing profile is touched.
    await db.prepare("DELETE FROM "+tableFor(type)+" WHERE id=?1 AND published_at IS NULL "+
      "AND status IN ('draft','DRAFT') AND created_at=?2 AND updated_at=?2")
      .bind(canonicalId,nowIso).run().catch(()=>{});
    throw error;
  }
  return {id,resourceType:type,canonicalId,status:"DRAFT" as const,
    editorHref:canonicalHref(type,canonicalId),baseUpdatedAt:nowIso};
}
type DraftRow={id:string;accountId:string;resourceType:PartnerCanonicalType;canonicalId:number;status:PartnerDraftStatus;
  proposedPatchJson:string;updatedAt:string;createdAt:string;};
function queryDraftSql(){
  return "SELECT s.id,s.submitter_ref accountId,s.resource_type resourceType,"+
    "CAST(s.subject_id AS INTEGER) canonicalId,s.status,s.proposed_patch_json proposedPatchJson,"+
    "s.updated_at updatedAt,s.created_at createdAt FROM moderation_submissions s "+
    "WHERE s.id=?1 AND s.submitter_type='PARTNER_ACCOUNT' AND s.operation='CREATE' AND s.subject_id IS NOT NULL "+
    "AND s.resource_type IN ('DIRECTORY_PROFILE','HELP_ORGANIZATION','MANAGED_EVENT','ADOPTION_DOG','LOST_FOUND_DOG','HELP_CASE') LIMIT 1";
}
async function draftById(id:string,db:Database){
  if(!isValidDraftId(id))throw new PartnerCanonicalWorkflowError("Koncept sa nenašiel.",404);
  const row=await db.prepare(queryDraftSql()).bind(id).first<DraftRow>();
  if(!row||!Number.isSafeInteger(row.canonicalId)||row.canonicalId<1)
    throw new PartnerCanonicalWorkflowError("Koncept sa nenašiel.",404);
  return row;
}
async function canonicalRevision(row:DraftRow,db:Database){
  return db.prepare("SELECT status,updated_at updatedAt FROM "+tableFor(row.resourceType)+" WHERE id=?1 LIMIT 1")
    .bind(row.canonicalId).first<{status:string;updatedAt:string}>();
}
function guard(db:Database){return db.prepare(CAS_GUARD_SQL);}
export async function getPartnerCanonicalDraft(input:{accountId:string;id:string;database?:D1Database}){
  const db=database(input.database),row=await draftById(input.id,db);
  if(row.accountId!==input.accountId)throw new PartnerCanonicalWorkflowError("Koncept sa nenašiel.",404);
  const mapping=kinds[row.resourceType].fields,fields=Object.entries(mapping)
    .map(([name,column])=>column+" AS "+name).join(",");
  const current=await db.prepare("SELECT "+fields+",updated_at baseUpdatedAt,status FROM "+tableFor(row.resourceType)+" WHERE id=?1")
    .bind(row.canonicalId).first<Record<string,unknown>>();
  if(!current)throw new PartnerCanonicalWorkflowError("Kanonický koncept chýba.",409);
  const values:Record<string,unknown>={};
  for(const key of Object.keys(mapping)){
    const v=current[key];
    if(key==="services"||key==="qualifications"){
      try{values[key]=JSON.parse(String(v??"[]"))}catch{values[key]=[]}
    }else values[key]=v??"";
  }
  const note=await db.prepare("SELECT reason_code reason FROM moderation_events "+
    "WHERE submission_id=?1 AND to_status='RETURNED' ORDER BY created_at DESC LIMIT 1")
    .bind(row.id).first<{reason:string|null}>();
  return {id:row.id,resourceType:row.resourceType,canonicalId:row.canonicalId,
    status:row.status,values,baseUpdatedAt:current.baseUpdatedAt,
    returnReason:row.status==="RETURNED"?note?.reason??null:null};
}
export async function savePartnerCanonicalDraft(input:{
  accountId:string;id:string;data:unknown;baseUpdatedAt:string;database?:D1Database;now?:Date;
}){
  const db=database(input.database),row=await draftById(input.id,db);
  if(row.accountId!==input.accountId)throw new PartnerCanonicalWorkflowError("Koncept sa nenašiel.",404);
  await assertActiveAccount(input.accountId,db);
  if(!editableStates.includes(row.status))
    throw new PartnerCanonicalWorkflowError("O tomto profile už bolo rozhodnuté.",409);
  const data=cleanFields(row.resourceType,input.data);
  // Technical route must remain valid, including edits of a category.
  if(data.category!==undefined||data.type!==undefined){
    const current=await getPartnerCanonicalDraft({accountId:input.accountId,id:input.id,database:db});
    ensureTechnicalType(row.resourceType,{...current.values,...data});
  }
  const revision=await canonicalRevision(row,db);
  if(!revision||!["draft","DRAFT"].includes(revision.status)||revision.updatedAt!==input.baseUpdatedAt)
    throw new PartnerCanonicalWorkflowError("Koncept sa medzičasom zmenil. Obnovte údaje.",409,"STALE_CANONICAL_DRAFT");
  const columns=kinds[row.resourceType].fields,entries=Object.entries(data);
  const nowIso=(input.now??new Date()).toISOString();
  // Empty payload is a no-op. A client still receives the live canonical revision.
  if(entries.length===0)return getPartnerCanonicalDraft({accountId:input.accountId,id:input.id,database:db});
  const assignments=entries.map(([key],i)=>columns[key]+"=?"+(i+1));
  const bindings=entries.map(([key,value])=>(key==="services"||key==="qualifications")?JSON.stringify(value):value);
  const updateSql="UPDATE "+tableFor(row.resourceType)+" SET "+assignments.join(",")+
    ",updated_at=?"+(entries.length+1)+
    (row.resourceType==="LOST_FOUND_DOG"?"":",updated_by=?"+(entries.length+2))+
    " WHERE id=?"+(entries.length+(row.resourceType==="LOST_FOUND_DOG"?2:3))+
    " AND status IN ('draft','DRAFT') AND updated_at=?"+(entries.length+(row.resourceType==="LOST_FOUND_DOG"?3:4))+
    " AND EXISTS(SELECT 1 FROM moderation_submissions s WHERE s.id=?"+
    (entries.length+(row.resourceType==="LOST_FOUND_DOG"?4:5))+
    " AND s.submitter_ref=?"+(entries.length+(row.resourceType==="LOST_FOUND_DOG"?5:6))+
    " AND s.status IN ('DRAFT','SUBMITTED','PENDING_REVIEW','QUARANTINED','RETURNED'))";
  const params=[...bindings,nowIso,...(row.resourceType==="LOST_FOUND_DOG"?[]:[accountActor(input.accountId)]),
    row.canonicalId,input.baseUpdatedAt,row.id,input.accountId];
  try{
    await db.batch([
      db.prepare(updateSql).bind(...params),
      guard(db),
      db.prepare("UPDATE moderation_submissions SET proposed_patch_json=json_patch(COALESCE(proposed_patch_json,'{}'),?1),updated_at=?2 "+
        "WHERE id=?3 AND submitter_ref=?4 AND status IN ('DRAFT','SUBMITTED','PENDING_REVIEW','QUARANTINED','RETURNED')")
        .bind(JSON.stringify(data),nowIso,row.id,input.accountId),
      guard(db),
      db.prepare("INSERT INTO moderation_events "+
        "(id,submission_id,resource_type,subject_id,action,actor_type,actor_ref,changed_fields_json,created_at) "+
        "VALUES(?1,?2,?3,?4,'DRAFT_EDITED','PARTNER',?5,?6,?7)")
        .bind(crypto.randomUUID(),row.id,row.resourceType,String(row.canonicalId),
          input.accountId,JSON.stringify(Object.keys(data)),nowIso),
    ]);
  }catch(error){
    if(String(error).includes("PARTNER_CANONICAL_DRAFT_REVISION_CONFLICT"))
      throw new PartnerCanonicalWorkflowError("Koncept sa medzičasom zmenil. Obnovte údaje.",409,"STALE_CANONICAL_DRAFT");
    throw error;
  }
  return getPartnerCanonicalDraft({accountId:input.accountId,id:input.id,database:db});
}
export async function submitPartnerCanonicalDraft(input:{accountId:string;id:string;database?:D1Database;now?:Date}){
  const db=database(input.database),row=await draftById(input.id,db);
  if(row.accountId!==input.accountId)throw new PartnerCanonicalWorkflowError("Koncept sa nenašiel.",404);
  await assertActiveAccount(input.accountId,db);
  if(row.status!=="DRAFT"&&row.status!=="RETURNED")
    throw new PartnerCanonicalWorkflowError("Tento koncept už bol odoslaný alebo vybavený.",409);
  const current=await canonicalRevision(row,db);
  if(!current||!["draft","DRAFT"].includes(current.status))
    throw new PartnerCanonicalWorkflowError("Koncept už nie je neverejný.",409);
  const now=input.now??new Date(),nowIso=now.toISOString();
  await applyAtomicModerationTransition(db,{
    id:row.id,expectedStatus:row.status,toStatus:"SUBMITTED",actorType:"PARTNER",
    actorRef:accountActor(input.accountId),eventId:crypto.randomUUID(),changedFieldsJson:'["status"]',now:nowIso,
    transitionGuard:{sql:"EXISTS(SELECT 1 FROM "+tableFor(row.resourceType)+" WHERE id=? AND status IN ('draft','DRAFT'))",
      bindings:[row.canonicalId]},
  });
  // Notifications must never accidentally expose a still-unsubmitted draft.
  try{
    await enqueueAdminNotificationEvent(db,{
      eventType:"partner_new_profile_submitted",sourceType:"PARTNER_NEW_PROFILE_REVIEW",
      resourceType:"partner_canonical_draft",resourceRef:row.id,
      actorType:"PARTNER",actorRef:accountActor(input.accountId),
      targetUrl:canonicalHref(row.resourceType,row.canonicalId),
      title:"Partner odoslal profil na schválenie",
      body:"Nový partnerský koncept čaká na schválenie.",
      tag:"partner-canonical-"+row.id,dedupeKey:"partner-canonical/"+row.id,
    },now);
  }catch(error){console.error("Partner canonical draft notification failed",error)}
  return {id:row.id,status:"SUBMITTED" as const,canonicalId:row.canonicalId};
}
export async function getPendingPartnerCanonicalDraft(input:{
  resourceType:PartnerCanonicalType;canonicalId:number;database?:D1Database;
}){
  const db=database(input.database);
  return db.prepare("SELECT id,status,submitter_ref accountId,updated_at updatedAt,"+
    "(SELECT updated_at FROM "+tableFor(input.resourceType)+" WHERE id=?3) canonicalUpdatedAt "+
    "FROM moderation_submissions "+
    "WHERE operation='CREATE' AND submitter_type='PARTNER_ACCOUNT' AND resource_type=?1 AND subject_id=?2 "+
    "AND status IN ('DRAFT','SUBMITTED','PENDING_REVIEW','QUARANTINED','RETURNED') ORDER BY created_at DESC LIMIT 1")
    .bind(input.resourceType,String(input.canonicalId),input.canonicalId)
    .first<{id:string;status:PartnerDraftStatus;accountId:string;updatedAt:string;canonicalUpdatedAt:string|null}>();
}
function publication(db:Database,row:DraftRow,nowIso:string,actorRef:string,baseUpdatedAt:string){
  const table=tableFor(row.resourceType);
  const publisher=row.resourceType==="LOST_FOUND_DOG"?"":" ,updated_by=?3";
  const sql="UPDATE "+table+" SET status=?1,published_at=?2"+publisher+
    " WHERE id="+(publisher?"?4":"?3")+
    " AND status IN ('draft','DRAFT') AND published_at IS NULL AND updated_at="+(publisher?"?5":"?4");
  return db.prepare(sql).bind(kinds[row.resourceType].published,nowIso,
    ...(publisher?[actorRef]:[]),row.canonicalId,baseUpdatedAt);
}
function ownerStatements(db:Database,row:DraftRow,nowIso:string,actorRef:string){
  const id=row.canonicalId,type=row.resourceType;
  if(type==="DIRECTORY_PROFILE"||type==="HELP_ORGANIZATION"||type==="MANAGED_EVENT"){
    const column=type==="DIRECTORY_PROFILE"?"directory_profile_id":
      type==="HELP_ORGANIZATION"?"help_organization_id":"managed_event_id";
    const resourceId=deterministicCanonicalResourceId(type,id);
    const canonicalSql="SELECT "+id;
    return [
      db.prepare("INSERT OR IGNORE INTO partner_resources(id,entity_type,"+column+",created_at,updated_at) "+
        "VALUES(?1,?2,?3,?4,?4)").bind(resourceId,type,id,nowIso),
      db.prepare("INSERT INTO partner_memberships(id,account_id,resource_id,role,created_at,created_by,updated_at) "+
        "VALUES(?1,?2,?3,'OWNER',?4,?5,?4)")
        .bind(crypto.randomUUID(),row.accountId,resourceId,nowIso,actorRef),
      ...(type==="DIRECTORY_PROFILE"?[
        partnerDirectoryReviewLockStatement({database:db,canonicalSql,accountId:row.accountId,actorRef,nowIso}),
        partnerDirectory0173ReviewSqlMirrorStatement({database:db,canonicalSql,accountId:row.accountId,actorRef,nowIso}),
      ]:[partnerAdminReviewStatement(db,{type:type==="MANAGED_EVENT"?"EVENT":"ORGANIZATION",
        entitySql:canonicalSql,nowIso,actorRef})]),
      ...(type==="MANAGED_EVENT"?[
        db.prepare("UPDATE event_notion_sync SET inbound_locked_at=?1,inbound_lock_reason='PARTNER_MODERATION',updated_at=?1 WHERE event_id=?2")
          .bind(nowIso,id),
      ]:[]),
    ];
  }
  const col=type==="ADOPTION_DOG"?"adoption_dog_id":type==="LOST_FOUND_DOG"?"lost_found_report_id":"help_case_id";
  const reviewType=type==="ADOPTION_DOG"?"ADOPTION":type==="LOST_FOUND_DOG"?"LOST_FOUND":"HELP_CASE";
  return [
    db.prepare("INSERT INTO partner_help_claims(id,account_id,entity_type,"+col+",status,created_at,updated_at,"+
      "reviewed_at,reviewed_by,decision_note) VALUES(?1,?2,?3,?4,'APPROVED',?5,?5,?5,?6,?7)")
      .bind(crypto.randomUUID(),row.accountId,type,id,nowIso,actorRef,"Schválený nový partnerský profil"),
    partnerAdminReviewStatement(db,{type:reviewType,entitySql:"SELECT "+id,nowIso,actorRef}),
  ];
}
function approveMetadata(db:Database,row:DraftRow,nowIso:string){
  if(row.resourceType==="DIRECTORY_PROFILE"||row.resourceType==="HELP_ORGANIZATION"){
    const column=row.resourceType==="DIRECTORY_PROFILE"?"directory_profile_id":"help_organization_id";
    return db.prepare("UPDATE partner_new_profile_metadata "+
      "SET resolution_type='CREATED_NEW',resolved_canonical_id=?1,resolved_resource_id="+
      "(SELECT id FROM partner_resources WHERE "+column+"=?1 LIMIT 1),dedupe_active=0 WHERE submission_id=?2")
      .bind(row.canonicalId,row.id);
  }
  if(row.resourceType==="MANAGED_EVENT"){
    return db.prepare("UPDATE partner_event_submission_metadata SET resolution_type='CREATED_NEW',resolved_event_id=?1,"+
      "partner_resource_id=(SELECT id FROM partner_resources WHERE managed_event_id=?1 LIMIT 1),dedupe_active=0 "+
      "WHERE submission_id=?2").bind(row.canonicalId,row.id);
  }
  return null;
}
export async function decidePartnerCanonicalDraftAdmin(input:{
  id:string;adminEmail:string;action:"APPROVE"|"REJECT"|"RETURN";note?:string;
  expectedCanonicalUpdatedAt?:string;database?:D1Database;now?:Date;
}){
  const db=database(input.database);
  let row=await draftById(input.id,db);
  if(!pendingStates.includes(row.status))
    throw new PartnerCanonicalWorkflowError("Žiadosť nečaká na rozhodnutie.",409);
  if(input.action==="APPROVE"){
    await assertActiveAccount(row.accountId,db);
    await assertIndependentOwnershipApprover({adminEmail:input.adminEmail,accountId:row.accountId,database:db});
  }
  if(input.action==="RETURN"){
    if(typeof input.note!=="string"||!input.note.trim()||input.note.length>2000)
      throw new PartnerCanonicalWorkflowError("Pri vrátení uveďte dôvod (maximálne 2 000 znakov).");
  }
  const actorRef=await adminAuditActorRef(input.adminEmail);
  const nowIso=(input.now??new Date()).toISOString();
  if(row.status!=="PENDING_REVIEW"){
    await applyAtomicModerationTransition(db,{
      id:row.id,expectedStatus:row.status,toStatus:"PENDING_REVIEW",
      actorType:"ADMIN",actorRef,eventId:crypto.randomUUID(),changedFieldsJson:'["status"]',now:nowIso,
    });
    row=await draftById(input.id,db);
  }
  const revision=await canonicalRevision(row,db);
  if(!revision||!["draft","DRAFT"].includes(revision.status))
    throw new PartnerCanonicalWorkflowError("Kanonický profil už nie je koncept.",409);
  if(input.expectedCanonicalUpdatedAt&&revision.updatedAt!==input.expectedCanonicalUpdatedAt)
    throw new PartnerCanonicalWorkflowError("Profil sa počas kontroly zmenil. Obnovte editor.",409);
  const outcome=input.action==="APPROVE"?"APPROVED":input.action==="RETURN"?"RETURNED":"REJECTED";
  const extras:D1PreparedStatement[]=[];
  if(input.action==="APPROVE"){
    extras.push(publication(db,row,nowIso,actorRef,revision.updatedAt),guard(db),
      ...ownerStatements(db,row,nowIso,actorRef));
    const meta=approveMetadata(db,row,nowIso);if(meta)extras.push(meta);
    const action=row.resourceType==="MANAGED_EVENT"?"EVENT_CREATED":"NEW_PROFILE_CREATED";
    extras.push(db.prepare("INSERT INTO partner_audit_events "+
      "(id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at) "+
      "VALUES(?1,'ADMIN',?2,?3,'MODERATION_SUBMISSION',?4,?5,?6)")
      .bind(crypto.randomUUID(),actorRef,action,row.id,JSON.stringify({canonicalId:row.canonicalId,
        resourceType:row.resourceType,accountId:row.accountId}),nowIso));
    const notice=row.resourceType==="MANAGED_EVENT"?"EVENT_CREATED":"NEW_PROFILE_CREATED";
    extras.push(db.prepare("INSERT OR IGNORE INTO partner_notification_outbox "+
      "(id,partner_account_id,notification_type,dedupe_key,status,expires_at,attempts,created_at,updated_at) "+
      "VALUES(?1,?2,?3,?4,'PENDING',?5,0,?6,?6)")
      .bind(crypto.randomUUID(),row.accountId,notice,"partner-canonical-approved/"+row.id,
        new Date(Date.parse(nowIso)+30*86400000).toISOString(),nowIso));
  }
  await applyAtomicModerationTransition(db,{
    id:row.id,expectedStatus:"PENDING_REVIEW",toStatus:outcome,actorType:"ADMIN",actorRef,
    eventId:crypto.randomUUID(),changedFieldsJson:'["status"]',now:nowIso,
    reasonCode:input.action==="RETURN"?input.note?.trim():input.action==="REJECT"?"OTHER":null,
    transitionGuard:{sql:"EXISTS(SELECT 1 FROM "+tableFor(row.resourceType)+
      " WHERE id=? AND status IN ('draft','DRAFT') AND updated_at=?)",
      bindings:[row.canonicalId,revision.updatedAt]},
    extraStatements:extras,
  });
  return {id:row.id,resourceType:row.resourceType,canonicalId:row.canonicalId,
    status:outcome,editorHref:canonicalHref(row.resourceType,row.canonicalId)};
}
