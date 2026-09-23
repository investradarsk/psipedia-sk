import { env } from "cloudflare:workers";
import { bratislavaDateKey, eventTypes, slovakRegions } from "@/lib/events";
import { normalizeManagedEventInput, type ManagedEventInput } from "@/lib/event-store";
import { getPartnerDatabase } from "@/lib/partner-auth-store";
import { requirePartnerPermission, type PartnerRole } from "@/lib/partner-platform";
import {
  enforcePartnerEventCreateRateLimit,
  enforcePartnerEventUpdateRateLimit,
} from "@/lib/partner-security";
import {
  applyAtomicModerationTransition,
  canTransitionModerationSubmission,
  isFoundationSubmissionStatus,
  type FoundationSubmissionStatus,
} from "@/lib/moderation-transition";

type RuntimeBindings={DB?:D1Database;PII_HASH_KEY?:string};
export type PartnerEventOperation="CREATE"|"UPDATE";
export type PartnerEventDuplicateConfidence="NONE"|"MEDIUM"|"HIGH";
export type PartnerEventValue=string|boolean|null;
export type PartnerEventPatch=Record<string,PartnerEventValue>;

export class PartnerEventError extends Error{
  readonly status:number;
  readonly code?:string;
  readonly details?:unknown;
  constructor(message:string,status=400,code?:string,details?:unknown){super(message);this.status=status;this.code=code;this.details=details;}
}

export const partnerEventFields=[
  {key:"title",label:"Názov",kind:"text",required:true},
  {key:"excerpt",label:"Krátky popis",kind:"textarea",required:true},
  {key:"eventType",label:"Typ podujatia",kind:"select",required:true,options:eventTypes},
  {key:"startDate",label:"Dátum začiatku",kind:"date",required:true},
  {key:"startTime",label:"Čas začiatku",kind:"time"},
  {key:"endDate",label:"Dátum konca",kind:"date"},
  {key:"endTime",label:"Čas konca",kind:"time"},
  {key:"venue",label:"Miesto",kind:"text"},
  {key:"city",label:"Mesto / Online",kind:"text",required:true},
  {key:"region",label:"Kraj",kind:"select",required:true,options:slovakRegions},
  {key:"address",label:"Adresa",kind:"text"},
  {key:"organizer",label:"Organizátor",kind:"text",required:true},
  {key:"description",label:"Popis",kind:"textarea",required:true},
  {key:"practicalInfo",label:"Praktické informácie",kind:"textarea"},
  {key:"websiteUrl",label:"Web",kind:"url"},
  {key:"registrationUrl",label:"Registrácia",kind:"url"},
] as const;
export type PartnerEventField=(typeof partnerEventFields)[number];

const CREATE_KEYS=new Set(partnerEventFields.map(field=>field.key));
const UPDATE_KEYS=new Set<string>([...CREATE_KEYS,"cancelled"]);
const SYSTEM_KEYS=new Set(["id","slug","status","publishedAt","published_at","createdBy","created_by","updatedBy","updated_by","imageUrl","imageKey","seo","seoJson","seo_json","latitude","longitude","lat","lng"]);

