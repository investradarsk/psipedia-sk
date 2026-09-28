import { env } from "cloudflare:workers";
import { decryptPii } from "./pii-crypto";
import { appendPartnerAuditEvent, partnerResourceTypes, partnerRoles, type PartnerResourceType, type PartnerRole } from "./partner-platform";
import { getPartnerAccountById, getPartnerDatabase, type PartnerAccountStatus } from "./partner-auth-store";
import { ensureCanonicalResource } from "./canonical-resource";
import { getPartnerContactProfile } from "./partner-contact-profile";
import { getPartnerAuthMethodSummary } from "./partner-auth-methods";

type Bindings = { DB?: D1Database; PII_ENCRYPTION_KEY?: string };
function db(database?: D1Database) { return getPartnerDatabase(database ?? (env as unknown as Bindings).DB); }
function piiKey(key?: string) { const value=key ?? (env as unknown as Bindings).PII_ENCRYPTION_KEY; if(!value) throw new Error("PII_ENCRYPTION_KEY nie je nakonfigurovaný."); return value; }
function validId(value:string){return /^[0-9a-f-]{20,64}$/i.test(value);}
function auditActor(email:string){return `admin:${email.trim().toLowerCase()}`;}

type AccountRow={id:string;emailCiphertext:string;status:PartnerAccountStatus;emailVerifiedAt:string|null;createdAt:string;activeMembershipCount:number};
export async function listPartnerAccountsAdmin(input:{q?:string;database?:D1Database;encryptionKey?:string}={}) {
  const rows=(await db(input.database).prepare(`SELECT a.id,a.email_ciphertext emailCiphertext,a.status,a.email_verified_at emailVerifiedAt,a.created_at createdAt,
    COUNT(m.id) activeMembershipCount FROM partner_accounts a LEFT JOIN partner_memberships m ON m.account_id=a.id AND m.revoked_at IS NULL
    GROUP BY a.id ORDER BY a.created_at DESC LIMIT 250`).all<AccountRow>()).results;
  const key=piiKey(input.encryptionKey); const q=(input.q??"").trim().toLocaleLowerCase("sk");
  const items=await Promise.all(rows.map(async row=>({...row,email:await decryptPii(row.emailCiphertext,key)})));
  return q?items.filter(item=>item.email.toLocaleLowerCase("sk").includes(q)||item.id.toLowerCase().includes(q)):items;
}

export async function getPartnerAdminSummary(database?:D1Database){
  const row=await db(database).prepare(`SELECT COUNT(*) accounts,
    SUM(status='ACTIVE') active,SUM(status='SUSPENDED') suspended,SUM(status='DEACTIVATED') deactivated,
    (SELECT COUNT(*) FROM partner_resources) resources,
    (SELECT COUNT(*) FROM partner_memberships WHERE revoked_at IS NULL) activeMemberships FROM partner_accounts`).first<Record<string,number>>();
  return {accounts:Number(row?.accounts??0),active:Number(row?.active??0),suspended:Number(row?.suspended??0),deactivated:Number(row?.deactivated??0),resources:Number(row?.resources??0),activeMemberships:Number(row?.activeMemberships??0)};
}

export async function getPartnerAccountAdmin(id:string,input:{database?:D1Database;encryptionKey?:string}={}){
  const account=await getPartnerAccountById(id,db(input.database)); if(!account)return null;
  const database=db(input.database);
  const key=piiKey(input.encryptionKey);
  const [memberships,audit,sessions,contactProfile,authMethods]=await Promise.all([
    database.prepare(`SELECT m.id,m.resource_id resourceId,m.role,m.created_at createdAt,m.updated_at updatedAt,m.revoked_at revokedAt,m.revoked_by revokedBy,r.entity_type entityType,
      COALESCE(d.name,o.name,e.title) resourceName FROM partner_memberships m JOIN partner_resources r ON r.id=m.resource_id
      LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id LEFT JOIN help_organizations o ON o.id=r.help_organization_id LEFT JOIN managed_events e ON e.id=r.managed_event_id
      WHERE m.account_id=? ORDER BY m.created_at DESC`).bind(id).all(),
    database.prepare(`SELECT id,actor_type actorType,actor_ref actorRef,action,target_type targetType,target_id targetId,metadata_json metadataJson,created_at createdAt FROM partner_audit_events WHERE target_id=? OR actor_ref=? ORDER BY created_at DESC LIMIT 100`).bind(id,`partner:${id}`).all(),
    database.prepare(`SELECT COUNT(*) total,SUM(revoked_at IS NULL AND expires_at>datetime('now')) active,MAX(created_at) lastCreatedAt FROM resource_management_sessions WHERE resource_type='PARTNER_ACCOUNT' AND subject_id=?`).bind(id).first(),
    getPartnerContactProfile(id,{database,encryptionKey:key}),
    getPartnerAuthMethodSummary(id,database),
  ]);
  return {...account,email:await decryptPii(account.emailCiphertext,key),contactProfile,authMethods,memberships:memberships.results,audit:audit.results,sessions:sessions??{total:0,active:0,lastCreatedAt:null}};
}

