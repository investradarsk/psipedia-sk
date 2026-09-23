import { env } from "cloudflare:workers";
import { adminAuditActorRef } from "@/lib/audit-identity";
import { slugifyArticleTitle } from "@/lib/article-store";
import { decryptPii } from "@/lib/pii-crypto";
import { getPartnerDatabase } from "@/lib/partner-auth-store";
import {
  normalizePartnerEventCreate,
  normalizePartnerEventUpdate,
  scanPartnerEventDuplicates,
  PartnerEventError,
  type PartnerEventPatch,
  type PartnerEventOperation,
} from "@/lib/partner-events";
import { normalizeManagedEventInput } from "@/lib/event-store";
import { applyAtomicModerationTransition, type FoundationSubmissionStatus } from "@/lib/moderation-transition";
import { syncGeoPointAfterSourceChange } from "@/lib/geo-store";
import { invalidateVersionedPublicHtmlCacheUrl } from "@/lib/public-html-cache";

type Bindings={DB?:D1Database;PII_ENCRYPTION_KEY?:string;CF_VERSION_METADATA?:{id?:string}};
type AdminRow={
  id:string;operation:PartnerEventOperation;status:string;subjectId:string|null;proposedPatchJson:string;riskFlagsJson:string;
  rejectionReasonCode:string|null;createdAt:string;updatedAt:string;reviewedAt:string|null;reviewedBy:string|null;
  accountId:string;resourceId:string|null;baseUpdatedAt:string|null;baseSnapshotJson:string;changedFieldCount:number;
  duplicateConfidence:string;duplicateCandidateId:number|null;duplicateReasonsJson:string;resolutionType:string|null;resolvedEventId:number|null;
  emailCiphertext:string;currentUpdatedAt:string|null;currentTitle:string|null;currentSlug:string|null;currentStatus:string|null;currentEventType:string|null;currentStartDate:string|null;currentRegion:string|null;
  candidateTitle:string|null;candidateSlug:string|null;candidateStatus:string|null;candidateStartDate:string|null;candidateCity:string|null;
};
function db(input?:D1Database){return getPartnerDatabase(input??(env as unknown as Bindings).DB);}
function key(value?:string){const k=value??(env as unknown as Bindings).PII_ENCRYPTION_KEY;if(!k)throw new PartnerEventError("PII_ENCRYPTION_KEY nie je nakonfigurovaný.",503);return k;}
function json<T>(value:string,fallback:T):T{try{return JSON.parse(value) as T}catch{return fallback}}
function active(status:string){return ["SUBMITTED","PENDING_REVIEW","QUARANTINED"].includes(status);}
function label(status:string){return status==="SUBMITTED"?"Nové":status==="PENDING_REVIEW"?"Čaká na rozhodnutie":status==="QUARANTINED"?"Dodatočná kontrola":status==="APPROVED"?"Schválené":status==="REJECTED"?"Zamietnuté":"Zrušené";}
const SELECT=`
  SELECT s.id,s.operation,s.status,s.subject_id subjectId,s.proposed_patch_json proposedPatchJson,s.risk_flags_json riskFlagsJson,
    s.rejection_reason_code rejectionReasonCode,s.created_at createdAt,s.updated_at updatedAt,s.reviewed_at reviewedAt,s.reviewed_by reviewedBy,
    m.partner_account_id accountId,m.partner_resource_id resourceId,m.base_updated_at baseUpdatedAt,m.base_snapshot_json baseSnapshotJson,
    m.changed_field_count changedFieldCount,m.duplicate_confidence duplicateConfidence,m.duplicate_candidate_id duplicateCandidateId,
    m.duplicate_reasons_json duplicateReasonsJson,m.resolution_type resolutionType,m.resolved_event_id resolvedEventId,
    a.email_ciphertext emailCiphertext,e.updated_at currentUpdatedAt,e.title currentTitle,e.slug currentSlug,e.status currentStatus,e.event_type currentEventType,e.start_date currentStartDate,e.region currentRegion,
    d.title candidateTitle,d.slug candidateSlug,d.status candidateStatus,d.start_date candidateStartDate,d.city candidateCity
  FROM partner_event_submission_metadata m
  JOIN moderation_submissions s ON s.id=m.submission_id
  JOIN partner_accounts a ON a.id=m.partner_account_id
  LEFT JOIN partner_resources r ON r.id=m.partner_resource_id
  LEFT JOIN managed_events e ON e.id=r.managed_event_id
  LEFT JOIN managed_events d ON d.id=m.duplicate_candidate_id
`;
async function hydrate(row:AdminRow,encryptionKey:string){
  const patch=json<PartnerEventPatch>(row.proposedPatchJson,{});
  const risks=json<string[]>(row.riskFlagsJson,[]).filter(x=>typeof x==="string");
  if(row.operation==="UPDATE"&&active(row.status)&&row.baseUpdatedAt&&row.currentUpdatedAt!==row.baseUpdatedAt&&!risks.includes("STALE_BASE"))risks.push("STALE_BASE");
  const eventType=typeof patch.eventType==="string"?patch.eventType:row.currentEventType;const startDate=typeof patch.startDate==="string"?patch.startDate:row.currentStartDate;const region=typeof patch.region==="string"?patch.region:row.currentRegion;const needsAttention=risks.length>0||row.duplicateConfidence==="HIGH"||row.status==="QUARANTINED";return {...row,email:await decryptPii(row.emailCiphertext,encryptionKey),proposedPatch:patch,riskFlags:risks,statusLabel:label(row.status),active:active(row.status),duplicateReasons:json<string[]>(row.duplicateReasonsJson,[]),eventType,startDate,region,needsAttention};
}
async function raw(id:string,database:D1Database){return database.prepare(SELECT+" WHERE s.id=?1 LIMIT 1").bind(id).first<AdminRow>();}
export async function listPartnerEventsAdmin(input:{status?:string;operation?:string;eventType?:string;region?:string;dateFrom?:string;dateTo?:string;attention?:string;q?:string;database?:D1Database;encryptionKey?:string}={}){
  const database=db(input.database);
  const rows=(await database.prepare(SELECT+" ORDER BY CASE WHEN s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') THEN 0 ELSE 1 END,s.created_at ASC LIMIT 300").all<AdminRow>()).results;
  let items=await Promise.all(rows.map(row=>hydrate(row,key(input.encryptionKey))));
  if(input.status&&input.status!=="all")items=input.status==="active"?items.filter(x=>x.active):items.filter(x=>x.status===input.status);
  if(input.operation&&input.operation!=="all")items=items.filter(x=>x.operation===input.operation);
  if(input.eventType&&input.eventType!=="all")items=items.filter(x=>x.eventType===input.eventType);
  if(input.region&&input.region!=="all")items=items.filter(x=>x.region===input.region);
  if(input.dateFrom)items=items.filter(x=>Boolean(x.startDate)&&String(x.startDate)>=input.dateFrom!);
  if(input.dateTo)items=items.filter(x=>Boolean(x.startDate)&&String(x.startDate)<=input.dateTo!);
  if(input.attention==="attention")items=items.filter(x=>x.needsAttention);
  if(input.attention==="normal")items=items.filter(x=>!x.needsAttention);
  if(input.q){const q=input.q.toLowerCase();items=items.filter(x=>String(x.proposedPatch.title??x.currentTitle??"").toLowerCase().includes(q)||x.email.toLowerCase().includes(q));}
  return items;
}

