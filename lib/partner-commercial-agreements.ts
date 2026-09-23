import { getPartnerDatabase } from "./partner-auth-store";
import { normalizePartnerCommercialText, type PartnerCommercialInterestType } from "./partner-commercial";
import { appendPartnerAuditEvent } from "./partner-platform";
import { queuePartnerLifecycleNotification } from "./partner-email";
import { SPONSORED_LABEL, assertValidWindow, isPromotionVisible, normalizeDateTime } from "./monetization";

export const partnerAgreementTypes=["PREMIUM_PROFILE","PROMOTED_PROFILE","AD_CAMPAIGN"] as const;
export type PartnerAgreementType=(typeof partnerAgreementTypes)[number];
export const partnerAgreementStatuses=["DRAFT","OFFERED","AGREED","ACTIVE","EXPIRED","CANCELLED"] as const;
export type PartnerAgreementStatus=(typeof partnerAgreementStatuses)[number];
export const partnerPaymentMethods=["BANK_TRANSFER","BY_AGREEMENT"] as const;
export type PartnerPaymentMethod=(typeof partnerPaymentMethods)[number];
export const partnerPaymentStatuses=["NOT_REQUIRED","AWAITING_PAYMENT","PAID","WAIVED"] as const;
export type PartnerPaymentStatus=(typeof partnerPaymentStatuses)[number];
export const partnerEntitlementStatuses=["SCHEDULED","ACTIVE","PAUSED","EXPIRED","CANCELLED"] as const;
export type PartnerEntitlementStatus=(typeof partnerEntitlementStatuses)[number];

export class PartnerCommercialAgreementError extends Error {
  readonly status:number;
  constructor(message:string,status=400){super(message);this.status=status;}
}

type ResourceRow={
  resourceId:string;entityType:string;canonicalId:number;resourceStatus:string;resourceName:string;
  directoryCategory:string|null;
};
type AgreementRow={
  id:string;interestId:string|null;accountId:string;resourceId:string|null;agreementType:PartnerAgreementType;
  status:PartnerAgreementStatus;paymentMethod:PartnerPaymentMethod;paymentStatus:PartnerPaymentStatus;
  priceCents:number;currency:string;startAt:string;endAt:string;partnerNote:string|null;paymentInstruction:string|null;
  adminNote:string|null;paidAt:string|null;paidBy:string|null;campaignId:string|null;createdAt:string;updatedAt:string;
  createdBy:string;updatedBy:string;resourceName:string|null;entityType:string|null;canonicalId:number|null;resourceStatus:string|null;
  entitlementId:string|null;entitlementStatus:PartnerEntitlementStatus|null;promotionId:string|null;
};
type PartnerAgreementView=Omit<AgreementRow,"adminNote"|"paidBy"|"createdBy"|"updatedBy">;

