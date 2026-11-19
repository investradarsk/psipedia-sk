import { env } from "cloudflare:workers";
import { adminAuditActorRef } from "@/lib/audit-identity";
import { slugifyArticleTitle } from "@/lib/article-store";
import { getPartnerDatabase } from "@/lib/partner-auth-store";
import { normalizePartnerHelpCreate, type PartnerHelpCreateType } from "@/lib/partner-help-create";
import { assertIndependentOwnershipApprover } from "@/lib/partner-ownership-approval";
import {
  applyAtomicModerationTransition,
  type FoundationSubmissionStatus,
} from "@/lib/moderation-transition";

type HelpSubmissionRow = {
  id: string; resourceType: PartnerHelpCreateType; subjectId: string | null;
  accountId: string; status: string; proposedJson: string; riskJson: string;
  createdAt: string; updatedAt: string; rejectionReasonCode: string | null;
};
const specs = {
  ADOPTION_DOG: { table:"adoption_dogs", column:"adoption_dog_id", slugColumn:"slug" },
  LOST_FOUND_DOG: { table:"lost_found_dog_reports", column:"lost_found_report_id", slugColumn:"slug" },
  HELP_CASE: { table:"help_cases", column:"help_case_id", slugColumn:"slug" },
} as const;
const allowedRejections=["INCORRECT_INFORMATION","DUPLICATE","INSUFFICIENT_EVIDENCE","POLICY_CONFLICT","OTHER"] as const;
export class PartnerHelpReviewError extends Error {
  readonly status: number;
  constructor(message:string,status=400){super(message);this.status=status;this.name="PartnerHelpReviewError";}
}
function db(input?:D1Database){return getPartnerDatabase(input??(env as unknown as {DB?:D1Database}).DB);}
function uuid(v:string){return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);}
function parseJson(text:string){
  try{const v:unknown=JSON.parse(text);if(v&&typeof v==="object"&&!Array.isArray(v))return v as Record<string,unknown>;}catch{}
  throw new PartnerHelpReviewError("Návrh obsahuje neplatné údaje. Nemožno ho schváliť.",409);
}
function label(type:PartnerHelpCreateType,p:Record<string,unknown>){
  return type==="ADOPTION_DOG"?String(p.name??"Pes"):type==="LOST_FOUND_DOG"?
    `${p.type==="FOUND"?"Nájdený":"Stratený"} pes: ${p.dogName||p.city||"bez mena"}`:String(p.title??"Pomoc psom");
}
async function submission(id:string,database:D1Database){
  if(!uuid(id))throw new PartnerHelpReviewError("Neplatné ID návrhu.",404);
  const row=await database.prepare(`SELECT id,resource_type resourceType,subject_id subjectId,
    submitter_ref accountId,status,proposed_patch_json proposedJson,risk_flags_json riskJson,
    created_at createdAt,updated_at updatedAt,rejection_reason_code rejectionReasonCode
    FROM moderation_submissions
    WHERE id=?1 AND operation='CREATE' AND submitter_type='PARTNER_ACCOUNT'
      AND resource_type IN ('ADOPTION_DOG','LOST_FOUND_DOG','HELP_CASE') LIMIT 1`)
    .bind(id).first<HelpSubmissionRow>();
  if(!row)throw new PartnerHelpReviewError("Návrh sa nenašiel.",404);
  return row;
}
export async function getPartnerHelpCreateAdmin(id:string,databaseInput?:D1Database){
  const database=db(databaseInput),row=await submission(id,database);
  const history=(await database.prepare(`SELECT id,action,actor_type actorType,actor_ref actorRef,
    from_status fromStatus,to_status toStatus,changed_fields_json changedFieldsJson,created_at createdAt
    FROM moderation_events WHERE submission_id=?1 ORDER BY created_at DESC,id DESC LIMIT 100`)
    .bind(id).all()).results;
  const payload=parseJson(row.proposedJson);
  let risks:string[]=[];try{const r:unknown=JSON.parse(row.riskJson);if(Array.isArray(r))risks=r.filter((v):v is string=>typeof v==="string");}catch{}
  return {
    id:row.id,accountId:row.accountId,resourceType:row.resourceType,status:row.status,
    title:label(row.resourceType,payload),payload,risks,history,
    createdAt:row.createdAt,updatedAt:row.updatedAt,
    rejectionReasonCode:row.rejectionReasonCode,canonicalId:row.subjectId?Number(row.subjectId):null,
    active:["SUBMITTED","PENDING_REVIEW","QUARANTINED"].includes(row.status),
  };
}
async function pending(id:string,status:string,actorRef:string,database:D1Database,requestId?:string|null){
  if(status==="PENDING_REVIEW")return;
  if(status!=="SUBMITTED"&&status!=="QUARANTINED")
    throw new PartnerHelpReviewError("Návrh už bol vybavený alebo stiahnutý.",409);
  await applyAtomicModerationTransition(database,{
    id,expectedStatus:status as FoundationSubmissionStatus,toStatus:"PENDING_REVIEW",
    actorType:"ADMIN",actorRef,requestId:requestId??null,
    eventId:crypto.randomUUID(),changedFieldsJson:JSON.stringify(["status"]),now:new Date().toISOString(),
  });
}
async function uniqueSlug(type:PartnerHelpCreateType,values:Record<string,unknown>,database:D1Database){
  const seed=type==="ADOPTION_DOG"?String(values.name):type==="LOST_FOUND_DOG"?
    `${values.type==="LOST"?"strateny":"najdeny"}-${values.dogName||values.breed||"pes"}-${values.city}`:String(values.title);
  const base=(slugifyArticleTitle(seed)||"pes").slice(0,120);
  const spec=specs[type];
  for(let i=1;i<=250;i++){
    const slug=i===1?base:`${base}-${i}`;
    const sql=type==="LOST_FOUND_DOG"
      ? "SELECT id FROM lost_found_dog_reports WHERE type=?1 AND slug=?2 LIMIT 1"
      : `SELECT id FROM ${spec.table} WHERE slug=?1 ${type==="HELP_CASE"?"AND category=?2":""} LIMIT 1`;
    const args=type==="LOST_FOUND_DOG"?[values.type,slug]:type==="HELP_CASE"?[slug,values.category]:[slug];
    if(!await database.prepare(sql).bind(...args).first())return slug;
  }
  throw new PartnerHelpReviewError("Nepodarilo sa vytvoriť jedinečnú adresu.",409);
}
function duplicateGuard(type:PartnerHelpCreateType,p:Record<string,unknown>){
  if(type==="ADOPTION_DOG")return {
    sql:"NOT EXISTS (SELECT 1 FROM adoption_dogs WHERE name=? COLLATE NOCASE AND city=? COLLATE NOCASE AND organization_name=? COLLATE NOCASE AND status<>'ARCHIVED')",
    args:[p.name,p.city,p.organizationName],
  };
  if(type==="LOST_FOUND_DOG")return {
    sql:"NOT EXISTS (SELECT 1 FROM lost_found_dog_reports WHERE type=? AND event_date=? AND city=? COLLATE NOCASE AND COALESCE(dog_name,'')=? COLLATE NOCASE AND status NOT IN ('ARCHIVED','REJECTED'))",
    args:[p.type,p.eventDate,p.city,p.dogName],
  };
  return {sql:"NOT EXISTS (SELECT 1 FROM help_cases WHERE title=? COLLATE NOCASE AND category=? AND city=? COLLATE NOCASE AND status<>'archived')",
    args:[p.title,p.category,p.city]};
}
function insertCanonical(database:D1Database,input:{
  id:string;type:PartnerHelpCreateType;p:Record<string,unknown>;slug:string;nowIso:string;actorRef:string;
}){
  const p=input.p;
  const approved=`EXISTS(SELECT 1 FROM moderation_submissions WHERE id=? AND status='APPROVED' AND updated_at=? AND reviewed_by=?)`;
  const search=(...v:unknown[])=>v.map(x=>String(x??"")).join(" ").toLocaleLowerCase("sk").slice(0,20000);
  if(input.type==="ADOPTION_DOG"){
    const values=[p.name,input.slug,p.sex,p.size,p.approximateAgeMonths,p.breedName,p.region,p.district,p.city,
      p.organizationName,p.shortDescription,p.description,search(p.name,p.breedName,p.city,p.description),input.nowIso,input.nowIso,input.actorRef,input.actorRef];
    return database.prepare(`INSERT INTO adoption_dogs(
      name,slug,status,sex,size,approximate_age_months,breed_name,region,district,city,
      organization_name,short_description,description,search_text,created_at,updated_at,created_by,updated_by)
      SELECT ?,?,'DRAFT',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
      WHERE ${approved}`).bind(...values,input.id,input.nowIso,input.actorRef);
  }
  if(input.type==="LOST_FOUND_DOG"){
    const values=[p.type,input.slug,p.dogName,p.sex,p.breed,p.color,p.size,p.eventDate,p.region,p.district,p.city,
      p.locationDescription,p.description,search(p.dogName,p.breed,p.city,p.description),input.nowIso,input.nowIso];
    return database.prepare(`INSERT INTO lost_found_dog_reports(
      type,slug,status,dog_name,sex,breed,color,size,event_date,region,district,city,
      location_description,description,search_text,created_at,updated_at)
      SELECT ?,?,'DRAFT',?,?,?,?,?,?,?,?,?,?,?,?,?,?
      WHERE ${approved}`).bind(...values,input.id,input.nowIso,input.actorRef);
  }
  const values=[input.slug,p.title,p.category,p.excerpt,p.description,p.organization,p.city,p.region,p.actionLabel,p.contactNote,input.nowIso,input.nowIso,input.actorRef,input.actorRef];
  return database.prepare(`INSERT INTO help_cases(
    slug,title,category,status,excerpt,description,organization,city,region,action_label,
    contact_note,created_at,updated_at,created_by,updated_by)
    SELECT ?,?,?,'draft',?,?,?,?,?,?,?,?,?,?,?
    WHERE ${approved}`).bind(...values,input.id,input.nowIso,input.actorRef);
}
function claim(database:D1Database,input:{
  submissionId:string;type:PartnerHelpCreateType;accountId:string;canonicalIdSql:string;actorRef:string;nowIso:string;
}){
  const column=specs[input.type].column;
  return database.prepare(`INSERT INTO partner_help_claims(
    id,account_id,entity_type,${column},status,request_message,decision_note,
    created_at,updated_at,reviewed_at,reviewed_by)
    SELECT ?,?,? ,(${input.canonicalIdSql}),'APPROVED',NULL,'Vytvorené alebo prepojené po redakčnej kontrole',?,?,?,?
    WHERE EXISTS(SELECT 1 FROM moderation_submissions WHERE id=? AND status='APPROVED'
      AND updated_at=? AND reviewed_by=?)
      AND EXISTS(SELECT 1 FROM ${specs[input.type].table} WHERE id=(${input.canonicalIdSql}))
      AND NOT EXISTS(SELECT 1 FROM partner_help_claims WHERE ${column}=(${input.canonicalIdSql}) AND status='APPROVED')`)
    .bind(crypto.randomUUID(),input.accountId,input.type,
      input.nowIso,input.nowIso,input.nowIso,input.actorRef,
      input.submissionId,input.nowIso,input.actorRef);
}
function subjectUpdate(database:D1Database,input:{id:string;canonicalIdSql:string;nowIso:string;actorRef:string}){
  return database.prepare(`UPDATE moderation_submissions SET subject_id=CAST((${input.canonicalIdSql}) AS TEXT)
    WHERE id=? AND status='APPROVED' AND updated_at=? AND reviewed_by=?`)
    .bind(input.id,input.nowIso,input.actorRef);
}
function audit(database:D1Database,input:{
  id:string;accountId:string;type:PartnerHelpCreateType;nowIso:string;actorRef:string;
  action:"NEW_PROFILE_CREATED"|"NEW_PROFILE_LINKED_EXISTING"|"NEW_PROFILE_REJECTED";
  edited?:boolean;canonicalIdSql?:string;reason?:string;
}){
  const extra=input.canonicalIdSql?` AND EXISTS(SELECT 1 FROM partner_help_claims c WHERE c.account_id=?
    AND c.entity_type=? AND c.${specs[input.type].column}=(${input.canonicalIdSql}) AND c.status='APPROVED')`:"";
  return database.prepare(`INSERT INTO partner_audit_events(
    id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at)
    SELECT ?,'ADMIN',?,?, 'MODERATION_SUBMISSION',?,?,?
    WHERE EXISTS(SELECT 1 FROM moderation_submissions WHERE id=? AND
      status=? AND updated_at=? AND reviewed_by=?)${extra}`)
    .bind(crypto.randomUUID(),input.actorRef,input.action,input.id,
      JSON.stringify({resourceType:input.type,accountId:input.accountId,editedByAdmin:Boolean(input.edited),reason:input.reason??null}),
      input.nowIso,input.id,input.action==="NEW_PROFILE_REJECTED"?"REJECTED":"APPROVED",input.nowIso,input.actorRef,
      ...(input.canonicalIdSql?[input.accountId,input.type]:[]));
}
function notify(database:D1Database,input:{id:string;accountId:string;status:"APPROVED"|"REJECTED";now:Date;nowIso:string;actorRef:string}){
  const notice=input.status==="APPROVED"?"NEW_PROFILE_CREATED":"NEW_PROFILE_REJECTED";
  const until=new Date(input.now.getTime()+30*24*60*60*1000).toISOString();
  return database.prepare(`INSERT OR IGNORE INTO partner_notification_outbox(
    id,partner_account_id,notification_type,dedupe_key,status,encrypted_secret,expires_at,attempts,created_at,updated_at)
    SELECT ?,?,?,?,'PENDING',NULL,?,0,?,?
    WHERE EXISTS(SELECT 1 FROM moderation_submissions WHERE id=? AND status=?
      AND updated_at=? AND reviewed_by=?)`)
    .bind(crypto.randomUUID(),input.accountId,notice,`partner-help-${input.status.toLowerCase()}/${input.id}`,
      until,input.nowIso,input.nowIso,input.id,input.status,input.nowIso,input.actorRef);
}
async function checkAccount(accountId:string,database:D1Database){
  const row=await database.prepare("SELECT status FROM partner_accounts WHERE id=?1 LIMIT 1").bind(accountId).first<{status:string}>();
  if(row?.status!=="ACTIVE")throw new PartnerHelpReviewError("Partner účet už nie je aktívny.",409);
}
function safeResult(error:unknown){
  if(error instanceof Error&&/UNIQUE constraint failed|partner_help_claims_.*manager|adoption_dogs_slug_unique|lost_found_dog_reports_type_slug_unique|help_cases_category_slug_unique/i.test(error.message))
    throw new PartnerHelpReviewError("Záznam už existuje alebo má schváleného správcu. Porovnajte duplicitu a použite prepojenie.",409);
  throw error;
}
export async function createPartnerHelpDraftAdmin(input:{
  id:string;adminEmail:string;editedPayload?:unknown;requestId?:string|null;
  database?:D1Database;now?:Date;
}){
  const database=db(input.database),original=await submission(input.id,database);
  if(!["SUBMITTED","PENDING_REVIEW","QUARANTINED"].includes(original.status))
    throw new PartnerHelpReviewError("Návrh už bol vybavený.",409);
  await checkAccount(original.accountId,database);
  await assertIndependentOwnershipApprover({adminEmail:input.adminEmail,accountId:original.accountId,database});
  const actorRef=await adminAuditActorRef(input.adminEmail);
  // Only the exact known public create fields may change; never accept status,
  // slug, SEO, claim ID or private fields in an administrative adjustment.
  const raw=input.editedPayload===undefined?parseJson(original.proposedJson):input.editedPayload;
  const data=normalizePartnerHelpCreate(original.resourceType,raw);
  const edited=JSON.stringify(data)!==JSON.stringify(parseJson(original.proposedJson));
  const risks=duplicateGuard(original.resourceType,data);
  const exists=await database.prepare("SELECT 1 found WHERE NOT ("+risks.sql+")").bind(...risks.args).first();
  if(exists)throw new PartnerHelpReviewError("Nájdená zhodná položka. Použite prepojenie s existujúcim záznamom.",409);
  const slug=await uniqueSlug(original.resourceType,data,database);
  await pending(input.id,original.status,actorRef,database,input.requestId);
  const row=await submission(input.id,database);
  if(row.status!=="PENDING_REVIEW")throw new PartnerHelpReviewError("Návrh sa zmenil.",409);
  const now=input.now??new Date(),nowIso=now.toISOString();
  const spec=specs[row.resourceType];
  const canonicalIdSql=row.resourceType==="LOST_FOUND_DOG"
    ? `SELECT id FROM ${spec.table} WHERE slug='${slug.replaceAll("'","''")}' AND type='${String(data.type).replaceAll("'","''")}' LIMIT 1`
    : row.resourceType==="HELP_CASE"
      ? `SELECT id FROM help_cases WHERE slug='${slug.replaceAll("'","''")}' AND category='${String(data.category).replaceAll("'","''")}' LIMIT 1`
      : `SELECT id FROM adoption_dogs WHERE slug='${slug.replaceAll("'","''")}' LIMIT 1`;
  try{
    await applyAtomicModerationTransition(database,{
      id:input.id,expectedStatus:"PENDING_REVIEW",toStatus:"APPROVED",
      actorType:"ADMIN",actorRef,requestId:input.requestId??null,eventId:crypto.randomUUID(),
      changedFieldsJson:JSON.stringify([...Object.keys(data),...(edited?["ADMIN_EDITED"]:[])]),now:nowIso,
      transitionGuard:{sql:`EXISTS(SELECT 1 FROM partner_accounts WHERE id=? AND status='ACTIVE') AND ${risks.sql}`,
        bindings:[row.accountId,...risks.args]},
      extraStatements:[
        insertCanonical(database,{id:row.id,type:row.resourceType,p:data,slug,nowIso,actorRef}),
        claim(database,{submissionId:row.id,type:row.resourceType,accountId:row.accountId,canonicalIdSql,actorRef,nowIso}),
        subjectUpdate(database,{id:row.id,canonicalIdSql,nowIso,actorRef}),
        audit(database,{id:row.id,accountId:row.accountId,type:row.resourceType,nowIso,actorRef,
          action:"NEW_PROFILE_CREATED",edited,canonicalIdSql}),
        notify(database,{id:row.id,accountId:row.accountId,status:"APPROVED",now,nowIso,actorRef}),
      ],
    });
  }catch(error){safeResult(error);}
  return getPartnerHelpCreateAdmin(row.id,database);
}
export async function linkPartnerHelpCreateAdmin(input:{
  id:string;adminEmail:string;canonicalId:number;requestId?:string|null;
  database?:D1Database;now?:Date;
}){
  if(!Number.isSafeInteger(input.canonicalId)||input.canonicalId<1)
    throw new PartnerHelpReviewError("Vyberte platné ID existujúceho záznamu.");
  const database=db(input.database),original=await submission(input.id,database);
  if(!["SUBMITTED","PENDING_REVIEW","QUARANTINED"].includes(original.status))
    throw new PartnerHelpReviewError("Návrh už bol vybavený.",409);
  await checkAccount(original.accountId,database);
  await assertIndependentOwnershipApprover({adminEmail:input.adminEmail,accountId:original.accountId,database});
  const spec=specs[original.resourceType];
  const row=await database.prepare(`SELECT id,status FROM ${spec.table} WHERE id=? LIMIT 1`)
    .bind(input.canonicalId).first<{id:number;status:string}>();
  if(!row||["ARCHIVED","archived","REJECTED"].includes(row.status))
    throw new PartnerHelpReviewError("Existujúci záznam sa nenašiel alebo je archivovaný.",404);
  const owner=await database.prepare(`SELECT id,account_id FROM partner_help_claims
    WHERE ${spec.column}=? AND status='APPROVED' LIMIT 1`)
    .bind(input.canonicalId).first<{id:string;account_id:string}>();
  if(owner&&owner.account_id!==original.accountId)throw new PartnerHelpReviewError("Záznam už má iného aktívneho správcu.",409);
  const actorRef=await adminAuditActorRef(input.adminEmail);
  await pending(input.id,original.status,actorRef,database,input.requestId);
  const now=input.now??new Date(),nowIso=now.toISOString();
  const canonicalIdSql=`SELECT id FROM ${spec.table} WHERE id=${input.canonicalId} LIMIT 1`;
  const ownerGuard=`NOT EXISTS(SELECT 1 FROM partner_help_claims WHERE ${spec.column}=? AND status='APPROVED')`;
  const alreadyManaged=Boolean(owner);
  // An already approved same-account manager can link the proposal to the
  // existing record without inserting a second active claim.
  try{
    await applyAtomicModerationTransition(database,{
      id:input.id,expectedStatus:"PENDING_REVIEW",toStatus:"APPROVED",actorType:"ADMIN",actorRef,
      requestId:input.requestId??null,eventId:crypto.randomUUID(),changedFieldsJson:JSON.stringify(["LINK_EXISTING"]),
      now:nowIso,transitionGuard:{
        sql:`EXISTS(SELECT 1 FROM partner_accounts WHERE id=? AND status='ACTIVE')
          AND EXISTS(SELECT 1 FROM ${spec.table} WHERE id=?)
          AND ${alreadyManaged
            ? `EXISTS(SELECT 1 FROM partner_help_claims WHERE ${spec.column}=? AND status='APPROVED' AND account_id=?)`
            : ownerGuard}`,
        bindings:[original.accountId,input.canonicalId,input.canonicalId,...(alreadyManaged?[original.accountId]:[])],
      },
      extraStatements:[
        ...(!alreadyManaged?[claim(database,{submissionId:input.id,type:original.resourceType,accountId:original.accountId,
          canonicalIdSql,actorRef,nowIso})]:[]),
        subjectUpdate(database,{id:input.id,canonicalIdSql,nowIso,actorRef}),
        audit(database,{id:input.id,accountId:original.accountId,type:original.resourceType,nowIso,actorRef,
          action:"NEW_PROFILE_LINKED_EXISTING",canonicalIdSql}),
        notify(database,{id:input.id,accountId:original.accountId,status:"APPROVED",now,nowIso,actorRef}),
      ],
    });
  }catch(error){safeResult(error);}
  return getPartnerHelpCreateAdmin(input.id,database);
}
export async function rejectPartnerHelpCreateAdmin(input:{
  id:string;adminEmail:string;reasonCode:unknown;requestId?:string|null;
  database?:D1Database;now?:Date;
}){
  if(typeof input.reasonCode!=="string"||!(allowedRejections as readonly string[]).includes(input.reasonCode))
    throw new PartnerHelpReviewError("Vyberte platný dôvod zamietnutia.");
  const database=db(input.database),original=await submission(input.id,database);
  if(!["SUBMITTED","PENDING_REVIEW","QUARANTINED"].includes(original.status))
    throw new PartnerHelpReviewError("Návrh už bol vybavený.",409);
  const actorRef=await adminAuditActorRef(input.adminEmail);
  await pending(input.id,original.status,actorRef,database,input.requestId);
  const now=input.now??new Date(),nowIso=now.toISOString();
  await applyAtomicModerationTransition(database,{
    id:input.id,expectedStatus:"PENDING_REVIEW",toStatus:"REJECTED",actorType:"ADMIN",
    actorRef,reasonCode:input.reasonCode,requestId:input.requestId??null,
    eventId:crypto.randomUUID(),changedFieldsJson:JSON.stringify(["status"]),now:nowIso,
    extraStatements:[
      audit(database,{id:input.id,accountId:original.accountId,type:original.resourceType,nowIso,actorRef,
        action:"NEW_PROFILE_REJECTED",reason:input.reasonCode}),
      notify(database,{id:input.id,accountId:original.accountId,status:"REJECTED",now,nowIso,actorRef}),
    ],
  });
  return getPartnerHelpCreateAdmin(input.id,database);
}