function database(input?:D1Database){return getPartnerDatabase(input??(env as unknown as RuntimeBindings).DB);}
function object(value:unknown){
  if(!value||typeof value!=="object"||Array.isArray(value))throw new PartnerEventError("Údaje podujatia nie sú platné.");
  return value as Record<string,unknown>;
}
function strictKeys(raw:Record<string,unknown>,allowed:Set<string>){
  for(const key of Object.keys(raw)){
    if(SYSTEM_KEYS.has(key)||!allowed.has(key))throw new PartnerEventError(`Pole ${key} nie je možné v Partner podujatí nastavovať.`);
  }
}
function eventInput(raw:Record<string,unknown>,base?:Record<string,PartnerEventValue>):ManagedEventInput{
  const merged={...(base??{}),...raw};
  return {
    title:typeof merged.title==="string"?merged.title:"",
    excerpt:typeof merged.excerpt==="string"?merged.excerpt:"",
    eventType:typeof merged.eventType==="string"?merged.eventType:"",
    startDate:typeof merged.startDate==="string"?merged.startDate:"",
    startTime:typeof merged.startTime==="string"?merged.startTime:"",
    endDate:typeof merged.endDate==="string"?merged.endDate:null,
    endTime:typeof merged.endTime==="string"?merged.endTime:null,
    venue:typeof merged.venue==="string"?merged.venue:"",
    city:typeof merged.city==="string"?merged.city:"",
    region:typeof merged.region==="string"?merged.region:"",
    address:typeof merged.address==="string"?merged.address:"",
    organizer:typeof merged.organizer==="string"?merged.organizer:"",
    description:typeof merged.description==="string"?merged.description:"",
    practicalInfo:typeof merged.practicalInfo==="string"?merged.practicalInfo:"",
    websiteUrl:typeof merged.websiteUrl==="string"?merged.websiteUrl:null,
    registrationUrl:typeof merged.registrationUrl==="string"?merged.registrationUrl:null,
    cancelled:merged.cancelled===true,
    slug:typeof merged.title==="string"?merged.title:"",
    status:"draft",
    imageUrl:null,
    imageKey:null,
    seo:{},
  };
}
function editable(normalized:ReturnType<typeof normalizeManagedEventInput>):PartnerEventPatch{
  return {
    title:normalized.title,excerpt:normalized.excerpt,eventType:normalized.eventType,
    startDate:normalized.startDate,startTime:normalized.startTime,endDate:normalized.endDate,endTime:normalized.endTime,
    venue:normalized.venue,city:normalized.city,region:normalized.region,address:normalized.address,
    organizer:normalized.organizer,description:normalized.description,practicalInfo:normalized.practicalInfo,
    websiteUrl:normalized.websiteUrl,registrationUrl:normalized.registrationUrl,cancelled:normalized.cancelled,
  };
}
function assertNotPast(values:PartnerEventPatch){
  const end=typeof values.endDate==="string"&&values.endDate?values.endDate:String(values.startDate??"");
  if(end<bratislavaDateKey())throw new PartnerEventError("Partner self-service nepovoľuje vytvoriť podujatie, ktoré sa už celé skončilo.");
}
export function normalizePartnerEventCreate(raw:unknown){
  const source=object(raw);strictKeys(source,CREATE_KEYS);
  const values=editable(normalizeManagedEventInput(eventInput(source)));
  delete values.cancelled;assertNotPast(values);
  return values;
}
export function normalizePartnerEventUpdate(raw:unknown,current:PartnerEventPatch){
  const source=object(raw);strictKeys(source,UPDATE_KEYS);
  if(!Object.keys(source).length)throw new PartnerEventError("Nezmenili ste žiadny údaj.");
  const normalized=editable(normalizeManagedEventInput(eventInput(source,current)));
  const patch:PartnerEventPatch={};
  for(const key of Object.keys(source)){
    const next=normalized[key],before=current[key];
    if(JSON.stringify(next)!==JSON.stringify(before))patch[key]=next;
  }
  if(!Object.keys(patch).length)throw new PartnerEventError("Nezmenili ste žiadny údaj.");
  return patch;
}
function text(value:unknown){
  return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
}
function url(value:unknown){
  const clean=String(value??"").trim();if(!clean)return "";
  try{const parsed=new URL(clean);return (parsed.hostname.replace(/^www\./,"")+parsed.pathname.replace(/\/$/,"")).toLowerCase();}catch{return "";}
}
async function digest(value:string){
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("");
}
export async function partnerEventIdentityFingerprint(values:PartnerEventPatch){
  return digest([text(values.title),values.startDate,text(values.city),url(values.registrationUrl)].join("|"));
}