type CurrentEvent={id:number;slug:string;title:string;excerpt:string;eventType:string;status:string;startDate:string;startTime:string;endDate:string|null;endTime:string|null;venue:string;city:string;region:string;address:string;organizer:string;description:string;practicalInfo:string;websiteUrl:string|null;registrationUrl:string|null;cancelled:number;updatedAt:string};
async function currentEvent(id:number,database:D1Database){
  return database.prepare(`SELECT id,slug,title,excerpt,event_type eventType,status,start_date startDate,start_time startTime,end_date endDate,end_time endTime,venue,city,region,address,organizer,description,practical_info practicalInfo,website_url websiteUrl,registration_url registrationUrl,cancelled,updated_at updatedAt FROM managed_events WHERE id=?1 LIMIT 1`).bind(id).first<CurrentEvent>();
}
function currentValues(e:CurrentEvent):PartnerEventPatch{return {title:e.title,excerpt:e.excerpt,eventType:e.eventType,startDate:e.startDate,startTime:e.startTime,endDate:e.endDate,endTime:e.endTime,venue:e.venue,city:e.city,region:e.region,address:e.address,organizer:e.organizer,description:e.description,practicalInfo:e.practicalInfo,websiteUrl:e.websiteUrl,registrationUrl:e.registrationUrl,cancelled:Boolean(e.cancelled)};}
export async function getPartnerEventAdmin(id:string,input:{database?:D1Database;encryptionKey?:string}={}){
  const database=db(input.database),row=await raw(id,database);if(!row)return null;
  const item=await hydrate(row,key(input.encryptionKey));
  const moderation=(await database.prepare("SELECT * FROM moderation_events WHERE submission_id=?1 ORDER BY created_at ASC,id ASC").bind(id).all<Record<string,unknown>>()).results;
  let current:null|CurrentEvent=null,diff:Array<Record<string,unknown>>=[];
  if(row.subjectId){const n=Number(row.subjectId);if(Number.isSafeInteger(n)&&n>0)current=await currentEvent(n,database)??null;}
  if(row.operation==="UPDATE"&&current){
    const base=json<PartnerEventPatch>(row.baseSnapshotJson,{});
    const proposed=normalizePartnerEventUpdate(item.proposedPatch,base);
    const now=currentValues(current);
    diff=Object.keys(proposed).map(field=>({field,baseValue:base[field]??null,currentValue:now[field]??null,proposedValue:proposed[field]??null,currentChangedFromBase:JSON.stringify(base[field]??null)!==JSON.stringify(now[field]??null)}));
  }
  return {...item,current,diff,moderation};
}
async function pending(id:string,status:string,actorRef:string,database:D1Database,requestId?:string|null){
  if(status==="PENDING_REVIEW")return;
  if(status!=="SUBMITTED"&&status!=="QUARANTINED")throw new PartnerEventError("Tento návrh už nie je možné rozhodnúť.",409);
  await applyAtomicModerationTransition(database,{
    id,
    expectedStatus:status as FoundationSubmissionStatus,
    toStatus:"PENDING_REVIEW",
    actorType:"ADMIN",
    actorRef,
    requestId:requestId??null,
    eventId:crypto.randomUUID(),
    changedFieldsJson:JSON.stringify(["status"]),
    now:new Date().toISOString(),
  });
}
function terminal(database:D1Database,id:string,status:"APPROVED"|"REJECTED",nowIso:string,actorRef:string,resolution:string|null,eventSql:string|null){
  return database.prepare(`UPDATE partner_event_submission_metadata SET dedupe_active=0,resolution_type=?1,resolved_event_id=${eventSql??"resolved_event_id"} WHERE submission_id=?2 AND EXISTS(SELECT 1 FROM moderation_submissions WHERE id=?2 AND status=?3 AND updated_at=?4 AND reviewed_by=?5)`).bind(resolution,id,status,nowIso,actorRef);
}
function audit(database:D1Database,input:{id:string;accountId:string;action:"EVENT_CREATED"|"EVENT_LINKED_EXISTING"|"EVENT_CHANGE_APPROVED"|"EVENT_REJECTED";nowIso:string;actorRef:string;status:"APPROVED"|"REJECTED";metadata?:Record<string,unknown>}){
  return database.prepare(`INSERT INTO partner_audit_events(id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at)
    SELECT ?1,'ADMIN',?2,?3,'MODERATION_SUBMISSION',?4,?5,?6 WHERE EXISTS(SELECT 1 FROM moderation_submissions WHERE id=?4 AND status=?7 AND updated_at=?6 AND reviewed_by=?2)`)
    .bind(crypto.randomUUID(),input.actorRef,input.action,input.id,JSON.stringify(input.metadata??{}),input.nowIso,input.status);
}
function notification(database:D1Database,input:{id:string;accountId:string;type:"EVENT_CREATED"|"EVENT_LINKED_EXISTING"|"EVENT_CHANGE_APPROVED"|"EVENT_REJECTED";now:Date;nowIso:string;actorRef:string;status:"APPROVED"|"REJECTED"}){
  const expiresAt=new Date(input.now.getTime()+30*24*60*60*1000).toISOString();
  return database.prepare(`INSERT OR IGNORE INTO partner_notification_outbox(id,partner_account_id,notification_type,dedupe_key,status,encrypted_secret,expires_at,attempts,created_at,updated_at)
    SELECT ?1,?2,?3,?4,'PENDING',NULL,?5,0,?6,?6 WHERE EXISTS(SELECT 1 FROM moderation_submissions WHERE id=?7 AND status=?8 AND updated_at=?6 AND reviewed_by=?9)`)
    .bind(crypto.randomUUID(),input.accountId,input.type,`partner-event-${input.status.toLowerCase()}/${input.id}`,expiresAt,input.nowIso,input.id,input.status,input.actorRef);
}
async function uniqueSlug(title:string,database:D1Database,values:PartnerEventPatch){
  const base=slugifyArticleTitle(title)||"podujatie";
  for(let i=0;i<100;i++){
    const slug=i===0?base:`${base}-${i+1}`;
    try{normalizeManagedEventInput({...values,slug,status:"draft",cancelled:false,imageUrl:null,imageKey:null,seo:{}});}catch{continue;}
    const exists=await database.prepare("SELECT 1 found FROM managed_events WHERE slug=?1 LIMIT 1").bind(slug).first<{found:number}>();
    if(!exists)return slug;
  }
  throw new PartnerEventError("Nepodarilo sa vytvoriť jedinečnú adresu podujatia.",409);
}
function eventInsert(database:D1Database,input:{id:string;slug:string;values:PartnerEventPatch;actorRef:string;nowIso:string}){
  const v=input.values;
  return database.prepare(`INSERT INTO managed_events(slug,title,excerpt,event_type,status,start_date,start_time,end_date,end_time,venue,city,region,address,organizer,description,practical_info,website_url,registration_url,image_url,image_key,cancelled,seo_json,created_at,updated_at,published_at,created_by,updated_by)
    SELECT ?1,?2,?3,?4,'draft',?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,NULL,NULL,0,'{}',?18,?18,NULL,?19,?19
    WHERE EXISTS(SELECT 1 FROM moderation_submissions WHERE id=?20 AND status='APPROVED' AND updated_at=?18 AND reviewed_by=?19)`)
    .bind(input.slug,v.title,v.excerpt,v.eventType,v.startDate,v.startTime,v.endDate,v.endTime,v.venue,v.city,v.region,v.address,v.organizer,v.description,v.practicalInfo,v.websiteUrl,v.registrationUrl,input.nowIso,input.actorRef,input.id);
}
function resourceInsert(database:D1Database,resourceId:string,slug:string,nowIso:string){
  return database.prepare(`INSERT OR IGNORE INTO partner_resources(id,entity_type,managed_event_id,created_at,updated_at) SELECT ?1,'MANAGED_EVENT',id,?3,?3 FROM managed_events WHERE slug=?2`).bind(resourceId,slug,nowIso);
}
function membershipStatements(database:D1Database,input:{resourceId:string;accountId:string;actorRef:string;nowIso:string}){
  const membershipId=crypto.randomUUID();
  return [
    database.prepare(`INSERT INTO partner_audit_events(id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at)
      SELECT ?1,'ADMIN',?2,'MEMBERSHIP_CREATED','PARTNER_RESOURCE',?3,?4,?5 WHERE NOT EXISTS(SELECT 1 FROM partner_memberships WHERE account_id=?6 AND resource_id=?3 AND revoked_at IS NULL)`)
      .bind(crypto.randomUUID(),input.actorRef,input.resourceId,JSON.stringify({accountId:input.accountId,role:"OWNER"}),input.nowIso,input.accountId),
    database.prepare(`INSERT INTO partner_memberships(id,account_id,resource_id,role,created_at,created_by,updated_at)
      SELECT ?1,?2,?3,'OWNER',?4,?5,?4 WHERE NOT EXISTS(SELECT 1 FROM partner_memberships WHERE account_id=?2 AND resource_id=?3 AND revoked_at IS NULL)`)
      .bind(membershipId,input.accountId,input.resourceId,input.nowIso,input.actorRef),
    database.prepare(`INSERT INTO partner_audit_events(id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at)
      SELECT ?1,'ADMIN',?2,'MEMBERSHIP_ROLE_CHANGED','PARTNER_RESOURCE',?3,?4,?5 WHERE EXISTS(SELECT 1 FROM partner_memberships WHERE account_id=?6 AND resource_id=?3 AND revoked_at IS NULL AND role<>'OWNER')`)
      .bind(crypto.randomUUID(),input.actorRef,input.resourceId,JSON.stringify({accountId:input.accountId,role:"OWNER"}),input.nowIso,input.accountId),
    database.prepare("UPDATE partner_memberships SET role='OWNER',updated_at=?1 WHERE account_id=?2 AND resource_id=?3 AND revoked_at IS NULL AND role<>'OWNER'").bind(input.nowIso,input.accountId,input.resourceId),
  ];
}