export async function setPartnerAccountStatusAdmin(input:{accountId:string;action:"SUSPEND"|"REACTIVATE"|"DEACTIVATE"|"REVOKE_SESSIONS";adminEmail:string;database?:D1Database;now?:Date}){
  const database=db(input.database),account=await getPartnerAccountById(input.accountId,database); if(!account)throw new Error("Partner účet neexistuje.");
  const now=(input.now??new Date()).toISOString(),actor=auditActor(input.adminEmail);
  let action:"ACCOUNT_SUSPENDED"|"ACCOUNT_REACTIVATED"|"ACCOUNT_DEACTIVATED"|"SESSIONS_REVOKED";
  if(input.action==="REACTIVATE"){
    if(account.status!=="SUSPENDED")throw new Error("Reaktivovať možno iba suspendovaný účet.");
    await database.prepare("UPDATE partner_accounts SET status='ACTIVE',suspended_at=NULL,updated_at=?2 WHERE id=?1 AND status='SUSPENDED'").bind(input.accountId,now).run(); action="ACCOUNT_REACTIVATED";
  }else if(input.action==="SUSPEND"||input.action==="DEACTIVATE"){
    if(input.action==="SUSPEND"&&account.status!=="ACTIVE")throw new Error("Suspendovať možno iba aktívny účet.");
    if(input.action==="DEACTIVATE"&&account.status==="DEACTIVATED")throw new Error("Účet je už deaktivovaný.");
    const status=input.action==="SUSPEND"?"SUSPENDED":"DEACTIVATED",column=input.action==="SUSPEND"?"suspended_at":"deactivated_at";
    await database.batch([
      database.prepare(`UPDATE partner_accounts SET status=?,${column}=?,updated_at=? WHERE id=?`).bind(status,now,now,input.accountId),
      database.prepare("UPDATE resource_management_sessions SET revoked_at=? WHERE resource_type='PARTNER_ACCOUNT' AND subject_id=? AND revoked_at IS NULL").bind(now,input.accountId),
      database.prepare("UPDATE resource_access_tokens SET revoked_at=? WHERE resource_type='PARTNER_ACCOUNT' AND subject_id=? AND used_at IS NULL AND revoked_at IS NULL").bind(now,input.accountId),
    ]); action=input.action==="SUSPEND"?"ACCOUNT_SUSPENDED":"ACCOUNT_DEACTIVATED";
  }else{
    await database.prepare("UPDATE resource_management_sessions SET revoked_at=? WHERE resource_type='PARTNER_ACCOUNT' AND subject_id=? AND revoked_at IS NULL").bind(now,input.accountId).run(); action="SESSIONS_REVOKED";
  }
  await appendPartnerAuditEvent({actorType:"ADMIN",actorRef:actor,action,targetType:"PARTNER_ACCOUNT",targetId:input.accountId,now:new Date(now),database});
  if(input.action==="SUSPEND"||input.action==="DEACTIVATE") await appendPartnerAuditEvent({actorType:"ADMIN",actorRef:actor,action:"SESSIONS_REVOKED",targetType:"PARTNER_ACCOUNT",targetId:input.accountId,metadata:{reason:input.action.toLowerCase()},now:new Date(now),database});
  return getPartnerAccountById(input.accountId,database);
}

export async function searchCanonicalPartnerResources(input:{q?:string;type?:PartnerResourceType;database?:D1Database}){
  const database=db(input.database),q=`%${(input.q??"").trim().replaceAll("%","").slice(0,100)}%`,type=input.type;
  const parts=[] as string[]; const binds:unknown[]=[];
  if(!type||type==="DIRECTORY_PROFILE")parts.push("SELECT 'DIRECTORY_PROFILE' entityType,id,name,slug,status FROM directory_profiles WHERE name LIKE ? COLLATE NOCASE");
  if(!type||type==="HELP_ORGANIZATION")parts.push("SELECT 'HELP_ORGANIZATION' entityType,id,name,slug,status FROM help_organizations WHERE name LIKE ? COLLATE NOCASE");
  if(!type||type==="MANAGED_EVENT")parts.push("SELECT 'MANAGED_EVENT' entityType,id,title name,slug,status FROM managed_events WHERE title LIKE ? COLLATE NOCASE");
  for(let i=0;i<parts.length;i++)binds.push(q);
  return (await database.prepare(parts.join(" UNION ALL ")+" ORDER BY name COLLATE NOCASE LIMIT 50").bind(...binds).all()).results;
}