type CandidateRow={id:number;title:string;eventType:string;startDate:string;city:string;venue:string;organizer:string;registrationUrl:string|null;slug:string;status:string};
export type PartnerEventDuplicateCandidate=CandidateRow&{confidence:Exclude<PartnerEventDuplicateConfidence,"NONE">;reasons:string[]};
function scoreCandidate(values:PartnerEventPatch,row:CandidateRow):PartnerEventDuplicateCandidate|null{
  const reasons:string[]=[];
  const sameRegistration=Boolean(url(values.registrationUrl)&&url(values.registrationUrl)===url(row.registrationUrl));
  const sameTitle=text(values.title)===text(row.title);
  const sameDate=String(values.startDate)===row.startDate;
  const sameCity=Boolean(text(values.city)&&text(values.city)===text(row.city));
  const sameVenue=Boolean(text(values.venue)&&text(values.venue)===text(row.venue));
  const sameOrganizer=Boolean(text(values.organizer)&&text(values.organizer)===text(row.organizer));
  if(sameRegistration)reasons.push("Rovnaký registračný odkaz");
  if(sameTitle&&sameDate&&sameCity)reasons.push("Rovnaký názov, dátum a mesto");
  if(sameTitle&&sameDate)reasons.push("Rovnaký názov a dátum");
  if(sameDate&&sameVenue&&sameOrganizer)reasons.push("Rovnaký dátum, miesto a organizátor");
  const confidence:PartnerEventDuplicateConfidence=sameRegistration||sameTitle&&sameDate&&sameCity?"HIGH":sameTitle&&sameDate||sameDate&&sameVenue&&sameOrganizer?"MEDIUM":"NONE";
  return confidence==="NONE"?null:{...row,confidence,reasons};
}
export async function scanPartnerEventDuplicates(values:PartnerEventPatch,dbInput?:D1Database){
  const db=database(dbInput);
  const rows=(await db.prepare(`
    SELECT id,title,event_type eventType,start_date startDate,city,venue,organizer,registration_url registrationUrl,slug,status
    FROM managed_events
    WHERE start_date=?1 OR registration_url=?2
    ORDER BY start_date ASC,id ASC LIMIT 100
  `).bind(String(values.startDate),typeof values.registrationUrl==="string"&&values.registrationUrl?values.registrationUrl:null).all<CandidateRow>()).results;
  const candidates=rows.map(row=>scoreCandidate(values,row)).filter((row):row is PartnerEventDuplicateCandidate=>Boolean(row));
  candidates.sort((a,b)=>(a.confidence===b.confidence?0:a.confidence==="HIGH"?-1:1)||a.id-b.id);
  return {confidence:(candidates[0]?.confidence??"NONE") as PartnerEventDuplicateConfidence,candidates};
}