function publicEventTypePaths(eventTypes:string[]){
  const paths=new Set<string>();
  for(const eventType of eventTypes){
    if(eventType==="Výstava")paths.add("/podujatia/vystavy");
    if(eventType==="Preteky")paths.add("/podujatia/preteky");
    if(eventType==="Seminár"||eventType==="Tréning")paths.add("/podujatia/seminare");
  }
  return [...paths];
}
async function sideEffects(input:{eventId:number;slug:string;published:boolean;locationChanged:boolean;invalidatePublic:boolean;eventTypes?:string[];publicOrigin?:string;workerVersionId?:string}){
  if(input.locationChanged)await syncGeoPointAfterSourceChange("MANAGED_EVENT",input.eventId).catch(error=>console.warn("Partner event GEO sync failed",{eventId:input.eventId,error:String(error)}));
  if(input.published&&input.invalidatePublic&&input.publicOrigin){
    const version=input.workerVersionId??(env as unknown as Bindings).CF_VERSION_METADATA?.id;
    const paths=[`/podujatia/${input.slug}`,"/podujatia","/podujatia/kalendar","/",...publicEventTypePaths(input.eventTypes??[])];
    await Promise.all(paths.map(path=>
      invalidateVersionedPublicHtmlCacheUrl(new URL(path,input.publicOrigin!),version)
        .catch(error=>{console.warn("Partner event public cache invalidation failed",{eventId:input.eventId,path,error:String(error)});return false;})
    ));
  }
}

