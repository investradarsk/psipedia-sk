/**
 * No second content store: partner lifecycle requests reuse moderation_submissions.
 * Only an authenticated Admin decision may hide/archive a canonical profile,
 * release its management, or deactivate an account. No hard-delete.
 */
import { env } from "cloudflare:workers";
import { getPartnerDatabase } from "./partner-auth-store";
import { parseHelpResourceId } from "./partner-help-claims";
import { adminAuditActorRef } from "./audit-identity";
import { applyAtomicModerationTransition } from "./moderation-transition";
import { adminNotificationEventStatement } from "./admin-notifications";

export const lifecycleActions=["REQUEST_HIDE","REQUEST_ARCHIVE","REQUEST_RELEASE","REQUEST_DELETE_ACCOUNT"] as const;
export type LifecycleAction=typeof lifecycleActions[number];
type ProfileType="DIRECTORY_PROFILE"|"HELP_ORGANIZATION"|"MANAGED_EVENT"|"ADOPTION_DOG"|"LOST_FOUND_DOG"|"HELP_CASE";
type Spec={table:string;archived:string;hidden:string;resourceColumn:string|null;nameColumn:string;};
const specs:Record<ProfileType,Spec>={
  DIRECTORY_PROFILE:{table:"directory_profiles",archived:"archived",hidden:"draft",resourceColumn:"directory_profile_id",nameColumn:"name"},
  HELP_ORGANIZATION:{table:"help_organizations",archived:"ARCHIVED",hidden:"DRAFT",resourceColumn:"help_organization_id",nameColumn:"name"},
  MANAGED_EVENT:{table:"managed_events",archived:"archived",hidden:"draft",resourceColumn:"managed_event_id",nameColumn:"title"},
  ADOPTION_DOG:{table:"adoption_dogs",archived:"ARCHIVED",hidden:"DRAFT",resourceColumn:null,nameColumn:"name"},
  LOST_FOUND_DOG:{table:"lost_found_dog_reports",archived:"ARCHIVED",hidden:"DRAFT",resourceColumn:null,nameColumn:"dog_name"},
  HELP_CASE:{table:"help_cases",archived:"archived",hidden:"draft",resourceColumn:null,nameColumn:"title"},
};
const helpColumn=(type:ProfileType)=>type==="ADOPTION_DOG"?"adoption_dog_id":type==="LOST_FOUND_DOG"?"lost_found_report_id":"help_case_id";
export class PartnerLifecycleError extends Error{
  constructor(message:string,readonly status=400){super(message);this.name="PartnerLifecycleError";}
}
function database(input?:D1Database){return getPartnerDatabase(input??(env as unknown as {DB?:D1Database}).DB);}
function validAction(value:unknown):LifecycleAction{
  if(typeof value!=="string"||!(lifecycleActions as readonly string[]).includes(value))
    throw new PartnerLifecycleError("Neplatná partnerská žiadosť.");
  return value as LifecycleAction;
}
function assertId(id:string){if(!/^[A-Za-z0-9_-]{1,128}$/.test(id))throw new PartnerLifecycleError("Žiadosť sa nenašla.",404);}
function cas(db:D1Database){return db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('PARTNER_LIFECYCLE_CAS_CONFLICT',char(36)) END accepted");}
function payload(value:string):{resourceId?:string;reason?:string}{
  try{const raw:unknown=JSON.parse(value);
    return raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as {resourceId?:string;reason?:string}:{};
  }catch{return {};}
}
async function activeAccount(db:D1Database,accountId:string){
  const row=await db.prepare("SELECT status FROM partner_accounts WHERE id=?").bind(accountId).first<{status:string}>();
  if(row?.status!=="ACTIVE")throw new PartnerLifecycleError("Potrebujete aktívny partnerský účet.",403);
}
type Target={type:ProfileType;id:number;resourceId:string;name:string;status:string};
async function owned(db:D1Database,accountId:string,resourceId:string):Promise<Target>{
  const help=parseHelpResourceId(resourceId);
  let type:ProfileType,id:number;
  if(help){type=help.entityType;id=help.canonicalId;}
  else{
    assertId(resourceId);
    const row=await db.prepare(
      "SELECT r.entity_type type,COALESCE(r.directory_profile_id,r.help_organization_id,r.managed_event_id) id "+
      "FROM partner_resources r JOIN partner_memberships m ON m.resource_id=r.id AND m.role='OWNER' "+
      "AND m.revoked_at IS NULL WHERE r.id=? AND m.account_id=? LIMIT 1"
    ).bind(resourceId,accountId).first<{type:ProfileType;id:number}>();
    if(!row||!(row.type in specs))throw new PartnerLifecycleError("Tento profil nespravujete.",403);
    type=row.type;id=row.id;
  }
  if(!Number.isSafeInteger(id)||id<1)throw new PartnerLifecycleError("Profil neexistuje.",404);
  const spec=specs[type];
  if(!spec.resourceColumn){
    const row=await db.prepare("SELECT id FROM partner_help_claims WHERE account_id=? AND "+helpColumn(type)+
      "=? AND status='APPROVED' LIMIT 1").bind(accountId,id).first();
    if(!row)throw new PartnerLifecycleError("Tento profil nespravujete.",403);
  }
  const row=await db.prepare("SELECT "+spec.nameColumn+" name,status FROM "+spec.table+" WHERE id=? LIMIT 1")
    .bind(id).first<{name:string|null;status:string}>();
  if(!row||row.status===spec.archived)throw new PartnerLifecycleError("Profil už nie je dostupný.",409);
  return {type,id,resourceId,name:row.name??"Profil",status:row.status};
}
export async function createPartnerLifecycleRequest(input:{
  accountId:string;action:unknown;resourceId?:unknown;reason?:unknown;db?:D1Database;now?:Date;
}){
  const db=database(input.db),action=validAction(input.action);
  await activeAccount(db,input.accountId);
  if(input.reason!==undefined&&typeof input.reason!=="string")
    throw new PartnerLifecycleError("Neplatný dôvod.");
  const reason=typeof input.reason==="string"?input.reason.trim():"";
  if(reason.length>2000)throw new PartnerLifecycleError("Dôvod môže mať najviac 2 000 znakov.");
  const target=action==="REQUEST_DELETE_ACCOUNT"?null:
    typeof input.resourceId==="string"?await owned(db,input.accountId,input.resourceId):
      (()=>{throw new PartnerLifecycleError("Vyberte profil.");})();
  if(action==="REQUEST_DELETE_ACCOUNT"&&input.resourceId!==undefined)
    throw new PartnerLifecycleError("Pri žiadosti o zrušenie účtu nevyberajte profil.");
  if(target&&action==="REQUEST_HIDE"&&["DRAFT","draft"].includes(target.status))
    throw new PartnerLifecycleError("Profil je už skrytý.",409);
  const id=crypto.randomUUID(),now=input.now??new Date(),iso=now.toISOString();
  const resourceType=target?.type??"PARTNER_ACCOUNT",subject=String(target?.id??input.accountId);
  const data=JSON.stringify({resourceId:target?.resourceId??null,reason});
  let entries:Array<{meta?:{changes?:number}}> = [];
  try{entries=await db.batch([
    db.prepare("INSERT INTO moderation_submissions "+
      "(id,resource_type,subject_id,operation,status,submitter_type,submitter_ref,proposed_patch_json,risk_flags_json,created_at,updated_at) "+
      "SELECT ?,?,?,?,'SUBMITTED','PARTNER_ACCOUNT',?,?,'[]',?,? "+
      "WHERE EXISTS(SELECT 1 FROM partner_accounts WHERE id=? AND status='ACTIVE') "+
      "AND NOT EXISTS(SELECT 1 FROM moderation_submissions WHERE submitter_type='PARTNER_ACCOUNT' "+
      "AND submitter_ref=? AND operation=? AND subject_id=? AND status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED'))")
      .bind(id,resourceType,subject,action,input.accountId,data,iso,iso,input.accountId,input.accountId,action,subject),
    cas(db),
    db.prepare("INSERT INTO moderation_events "+
      "(id,submission_id,resource_type,subject_id,action,actor_type,actor_ref,from_status,to_status,changed_fields_json,created_at) "+
      "VALUES(?,?,?,?,'SUBMISSION_CREATED','PARTNER',?,NULL,'SUBMITTED','[]',?)")
      .bind(crypto.randomUUID(),id,resourceType,subject,input.accountId,iso),
    adminNotificationEventStatement(db,{
      eventType:"partner_lifecycle_requested",sourceType:"PARTNER_LIFECYCLE",resourceType:"partner_lifecycle",
      resourceRef:id,actorType:"PARTNER",actorRef:"partner:"+input.accountId,
      targetUrl:"/admin/partners/accounts/"+encodeURIComponent(input.accountId)+"?tab=ziadosti",
      title:"Nová žiadosť partnera",body:target?target.name+" · "+action:"Žiadosť o zrušenie účtu",
      tag:"partner-lifecycle",dedupeKey:"partner-lifecycle/"+id,
    },now),
  ]);}catch(error){
    const previous=await db.prepare("SELECT 1 found FROM moderation_submissions "+
      "WHERE submitter_type='PARTNER_ACCOUNT' AND submitter_ref=? AND operation=? "+
      "AND subject_id=? AND status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') LIMIT 1")
      .bind(input.accountId,action,subject).first();
    if(previous)throw new PartnerLifecycleError("Táto žiadosť už čaká na kontrolu.",409);
    throw error;
  }
  if(Number(entries[0]?.meta?.changes??0)!==1)throw new PartnerLifecycleError("Táto žiadosť už čaká na kontrolu.",409);
  return {id,action,status:"SUBMITTED" as const,resourceType,canonicalId:target?.id??null};
}
type Row={id:string;accountId:string;resourceType:ProfileType|"PARTNER_ACCOUNT";subjectId:string;
  operation:LifecycleAction;status:string;data:string;};
async function getRequest(db:D1Database,id:string){
  assertId(id);
  const row=await db.prepare("SELECT id,submitter_ref accountId,resource_type resourceType,subject_id subjectId,"+
    "operation,status,proposed_patch_json data FROM moderation_submissions WHERE id=? "+
    "AND submitter_type='PARTNER_ACCOUNT' AND operation IN "+
    "('REQUEST_HIDE','REQUEST_ARCHIVE','REQUEST_RELEASE','REQUEST_DELETE_ACCOUNT') LIMIT 1")
    .bind(id).first<Row>();
  if(!row)throw new PartnerLifecycleError("Žiadosť neexistuje.",404);
  return row;
}
function ownerCondition(row:Row,resourceId:string){
  const type=row.resourceType as ProfileType,spec=specs[type],id=Number(row.subjectId);
  if(spec.resourceColumn)return {
    sql:"EXISTS(SELECT 1 FROM partner_resources r JOIN partner_memberships m ON m.resource_id=r.id "+
      "AND m.role='OWNER' AND m.revoked_at IS NULL WHERE r.id=? AND r.entity_type=? "+
      "AND r."+spec.resourceColumn+"=? AND m.account_id=?)",
    binds:[resourceId,type,id,row.accountId] as unknown[],
  };
  return {sql:"EXISTS(SELECT 1 FROM partner_help_claims WHERE account_id=? AND "+
    helpColumn(type)+"=? AND status='APPROVED')",binds:[row.accountId,id] as unknown[]};
}
function revokeOwner(db:D1Database,row:Row,iso:string,actor:string,resourceId:string){
  const type=row.resourceType as ProfileType;
  if(specs[type].resourceColumn)return db.prepare("UPDATE partner_memberships SET revoked_at=?,revoked_by=?,updated_at=? "+
    "WHERE account_id=? AND resource_id=? AND role='OWNER' AND revoked_at IS NULL")
    .bind(iso,actor,iso,row.accountId,resourceId);
  return db.prepare("UPDATE partner_help_claims SET status='REVOKED',revoked_at=?,revoked_by=?,updated_at=? "+
    "WHERE account_id=? AND "+helpColumn(type)+"=? AND status='APPROVED'")
    .bind(iso,actor,iso,row.accountId,Number(row.subjectId));
}
function profileStatements(db:D1Database,row:Row,iso:string,actor:string,resourceId:string){
  const type=row.resourceType as ProfileType,spec=specs[type],id=Number(row.subjectId);
  if(!spec||!Number.isSafeInteger(id)||id<1)throw new PartnerLifecycleError("Profil neexistuje.",409);
  const own=ownerCondition(row,resourceId);
  if(row.operation==="REQUEST_RELEASE")return [revokeOwner(db,row,iso,actor,resourceId),cas(db)];
  const next=row.operation==="REQUEST_HIDE"?spec.hidden:spec.archived;
  const updatedBy=type==="LOST_FOUND_DOG"?"":",updated_by=?";
  const query="UPDATE "+spec.table+" SET status=?,updated_at=?"+updatedBy+
    " WHERE id=? AND status NOT IN (?,?) AND "+own.sql;
  const params=[next,iso,...(updatedBy?[actor]:[]),id,spec.archived,next,...own.binds];
  return [
    db.prepare(query).bind(...params),cas(db),
    ...(row.operation==="REQUEST_ARCHIVE"?[revokeOwner(db,row,iso,actor,resourceId),cas(db)]:[]),
  ];
}
function closeAccountStatements(db:D1Database,row:Row,iso:string,actor:string){
  return [
    db.prepare("UPDATE partner_accounts SET status='DEACTIVATED',deactivated_at=?,updated_at=? "+
      "WHERE id=? AND status='ACTIVE'").bind(iso,iso,row.accountId),
    cas(db),
    db.prepare("UPDATE partner_memberships SET revoked_at=?,revoked_by=?,updated_at=? "+
      "WHERE account_id=? AND revoked_at IS NULL").bind(iso,actor,iso,row.accountId),
    db.prepare("UPDATE partner_help_claims SET status='REVOKED',revoked_at=?,revoked_by=?,updated_at=? "+
      "WHERE account_id=? AND status='APPROVED'").bind(iso,actor,iso,row.accountId),
    db.prepare("UPDATE partner_claims SET status='CANCELLED',updated_at=? "+
      "WHERE account_id=? AND status='PENDING'").bind(iso,row.accountId),
    db.prepare("UPDATE partner_help_claims SET status='CANCELLED',cancelled_at=?,updated_at=? "+
      "WHERE account_id=? AND status='PENDING'").bind(iso,iso,row.accountId),
    db.prepare("UPDATE moderation_submissions SET status='WITHDRAWN',updated_at=? "+
      "WHERE submitter_type='PARTNER_ACCOUNT' AND submitter_ref=? AND id<>? "+
      "AND status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED','RETURNED')").bind(iso,row.accountId,row.id),
    db.prepare("UPDATE partner_new_profile_metadata SET dedupe_active=0 WHERE partner_account_id=?").bind(row.accountId),
    db.prepare("UPDATE partner_event_submission_metadata SET dedupe_active=0 WHERE partner_account_id=?").bind(row.accountId),
    db.prepare("UPDATE partner_profile_change_metadata SET dedupe_active=0 WHERE partner_account_id=?").bind(row.accountId),
    db.prepare("UPDATE partner_resource_verifications SET status='REJECTED',updated_at=?,reviewed_at=?,reviewed_by=?,review_note='Uzavreté po zrušení partnerského účtu' WHERE account_id=? AND status='PENDING_VERIFICATION'")
      .bind(iso,iso,actor,row.accountId),
    db.prepare("UPDATE partner_commercial_interests SET status='CLOSED',updated_at=?,status_updated_at=?,status_updated_by=? WHERE account_id=? AND status='NEW'")
      .bind(iso,iso,actor,row.accountId),
    db.prepare("UPDATE partner_commercial_agreements SET status='CANCELLED',updated_at=?,updated_by=? WHERE account_id=? AND status='OFFERED'")
      .bind(iso,actor,row.accountId),
    db.prepare("UPDATE resource_management_sessions SET revoked_at=? WHERE resource_type='PARTNER_ACCOUNT' "+
      "AND subject_id=? AND revoked_at IS NULL").bind(iso,row.accountId),
    db.prepare("UPDATE resource_access_tokens SET revoked_at=? WHERE resource_type='PARTNER_ACCOUNT' "+
      "AND subject_id=? AND revoked_at IS NULL").bind(iso,row.accountId),
  ];
}
export async function decidePartnerLifecycleAdmin(input:{
  id:string;adminEmail:string;decision:"APPROVE"|"REJECT";note?:unknown;db?:D1Database;now?:Date;
}){
  const db=database(input.db),row=await getRequest(db,input.id);
  if(!["SUBMITTED","PENDING_REVIEW","QUARANTINED"].includes(row.status))
    throw new PartnerLifecycleError("Žiadosť už bola vybavená.",409);
  if(input.note!==undefined&&typeof input.note!=="string")throw new PartnerLifecycleError("Neplatná poznámka.");
  const note=typeof input.note==="string"?input.note.trim():"";
  if(note.length>2000)throw new PartnerLifecycleError("Poznámka je príliš dlhá.");
  const iso=(input.now??new Date()).toISOString(),actor=await adminAuditActorRef(input.adminEmail);
  if(row.status!=="PENDING_REVIEW"){
    await applyAtomicModerationTransition(db,{
      id:row.id,expectedStatus:row.status as "SUBMITTED"|"QUARANTINED",toStatus:"PENDING_REVIEW",
      actorType:"ADMIN",actorRef:actor,eventId:crypto.randomUUID(),changedFieldsJson:'["status"]',now:iso,
    });
  }
  const data=payload(row.data),resourceId=data.resourceId??"";
  if(row.operation!=="REQUEST_DELETE_ACCOUNT"&&(!resourceId||!(row.resourceType in specs)))
    throw new PartnerLifecycleError("Žiadosť nemá platný kanonický profil.",409);
  const statements:D1PreparedStatement[]=[];
  if(input.decision==="APPROVE"){
    if(row.operation==="REQUEST_DELETE_ACCOUNT")statements.push(...closeAccountStatements(db,row,iso,actor));
    else statements.push(...profileStatements(db,row,iso,actor,resourceId));
  }
  const action=input.decision==="REJECT"?"CLAIM_REJECTED":
    row.operation==="REQUEST_DELETE_ACCOUNT"?"ACCOUNT_DEACTIVATED":
    row.operation==="REQUEST_RELEASE"&&input.decision==="APPROVE"?"MEMBERSHIP_REVOKED":"CLAIM_APPROVED";
  statements.push(db.prepare("INSERT INTO partner_audit_events "+
    "(id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at) "+
    "VALUES(?,'ADMIN',?,?,'MODERATION_SUBMISSION',?,?,?)")
    .bind(crypto.randomUUID(),actor,action,row.id,
      JSON.stringify({lifecycleAction:row.operation,decision:input.decision,accountId:row.accountId,
        resourceType:row.resourceType,subjectId:row.subjectId,note}),iso));
  try{
    await applyAtomicModerationTransition(db,{
      id:row.id,expectedStatus:"PENDING_REVIEW",toStatus:input.decision==="APPROVE"?"APPROVED":"REJECTED",
      actorType:"ADMIN",actorRef:actor,eventId:crypto.randomUUID(),changedFieldsJson:'["status"]',
      reasonCode:input.decision==="REJECT"?"OTHER":null,now:iso,extraStatements:statements,
    });
  }catch(error){
    if(error instanceof Error&&/malformed JSON|PARTNER_LIFECYCLE_CAS_CONFLICT|constraint failed/i.test(error.message))
      throw new PartnerLifecycleError("Stav záznamu alebo oprávnenia sa zmenili. Obnovte Admin.",409);
    throw error;
  }
  return {id:row.id,action:row.operation,status:input.decision==="APPROVE"?"APPROVED":"REJECTED"};
}
export async function listPartnerLifecycleRequests(input:{accountId:string;db?:D1Database;limit?:number}){
  const db=database(input.db),limit=Math.min(200,Math.max(1,input.limit??50));
  const rows=await db.prepare("SELECT id,operation action,status,resource_type resourceType,"+
    "subject_id subjectId,proposed_patch_json data,created_at createdAt FROM moderation_submissions "+
    "WHERE submitter_type='PARTNER_ACCOUNT' AND submitter_ref=? "+
    "AND operation IN ('REQUEST_HIDE','REQUEST_ARCHIVE','REQUEST_RELEASE','REQUEST_DELETE_ACCOUNT') "+
    "ORDER BY created_at DESC,id DESC LIMIT ?")
    .bind(input.accountId,limit).all<{id:string;action:LifecycleAction;status:string;resourceType:string;
      subjectId:string;data:string;createdAt:string}>();
  return rows.results.map(({data,...item})=>({...item,reason:payload(data).reason??""}));
}
