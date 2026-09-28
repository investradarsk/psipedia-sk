import {env} from "cloudflare:workers";
import {decryptPii} from "./pii-crypto";
import {appendPartnerAuditEvent} from "./partner-platform";
import {getPartnerDatabase} from "./partner-auth-store";
import {isPartnerCommercialInterestType,isPartnerCommercialStatus,normalizePartnerCommercialText,type PartnerCommercialInterestType,type PartnerCommercialStatus} from "./partner-commercial";

type Bindings={DB?:D1Database;PII_ENCRYPTION_KEY?:string};
function db(database?:D1Database){return getPartnerDatabase(database??(env as unknown as Bindings).DB);}
function piiKey(key?:string){const value=key??(env as unknown as Bindings).PII_ENCRYPTION_KEY;if(!value)throw new Error("PII_ENCRYPTION_KEY nie je nakonfigurovaný.");return value;}
function actor(email:string){return `admin:${email.trim().toLowerCase()}`;}
export class PartnerCommercialAdminError extends Error{readonly status:number;constructor(message:string,status=400){super(message);this.status=status;}}
type AdminRow={id:string;accountId:string;emailCiphertext:string;resourceId:string|null;interestType:PartnerCommercialInterestType;status:PartnerCommercialStatus;message:string|null;adminNote:string|null;createdAt:string;updatedAt:string;statusUpdatedAt:string|null;statusUpdatedBy:string|null;entityType:string|null;resourceName:string|null;slug:string|null;directoryCategory:string|null;resourceStatus:string|null};
function href(row:AdminRow){if(!row.slug||!row.entityType)return null;if(row.entityType==="DIRECTORY_PROFILE")return `/adresar/${row.directoryCategory}/${row.slug}`;if(row.entityType==="HELP_ORGANIZATION")return `/organizacie/${row.slug}`;if(row.entityType==="MANAGED_EVENT"&&row.resourceStatus==="published")return `/podujatia/${row.slug}`;return null;}
const BASE=`SELECT c.id,c.account_id accountId,a.email_ciphertext emailCiphertext,c.resource_id resourceId,c.interest_type interestType,c.status,c.message,c.admin_note adminNote,c.created_at createdAt,c.updated_at updatedAt,c.status_updated_at statusUpdatedAt,c.status_updated_by statusUpdatedBy,
  r.entity_type entityType,COALESCE(d.name,o.name,e.title) resourceName,COALESCE(d.slug,o.slug,e.slug) slug,d.category directoryCategory,COALESCE(d.status,o.status,e.status) resourceStatus
  FROM partner_commercial_interests c JOIN partner_accounts a ON a.id=c.account_id LEFT JOIN partner_resources r ON r.id=c.resource_id
  LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id LEFT JOIN help_organizations o ON o.id=r.help_organization_id LEFT JOIN managed_events e ON e.id=r.managed_event_id`;