export async function createPartnerEventAdmin(input:{id:string;adminEmail:string;requestId?:string|null;database?:D1Database;now?:Date;publicOrigin?:string;workerVersionId?:string}){
  const database=db(input.database);let row=await raw(input.id,database);if(!row)throw new PartnerEventError("Návrh sa nenašiel.",404);if(row.operation!=="CREATE")throw new PartnerEventError("Táto akcia je iba pre nové podujatie.",409);
  const actorRef=await adminAuditActorRef(input.adminEmail);await pending(input.id,row.status,actorRef,database,input.requestId);row=await raw(input.id,database);if(!row||row.status!=="PENDING_REVIEW")throw new PartnerEventError("Stav návrhu sa zmenil.",409);
  const values=normalizePartnerEventCreate(json(row.proposedPatchJson,{}));const scan=await scanPartnerEventDuplicates(values,database);void scan;
  const slug=await uniqueSlug(String(values.title),database,values),resourceId=crypto.randomUUID(),now=input.now??new Date(),nowIso=now.toISOString();
  await applyAtomicModerationTransition(database,{id:input.id,expectedStatus:"PENDING_REVIEW",toStatus:"APPROVED",actorType:"ADMIN",actorRef,requestId:input.requestId??null,eventId:crypto.randomUUID(),changedFieldsJson:JSON.stringify(Object.keys(values)),now:nowIso,extraStatements:[
    eventInsert(database,{id:input.id,slug,values,actorRef,nowIso}),
    resourceInsert(database,resourceId,slug,nowIso),
    ...membershipStatements(database,{resourceId,accountId:row.accountId,actorRef,nowIso}),
    terminal(database,input.id,"APPROVED",nowIso,actorRef,"CREATED_NEW",`(SELECT id FROM managed_events WHERE slug='${slug.replaceAll("'","''")}' LIMIT 1)`),
    audit(database,{id:input.id,accountId:row.accountId,action:"EVENT_CREATED",nowIso,actorRef,status:"APPROVED",metadata:{resourceId}}),
    notification(database,{id:input.id,accountId:row.accountId,type:"EVENT_CREATED",now,nowIso,actorRef,status:"APPROVED"}),
  ]});
  const event=await database.prepare("SELECT id,slug FROM managed_events WHERE slug=?1 LIMIT 1").bind(slug).first<{id:number;slug:string}>();if(!event)throw new PartnerEventError("Canonical podujatie po schválení chýba.",500);
  await sideEffects({eventId:event.id,slug:event.slug,published:false,locationChanged:true,invalidatePublic:false,publicOrigin:input.publicOrigin,workerVersionId:input.workerVersionId});
  return getPartnerEventAdmin(input.id,{database});
}

