import { getPartnerAccountById, getPartnerDatabase } from "./partner-auth-store";
import { appendPartnerAuditEvent } from "./partner-platform";
import { normalizePartnerClaimText } from "./partner-claims";
import { queuePartnerLifecycleNotification } from "./partner-email";
import { enqueueAdminNotificationEvent } from "./admin-notifications";
import { assertIndependentOwnershipApprover, PartnerOwnershipApprovalGuardError } from "./partner-ownership-approval";

export const partnerHelpTypes = ["ADOPTION_DOG","LOST_FOUND_DOG","HELP_CASE"] as const;
export type PartnerHelpType = (typeof partnerHelpTypes)[number];
export type HelpClaimStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "REVOKED";
export function isPartnerHelpType(value: unknown): value is PartnerHelpType {
  return typeof value === "string" && (partnerHelpTypes as readonly string[]).includes(value);
}
export class PartnerHelpClaimError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status=status; this.name = "PartnerHelpClaimError"; }
}
export const helpResourceId = (type: PartnerHelpType, id: number) => `help-record-${type}-${id}`;
export function parseHelpResourceId(value: string) {
  const match = /^help-record-(ADOPTION_DOG|LOST_FOUND_DOG|HELP_CASE)-([1-9][0-9]*)$/.exec(value);
  if (!match) return null;
  const id = Number(match[2]);
  return Number.isSafeInteger(id) ? { entityType: match[1] as PartnerHelpType, canonicalId: id } : null;
}
const specs = {
  ADOPTION_DOG: {
    column: "adoption_dog_id", label: "Adopcia",
    table: "adoption_dogs", title: "name", publicWhere: "status IN ('ACTIVE','RESERVED')",
  },
  LOST_FOUND_DOG: {
    column: "lost_found_report_id", label: "Stratené a nájdené psy",
    table: "lost_found_dog_reports", title: "COALESCE(NULLIF(dog_name,''),NULLIF(breed,''),'Pes')",
    publicWhere: "status='ACTIVE' AND type IN ('LOST','FOUND') AND published_at IS NOT NULL AND (expires_at IS NULL OR expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
  },
  HELP_CASE: {
    column: "help_case_id", label: "Pomoc psom",
    table: "help_cases", title: "title",
    publicWhere: "status='published' AND resolved=0 AND category IN ('docasna-opatera','zbierky','dobrovolnictvo','urgentne-pripady')",
  },
} as const;