type EventResourceRow={resourceId:string;canonicalId:number;role:PartnerRole;slug:string;status:string;updatedAt:string;title:string;excerpt:string;eventType:string;startDate:string;startTime:string;endDate:string|null;endTime:string|null;venue:string;city:string;region:string;address:string;organizer:string;description:string;practicalInfo:string;websiteUrl:string|null;registrationUrl:string|null;cancelled:number};
async function resourceRow(resourceId:string,db:D1Database){
  return db.prepare(`
    SELECT r.id resourceId,e.id canonicalId,m.role,e.slug,e.status,e.updated_at updatedAt,e.title,e.excerpt,e.event_type eventType,
      e.start_date startDate,e.start_time startTime,e.end_date endDate,e.end_time endTime,e.venue,e.city,e.region,e.address,e.organizer,
      e.description,e.practical_info practicalInfo,e.website_url websiteUrl,e.registration_url registrationUrl,e.cancelled
    FROM partner_resources r
    JOIN managed_events e ON e.id=r.managed_event_id
    LEFT JOIN partner_memberships m ON m.resource_id=r.id AND m.revoked_at IS NULL
    WHERE r.id=?1 AND r.entity_type='MANAGED_EVENT' LIMIT 1
  `).bind(resourceId).first<EventResourceRow>();
}
function valuesFromRow(row:EventResourceRow):PartnerEventPatch{
  return {title:row.title,excerpt:row.excerpt,eventType:row.eventType,startDate:row.startDate,startTime:row.startTime,endDate:row.endDate,endTime:row.endTime,venue:row.venue,city:row.city,region:row.region,address:row.address,organizer:row.organizer,description:row.description,practicalInfo:row.practicalInfo,websiteUrl:row.websiteUrl,registrationUrl:row.registrationUrl,cancelled:Boolean(row.cancelled)};
}
async function revision(updatedAt:string,values:PartnerEventPatch){return digest(updatedAt+"\n"+JSON.stringify(values));}
export async function getPartnerEventEditor(accountId:string,resourceId:string,dbInput?:D1Database){
  const db=database(dbInput);
  const membership=await requirePartnerPermission(accountId,resourceId,"EVENT_SUBMIT",db);
  const row=await resourceRow(resourceId,db);
  if(!row)throw new PartnerEventError("Podujatie sa nenašlo alebo resource nie je MANAGED_EVENT.",404);
  const values=valuesFromRow(row);
  return {resource:{resourceId,canonicalId:row.canonicalId,role:membership.role as PartnerRole,title:row.title,status:row.status,slug:row.slug,publicHref:row.status==="published"?`/podujatia/${row.slug}`:null},values,baseUpdatedAt:row.updatedAt,baseRevision:await revision(row.updatedAt,values)};
}

function hashKey(input?:string){const value=input??(env as unknown as RuntimeBindings).PII_HASH_KEY?.trim();if(!value)throw new PartnerEventError("Bezpečnostná konfigurácia nie je dostupná.",503);return value;}
function expiry(now:Date){return new Date(now.getTime()+30*24*60*60*1000).toISOString();}
function duplicateFlags(scan:Awaited<ReturnType<typeof scanPartnerEventDuplicates>>){return scan.confidence==="HIGH"?["LIKELY_DUPLICATE"]:scan.confidence==="MEDIUM"?["POSSIBLE_DUPLICATE"]:[];}