export async function linkPartnerEventAdmin(input:{id:string;canonicalId:number;adminEmail:string;requestId?:string|null;database?:D1Database;now?:Date}){
  const database=db(input.database);let row=await raw(input.id,database);if(!row)throw new PartnerEventError("Návrh sa nenašiel.",404);if(row.operation!=="CREATE")throw new PartnerEventError("Prepojenie je iba pre nový návrh.",409);
  const existing=await currentEvent(input.canonicalId,database);if(!existing)throw new PartnerEventError("Existujúce podujatie sa nenašlo.",404);
  const actorRef=await adminAuditActorRef(input.adminEmail);await pending(input.id,row.status,actorRef,database,input.requestId);row=await raw(input.id,database);if(!row||row.status!=="PENDING_REVIEW")throw new PartnerEventError("Stav návrhu sa zmenil.",409);
  const now=input.now??new Date(),nowIso=now.toISOString(),resourceId=crypto.randomUUID();
  await applyAtomicModerationTransition(database,{id:input.id,expectedStatus:"PENDING_REVIEW",toStatus:"APPROVED",actorType:"ADMIN",actorRef,requestId:input.requestId??null,eventId:crypto.randomUUID(),changedFieldsJson:"[]",now:nowIso,extraStatements:[
    database.prepare(`INSERT OR IGNORE INTO partner_resources(id,entity_type,managed_event_id,created_at,updated_at) VALUES(?1,'MANAGED_EVENT',?2,?3,?3)`).bind(resourceId,input.canonicalId,nowIso),
    database.prepare(`INSERT INTO partner_audit_events(id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at)
      SELECT ?1,'ADMIN',?2,'MEMBERSHIP_CREATED','PARTNER_RESOURCE',r.id,?3,?4 FROM partner_resources r
      WHERE r.managed_event_id=?5 AND NOT EXISTS(SELECT 1 FROM partner_memberships m WHERE m.account_id=?6 AND m.resource_id=r.id AND m.revoked_at IS NULL)`)
      .bind(crypto.randomUUID(),actorRef,JSON.stringify({accountId:row.accountId,role:"OWNER"}),nowIso,input.canonicalId,row.accountId),
    database.prepare(`INSERT INTO partner_memberships(id,account_id,resource_id,role,created_at,created_by,updated_at)
      SELECT ?1,?2,r.id,'OWNER',?3,?4,?3 FROM partner_resources r WHERE r.managed_event_id=?5
      AND NOT EXISTS(SELECT 1 FROM partner_memberships m WHERE m.account_id=?2 AND m.resource_id=r.id AND m.revoked_at IS NULL)`)
      .bind(crypto.randomUUID(),row.accountId,nowIso,actorRef,input.canonicalId),
    database.prepare(`INSERT INTO partner_audit_events(id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at)
      SELECT ?1,'ADMIN',?2,'MEMBERSHIP_ROLE_CHANGED','PARTNER_RESOURCE',r.id,?3,?4
      FROM partner_resources r
      JOIN partner_memberships m ON m.resource_id=r.id AND m.account_id=?5 AND m.revoked_at IS NULL
      WHERE r.managed_event_id=?6 AND m.role<>'OWNER'`)
      .bind(crypto.randomUUID(),actorRef,JSON.stringify({accountId:row.accountId,role:"OWNER"}),nowIso,row.accountId,input.canonicalId),
    database.prepare(`UPDATE partner_memberships SET role='OWNER',updated_at=?1 WHERE account_id=?2 AND revoked_at IS NULL AND role<>'OWNER'
      AND resource_id=(SELECT id FROM partner_resources WHERE managed_event_id=?3 LIMIT 1)`).bind(nowIso,row.accountId,input.canonicalId),
    database.prepare(`UPDATE partner_event_submission_metadata SET dedupe_active=0,resolution_type='LINKED_EXISTING',resolved_event_id=?1,partner_resource_id=(SELECT id FROM partner_resources WHERE managed_event_id=?1 LIMIT 1)
      WHERE submission_id=?2 AND EXISTS(SELECT 1 FROM moderation_submissions WHERE id=?2 AND status='APPROVED' AND updated_at=?3 AND reviewed_by=?4)`).bind(input.canonicalId,input.id,nowIso,actorRef),
    audit(database,{id:input.id,accountId:row.accountId,action:"EVENT_LINKED_EXISTING",nowIso,actorRef,status:"APPROVED",metadata:{eventId:input.canonicalId}}),
    notification(database,{id:input.id,accountId:row.accountId,type:"EVENT_LINKED_EXISTING",now,nowIso,actorRef,status:"APPROVED"}),
  ]});
  return getPartnerEventAdmin(input.id,{database});
}

