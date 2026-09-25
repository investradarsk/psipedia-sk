import {appendPartnerAuditEvent, requirePartnerPermission} from "./partner-platform";
import {getPartnerAccountById, getPartnerDatabase} from "./partner-auth-store";

export const partnerCommercialInterestTypes=["PREMIUM_PROFILE","PROMOTED_PROFILE","AD_CAMPAIGN","OTHER"] as const;
export type PartnerCommercialInterestType=(typeof partnerCommercialInterestTypes)[number];
export const partnerCommercialStatuses=["NEW","CONTACTED","INTERESTED","NOT_NOW","CLOSED"] as const;
export type PartnerCommercialStatus=(typeof partnerCommercialStatuses)[number];
export const PARTNER_COMMERCIAL_MESSAGE_MAX=1000;

export class PartnerCommercialError extends Error {
  readonly status:number;
  constructor(message:string,status=400){super(message);this.status=status;}
}
export function isPartnerCommercialInterestType(value:string):value is PartnerCommercialInterestType{return (partnerCommercialInterestTypes as readonly string[]).includes(value);}
export function isPartnerCommercialStatus(value:string):value is PartnerCommercialStatus{return (partnerCommercialStatuses as readonly string[]).includes(value);}
export function normalizePartnerCommercialText(value:unknown,max=PARTNER_COMMERCIAL_MESSAGE_MAX){
  if(value===null||value===undefined||value==="")return null;
  if(typeof value!=="string")throw new PartnerCommercialError("Správa musí byť text.");
  const normalized=value.replace(/\r\n?/g,"\n").trim();
  if(normalized.length>max)throw new PartnerCommercialError(`Text môže mať najviac ${max} znakov.`);
  if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(normalized)||/<\/?[A-Za-z][^>]*>/.test(normalized))throw new PartnerCommercialError("Použite iba obyčajný text bez HTML.");
  return normalized||null;
}
type Row={id:string;accountId:string;resourceId:string|null;interestType:PartnerCommercialInterestType;status:PartnerCommercialStatus;message:string|null;createdAt:string;updatedAt:string;resourceName:string|null;entityType:string|null;slug:string|null;directoryCategory:string|null;resourceStatus:string|null};
function publicHref(row:Row){
  if(!row.resourceId||!row.slug||!row.entityType)return null;
  if(row.entityType==="DIRECTORY_PROFILE")return `/adresar/${row.directoryCategory}/${row.slug}`;
  if(row.entityType==="HELP_ORGANIZATION")return `/organizacie/${row.slug}`;
  if(row.entityType==="MANAGED_EVENT"&&row.resourceStatus==="published")return `/podujatia/${row.slug}`;
  return null;
}
async function findNew(database:D1Database,accountId:string,resourceId:string|null,interestType:PartnerCommercialInterestType){
  return database.prepare(`SELECT id FROM partner_commercial_interests WHERE account_id=?1 AND interest_type=?2 AND status='NEW' AND ((resource_id IS NULL AND ?3 IS NULL) OR resource_id=?3) LIMIT 1`).bind(accountId,interestType,resourceId).first<{id:string}>();
}
export async function createPartnerCommercialInterest(input:{accountId:string;interestType:unknown;resourceId?:unknown;message?:unknown;database?:D1Database;now?:Date}){
  const database=getPartnerDatabase(input.database);
  if(typeof input.interestType!=="string"||!isPartnerCommercialInterestType(input.interestType))throw new PartnerCommercialError("Neplatný typ záujmu.");
  const account=await getPartnerAccountById(input.accountId,database);
  if(!account||account.status!=="ACTIVE")throw new PartnerCommercialError("Aktívny Partner účet je potrebný.",403);
  let resourceId:string|null=null;
  if(input.resourceId!==null&&input.resourceId!==undefined&&input.resourceId!==""){
    if(typeof input.resourceId!=="string"||input.resourceId.length>128)throw new PartnerCommercialError("Neplatný Partner resource.");
    resourceId=input.resourceId.trim();
    await requirePartnerPermission(input.accountId,resourceId,"COMMERCIAL_INTEREST_CREATE",database);
  }else if(input.interestType!=="OTHER"){
    const eligible=await database.prepare("SELECT 1 ok FROM partner_memberships WHERE account_id=?1 AND revoked_at IS NULL AND role IN ('OWNER','MANAGER') LIMIT 1").bind(input.accountId).first();
    if(!eligible)throw new PartnerCommercialError("Pre tento typ záujmu je potrebná OWNER alebo MANAGER membership.",403);
  }
  const message=normalizePartnerCommercialText(input.message);
  const existing=await findNew(database,input.accountId,resourceId,input.interestType);
  if(existing)return {id:existing.id,deduplicated:true};
  const now=input.now??new Date(),nowIso=now.toISOString(),threshold=new Date(now.getTime()-60*60*1000).toISOString();
  const recent=await database.prepare("SELECT COUNT(*) count FROM partner_commercial_interests WHERE account_id=?1 AND created_at>=?2").bind(input.accountId,threshold).first<{count:number}>();
  if(Number(recent?.count??0)>=10)throw new PartnerCommercialError("Za krátky čas bolo odoslaných priveľa požiadaviek. Skúste to neskôr.",429);
  const id=crypto.randomUUID();
  await database.prepare(`INSERT OR IGNORE INTO partner_commercial_interests
    (id,account_id,resource_id,interest_type,status,message,created_at,updated_at)
    VALUES (?1,?2,?3,?4,'NEW',?5,?6,?6)`).bind(id,input.accountId,resourceId,input.interestType,message,nowIso).run();
  const current=await findNew(database,input.accountId,resourceId,input.interestType);
  if(!current)throw new PartnerCommercialError("Záujem sa nepodarilo uložiť.",503);
  if(current.id===id){
    await appendPartnerAuditEvent({actorType:"PARTNER",actorRef:`partner:${input.accountId}`,action:"COMMERCIAL_INTEREST_CREATED",targetType:"PARTNER_COMMERCIAL_INTEREST",targetId:id,metadata:{interestType:input.interestType,resourceId:resourceId??"account"},database,now});
    try{
      await enqueueAdminNotificationEvent(database,{
        eventType:"partner_commercial_lead_created",
        sourceType:"PARTNER_COMMERCIAL_LEAD",
        resourceType:"partner_commercial_interest",
        resourceRef:id,
        actorType:"PARTNER",
        actorRef:`partner:${input.accountId}`,
        targetUrl:`/admin/partners/commercial/${id}`,
        title:"Nový Partner dopyt na propagáciu",
        body:`Partner prejavil záujem o ${input.interestType}.`,
        tag:`partner-commercial-${id}`,
        dedupeKey:`partner-commercial-lead/${id}`,
      },now);
    }catch(error){
      console.error(JSON.stringify({event:"partner_commercial_admin_push_enqueue",interestId:id,result:"failed",error:error instanceof Error?error.message:"unknown"}));
    }
  }
  return {id:current.id,deduplicated:current.id!==id};
}
export async function listPartnerCommercialInterests(accountId:string,database?:D1Database){
  const rows=(await getPartnerDatabase(database).prepare(`SELECT c.id,c.account_id accountId,c.resource_id resourceId,c.interest_type interestType,c.status,c.message,c.created_at createdAt,c.updated_at updatedAt,
    r.entity_type entityType,COALESCE(d.name,o.name,e.title) resourceName,COALESCE(d.slug,o.slug,e.slug) slug,d.category directoryCategory,COALESCE(d.status,o.status,e.status) resourceStatus
    FROM partner_commercial_interests c LEFT JOIN partner_resources r ON r.id=c.resource_id
    LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id LEFT JOIN help_organizations o ON o.id=r.help_organization_id LEFT JOIN managed_events e ON e.id=r.managed_event_id
    WHERE c.account_id=?1 ORDER BY c.created_at DESC LIMIT 100`).bind(accountId).all<Row>()).results;
  return rows.map(row=>({...row,publicHref:publicHref(row)}));
}