function missingCommercialSchema(error:unknown){
  const message=error instanceof Error?error.message:String(error);
  return /no such table:\s*partner_(?:commercial_agreements|entitlements)/i.test(message);
}
function isAgreementType(value:unknown):value is PartnerAgreementType{return typeof value==="string"&&(partnerAgreementTypes as readonly string[]).includes(value);}
function isAgreementStatus(value:unknown):value is PartnerAgreementStatus{return typeof value==="string"&&(partnerAgreementStatuses as readonly string[]).includes(value);}
function isPaymentMethod(value:unknown):value is PartnerPaymentMethod{return typeof value==="string"&&(partnerPaymentMethods as readonly string[]).includes(value);}
function actor(email:string){return "admin:"+email.trim().toLowerCase();}
function plain(value:unknown,max:number){return normalizePartnerCommercialText(value,max);}
function priceCents(value:unknown){
  if(typeof value!=="number"||!Number.isSafeInteger(value)||value<0||value>2147483647)throw new PartnerCommercialAgreementError("Cena musí byť bezpečné celé číslo v centoch.");
  return value;
}
function euro(value:unknown){if(value!=="EUR")throw new PartnerCommercialAgreementError("PARTNER-5 podporuje iba menu EUR.");return "EUR" as const;}
function windowValues(start:unknown,end:unknown){
  const startAt=normalizeDateTime(start),endAt=normalizeDateTime(end);
  if(!startAt||!endAt)throw new PartnerCommercialAgreementError("Doplň platný začiatok a koniec dohody.");
  assertValidWindow(startAt,endAt);
  return {startAt,endAt};
}
function runtimeActive(status:PartnerEntitlementStatus,startAt:string,endAt:string,now=new Date()){
  if(status!=="ACTIVE"&&status!=="SCHEDULED")return false;
  const t=now.getTime();return Date.parse(startAt)<=t&&Date.parse(endAt)>t;
}
function paymentSatisfied(row:Pick<AgreementRow,"paymentMethod"|"paymentStatus">){
  return row.paymentStatus==="PAID"||row.paymentStatus==="WAIVED";
}
async function resource(database:D1Database,resourceId:string):Promise<ResourceRow|null>{
  return database.prepare(`
    SELECT r.id resourceId,r.entity_type entityType,
      COALESCE(d.id,o.id,e.id) canonicalId,COALESCE(d.status,o.status,e.status) resourceStatus,
      COALESCE(d.name,o.name,e.title) resourceName,d.category directoryCategory
    FROM partner_resources r
    LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id
    LEFT JOIN help_organizations o ON o.id=r.help_organization_id
    LEFT JOIN managed_events e ON e.id=r.managed_event_id
    WHERE r.id=?1 LIMIT 1
  `).bind(resourceId).first<ResourceRow>();
}
function promotionTarget(row:ResourceRow){
  if(row.entityType==="DIRECTORY_PROFILE")return {entityType:"directory" as const,entityId:String(row.canonicalId)};
  if(row.entityType==="HELP_ORGANIZATION")return {entityType:"organization" as const,entityId:String(row.canonicalId)};
  throw new PartnerCommercialAgreementError("Premium a propagovaný profil sú dostupné iba pre profilové zdroje.");
}
async function ensureCommercialMembership(database:D1Database,accountId:string,resourceId:string){
  const membership=await database.prepare(`
    SELECT m.role,a.status accountStatus FROM partner_memberships m
    JOIN partner_accounts a ON a.id=m.account_id
    WHERE m.account_id=?1 AND m.resource_id=?2 AND m.revoked_at IS NULL
      AND m.role IN ('OWNER','MANAGER') LIMIT 1
  `).bind(accountId,resourceId).first<{role:string;accountStatus:string}>();
  if(!membership||membership.accountStatus!=="ACTIVE")throw new PartnerCommercialAgreementError("Komerčná dohoda vyžaduje aktívne OWNER alebo MANAGER oprávnenie.",403);
}
async function ensureActiveCommercialAccount(database:D1Database,accountId:string){
  const row=await database.prepare("SELECT status FROM partner_accounts WHERE id=?1 LIMIT 1").bind(accountId).first<{status:string}>();
  if(!row||row.status!=="ACTIVE")throw new PartnerCommercialAgreementError("Partner účet nie je aktívny; novú platenú aktiváciu nemožno vykonať.",409);
}
const BASE=`SELECT a.id,a.interest_id interestId,a.account_id accountId,a.resource_id resourceId,a.agreement_type agreementType,
  a.status,a.payment_method paymentMethod,a.payment_status paymentStatus,a.price_cents priceCents,a.currency,
  a.start_at startAt,a.end_at endAt,a.partner_note partnerNote,a.payment_instruction paymentInstruction,a.admin_note adminNote,
  a.paid_at paidAt,a.paid_by paidBy,a.campaign_id campaignId,a.created_at createdAt,a.updated_at updatedAt,
  a.created_by createdBy,a.updated_by updatedBy,
  r.entity_type entityType,COALESCE(d.id,o.id,e.id) canonicalId,COALESCE(d.status,o.status,e.status) resourceStatus,
  COALESCE(d.name,o.name,e.title) resourceName,
  ent.id entitlementId,ent.status entitlementStatus,ent.promotion_id promotionId
  FROM partner_commercial_agreements a
  LEFT JOIN partner_resources r ON r.id=a.resource_id
  LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id
  LEFT JOIN help_organizations o ON o.id=r.help_organization_id
  LEFT JOIN managed_events e ON e.id=r.managed_event_id
  LEFT JOIN partner_entitlements ent ON ent.agreement_id=a.id`;

export async function listPartnerCommercialAgreements(accountId:string,database?:D1Database):Promise<PartnerAgreementView[]>{
  try{
    const rows=(await getPartnerDatabase(database).prepare(BASE+" WHERE a.account_id=?1 ORDER BY a.created_at DESC LIMIT 100").bind(accountId).all<AgreementRow>()).results;
    return rows.map(({adminNote:_,paidBy:__,createdBy:___,updatedBy:____,...safe})=>safe);
  }catch(error){if(missingCommercialSchema(error))return [];throw error;}
}
export async function listPartnerCommercialAgreementsAdmin(database?:D1Database){
  return (await getPartnerDatabase(database).prepare(BASE+" ORDER BY a.updated_at DESC LIMIT 250").all<AgreementRow>()).results;
}
export async function getPartnerCommercialAdminSummary(databaseInput?:D1Database,now=new Date()){
  const database=getPartnerDatabase(databaseInput),nowIso=now.toISOString(),expiringAt=new Date(now.getTime()+14*86400000).toISOString();
  try{
    const row=await database.prepare(`SELECT
      SUM(CASE WHEN payment_status='AWAITING_PAYMENT' THEN 1 ELSE 0 END) awaitingPayment,
      SUM(CASE WHEN status='AGREED' AND payment_status IN ('PAID','WAIVED') THEN 1 ELSE 0 END) readyToActivate,
      SUM(CASE WHEN status='ACTIVE' THEN 1 ELSE 0 END) active,
      SUM(CASE WHEN status='ACTIVE' AND end_at>?1 AND end_at<=?2 THEN 1 ELSE 0 END) expiringSoon
      FROM partner_commercial_agreements`).bind(nowIso,expiringAt).first<{awaitingPayment:number|null;readyToActivate:number|null;active:number|null;expiringSoon:number|null}>();
    return {
      awaitingPayment:Number(row?.awaitingPayment??0),
      readyToActivate:Number(row?.readyToActivate??0),
      active:Number(row?.active??0),
      expiringSoon:Number(row?.expiringSoon??0),
    };
  }catch(error){
    if(missingCommercialSchema(error))return {awaitingPayment:0,readyToActivate:0,active:0,expiringSoon:0};
    throw error;
  }
}
export async function getPartnerCommercialAgreementAdmin(id:string,database?:D1Database){
  return getPartnerDatabase(database).prepare(BASE+" WHERE a.id=?1 LIMIT 1").bind(id).first<AgreementRow>();
}
export async function getPartnerCommercialAgreement(accountId:string,id:string,database?:D1Database):Promise<PartnerAgreementView|null>{
  const row=await getPartnerDatabase(database).prepare(BASE+" WHERE a.id=?1 AND a.account_id=?2 LIMIT 1").bind(id,accountId).first<AgreementRow>();
  if(!row)return null;
  const {adminNote:_,paidBy:__,createdBy:___,updatedBy:____,...safe}=row;return safe;
}