const COLUMN:Record<string,string>={title:"title",excerpt:"excerpt",eventType:"event_type",startDate:"start_date",startTime:"start_time",endDate:"end_date",endTime:"end_time",venue:"venue",city:"city",region:"region",address:"address",organizer:"organizer",description:"description",practicalInfo:"practical_info",websiteUrl:"website_url",registrationUrl:"registration_url",cancelled:"cancelled"};
function updateStatement(database:D1Database,eventId:number,patch:PartnerEventPatch,actorRef:string,nowIso:string,submissionId:string){
  const keys=Object.keys(patch);const sets=keys.map((key,i)=>`${COLUMN[key]}=?${i+1}`);const values=keys.map(key=>key==="cancelled"?(patch[key]?1:0):patch[key]);
  return database.prepare(`UPDATE managed_events SET ${sets.join(",")},updated_at=?${keys.length+1},updated_by=?${keys.length+2} WHERE id=?${keys.length+3}
    AND EXISTS(SELECT 1 FROM moderation_submissions WHERE id=?${keys.length+4} AND status='APPROVED' AND updated_at=?${keys.length+1} AND reviewed_by=?${keys.length+2})`)
    .bind(...values,nowIso,actorRef,eventId,submissionId);
}
export async function approvePartnerEventUpdateAdmin(input:{id:string;adminEmail:string;requestId?:string|null;database?:D1Database;now?:Date;publicOrigin?:string;workerVersionId?:string}){
  const database=db(input.database);let row=await raw(input.id,database);if(!row)throw new PartnerEventError("Návrh sa nenašiel.",404);if(row.operation!=="UPDATE"||!row.subjectId)throw new PartnerEventError("Táto akcia je iba pre úpravu podujatia.",409);
  const actorRef=await adminAuditActorRef(input.adminEmail);await pending(input.id,row.status,actorRef,database,input.requestId);row=await raw(input.id,database);if(!row||row.status!=="PENDING_REVIEW")throw new PartnerEventError("Stav návrhu sa zmenil.",409);
  const eventId=Number(row.subjectId),current=await currentEvent(eventId,database);if(!current)throw new PartnerEventError("Canonical podujatie sa nenašlo.",404);
  const base=json<PartnerEventPatch>(row.baseSnapshotJson,{}),patch=normalizePartnerEventUpdate(json(row.proposedPatchJson,{}),base),changed=Object.keys(patch);
  const now=input.now??new Date(),nowIso=now.toISOString();
  await applyAtomicModerationTransition(database,{id:input.id,expectedStatus:"PENDING_REVIEW",toStatus:"APPROVED",actorType:"ADMIN",actorRef,requestId:input.requestId??null,eventId:crypto.randomUUID(),changedFieldsJson:JSON.stringify(changed),now:nowIso,extraStatements:[
    updateStatement(database,eventId,patch,actorRef,nowIso,input.id),
    database.prepare(`UPDATE event_notion_sync SET inbound_locked_at=?1,inbound_lock_reason='PARTNER_MODERATION',updated_at=?1
      WHERE event_id=?2 AND EXISTS(SELECT 1 FROM moderation_submissions WHERE id=?3 AND status='APPROVED' AND updated_at=?1 AND reviewed_by=?4)`)
      .bind(nowIso,eventId,input.id,actorRef),
    terminal(database,input.id,"APPROVED",nowIso,actorRef,"UPDATED",String(eventId)),
    audit(database,{id:input.id,accountId:row.accountId,action:"EVENT_CHANGE_APPROVED",nowIso,actorRef,status:"APPROVED",metadata:{eventId,changedFieldCount:changed.length}}),
    notification(database,{id:input.id,accountId:row.accountId,type:"EVENT_CHANGE_APPROVED",now,nowIso,actorRef,status:"APPROVED"}),
  ]});
  const locationChanged=changed.some(field=>["venue","city","region","address"].includes(field));
  await sideEffects({eventId,slug:current.slug,published:current.status==="published",locationChanged,invalidatePublic:true,eventTypes:[current.eventType,typeof patch.eventType==="string"?patch.eventType:current.eventType],publicOrigin:input.publicOrigin,workerVersionId:input.workerVersionId});
  return getPartnerEventAdmin(input.id,{database});
}