export async function submitPartnerEventCreate(input:{accountId:string;event:unknown;confirmDuplicate?:boolean;database?:D1Database;hashKey?:string;now?:Date}){
  const db=database(input.database),values=normalizePartnerEventCreate(input.event);
  const fingerprint=await partnerEventIdentityFingerprint(values);
  const scan=await scanPartnerEventDuplicates(values,db);
  if(scan.confidence==="HIGH"&&input.confirmDuplicate!==true)throw new PartnerEventError("Podobné podujatie už môže na Psipedii existovať.",409,"DUPLICATE_CONFIRMATION_REQUIRED",{scan});
  await enforcePartnerEventCreateRateLimit({database:db,accountId:input.accountId,identityFingerprint:fingerprint,hashKey:hashKey(input.hashKey),now:input.now});
  const existing=await db.prepare(`SELECT m.submission_id id FROM partner_event_submission_metadata m JOIN moderation_submissions s ON s.id=m.submission_id
    WHERE m.partner_account_id=?1 AND m.dedupe_key=?2 AND m.dedupe_active=1 AND s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') LIMIT 1`).bind(input.accountId,`CREATE:${fingerprint}`).first<{id:string}>();
  if(existing)throw new PartnerEventError("Rovnaký návrh podujatia už čaká na spracovanie.",409);
  const now=input.now??new Date(),nowIso=now.toISOString(),id=crypto.randomUUID(),top=scan.candidates[0]??null;
  const fields=Object.keys(values).filter(key=>key!=="cancelled");
  try{
    await db.batch([
      db.prepare(`INSERT INTO moderation_submissions(id,resource_type,subject_id,operation,status,submitter_type,submitter_ref,proposed_patch_json,risk_flags_json,duplicate_resource_type,duplicate_subject_id,created_at,updated_at)
        VALUES(?1,'MANAGED_EVENT',NULL,'CREATE','SUBMITTED','PARTNER_ACCOUNT',?2,?3,?4,?5,?6,?7,?7)`).bind(id,input.accountId,JSON.stringify(values),JSON.stringify(duplicateFlags(scan)),top?"MANAGED_EVENT":null,top?String(top.id):null,nowIso),
      db.prepare(`INSERT INTO partner_event_submission_metadata(submission_id,partner_account_id,partner_resource_id,operation,base_updated_at,base_snapshot_json,changed_field_count,dedupe_key,dedupe_active,duplicate_confidence,duplicate_candidate_id,duplicate_reasons_json,created_at)
        VALUES(?1,?2,NULL,'CREATE',NULL,'{}',?3,?4,1,?5,?6,?7,?8)`).bind(id,input.accountId,fields.length,`CREATE:${fingerprint}`,scan.confidence,top?.id??null,JSON.stringify(top?.reasons??[]),nowIso),
      db.prepare(`INSERT INTO moderation_events(id,submission_id,resource_type,subject_id,action,actor_type,actor_ref,from_status,to_status,changed_fields_json,created_at)
        VALUES(?1,?2,'MANAGED_EVENT',NULL,'SUBMISSION_CREATED','PARTNER',?3,NULL,'SUBMITTED',?4,?5)`).bind(crypto.randomUUID(),id,input.accountId,JSON.stringify(fields),nowIso),
      db.prepare(`INSERT INTO partner_audit_events(id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at)
        VALUES(?1,'PARTNER',?2,'EVENT_SUBMITTED','MODERATION_SUBMISSION',?3,?4,?5)`).bind(crypto.randomUUID(),`partner:${input.accountId}`,id,JSON.stringify({operation:"CREATE",duplicateConfidence:scan.confidence}),nowIso),
      db.prepare(`INSERT OR IGNORE INTO partner_notification_outbox(id,partner_account_id,notification_type,dedupe_key,status,encrypted_secret,expires_at,attempts,created_at,updated_at)
        VALUES(?1,?2,'EVENT_SUBMITTED',?3,'PENDING',NULL,?4,0,?5,?5)`).bind(crypto.randomUUID(),input.accountId,`partner-event-submitted/${id}`,expiry(now),nowIso),
    ]);
  }catch(error){
    if(/partner_event_submission_active_dedupe_unique|UNIQUE constraint failed/i.test(String(error)))throw new PartnerEventError("Rovnaký návrh podujatia už čaká na spracovanie.",409);
    throw error;
  }
  return {id,operation:"CREATE" as const,status:"SUBMITTED" as const,title:String(values.title),duplicateConfidence:scan.confidence};
}