export async function createPartnerMembershipAdmin(input:{accountId:string;entityType:PartnerResourceType;canonicalId:number;role:PartnerRole;adminEmail:string;database?:D1Database;now?:Date}){
  if(!(partnerResourceTypes as readonly string[]).includes(input.entityType)||!(partnerRoles as readonly string[]).includes(input.role)||!Number.isSafeInteger(input.canonicalId)||input.canonicalId<1)throw new Error("Neplatný Partner resource alebo rola.");
  const database=db(input.database),account=await getPartnerAccountById(input.accountId,database);if(!account)throw new Error("Partner účet neexistuje.");
  const nowDate=input.now??new Date();
  const resource=await ensureCanonicalResource({entityType:input.entityType,canonicalId:input.canonicalId,database,now:nowDate});
  const now=nowDate.toISOString();
  const id=crypto.randomUUID();
  await database.prepare("INSERT INTO partner_memberships(id,account_id,resource_id,role,created_at,created_by,updated_at) VALUES(?,?,?,?,?,?,?)").bind(id,input.accountId,resource.id,input.role,now,auditActor(input.adminEmail),now).run();
  await appendPartnerAuditEvent({actorType:"ADMIN",actorRef:auditActor(input.adminEmail),action:"MEMBERSHIP_CREATED",targetType:"PARTNER_MEMBERSHIP",targetId:id,metadata:{accountId:input.accountId,resourceId:resource.id,role:input.role},database,now:new Date(now)});return {id,resourceId:resource.id};
}

export async function changePartnerMembershipAdmin(input:{membershipId:string;role?:PartnerRole;revoke?:boolean;adminEmail:string;database?:D1Database;now?:Date}){
  if(!validId(input.membershipId))throw new Error("Neplatná membership.");if(input.role&&!(partnerRoles as readonly string[]).includes(input.role))throw new Error("Neplatná Partner rola.");
  const database=db(input.database),current=await database.prepare("SELECT id,role,revoked_at revokedAt FROM partner_memberships WHERE id=?").bind(input.membershipId).first<{id:string;role:PartnerRole;revokedAt:string|null}>();
  if(!current)throw new Error("Membership neexistuje.");if(current.revokedAt)throw new Error("Membership už bola odvolaná.");const now=(input.now??new Date()).toISOString(),actor=auditActor(input.adminEmail);
  const action=input.revoke?"MEMBERSHIP_REVOKED":"MEMBERSHIP_ROLE_CHANGED";
  if(input.revoke)await database.prepare("UPDATE partner_memberships SET revoked_at=?,revoked_by=?,updated_at=? WHERE id=? AND revoked_at IS NULL").bind(now,actor,now,input.membershipId).run();
  else {if(!input.role)throw new Error("Vyberte rolu.");await database.prepare("UPDATE partner_memberships SET role=?,updated_at=? WHERE id=? AND revoked_at IS NULL").bind(input.role,now,input.membershipId).run();}
  await appendPartnerAuditEvent({actorType:"ADMIN",actorRef:actor,action,targetType:"PARTNER_MEMBERSHIP",targetId:input.membershipId,metadata:{fromRole:current.role,toRole:input.role??null},database,now:new Date(now)});
}

export async function ensurePartnerOwnerMembershipAdmin(input:{
  accountId:string;
  resourceId:string;
  adminEmail:string;
  database?:D1Database;
  now?:Date;
}){
  const database=db(input.database);
  const account=await getPartnerAccountById(input.accountId,database);
  if(!account||account.status!=="ACTIVE")throw new Error("Partner účet musí byť aktívny.");
  const resource=await database.prepare("SELECT id FROM partner_resources WHERE id=?1 LIMIT 1").bind(input.resourceId).first<{id:string}>();
  if(!resource)throw new Error("Partner resource neexistuje.");
  const current=await database.prepare(
    "SELECT id,role FROM partner_memberships WHERE account_id=?1 AND resource_id=?2 AND revoked_at IS NULL LIMIT 1",
  ).bind(input.accountId,input.resourceId).first<{id:string;role:PartnerRole}>();
  if(current?.role==="OWNER")return {id:current.id,resourceId:input.resourceId,role:"OWNER" as const,reused:true};
  if(current){
    await changePartnerMembershipAdmin({
      membershipId:current.id,
      role:"OWNER",
      adminEmail:input.adminEmail,
      database,
      now:input.now,
    });
    return {id:current.id,resourceId:input.resourceId,role:"OWNER" as const,reused:false};
  }
  const now=input.now??new Date(),iso=now.toISOString(),id=crypto.randomUUID(),actor=auditActor(input.adminEmail);
  await database.prepare(
    "INSERT INTO partner_memberships(id,account_id,resource_id,role,created_at,created_by,updated_at) VALUES(?1,?2,?3,'OWNER',?4,?5,?4)",
  ).bind(id,input.accountId,input.resourceId,iso,actor).run();
  await appendPartnerAuditEvent({
    actorType:"ADMIN",
    actorRef:actor,
    action:"MEMBERSHIP_CREATED",
    targetType:"PARTNER_MEMBERSHIP",
    targetId:id,
    metadata:{accountId:input.accountId,resourceId:input.resourceId,role:"OWNER"},
    database,
    now,
  });
  return {id,resourceId:input.resourceId,role:"OWNER" as const,reused:false};
}