export async function createPartnerCommercialAgreementFromLead(input:{
  interestId:string;priceCents:unknown;currency:unknown;paymentMethod:unknown;startAt:unknown;endAt:unknown;
  partnerNote?:unknown;paymentInstruction?:unknown;adminNote?:unknown;adminEmail:string;database?:D1Database;now?:Date;
}){
  const database=getPartnerDatabase(input.database),now=input.now??new Date(),iso=now.toISOString();
  const lead=await database.prepare(`
    SELECT c.id,c.account_id accountId,c.resource_id resourceId,c.interest_type interestType,c.status,a.status accountStatus
    FROM partner_commercial_interests c JOIN partner_accounts a ON a.id=c.account_id WHERE c.id=?1 LIMIT 1
  `).bind(input.interestId).first<{id:string;accountId:string;resourceId:string|null;interestType:PartnerCommercialInterestType;status:string;accountStatus:string}>();
  if(!lead)throw new PartnerCommercialAgreementError("Commercial lead neexistuje.",404);
  if(lead.accountStatus!=="ACTIVE")throw new PartnerCommercialAgreementError("Partner účet nie je aktívny.",409);
  if(!isAgreementType(lead.interestType))throw new PartnerCommercialAgreementError("OTHER lead zostáva bez arbitrary plateného entitlementu.");
  if(!["NEW","CONTACTED","INTERESTED"].includes(lead.status))throw new PartnerCommercialAgreementError("Z tohto leadu už nemožno vytvoriť novú dohodu.",409);
  if(lead.resourceId)await ensureCommercialMembership(database,lead.accountId,lead.resourceId);
  if((lead.interestType==="PREMIUM_PROFILE"||lead.interestType==="PROMOTED_PROFILE")&&!lead.resourceId)throw new PartnerCommercialAgreementError("Profilová dohoda musí mať konkrétny Partner resource.");
  if(lead.resourceId&&(lead.interestType==="PREMIUM_PROFILE"||lead.interestType==="PROMOTED_PROFILE")){
    const target=await resource(database,lead.resourceId);if(!target)throw new PartnerCommercialAgreementError("Partner resource neexistuje.",404);promotionTarget(target);
  }
  const price=priceCents(input.priceCents),currency=euro(input.currency);
  if(!isPaymentMethod(input.paymentMethod))throw new PartnerCommercialAgreementError("Neplatný spôsob platby.");
  const {startAt,endAt}=windowValues(input.startAt,input.endAt);
  const id=crypto.randomUUID(),adminActor=actor(input.adminEmail);
  try{
    await database.prepare(`INSERT INTO partner_commercial_agreements
      (id,interest_id,account_id,resource_id,agreement_type,status,payment_method,payment_status,price_cents,currency,
       start_at,end_at,partner_note,payment_instruction,admin_note,created_at,updated_at,created_by,updated_by)
      VALUES (?1,?2,?3,?4,?5,'OFFERED',?6,'NOT_REQUIRED',?7,?8,?9,?10,?11,?12,?13,?14,?14,?15,?15)`)
      .bind(id,lead.id,lead.accountId,lead.resourceId,lead.interestType,input.paymentMethod,price,currency,startAt,endAt,
        plain(input.partnerNote,2000),plain(input.paymentInstruction,2000),plain(input.adminNote,3000),iso,adminActor).run();
  }catch(error){
    if(String(error).includes("partner_commercial_agreement_interest_active_unique"))throw new PartnerCommercialAgreementError("Tento lead už má aktívnu ponuku alebo dohodu.",409);
    throw error;
  }
  await database.prepare("UPDATE partner_commercial_interests SET status='CLOSED',status_updated_at=?2,status_updated_by=?3,updated_at=?2 WHERE id=?1").bind(lead.id,iso,adminActor).run();
  await appendPartnerAuditEvent({actorType:"ADMIN",actorRef:adminActor,action:"COMMERCIAL_AGREEMENT_CREATED",targetType:"PARTNER_COMMERCIAL_AGREEMENT",targetId:id,metadata:{interestId:lead.id,agreementType:lead.interestType,priceCents:price,currency},database,now});
  await queuePartnerLifecycleNotification({accountId:lead.accountId,notificationType:"COMMERCIAL_OFFER_CREATED",dedupeKey:`partner-agreement:${id}:offer`,database,now});
  return getPartnerCommercialAgreementAdmin(id,database);
}