export async function submitPartnerEventUpdate(input:{accountId:string;resourceId:string;baseRevision:unknown;patch:unknown;database?:D1Database;hashKey?:string;now?:Date}){
  const db=database(input.database);
  const editor=await getPartnerEventEditor(input.accountId,input.resourceId,db);
  if(typeof input.baseRevision!=="string"||input.baseRevision!==editor.baseRevision)throw new PartnerEventError("Podujatie sa medzitým zmenilo. Obnovte stránku a skontrolujte aktuálne údaje.",409);
  const patch=normalizePartnerEventUpdate(input.patch,editor.values);
  await enforcePartnerEventUpdateRateLimit({database:db,accountId:input.accountId,resourceId:input.resourceId,hashKey:hashKey(input.hashKey),now:input.now});
  const key=`UPDATE:${input.resourceId}`;
  const existing=await db.prepare(`SELECT m.submission_id id FROM partner_event_submission_metadata m JOIN moderation_submissions s ON s.id=m.submission_id
    WHERE m.partner_account_id=?1 AND m.dedupe_key=?2 AND m.dedupe_active=1 AND s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') LIMIT 1`).bind(input.accountId,key).first<{id:string}>();
  if(existing)throw new PartnerEventError("Pre toto podujatie už máte návrh, ktorý čaká na spracovanie.",409);
  const riskFlags:string[]=[];const changed=Object.keys(patch);
  if(changed.some(key=>["startDate","startTime","endDate","endTime"].includes(key)))riskFlags.push("DATE_CHANGE");
  if(changed.some(key=>["venue","city","region","address"].includes(key)))riskFlags.push("LOCATION_CHANGE");
  if(changed.includes("cancelled"))riskFlags.push("CANCELLATION_CHANGE");
  const now=input.now??new Date(),nowIso=now.toISOString(),id=crypto.randomUUID();
  try{
    await db.batch([
      db.prepare(`INSERT INTO moderation_submissions(id,resource_type,subject_id,operation,status,submitter_type,submitter_ref,proposed_patch_json,risk_flags_json,created_at,updated_at)
        VALUES(?1,'MANAGED_EVENT',?2,'UPDATE','SUBMITTED','PARTNER_ACCOUNT',?3,?4,?5,?6,?6)`).bind(id,String(editor.resource.canonicalId),input.accountId,JSON.stringify(patch),JSON.stringify(riskFlags),nowIso),
      db.prepare(`INSERT INTO partner_event_submission_metadata(submission_id,partner_account_id,partner_resource_id,operation,base_updated_at,base_snapshot_json,changed_field_count,dedupe_key,dedupe_active,duplicate_confidence,duplicate_reasons_json,created_at)
        VALUES(?1,?2,?3,'UPDATE',?4,?5,?6,?7,1,'NONE','[]',?8)`).bind(id,input.accountId,input.resourceId,editor.baseUpdatedAt,JSON.stringify(editor.values),changed.length,key,nowIso),
      db.prepare(`INSERT INTO moderation_events(id,submission_id,resource_type,subject_id,action,actor_type,actor_ref,from_status,to_status,changed_fields_json,created_at)
        VALUES(?1,?2,'MANAGED_EVENT',?3,'SUBMISSION_CREATED','PARTNER',?4,NULL,'SUBMITTED',?5,?6)`).bind(crypto.randomUUID(),id,String(editor.resource.canonicalId),input.accountId,JSON.stringify(changed),nowIso),
      db.prepare(`INSERT INTO partner_audit_events(id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at)
        VALUES(?1,'PARTNER',?2,'EVENT_CHANGE_SUBMITTED','MODERATION_SUBMISSION',?3,?4,?5)`).bind(crypto.randomUUID(),`partner:${input.accountId}`,id,JSON.stringify({resourceId:input.resourceId,changedFieldCount:changed.length}),nowIso),
      db.prepare(`INSERT OR IGNORE INTO partner_notification_outbox(id,partner_account_id,notification_type,dedupe_key,status,encrypted_secret,expires_at,attempts,created_at,updated_at)
        VALUES(?1,?2,'EVENT_SUBMITTED',?3,'PENDING',NULL,?4,0,?5,?5)`).bind(crypto.randomUUID(),input.accountId,`partner-event-change-submitted/${id}`,expiry(now),nowIso),
    ]);
  }catch(error){
    if(/partner_event_submission_active_dedupe_unique|UNIQUE constraint failed/i.test(String(error)))throw new PartnerEventError("Pre toto podujatie už máte návrh, ktorý čaká na spracovanie.",409);
    throw error;
  }
  return {id,operation:"UPDATE" as const,status:"SUBMITTED" as const,resourceId:input.resourceId,title:editor.resource.title,changedFields:changed};
}