type HelpRow = { id: number; name: string; slug: string; city: string; status: string; category?: string; type?: string };
function href(type: PartnerHelpType, row: Pick<HelpRow,"slug"|"type"|"category">) {
  return type === "ADOPTION_DOG" ? `/pomoc-psom/adopcia/${row.slug}`
    : type === "LOST_FOUND_DOG" ? `/pomoc-psom/${row.type === "LOST" ? "stratene-psy" : "najdene-psy"}/${row.slug}`
      : `/pomoc-psom/${row.category}/${row.slug}`;
}
const select = (type: PartnerHelpType) => {
  const s = specs[type];
  return `SELECT id,${s.title} AS name,slug,city,status,${type==="LOST_FOUND_DOG"?"type":"NULL AS type"},${type==="HELP_CASE"?"category":"NULL AS category"} FROM ${s.table} WHERE ${s.publicWhere}`;
};
export async function getPartnerHelpPreview(type: PartnerHelpType, id: number, database?: D1Database) {
  if (!Number.isSafeInteger(id) || id<1) return null;
  const row = await getPartnerDatabase(database).prepare(select(type)+" AND id=?1 LIMIT 1").bind(id).first<HelpRow>();
  return row ? { entityType: type, canonicalId: id, name: row.name, slug: row.slug, publicHref: href(type,row) } : null;
}
export async function searchPartnerHelpRecords(type: PartnerHelpType, query: string, database?: D1Database) {
  const trimmed = query.trim().replace(/\s+/g," ").slice(0,80);
  if (trimmed.length<2) return [];
  const pattern = `%${trimmed.replace(/[\\%_]/g,"\\$&")}%`;
  const q = select(type) + " AND (name LIKE ?1 ESCAPE '\\' OR city LIKE ?1 ESCAPE '\\') ORDER BY name COLLATE NOCASE,id LIMIT 15";
  // Alias 'name' is not visible to WHERE in every SQLite derivative. Repeat the safe, fixed title expression.
  const sql = q.replace("name LIKE ?1", specs[type].title+" LIKE ?1");
  const rows = (await getPartnerDatabase(database).prepare(sql).bind(pattern).all<HelpRow>()).results;
  return rows.map(row=>({
    entityType:type,canonicalId:row.id,name:row.name,details:[specs[type].label,row.city].filter(Boolean).join(" · "),
    publicHref:href(type,row),claimHref:`/partner/prevziat-profil/${type}/${row.id}`,
  }));
}
function idValue(value: unknown) {
  const n = typeof value==="number"?value:typeof value==="string"&&/^\d+$/.test(value)?Number(value):NaN;
  if (!Number.isSafeInteger(n)||n<1) throw new PartnerHelpClaimError("Neplatné ID záznamu.");
  return n;
}
function resourceCondition(type: PartnerHelpType, alias = "") {return `${alias}${specs[type].column}`;}
function pendingFor(accountId:string,type:PartnerHelpType,id:number,db:D1Database){
  return db.prepare(`SELECT id FROM partner_help_claims WHERE account_id=?1 AND ${resourceCondition(type)}=?2 AND status='PENDING' LIMIT 1`)
    .bind(accountId,id).first<{id:string}>();
}
export async function createPartnerHelpClaim(input:{accountId:string;entityType:PartnerHelpType;canonicalId:unknown;requestMessage?:unknown;database?:D1Database;now?:Date}) {
  const database=getPartnerDatabase(input.database), now=input.now??new Date();
  const account=await getPartnerAccountById(input.accountId,database);
  if(account?.status!=="ACTIVE")throw new PartnerHelpClaimError("Aktívny Partner účet je potrebný.",403);
  const id=idValue(input.canonicalId);
  const preview=await getPartnerHelpPreview(input.entityType,id,database);
  if(!preview)throw new PartnerHelpClaimError("Verejný záznam neexistuje alebo ho nemožno prevziať.",404);
  const owned=await database.prepare(`SELECT account_id accountId FROM partner_help_claims WHERE ${resourceCondition(input.entityType)}=?1 AND status='APPROVED' LIMIT 1`)
    .bind(id).first<{accountId:string}>();
  if(owned)throw new PartnerHelpClaimError(owned.accountId===input.accountId?"Tento záznam už spravujete.":"Tento záznam už spravuje iný partner.",409);
  const existing=await pendingFor(input.accountId,input.entityType,id,database);
  const resourceId=helpResourceId(input.entityType,id);
  if(existing)return {id:existing.id,resourceId,deduplicated:true};
  const threshold=new Date(now.getTime()-60*60*1000).toISOString();
  const [legacy,help]=await Promise.all([
    database.prepare("SELECT COUNT(*) count FROM partner_claims WHERE account_id=?1 AND created_at>=?2").bind(input.accountId,threshold).first<{count:number}>(),
    database.prepare("SELECT COUNT(*) count FROM partner_help_claims WHERE account_id=?1 AND created_at>=?2").bind(input.accountId,threshold).first<{count:number}>(),
  ]);
  if(Number(legacy?.count??0)+Number(help?.count??0)>=10)throw new PartnerHelpClaimError("Priveľa žiadostí za poslednú hodinu. Skúste to neskôr.",429);
  const message=normalizePartnerClaimText(input.requestMessage);
  const claimId="help-claim-"+crypto.randomUUID(), iso=now.toISOString();
  await database.prepare(`INSERT OR IGNORE INTO partner_help_claims
    (id,account_id,entity_type,${resourceCondition(input.entityType)},status,request_message,created_at,updated_at)
    VALUES(?1,?2,?3,?4,'PENDING',?5,?6,?6)`)
    .bind(claimId,input.accountId,input.entityType,id,message,iso).run();
  const current=await pendingFor(input.accountId,input.entityType,id,database);
  if(!current)throw new PartnerHelpClaimError("Žiadosť sa nepodarilo uložiť.",503);
  if(current.id===claimId){
    await appendPartnerAuditEvent({actorType:"PARTNER",actorRef:`partner:${input.accountId}`,action:"CLAIM_SUBMITTED",
      targetType:"PARTNER_HELP_CLAIM",targetId:claimId,metadata:{resourceId,entityType:input.entityType,canonicalId:id},database,now});
    try {
      await enqueueAdminNotificationEvent(database,{
        eventType:"partner_claim_submitted",sourceType:"PARTNER_CLAIM_REVIEW",resourceType:"partner_help_claim",
        resourceRef:claimId,actorType:"PARTNER",actorRef:`partner:${input.accountId}`,
        targetUrl:`/admin/partners/claims/${claimId}`,
        title:"Žiadosť o správu záznamu Pomoci psom",body:"Partner požiadal o správu existujúceho záznamu.",
        tag:`partner-help-claim-${claimId}`,dedupeKey:`partner-help-claim/${claimId}`,
      },now);
    }catch(error){console.error("partner-help-claim notification failed",error);}
  }
  await queuePartnerLifecycleNotification({accountId:input.accountId,notificationType:"CLAIM_SUBMITTED",
    dedupeKey:`partner-claim-submitted/${current.id}`,database,now});
  return {id:current.id,resourceId,deduplicated:current.id!==claimId};
}
export async function cancelPartnerHelpClaim(input:{accountId:string;claimId:string;database?:D1Database;now?:Date}) {
  const database=getPartnerDatabase(input.database);
  const account=await getPartnerAccountById(input.accountId,database);
  if(account?.status!=="ACTIVE")throw new PartnerHelpClaimError("Aktívny Partner účet je potrebný.",403);
  const current=await database.prepare("SELECT status FROM partner_help_claims WHERE id=?1 AND account_id=?2 LIMIT 1")
    .bind(input.claimId,input.accountId).first<{status:HelpClaimStatus}>();
  if(!current)throw new PartnerHelpClaimError("Žiadosť neexistuje.",404);
  if(current.status!=="PENDING")throw new PartnerHelpClaimError("Zrušiť možno iba čakajúcu žiadosť.",409);
  const now=input.now??new Date(),iso=now.toISOString();
  const result=await database.prepare("UPDATE partner_help_claims SET status='CANCELLED',cancelled_at=?3,updated_at=?3 WHERE id=?1 AND account_id=?2 AND status='PENDING'")
    .bind(input.claimId,input.accountId,iso).run();
  if(result.meta?.changes!==1)throw new PartnerHelpClaimError("Žiadosť už bola vybavená.",409);
  await appendPartnerAuditEvent({actorType:"PARTNER",actorRef:`partner:${input.accountId}`,action:"CLAIM_CANCELLED",targetType:"PARTNER_HELP_CLAIM",targetId:input.claimId,database,now});
  return {id:input.claimId,status:"CANCELLED" as const};
}
type HelpClaimRow = {id:string;accountId:string;entityType:PartnerHelpType;canonicalId:number;status:HelpClaimStatus;requestMessage:string|null;createdAt:string;updatedAt:string;reviewedAt:string|null;reviewedBy:string|null;decisionNote:string|null;name:string;slug:string;recordStatus:string;city:string;category:string|null;reportType:string|null;emailCiphertext?:string};
const HELP_SELECT = `SELECT c.id,c.account_id accountId,c.entity_type entityType,
  COALESCE(c.adoption_dog_id,c.lost_found_report_id,c.help_case_id) canonicalId,
  c.status,c.request_message requestMessage,c.created_at createdAt,c.updated_at updatedAt,
  c.reviewed_at reviewedAt,c.reviewed_by reviewedBy,c.decision_note decisionNote,
  COALESCE(d.name,NULLIF(r.dog_name,''),NULLIF(r.breed,''),h.title,'Pes') name,
  COALESCE(d.slug,r.slug,h.slug) slug,COALESCE(d.status,r.status,h.status) recordStatus,
  COALESCE(d.city,r.city,h.city) city,h.category category,r.type reportType
  FROM partner_help_claims c
  LEFT JOIN adoption_dogs d ON d.id=c.adoption_dog_id
  LEFT JOIN lost_found_dog_reports r ON r.id=c.lost_found_report_id
  LEFT JOIN help_cases h ON h.id=c.help_case_id`;