async function hydrate(rows:AdminRow[],key:string){return Promise.all(rows.map(async row=>({...row,email:await decryptPii(row.emailCiphertext,key),publicHref:href(row)})));}
export async function listPartnerCommercialInterestsAdmin(input:{status?:string;interestType?:string;q?:string;database?:D1Database;encryptionKey?:string}={}){
  if(input.status&&input.status!=="all"&&!isPartnerCommercialStatus(input.status))throw new PartnerCommercialAdminError("Neplatný filter stavu.");
  if(input.interestType&&input.interestType!=="all"&&!isPartnerCommercialInterestType(input.interestType))throw new PartnerCommercialAdminError("Neplatný filter typu.");
  const rows=(await db(input.database).prepare(BASE+` ORDER BY CASE WHEN c.status='NEW' THEN 0 ELSE 1 END,c.created_at ASC LIMIT 250`).all<AdminRow>()).results;
  let items=await hydrate(rows,piiKey(input.encryptionKey));
  if(input.status&&input.status!=="all")items=items.filter(x=>x.status===input.status);
  if(input.interestType&&input.interestType!=="all")items=items.filter(x=>x.interestType===input.interestType);
  const q=(input.q??"").trim().toLocaleLowerCase("sk");
  if(q)items=items.filter(x=>[x.email,x.accountId,x.resourceName??"",x.message??"",x.id].some(v=>v.toLocaleLowerCase("sk").includes(q)));
  return items;
}
export async function getPartnerCommercialInterestAdmin(id:string,input:{database?:D1Database;encryptionKey?:string}={}){
  const database=db(input.database),row=await database.prepare(BASE+" WHERE c.id=?1 LIMIT 1").bind(id).first<AdminRow>();if(!row)return null;
  const [item]=await hydrate([row],piiKey(input.encryptionKey));
  const audit=(await database.prepare("SELECT id,actor_type actorType,actor_ref actorRef,action,metadata_json metadataJson,created_at createdAt FROM partner_audit_events WHERE target_type='PARTNER_COMMERCIAL_INTEREST' AND target_id=?1 ORDER BY created_at DESC LIMIT 100").bind(id).all()).results;
  return {...item,audit};
}
const transitions:Record<PartnerCommercialStatus,readonly PartnerCommercialStatus[]>={
  NEW:["CONTACTED","NOT_NOW","CLOSED"],CONTACTED:["INTERESTED","NOT_NOW","CLOSED"],INTERESTED:["NOT_NOW","CLOSED"],NOT_NOW:[],CLOSED:[]
};
export async function updatePartnerCommercialInterestAdmin(input:{id:string;status?:unknown;adminNote?:unknown;adminEmail:string;database?:D1Database;now?:Date}){
  const database=db(input.database),current=await database.prepare("SELECT status,admin_note adminNote FROM partner_commercial_interests WHERE id=?1").bind(input.id).first<{status:PartnerCommercialStatus;adminNote:string|null}>();
  if(!current)throw new PartnerCommercialAdminError("Commercial lead neexistuje.",404);
  const now=input.now??new Date(),iso=now.toISOString(),adminActor=actor(input.adminEmail);
  let changed=false;
  if(input.status!==undefined){
    if(typeof input.status!=="string"||!isPartnerCommercialStatus(input.status))throw new PartnerCommercialAdminError("Neplatný stav.");
    if(input.status!==current.status){
      if(!transitions[current.status].includes(input.status))throw new PartnerCommercialAdminError(`Prechod ${current.status} → ${input.status} nie je povolený.`);
      await database.prepare("UPDATE partner_commercial_interests SET status=?2,status_updated_at=?3,status_updated_by=?4,updated_at=?3 WHERE id=?1").bind(input.id,input.status,iso,adminActor).run();
      await appendPartnerAuditEvent({actorType:"ADMIN",actorRef:adminActor,action:"COMMERCIAL_INTEREST_STATUS_CHANGED",targetType:"PARTNER_COMMERCIAL_INTEREST",targetId:input.id,metadata:{oldStatus:current.status,newStatus:input.status},database,now});
      changed=true;
    }
  }
  if(input.adminNote!==undefined){
    const note=normalizePartnerCommercialText(input.adminNote,2000);
    if(note!==current.adminNote){
      await database.prepare("UPDATE partner_commercial_interests SET admin_note=?2,updated_at=?3 WHERE id=?1").bind(input.id,note,iso).run();
      await appendPartnerAuditEvent({actorType:"ADMIN",actorRef:adminActor,action:"COMMERCIAL_INTEREST_NOTE_UPDATED",targetType:"PARTNER_COMMERCIAL_INTEREST",targetId:input.id,metadata:{changed:true},database,now});
      changed=true;
    }
  }
  if(!changed)throw new PartnerCommercialAdminError("Nebola zadaná žiadna zmena.");
  return getPartnerCommercialInterestAdmin(input.id,{database});
}