const transitions:Record<PartnerAgreementStatus,readonly PartnerAgreementStatus[]>={
  DRAFT:["OFFERED","CANCELLED"],OFFERED:["AGREED","CANCELLED"],AGREED:["CANCELLED"],ACTIVE:["EXPIRED","CANCELLED"],EXPIRED:[],CANCELLED:[]
};
export async function updatePartnerCommercialAgreementAdmin(input:{
  id:string;status?:unknown;priceCents?:unknown;currency?:unknown;paymentMethod?:unknown;startAt?:unknown;endAt?:unknown;
  partnerNote?:unknown;paymentInstruction?:unknown;adminNote?:unknown;adminEmail:string;database?:D1Database;now?:Date;
}){
  const database=getPartnerDatabase(input.database),current=await getPartnerCommercialAgreementAdmin(input.id,database);
  if(!current)throw new PartnerCommercialAgreementError("Dohoda neexistuje.",404);
  if(current.status==="ACTIVE"||current.status==="EXPIRED"||current.status==="CANCELLED"){
    const changingCommercialFields=[input.priceCents,input.currency,input.paymentMethod,input.startAt,input.endAt,input.partnerNote,input.paymentInstruction].some(v=>v!==undefined);
    if(changingCommercialFields)throw new PartnerCommercialAgreementError("Aktívnu alebo ukončenú dohodu nemožno prepisovať. Použite lifecycle akciu.",409);
  }
  let price=current.priceCents,currency=current.currency,paymentMethod=current.paymentMethod,startAt=current.startAt,endAt=current.endAt;
  if(input.priceCents!==undefined)price=priceCents(input.priceCents);
  if(input.currency!==undefined)currency=euro(input.currency);
  if(input.paymentMethod!==undefined){if(!isPaymentMethod(input.paymentMethod))throw new PartnerCommercialAgreementError("Neplatný spôsob platby.");paymentMethod=input.paymentMethod;}
  if(input.startAt!==undefined||input.endAt!==undefined){const win=windowValues(input.startAt??startAt,input.endAt??endAt);startAt=win.startAt;endAt=win.endAt;}
  let status=current.status,paymentStatus=current.paymentStatus;
  if(input.status!==undefined){
    if(!isAgreementStatus(input.status)||!transitions[current.status].includes(input.status))throw new PartnerCommercialAgreementError(`Prechod ${current.status} → ${String(input.status)} nie je povolený.`,409);
    status=input.status;
    if(status==="AGREED")paymentStatus="AWAITING_PAYMENT";
  }
  const now=input.now??new Date(),iso=now.toISOString(),adminActor=actor(input.adminEmail);
  await database.prepare(`UPDATE partner_commercial_agreements SET status=?2,payment_method=?3,payment_status=?4,price_cents=?5,currency=?6,
    start_at=?7,end_at=?8,partner_note=?9,payment_instruction=?10,admin_note=?11,updated_at=?12,updated_by=?13 WHERE id=?1`)
    .bind(input.id,status,paymentMethod,paymentStatus,price,currency,startAt,endAt,
      input.partnerNote===undefined?current.partnerNote:plain(input.partnerNote,2000),
      input.paymentInstruction===undefined?current.paymentInstruction:plain(input.paymentInstruction,2000),
      input.adminNote===undefined?current.adminNote:plain(input.adminNote,3000),iso,adminActor).run();
  await appendPartnerAuditEvent({actorType:"ADMIN",actorRef:adminActor,action:"COMMERCIAL_AGREEMENT_UPDATED",targetType:"PARTNER_COMMERCIAL_AGREEMENT",targetId:input.id,metadata:{oldStatus:current.status,newStatus:status,paymentStatus},database,now});
  await queuePartnerLifecycleNotification({accountId:current.accountId,notificationType:"COMMERCIAL_AGREEMENT_UPDATED",dedupeKey:`partner-agreement:${input.id}:update:${iso}`,database,now});
  return getPartnerCommercialAgreementAdmin(input.id,database);
}