export const helpClaimHref = (item:{entityType:PartnerHelpType;slug:string;reportType:string|null;category:string|null})=>
  href(item.entityType,{slug:item.slug,type:item.reportType??undefined,category:item.category??undefined});
export async function listPartnerHelpClaims(accountId:string,database?:D1Database){
  const rows=(await getPartnerDatabase(database).prepare(HELP_SELECT+" WHERE c.account_id=?1 ORDER BY c.created_at DESC LIMIT 150")
    .bind(accountId).all<HelpClaimRow>()).results;
  return rows.map(row=>({...row,resourceId:helpResourceId(row.entityType,row.canonicalId),publicHref:helpClaimHref(row),verificationState:"UNVERIFIED" as const}));
}
export async function listPartnerApprovedHelpResources(accountId:string,database?:D1Database){
  const rows=(await getPartnerDatabase(database).prepare(HELP_SELECT+
    " JOIN partner_accounts a ON a.id=c.account_id AND a.status='ACTIVE' WHERE c.account_id=?1 AND c.status='APPROVED' ORDER BY name COLLATE NOCASE,c.id")
    .bind(accountId).all<HelpClaimRow>()).results;
  return rows.map(row=>({
    resourceId:helpResourceId(row.entityType,row.canonicalId),entityType:row.entityType,
    canonicalId:row.canonicalId,role:"OWNER" as const,name:row.name,status:row.recordStatus,
    slug:row.slug,publicHref:row.entityType==="ADOPTION_DOG"&&!["ACTIVE","RESERVED"].includes(row.recordStatus)?null:row.entityType==="LOST_FOUND_DOG"&&row.recordStatus!=="ACTIVE"?null:row.entityType==="HELP_CASE"&&row.recordStatus!=="published"?null:helpClaimHref(row),verificationStatus:"UNVERIFIED" as const,
  }));
}
export async function getPartnerHelpMembership(accountId:string,resourceId:string,database?:D1Database){
  const parsed=parseHelpResourceId(resourceId);
  if(!parsed)return null;
  const row=await getPartnerDatabase(database).prepare(`SELECT c.id membershipId,c.account_id accountId,a.status accountStatus
    FROM partner_help_claims c JOIN partner_accounts a ON a.id=c.account_id
    WHERE c.account_id=?1 AND c.${resourceCondition(parsed.entityType)}=?2 AND c.status='APPROVED' AND a.status='ACTIVE' LIMIT 1`)
    .bind(accountId,parsed.canonicalId).first<{membershipId:string;accountId:string;accountStatus:string}>();
  return row?{...row,resourceId,role:"OWNER" as const,revokedAt:null}:null;
}
export async function listPartnerHelpClaimsAdmin(database?:D1Database) {
  return (await getPartnerDatabase(database).prepare(
    HELP_SELECT+" JOIN partner_accounts a ON a.id=c.account_id"+
    " ORDER BY CASE WHEN c.status='PENDING' THEN 0 ELSE 1 END,c.created_at ASC LIMIT 300"
  .replace("SELECT c.id","SELECT a.email_ciphertext emailCiphertext,c.id")).all<HelpClaimRow>()).results;
}
export async function getPartnerHelpClaimAdmin(id:string,database?:D1Database) {
  const db=getPartnerDatabase(database);
  const row=await db.prepare((HELP_SELECT+" JOIN partner_accounts a ON a.id=c.account_id WHERE c.id=?1 LIMIT 1")
    .replace("SELECT c.id","SELECT a.email_ciphertext emailCiphertext,c.id")).bind(id).first<HelpClaimRow>();
  if(!row)return null;
  const column=resourceCondition(row.entityType);
  const [all,events]=await Promise.all([
    db.prepare(`SELECT c.id,c.account_id accountId,c.status,c.created_at createdAt,a.status accountStatus
       FROM partner_help_claims c JOIN partner_accounts a ON a.id=c.account_id
       WHERE c.${column}=?1 AND c.status IN ('PENDING','APPROVED') ORDER BY c.created_at`)
      .bind(row.canonicalId).all<{id:string;accountId:string;status:string;createdAt:string;accountStatus:string}>(),
    db.prepare("SELECT id,action,actor_ref actorRef,created_at createdAt FROM partner_audit_events WHERE target_type='PARTNER_HELP_CLAIM' AND target_id=?1 ORDER BY created_at DESC LIMIT 100")
      .bind(id).all(),
  ]);
  const members=all.results.filter(x=>x.status==="APPROVED");
  return {
    ...row,resourceId:helpResourceId(row.entityType,row.canonicalId),
    resourceName:row.name,publicHref:helpClaimHref(row),
    conflict:all.results.some(x=>x.accountId!==row.accountId),
    memberships:members.map(x=>({...x,role:"OWNER"})),
    otherPendingClaims:all.results.filter(x=>x.status==="PENDING"&&x.id!==id),
    verification:{status:"UNVERIFIED"},audit:events.results,
  };
}
export async function decidePartnerHelpClaimAdmin(input:{id:string;action:"APPROVE"|"REJECT"|"REVOKE";adminEmail:string;decisionNote?:unknown;database?:D1Database;now?:Date;hashKey?:string}){
  const database=getPartnerDatabase(input.database),claim=await getPartnerHelpClaimAdmin(input.id,database);
  if(!claim)throw new PartnerHelpClaimError("Žiadosť neexistuje.",404);
  const revoke=input.action==="REVOKE";
  if(claim.status!==(revoke?"APPROVED":"PENDING"))throw new PartnerHelpClaimError("Žiadosť už bola vybavená.",409);
  if(input.action==="APPROVE"){
    const account=await getPartnerAccountById(claim.accountId,database);
    if(account?.status!=="ACTIVE")throw new PartnerHelpClaimError("Účet partnera nie je aktívny.",409);
    try{
      await assertIndependentOwnershipApprover({adminEmail:input.adminEmail,accountId:claim.accountId,
        database,hashKey:input.hashKey});
    }catch(error){
      if(error instanceof PartnerOwnershipApprovalGuardError)throw new PartnerHelpClaimError(error.message,error.status);
      throw error;
    }
    if(claim.memberships.some((member:{accountId:string})=>member.accountId!==claim.accountId)){
      throw new PartnerHelpClaimError("Záznam už spravuje iný partner. Najskôr odoberte jeho prístup.",409);
    }
  }
  const now=input.now??new Date(),iso=now.toISOString();
  const actor=`admin:${input.adminEmail.trim().toLowerCase()}`;
  const status=input.action==="APPROVE"?"APPROVED":input.action==="REJECT"?"REJECTED":"REVOKED";
  const note=normalizePartnerClaimText(input.decisionNote,2000);
  let result;
  try{
    result=await database.prepare(
      `UPDATE partner_help_claims SET status=?2,decision_note=?3,reviewed_at=?4,reviewed_by=?5,updated_at=?4,
       revoked_at=?6,revoked_by=?7 WHERE id=?1 AND status=?8`
    ).bind(input.id,status,note,iso,actor,revoke?iso:null,revoke?actor:null,revoke?"APPROVED":"PENDING").run();
  }catch(error){
    if(error instanceof Error && /UNIQUE constraint failed|partner_help_claims_.*manager/i.test(error.message))
      throw new PartnerHelpClaimError("Záznam už má aktívneho správcu.",409);
    throw error;
  }
  if(result.meta?.changes!==1)throw new PartnerHelpClaimError("Žiadosť sa medzitým zmenila.",409);
  await appendPartnerAuditEvent({actorType:"ADMIN",actorRef:actor,
    action:revoke?"MEMBERSHIP_REVOKED":input.action==="APPROVE"?"CLAIM_APPROVED":"CLAIM_REJECTED",
    targetType:"PARTNER_HELP_CLAIM",targetId:input.id,
    metadata:{resourceId:claim.resourceId,entityType:claim.entityType,accountId:claim.accountId},database,now});
  if(!revoke)await queuePartnerLifecycleNotification({accountId:claim.accountId,
    notificationType:input.action==="APPROVE"?"CLAIM_APPROVED":"CLAIM_REJECTED",
    dedupeKey:`partner-claim-${status.toLowerCase()}/${input.id}`,database,now});
  return getPartnerHelpClaimAdmin(input.id,database);
}