export const partnerEventRejectionReasons=["INCORRECT_INFORMATION","DUPLICATE","POLICY_CONFLICT","OTHER"] as const;
export async function rejectPartnerEventAdmin(input:{id:string;reasonCode:unknown;adminEmail:string;requestId?:string|null;database?:D1Database;now?:Date}){
  if(typeof input.reasonCode!=="string"||!(partnerEventRejectionReasons as readonly string[]).includes(input.reasonCode))throw new PartnerEventError("Vyberte platný dôvod zamietnutia.");
  const database=db(input.database);let row=await raw(input.id,database);if(!row)throw new PartnerEventError("Návrh sa nenašiel.",404);
  const actorRef=await adminAuditActorRef(input.adminEmail);await pending(input.id,row.status,actorRef,database,input.requestId);row=await raw(input.id,database);if(!row||row.status!=="PENDING_REVIEW")throw new PartnerEventError("Stav návrhu sa zmenil.",409);
  const now=input.now??new Date(),nowIso=now.toISOString(),changed=Object.keys(json<PartnerEventPatch>(row.proposedPatchJson,{}));
  await applyAtomicModerationTransition(database,{id:input.id,expectedStatus:"PENDING_REVIEW",toStatus:"REJECTED",actorType:"ADMIN",actorRef,reasonCode:input.reasonCode,requestId:input.requestId??null,eventId:crypto.randomUUID(),changedFieldsJson:JSON.stringify(changed),now:nowIso,extraStatements:[
    terminal(database,input.id,"REJECTED",nowIso,actorRef,null,null),
    audit(database,{id:input.id,accountId:row.accountId,action:"EVENT_REJECTED",nowIso,actorRef,status:"REJECTED",metadata:{operation:row.operation}}),
    notification(database,{id:input.id,accountId:row.accountId,type:"EVENT_REJECTED",now,nowIso,actorRef,status:"REJECTED"}),
  ]});
  return getPartnerEventAdmin(input.id,{database});
}