export async function markPartnerCommercialAgreementPaid(input:{id:string;adminEmail:string;database?:D1Database;now?:Date}){
  const database=getPartnerDatabase(input.database),current=await getPartnerCommercialAgreementAdmin(input.id,database);
  if(!current)throw new PartnerCommercialAgreementError("Dohoda neexistuje.",404);
  if(current.status!=="AGREED")throw new PartnerCommercialAgreementError("Platbu možno potvrdiť iba pri dohodnutej ponuke.",409);
  if(current.paymentStatus==="PAID")return current;
  const now=input.now??new Date(),iso=now.toISOString(),adminActor=actor(input.adminEmail);
  const changed=await database.prepare("UPDATE partner_commercial_agreements SET payment_status='PAID',paid_at=?2,paid_by=?3,updated_at=?2,updated_by=?3 WHERE id=?1 AND payment_status<>'PAID' RETURNING id").bind(input.id,iso,adminActor).first<{id:string}>();
  if(!changed)return getPartnerCommercialAgreementAdmin(input.id,database);
  await appendPartnerAuditEvent({actorType:"ADMIN",actorRef:adminActor,action:"COMMERCIAL_PAYMENT_MARKED_PAID",targetType:"PARTNER_COMMERCIAL_AGREEMENT",targetId:input.id,metadata:{paymentMethod:current.paymentMethod},database,now});
  await queuePartnerLifecycleNotification({accountId:current.accountId,notificationType:"PAYMENT_MARKED_PAID",dedupeKey:`partner-agreement:${input.id}:paid`,database,now});
  return getPartnerCommercialAgreementAdmin(input.id,database);
}
export async function waivePartnerCommercialAgreementPayment(input:{id:string;adminEmail:string;database?:D1Database;now?:Date}){
  const database=getPartnerDatabase(input.database),current=await getPartnerCommercialAgreementAdmin(input.id,database);
  if(!current)throw new PartnerCommercialAgreementError("Dohoda neexistuje.",404);
  if(current.status!=="AGREED"||current.paymentMethod!=="BY_AGREEMENT")throw new PartnerCommercialAgreementError("Odpustenie platby je dostupné iba pre dohodu „Podľa dohody“.",409);
  const now=input.now??new Date(),iso=now.toISOString(),adminActor=actor(input.adminEmail);
  await database.prepare("UPDATE partner_commercial_agreements SET payment_status='WAIVED',updated_at=?2,updated_by=?3 WHERE id=?1").bind(input.id,iso,adminActor).run();
  await appendPartnerAuditEvent({actorType:"ADMIN",actorRef:adminActor,action:"COMMERCIAL_AGREEMENT_UPDATED",targetType:"PARTNER_COMMERCIAL_AGREEMENT",targetId:input.id,metadata:{paymentStatus:"WAIVED"},database,now});
  return getPartnerCommercialAgreementAdmin(input.id,database);
}