function statusLabel(status:string){return status==="APPROVED"?"Schválené":status==="REJECTED"?"Zamietnuté":status==="WITHDRAWN"?"Zrušené":status==="QUARANTINED"?"Vyžaduje dodatočnú kontrolu":status==="PENDING_REVIEW"?"Kontroluje sa":"Čaká na kontrolu";}
function parse<T>(value:string,fallback:T):T{try{return JSON.parse(value) as T}catch{return fallback}}
export async function listPartnerEventSubmissions(accountId:string,dbInput?:D1Database){
  const rows=(await database(dbInput).prepare(`
    SELECT s.id,s.operation,s.status,s.proposed_patch_json proposedPatchJson,s.rejection_reason_code rejectionReason,s.created_at createdAt,s.updated_at updatedAt,
      m.partner_resource_id resourceId,m.resolution_type resolutionType,m.resolved_event_id resolvedEventId,
      COALESCE(e.title,re.title,'Podujatie') canonicalTitle,COALESCE(e.slug,re.slug) slug,COALESCE(e.status,re.status) canonicalStatus
    FROM partner_event_submission_metadata m
    JOIN moderation_submissions s ON s.id=m.submission_id
    LEFT JOIN partner_resources r ON r.id=m.partner_resource_id
    LEFT JOIN managed_events e ON e.id=r.managed_event_id
    LEFT JOIN managed_events re ON re.id=m.resolved_event_id
    WHERE m.partner_account_id=?1 ORDER BY s.created_at DESC LIMIT 200
  `).bind(accountId).all<{id:string;operation:PartnerEventOperation;status:string;proposedPatchJson:string;rejectionReason:string|null;createdAt:string;updatedAt:string;resourceId:string|null;resolutionType:string|null;resolvedEventId:number|null;canonicalTitle:string;slug:string|null;canonicalStatus:string|null}>()).results;
  return rows.map(row=>{const patch=parse<PartnerEventPatch>(row.proposedPatchJson,{});return {...row,title:typeof patch.title==="string"?patch.title:row.canonicalTitle,statusLabel:statusLabel(row.status),changedFields:Object.keys(patch),canWithdraw:["SUBMITTED","PENDING_REVIEW","QUARANTINED"].includes(row.status),canonicalHref:row.slug&&row.canonicalStatus==="published"?`/podujatia/${row.slug}`:null};});
}

export async function withdrawPartnerEventSubmission(input:{accountId:string;id:string;database?:D1Database;now?:Date}){
  const db=database(input.database);
  const row=await db.prepare(`SELECT s.status,m.partner_account_id accountId FROM moderation_submissions s JOIN partner_event_submission_metadata m ON m.submission_id=s.id WHERE s.id=?1 LIMIT 1`).bind(input.id).first<{status:string;accountId:string}>();
  if(!row||row.accountId!==input.accountId)throw new PartnerEventError("Návrh podujatia sa nenašiel.",404);
  if(!isFoundationSubmissionStatus(row.status)||!canTransitionModerationSubmission(row.status,"WITHDRAWN"))throw new PartnerEventError("Tento návrh už nie je možné zrušiť.",409);
  const nowIso=(input.now??new Date()).toISOString(),actorRef=`partner:${input.accountId}`;
  await applyAtomicModerationTransition(db,{id:input.id,expectedStatus:row.status as FoundationSubmissionStatus,toStatus:"WITHDRAWN",actorType:"PARTNER",actorRef,eventId:crypto.randomUUID(),changedFieldsJson:JSON.stringify(["status"]),now:nowIso,extraStatements:[
    db.prepare(`UPDATE partner_event_submission_metadata SET dedupe_active=0 WHERE submission_id=?1 AND EXISTS(SELECT 1 FROM moderation_submissions WHERE id=?1 AND status='WITHDRAWN' AND updated_at=?2 AND reviewed_by=?3)`).bind(input.id,nowIso,actorRef),
    db.prepare(`INSERT INTO partner_audit_events(id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at)
      SELECT ?1,'PARTNER',?2,'EVENT_WITHDRAWN','MODERATION_SUBMISSION',?3,'{}',?4 WHERE EXISTS(SELECT 1 FROM moderation_submissions WHERE id=?3 AND status='WITHDRAWN' AND updated_at=?4 AND reviewed_by=?2)`).bind(crypto.randomUUID(),actorRef,input.id,nowIso),
  ]});
  return {id:input.id,status:"WITHDRAWN" as const};
}