async function insertPromotion(database:D1Database,row:AgreementRow,target:ReturnType<typeof promotionTarget>,adminActor:string,nowIso:string){
  const provenance=`partner-agreement:${row.id}`;
  const existing=await database.prepare("SELECT id FROM monetization_promotions WHERE provenance=?1 LIMIT 1").bind(provenance).first<{id:string}>();
  if(existing)return existing.id;
  const id=crypto.randomUUID();
  await database.prepare(`INSERT OR IGNORE INTO monetization_promotions
    (id,entity_type,entity_id,status,start_at,end_at,label,priority,provenance,admin_note,created_at,updated_at,created_by,updated_by)
    VALUES (?1,?2,?3,'active',?4,?5,?6,0,?7,'',?8,?8,?9,?9)`)
    .bind(id,target.entityType,target.entityId,row.startAt,row.endAt,SPONSORED_LABEL,provenance,nowIso,adminActor).run();
  const linked=await database.prepare("SELECT id FROM monetization_promotions WHERE provenance=?1 LIMIT 1").bind(provenance).first<{id:string}>();
  if(!linked)throw new PartnerCommercialAgreementError("Sponzorovanú promotion sa nepodarilo bezpečne vytvoriť.",409);
  return linked.id;
}
export async function activatePartnerCommercialAgreement(input:{id:string;campaignId?:unknown;adminEmail:string;database?:D1Database;now?:Date}){
  const database=getPartnerDatabase(input.database),current=await getPartnerCommercialAgreementAdmin(input.id,database);
  if(!current)throw new PartnerCommercialAgreementError("Dohoda neexistuje.",404);
  if(current.status==="ACTIVE")return current;
  if(current.status!=="AGREED")throw new PartnerCommercialAgreementError("Aktivovať možno iba dohodu v stave AGREED.",409);
  await ensureActiveCommercialAccount(database,current.accountId);
  if(!paymentSatisfied(current))throw new PartnerCommercialAgreementError("Platobný stav zatiaľ nedovoľuje aktiváciu.",409);
  const now=input.now??new Date(),iso=now.toISOString(),adminActor=actor(input.adminEmail);
  if(Date.parse(current.endAt)<=now.getTime())throw new PartnerCommercialAgreementError("Dohodnuté obdobie už skončilo.",409);
  if(current.agreementType==="AD_CAMPAIGN"){
    if(typeof input.campaignId!=="string"||!input.campaignId.trim())throw new PartnerCommercialAgreementError("Najprv vytvorte bezpečnú reklamnú kampaň v existujúcom monetization engine.");
    const campaign=await database.prepare("SELECT id,status,start_at startAt,end_at endAt FROM monetization_campaigns WHERE id=?1 LIMIT 1").bind(input.campaignId.trim()).first<{id:string;status:string;startAt:string|null;endAt:string|null}>();
    if(!campaign||campaign.status==="archived")throw new PartnerCommercialAgreementError("Kampaň neexistuje alebo je archivovaná.",404);
    if(!campaign.startAt||!campaign.endAt||Date.parse(campaign.startAt)<Date.parse(current.startAt)||Date.parse(campaign.endAt)>Date.parse(current.endAt)){
      throw new PartnerCommercialAgreementError("Obdobie reklamnej kampane musí byť celé v rámci obdobia obchodnej dohody.",409);
    }
    await database.prepare("UPDATE monetization_campaigns SET status='active',updated_at=?2,updated_by=?3 WHERE id=?1").bind(campaign.id,iso,adminActor).run();
    const activated=await database.prepare("UPDATE partner_commercial_agreements SET status='ACTIVE',campaign_id=?2,updated_at=?3,updated_by=?4 WHERE id=?1 AND status='AGREED' RETURNING id").bind(current.id,campaign.id,iso,adminActor).first<{id:string}>();
    if(!activated)return getPartnerCommercialAgreementAdmin(current.id,database);
    await appendPartnerAuditEvent({actorType:"ADMIN",actorRef:adminActor,action:"COMMERCIAL_CAMPAIGN_LINKED",targetType:"PARTNER_COMMERCIAL_AGREEMENT",targetId:current.id,metadata:{campaignId:campaign.id},database,now});
    await queuePartnerLifecycleNotification({accountId:current.accountId,notificationType:"COMMERCIAL_AGREEMENT_UPDATED",dedupeKey:`partner-agreement:${current.id}:campaign-activated`,database,now});
    return getPartnerCommercialAgreementAdmin(current.id,database);
  }
  if(!current.resourceId)throw new PartnerCommercialAgreementError("Profilová dohoda nemá Partner resource.",409);
  await ensureCommercialMembership(database,current.accountId,current.resourceId);
  const targetResource=await resource(database,current.resourceId);
  if(!targetResource)throw new PartnerCommercialAgreementError("Partner resource už neexistuje.",404);
  if(!["published","PUBLISHED"].includes(targetResource.resourceStatus))throw new PartnerCommercialAgreementError("Platený profilový benefit možno aktivovať iba pre verejný canonical profil.",409);
  const target=promotionTarget(targetResource);
  const conflict=await database.prepare("SELECT id,agreement_id agreementId FROM partner_entitlements WHERE resource_id=?1 AND entitlement_type=?2 AND status IN ('SCHEDULED','ACTIVE','PAUSED') LIMIT 1")
    .bind(current.resourceId,current.agreementType).first<{id:string;agreementId:string}>();
  if(conflict&&conflict.agreementId!==current.id)throw new PartnerCommercialAgreementError("Pre tento profil už existuje aktívny alebo naplánovaný benefit rovnakého typu.",409);
  let promotionId:string|null=null;
  if(current.agreementType==="PROMOTED_PROFILE")promotionId=await insertPromotion(database,current,target,adminActor,iso);
  const entStatus:PartnerEntitlementStatus=Date.parse(current.startAt)>now.getTime()?"SCHEDULED":"ACTIVE";
  let entitlementId=conflict?.id??crypto.randomUUID();
  if(!conflict){
    await database.prepare(`INSERT OR IGNORE INTO partner_entitlements
      (id,account_id,resource_id,agreement_id,entitlement_type,status,start_at,end_at,promotion_id,created_at,updated_at,activated_at,activated_by)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10,?10,?11)`)
      .bind(entitlementId,current.accountId,current.resourceId,current.id,current.agreementType,entStatus,current.startAt,current.endAt,promotionId,iso,adminActor).run();
    const linked=await database.prepare("SELECT id FROM partner_entitlements WHERE agreement_id=?1 AND entitlement_type=?2 LIMIT 1").bind(current.id,current.agreementType).first<{id:string}>();
    if(!linked)throw new PartnerCommercialAgreementError("Platený benefit sa nepodarilo bezpečne aktivovať.",409);
    entitlementId=linked.id;
  }
  const activated=await database.prepare("UPDATE partner_commercial_agreements SET status='ACTIVE',updated_at=?2,updated_by=?3 WHERE id=?1 AND status='AGREED' RETURNING id").bind(current.id,iso,adminActor).first<{id:string}>();
  if(!activated)return getPartnerCommercialAgreementAdmin(current.id,database);
  await appendPartnerAuditEvent({actorType:"ADMIN",actorRef:adminActor,action:"ENTITLEMENT_ACTIVATED",targetType:"PARTNER_ENTITLEMENT",targetId:entitlementId,metadata:{agreementId:current.id,entitlementType:current.agreementType,status:entStatus},database,now});
  if(promotionId)await appendPartnerAuditEvent({actorType:"ADMIN",actorRef:adminActor,action:"COMMERCIAL_PROMOTION_LINKED",targetType:"PARTNER_COMMERCIAL_AGREEMENT",targetId:current.id,metadata:{promotionId},database,now});
  await queuePartnerLifecycleNotification({accountId:current.accountId,notificationType:"ENTITLEMENT_ACTIVATED",dedupeKey:`partner-agreement:${current.id}:activated`,database,now});
  return getPartnerCommercialAgreementAdmin(current.id,database);
}
export async function pausePartnerCommercialEntitlement(input:{agreementId:string;adminEmail:string;database?:D1Database;now?:Date}){
  const database=getPartnerDatabase(input.database),current=await getPartnerCommercialAgreementAdmin(input.agreementId,database);
  if(!current||!current.entitlementId)throw new PartnerCommercialAgreementError("Aktívny entitlement neexistuje.",404);
  if(current.entitlementStatus==="PAUSED")return current;
  if(current.entitlementStatus!=="ACTIVE"&&current.entitlementStatus!=="SCHEDULED")throw new PartnerCommercialAgreementError("Tento entitlement nemožno pozastaviť.",409);
  const now=input.now??new Date(),iso=now.toISOString(),adminActor=actor(input.adminEmail);
  await database.prepare("UPDATE partner_entitlements SET status='PAUSED',updated_at=?2 WHERE id=?1").bind(current.entitlementId,iso).run();
  if(current.promotionId)await database.prepare("UPDATE monetization_promotions SET status='paused',updated_at=?2,updated_by=?3 WHERE id=?1").bind(current.promotionId,iso,adminActor).run();
  await appendPartnerAuditEvent({actorType:"ADMIN",actorRef:adminActor,action:"ENTITLEMENT_PAUSED",targetType:"PARTNER_ENTITLEMENT",targetId:current.entitlementId,metadata:{agreementId:current.id},database,now});
  return getPartnerCommercialAgreementAdmin(current.id,database);
}
export async function cancelPartnerCommercialAgreement(input:{id:string;adminEmail:string;database?:D1Database;now?:Date}){
  const database=getPartnerDatabase(input.database),current=await getPartnerCommercialAgreementAdmin(input.id,database);
  if(!current)throw new PartnerCommercialAgreementError("Dohoda neexistuje.",404);
  if(current.status==="CANCELLED")return current;
  const now=input.now??new Date(),iso=now.toISOString(),adminActor=actor(input.adminEmail);
  await database.prepare("UPDATE partner_commercial_agreements SET status='CANCELLED',updated_at=?2,updated_by=?3 WHERE id=?1").bind(current.id,iso,adminActor).run();
  if(current.entitlementId){
    await database.prepare("UPDATE partner_entitlements SET status='CANCELLED',cancelled_at=?2,cancelled_by=?3,updated_at=?2 WHERE id=?1").bind(current.entitlementId,iso,adminActor).run();
    if(current.promotionId)await database.prepare("UPDATE monetization_promotions SET status='archived',updated_at=?2,updated_by=?3 WHERE id=?1").bind(current.promotionId,iso,adminActor).run();
    await appendPartnerAuditEvent({actorType:"ADMIN",actorRef:adminActor,action:"ENTITLEMENT_CANCELLED",targetType:"PARTNER_ENTITLEMENT",targetId:current.entitlementId,metadata:{agreementId:current.id},database,now});
  }
  if(current.campaignId)await database.prepare("UPDATE monetization_campaigns SET status='paused',updated_at=?2,updated_by=?3 WHERE id=?1 AND status='active'").bind(current.campaignId,iso,adminActor).run();
  await appendPartnerAuditEvent({actorType:"ADMIN",actorRef:adminActor,action:"COMMERCIAL_AGREEMENT_UPDATED",targetType:"PARTNER_COMMERCIAL_AGREEMENT",targetId:current.id,metadata:{newStatus:"CANCELLED"},database,now});
  return getPartnerCommercialAgreementAdmin(current.id,database);
}

export async function expireEndedCommercialItems(databaseInput?:D1Database,now=new Date()){
  const database=getPartnerDatabase(databaseInput),iso=now.toISOString();
  const rows=(await database.prepare(`SELECT a.id,a.account_id accountId,a.campaign_id campaignId,e.id entitlementId,e.promotion_id promotionId
    FROM partner_commercial_agreements a LEFT JOIN partner_entitlements e ON e.agreement_id=a.id
    WHERE a.status='ACTIVE' AND a.end_at<=?1 LIMIT 100`).bind(iso).all<{id:string;accountId:string;campaignId:string|null;entitlementId:string|null;promotionId:string|null}>()).results;
  for(const row of rows){
    await database.prepare("UPDATE partner_commercial_agreements SET status='EXPIRED',updated_at=?2,updated_by='system:commercial-expiry' WHERE id=?1 AND status='ACTIVE'").bind(row.id,iso).run();
    if(row.entitlementId)await database.prepare("UPDATE partner_entitlements SET status='EXPIRED',updated_at=?2 WHERE id=?1 AND status IN ('ACTIVE','SCHEDULED')").bind(row.entitlementId,iso).run();
    if(row.promotionId)await database.prepare("UPDATE monetization_promotions SET status='archived',updated_at=?2,updated_by='system:commercial-expiry' WHERE id=?1").bind(row.promotionId,iso).run();
    if(row.campaignId)await database.prepare("UPDATE monetization_campaigns SET status='paused',updated_at=?2,updated_by='system:commercial-expiry' WHERE id=?1 AND status='active'").bind(row.campaignId,iso).run();
    await appendPartnerAuditEvent({actorType:"SYSTEM",actorRef:"system:commercial-expiry",action:"ENTITLEMENT_EXPIRED",targetType:"PARTNER_COMMERCIAL_AGREEMENT",targetId:row.id,metadata:{automatic:true},database,now});
    await queuePartnerLifecycleNotification({accountId:row.accountId,notificationType:"ENTITLEMENT_EXPIRED",dedupeKey:`partner-agreement:${row.id}:expired`,database,now});
  }
  return rows.length;
}

export async function getPublicPartnerCommercialFlags(resourceType:"DIRECTORY_PROFILE"|"HELP_ORGANIZATION",canonicalId:number,databaseInput?:D1Database,now=new Date()){
  const fallback={premium:false,promoted:false,sponsoredLabel:null as string|null};
  try{
    const database=getPartnerDatabase(databaseInput),resourceRow=await database.prepare(`
      SELECT id FROM partner_resources WHERE entity_type=?1 AND
        ((?1='DIRECTORY_PROFILE' AND directory_profile_id=?2) OR (?1='HELP_ORGANIZATION' AND help_organization_id=?2)) LIMIT 1
    `).bind(resourceType,canonicalId).first<{id:string}>();
    if(!resourceRow)return fallback;
    const entitlements=(await database.prepare(`SELECT entitlement_type entitlementType,status,start_at startAt,end_at endAt,promotion_id promotionId
      FROM partner_entitlements WHERE resource_id=?1 AND status IN ('SCHEDULED','ACTIVE','PAUSED')`).bind(resourceRow.id)
      .all<{entitlementType:"PREMIUM_PROFILE"|"PROMOTED_PROFILE";status:PartnerEntitlementStatus;startAt:string;endAt:string;promotionId:string|null}>()).results;
    const premium=entitlements.some(x=>x.entitlementType==="PREMIUM_PROFILE"&&runtimeActive(x.status,x.startAt,x.endAt,now));
    let promoted=false;
    const promotedEnt=entitlements.find(x=>x.entitlementType==="PROMOTED_PROFILE"&&runtimeActive(x.status,x.startAt,x.endAt,now)&&x.promotionId);
    if(promotedEnt?.promotionId){
      const p=await database.prepare(`SELECT status,start_at startAt,end_at endAt,label FROM monetization_promotions WHERE id=?1 LIMIT 1`).bind(promotedEnt.promotionId)
        .first<{status:"draft"|"active"|"paused"|"archived";startAt:string|null;endAt:string|null;label:string}>();
      promoted=Boolean(p&&isPromotionVisible({status:p.status,startAt:p.startAt,endAt:p.endAt,entityPublic:true,label:p.label},now));
    }
    return {premium,promoted,sponsoredLabel:promoted?SPONSORED_LABEL:null};
  }catch(error){if(missingCommercialSchema(error))return fallback;throw error;}
}

export async function getPartnerCommercialDashboardSummary(accountId:string,databaseInput?:D1Database,now=new Date()){
  const database=getPartnerDatabase(databaseInput),iso=now.toISOString();
  try{
  const [open, premium, promoted]=await Promise.all([
    database.prepare("SELECT COUNT(*) count FROM partner_commercial_interests WHERE account_id=?1 AND status IN ('NEW','CONTACTED','INTERESTED')").bind(accountId).first<{count:number}>(),
    database.prepare(`SELECT COUNT(*) count FROM partner_entitlements WHERE account_id=?1 AND entitlement_type='PREMIUM_PROFILE' AND status IN ('ACTIVE','SCHEDULED') AND start_at<=?2 AND end_at>?2`).bind(accountId,iso).first<{count:number}>(),
    database.prepare(`SELECT COUNT(*) count FROM partner_entitlements WHERE account_id=?1 AND entitlement_type='PROMOTED_PROFILE' AND status IN ('ACTIVE','SCHEDULED') AND start_at<=?2 AND end_at>?2`).bind(accountId,iso).first<{count:number}>(),
  ]);
  return {openRequests:Number(open?.count??0),activePremium:Number(premium?.count??0),activePromotions:Number(promoted?.count??0)};
  }catch(error){if(missingCommercialSchema(error))return {openRequests:0,activePremium:0,activePromotions:0};throw error;}
}
