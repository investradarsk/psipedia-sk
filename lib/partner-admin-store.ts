import { getAdminEntityReview, setAdminEntityReviewed, type AdminReviewEntityType } from "./admin-entity-review-store";
import { env } from "cloudflare:workers";
import { decryptPii } from "./pii-crypto";
import { appendPartnerAuditEvent, partnerResourceTypes, type PartnerResourceType, type PartnerRole } from "./partner-platform";
import { getPartnerAccountById, getPartnerDatabase, type PartnerAccountStatus } from "./partner-auth-store";
import { ensureCanonicalResource } from "./canonical-resource";
import { getPartnerContactProfile } from "./partner-contact-profile";
import { getPartnerAuthMethodSummary } from "./partner-auth-methods";
import { assertSingleActivePartnerManager } from "./partner-single-manager";
import { ensurePartnerDirectoryReviewLock } from "./partner-directory-review";
import { listPartnerAccountDossierRequests, listPartnerAccountDossierProfiles, listPartnerAccountDossierHistory } from "./partner-admin-dossier";

type Bindings = { DB?: D1Database; PII_ENCRYPTION_KEY?: string };
function db(database?: D1Database) { return getPartnerDatabase(database ?? (env as unknown as Bindings).DB); }
function piiKey(key?: string) { const value=key ?? (env as unknown as Bindings).PII_ENCRYPTION_KEY; if(!value) throw new Error("PII_ENCRYPTION_KEY nie je nakonfigurovaný."); return value; }
function validId(value:string){return /^[0-9a-f-]{20,64}$/i.test(value);}
function auditActor(email:string){return `admin:${email.trim().toLowerCase()}`;}

type AccountRow={id:string;emailCiphertext:string;contactNameCiphertext:string|null;status:PartnerAccountStatus;emailVerifiedAt:string|null;createdAt:string};

async function revealPartnerAccount(row:AccountRow,encryptionKey:string) {
  const [email,contactName]=await Promise.all([
    decryptPii(row.emailCiphertext,encryptionKey),
    row.contactNameCiphertext?decryptPii(row.contactNameCiphertext,encryptionKey):Promise.resolve(null),
  ]);
  return {...row,email,contactName};
}
type PartnerAccountAdminFilters={q?:string;page?:number;pageSize?:number;status?:string;verified?:string;access?:string;database?:D1Database;encryptionKey?:string};
const ACCOUNT_PAGE_SIZE=25;
const ACCOUNT_MAX_PAGE_SIZE=100;
const ACCOUNT_SCAN_BATCH_SIZE=200;
const accountStatuses=["PENDING_VERIFICATION","ACTIVE","SUSPENDED","DEACTIVATED"] as const;

export function normalizePartnerAccountAdminFilters(input:PartnerAccountAdminFilters={}){
  const positiveInt=(value:number|undefined,fallback:number,max:number)=>
    typeof value==="number"&&Number.isSafeInteger(value)&&value>=1?Math.min(value,max):fallback;
  return {
    q:(input.q??"").trim().normalize("NFKC").slice(0,120),
    page:positiveInt(input.page,1,10000),
    pageSize:positiveInt(input.pageSize,ACCOUNT_PAGE_SIZE,ACCOUNT_MAX_PAGE_SIZE),
    status:accountStatuses.includes(input.status as PartnerAccountStatus)?input.status as PartnerAccountStatus:"",
    verified:input.verified==="VERIFIED"||input.verified==="UNVERIFIED"?input.verified:"",
    access:input.access==="LINKED"||input.access==="UNLINKED"?input.access:"",
  };
}

export async function listPartnerAccountsAdmin(input:PartnerAccountAdminFilters={}){
  const filters=normalizePartnerAccountAdminFilters(input);
  const database=db(input.database);
  const key=piiKey(input.encryptionKey);
  const conditions:string[]=[];
  const values:unknown[]=[];
  if(filters.status){conditions.push("a.status=?");values.push(filters.status);}
  if(filters.verified==="VERIFIED")conditions.push("a.email_verified_at IS NOT NULL");
  if(filters.verified==="UNVERIFIED")conditions.push("a.email_verified_at IS NULL");
  if(filters.access==="LINKED")conditions.push("(EXISTS (SELECT 1 FROM partner_memberships m WHERE m.account_id=a.id AND m.revoked_at IS NULL) OR EXISTS (SELECT 1 FROM partner_help_claims h WHERE h.account_id=a.id AND h.status='APPROVED'))");
  if(filters.access==="UNLINKED")conditions.push("(NOT EXISTS (SELECT 1 FROM partner_memberships m WHERE m.account_id=a.id AND m.revoked_at IS NULL) AND NOT EXISTS (SELECT 1 FROM partner_help_claims h WHERE h.account_id=a.id AND h.status='APPROVED'))");
  const where=conditions.length?" WHERE "+conditions.join(" AND "):"";
  const select="SELECT a.id,a.email_ciphertext emailCiphertext,p.contact_name_ciphertext contactNameCiphertext,a.status,a.email_verified_at emailVerifiedAt,a.created_at createdAt FROM partner_accounts a LEFT JOIN partner_account_profiles p ON p.account_id=a.id";
  const order=" ORDER BY a.created_at DESC,a.id DESC";
  const offset=(filters.page-1)*filters.pageSize;
  const normalizedQuery=filters.q.toLocaleLowerCase("sk");

  let total=0;
  let pageRows:Array<AccountRow & {email:string;contactName:string|null}>=[];
  if(!normalizedQuery){
    const [count,rows]=await Promise.all([
      database.prepare("SELECT COUNT(*) total FROM partner_accounts a"+where).bind(...values).first<{total:number}>(),
      database.prepare(select+where+order+" LIMIT ? OFFSET ?").bind(...values,filters.pageSize,offset).all<AccountRow>(),
    ]);
    total=Number(count?.total??0);
    pageRows=await Promise.all(rows.results.map(row=>revealPartnerAccount(row,key)));
  }else{
    // Email is AES-GCM encrypted: substring searches cannot run against SQL ciphertext
    // or the exact-match HMAC email_hash. Scan *all* filtered accounts on the server
    // in bounded keyset batches, decrypt there, and retain only the requested page.
    let cursor:{createdAt:string;id:string}|null=null;
    while(true){
      const predicate=cursor
        ?(where?" AND ":" WHERE ")+"(a.created_at < ? OR (a.created_at = ? AND a.id < ?))"
        :"";
      const params=cursor?[...values,cursor.createdAt,cursor.createdAt,cursor.id]:values;
      const batch=(await database.prepare(select+where+predicate+order+" LIMIT ?")
        .bind(...params,ACCOUNT_SCAN_BATCH_SIZE).all<AccountRow>()).results;
      if(!batch.length)break;
      const decrypted=await Promise.all(batch.map(row=>revealPartnerAccount(row,key)));
      for(const item of decrypted){
        if(item.id.toLowerCase().includes(normalizedQuery)||item.email.toLocaleLowerCase("sk").includes(normalizedQuery)||item.contactName?.toLocaleLowerCase("sk").includes(normalizedQuery)){
          if(total>=offset&&pageRows.length<filters.pageSize)pageRows.push(item);
          total++;
        }
      }
      const last=batch[batch.length-1];
      cursor={createdAt:last.createdAt,id:last.id};
      if(batch.length<ACCOUNT_SCAN_BATCH_SIZE)break;
    }
  }

  // Aggregate only visible accounts. Never count completed claims or proposals as pending.
  // Help ownership is stored separately from partner_memberships.
  const memberships=new Map<string,number>();
  const pending=new Map<string,{requests:number;helpProfiles:number}>();
  if(pageRows.length){
    const placeholders=pageRows.map(()=>"?").join(",");
    const ids=pageRows.map(row=>row.id);
    const [membershipRows,requestRows]=await Promise.all([
      database.prepare(
        "SELECT account_id accountId,COUNT(*) activeMembershipCount FROM partner_memberships WHERE revoked_at IS NULL AND account_id IN ("+placeholders+") GROUP BY account_id"
      ).bind(...ids).all<{accountId:string;activeMembershipCount:number}>(),
      database.prepare(`
        SELECT a.id accountId,
          (SELECT COUNT(*) FROM partner_claims c WHERE c.account_id=a.id AND c.status='PENDING')
          +(SELECT COUNT(*) FROM partner_help_claims c WHERE c.account_id=a.id AND c.status='PENDING')
          +(SELECT COUNT(*) FROM moderation_submissions s JOIN partner_new_profile_metadata m ON m.submission_id=s.id
              WHERE m.partner_account_id=a.id AND s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED'))
          +(SELECT COUNT(*) FROM moderation_submissions s JOIN partner_profile_change_metadata m ON m.submission_id=s.id
              WHERE m.partner_account_id=a.id AND s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED'))
          +(SELECT COUNT(*) FROM moderation_submissions s JOIN partner_event_submission_metadata m ON m.submission_id=s.id
              WHERE m.partner_account_id=a.id AND s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED'))
          +(SELECT COUNT(*) FROM moderation_submissions s WHERE s.submitter_type='PARTNER_ACCOUNT'
              AND s.submitter_ref=a.id AND s.operation='CREATE'
              AND s.resource_type IN ('ADOPTION_DOG','LOST_FOUND_DOG','HELP_CASE')
              AND s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED'))
          +(SELECT COUNT(*) FROM partner_resource_verifications v WHERE v.account_id=a.id AND v.status='PENDING_VERIFICATION')
          +(SELECT COUNT(*) FROM partner_commercial_interests i WHERE i.account_id=a.id AND i.status='NEW')
          +(SELECT COUNT(*) FROM partner_commercial_agreements g WHERE g.account_id=a.id AND g.status='OFFERED')
          AS pendingRequests,
          (SELECT COUNT(*) FROM partner_help_claims c WHERE c.account_id=a.id AND c.status='APPROVED') AS helpProfiles
        FROM partner_accounts a WHERE a.id IN (${placeholders})
      `).bind(...ids).all<{accountId:string;pendingRequests:number;helpProfiles:number}>(),
    ]);
    for(const item of membershipRows.results)memberships.set(item.accountId,Number(item.activeMembershipCount));
    for(const item of requestRows.results)pending.set(item.accountId,{
      requests:Number(item.pendingRequests),helpProfiles:Number(item.helpProfiles),
    });
  }
  return {
    items:pageRows.map(({emailCiphertext,contactNameCiphertext,...row})=>({
      ...row,
      pendingRequestCount:pending.get(row.id)?.requests??0,
      activeMembershipCount:memberships.get(row.id)??0,
      managedProfileCount:(memberships.get(row.id)??0)+(pending.get(row.id)?.helpProfiles??0),
    })),
    total,
    page:filters.page,
    pageSize:filters.pageSize,
    totalPages:Math.max(1,Math.ceil(total/filters.pageSize)),
  };
}

/** Current external manager for a directory record; decrypted only on the Admin server. */
export async function getDirectoryPartnerOwnerAdmin(profileId: number, input: { database?: D1Database; encryptionKey?: string } = {}) {
  const database=db(input.database);
  const row=await database.prepare(`
    SELECT m.id membershipId,m.account_id accountId,m.created_at grantedAt,
      a.email_ciphertext emailCiphertext,a.status accountStatus
    FROM partner_resources r
    JOIN partner_memberships m ON m.resource_id=r.id
    JOIN partner_accounts a ON a.id=m.account_id
    WHERE r.entity_type='DIRECTORY_PROFILE' AND r.directory_profile_id=?1
      AND m.revoked_at IS NULL
    LIMIT 1
  `).bind(profileId).first<{
    membershipId:string;accountId:string;grantedAt:string;emailCiphertext:string;accountStatus:PartnerAccountStatus;
  }>();
  if(!row)return null;
  const {emailCiphertext,...owner}=row;
  return {...owner,email:await decryptPii(emailCiphertext,piiKey(input.encryptionKey))};
}

export async function getPartnerAdminSummary(database?:D1Database){
  const row=await db(database).prepare(`SELECT COUNT(*) accounts,
    SUM(status='ACTIVE') active,SUM(status='SUSPENDED') suspended,SUM(status='DEACTIVATED') deactivated,
    (SELECT COUNT(*) FROM partner_resources) resources,
    (SELECT COUNT(*) FROM partner_memberships WHERE revoked_at IS NULL) activeMemberships,
    (SELECT COUNT(DISTINCT m.account_id) FROM partner_memberships m JOIN partner_accounts p ON p.id=m.account_id WHERE m.revoked_at IS NULL AND p.status='ACTIVE') activeAccountsWithAccess,
    (SELECT COUNT(*) FROM partner_accounts p WHERE p.status='ACTIVE' AND NOT EXISTS (SELECT 1 FROM partner_memberships m WHERE m.account_id=p.id AND m.revoked_at IS NULL)) activeAccountsWithoutAccess
    FROM partner_accounts`).first<Record<string,number>>();
  return {accounts:Number(row?.accounts??0),active:Number(row?.active??0),suspended:Number(row?.suspended??0),deactivated:Number(row?.deactivated??0),resources:Number(row?.resources??0),activeMemberships:Number(row?.activeMemberships??0),activeAccountsWithAccess:Number(row?.activeAccountsWithAccess??0),activeAccountsWithoutAccess:Number(row?.activeAccountsWithoutAccess??0)};
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

/** Unified read-only account dossier. Every list is scoped to this exact account. */
export async function getPartnerAccountDossierAdmin(input:{
  accountId:string;tab:"ziadosti"|"profily"|"spravy"|"ucet"|"historia";page?:number;database?:D1Database;
}) {
  const database=db(input.database);
  const activePage=input.page??1;
  const [requests,profiles,history]=await Promise.all([
    listPartnerAccountDossierRequests(input.accountId,database,input.tab==="ziadosti"?activePage:1),
    listPartnerAccountDossierProfiles(input.accountId,database,input.tab==="profily"?activePage:1),
    input.tab==="historia"?listPartnerAccountDossierHistory(input.accountId,database,activePage):Promise.resolve(null),
  ]);
  return {requests,profiles,history};
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

export async function createPartnerMembershipAdmin(input:{accountId:string;entityType:PartnerResourceType;canonicalId:number;role?:PartnerRole;adminEmail:string;database?:D1Database;now?:Date}){
  if(!(partnerResourceTypes as readonly string[]).includes(input.entityType)||!Number.isSafeInteger(input.canonicalId)||input.canonicalId<1)throw new Error("Neplatný Partner resource.");
  if(input.role && input.role!=="OWNER")throw new Error("Externý partner má jedinú rolu: Správca profilu.");
  const database=db(input.database),account=await getPartnerAccountById(input.accountId,database);
  if(!account||account.status!=="ACTIVE")throw new Error("Partner účet musí byť aktívny.");
  const now=input.now??new Date();
  const resource=await ensureCanonicalResource({entityType:input.entityType,canonicalId:input.canonicalId,database,now});
  return ensurePartnerOwnerMembershipAdmin({accountId:input.accountId,resourceId:resource.id,adminEmail:input.adminEmail,database,now});
}

export async function changePartnerMembershipAdmin(input:{membershipId:string;role?:PartnerRole;revoke?:boolean;adminEmail:string;database?:D1Database;now?:Date}){
  if(!validId(input.membershipId))throw new Error("Neplatná membership.");if(!input.revoke && input.role!=="OWNER")throw new Error("Externý partner má jedinú rolu: Správca profilu.");
  const database=db(input.database),current=await database.prepare("SELECT id,role,revoked_at revokedAt FROM partner_memberships WHERE id=?").bind(input.membershipId).first<{id:string;role:PartnerRole;revokedAt:string|null}>();
  if(!current)throw new Error("Membership neexistuje.");if(current.revokedAt)throw new Error("Membership už bola odvolaná.");const now=(input.now??new Date()).toISOString(),actor=auditActor(input.adminEmail);
  const action=input.revoke?"MEMBERSHIP_REVOKED":"MEMBERSHIP_ROLE_CHANGED";
  if(input.revoke)await database.prepare("UPDATE partner_memberships SET revoked_at=?,revoked_by=?,updated_at=? WHERE id=? AND revoked_at IS NULL").bind(now,actor,now,input.membershipId).run();
  else {if(!input.role)throw new Error("Vyberte rolu.");await database.prepare("UPDATE partner_memberships SET role=?,updated_at=? WHERE id=? AND revoked_at IS NULL").bind(input.role,now,input.membershipId).run();}
  await appendPartnerAuditEvent({actorType:"ADMIN",actorRef:actor,action,targetType:"PARTNER_MEMBERSHIP",targetId:input.membershipId,metadata:{fromRole:current.role,toRole:input.role??null},database,now:new Date(now)});
}

async function markPartnerGrantedReview(input:{
  database:D1Database;resourceId:string;adminEmail:string;
}) {
  const row=await input.database.prepare(`
    SELECT entity_type entityType,managed_event_id eventId,
      help_organization_id organizationId
    FROM partner_resources WHERE id=?1 LIMIT 1
  `).bind(input.resourceId).first<{entityType:string;eventId:number|null;organizationId:number|null}>();
  const type:AdminReviewEntityType|null=row?.entityType==="MANAGED_EVENT"?"EVENT":
    row?.entityType==="HELP_ORGANIZATION"?"ORGANIZATION":null;
  const entityId=type==="EVENT"?row?.eventId:row?.organizationId;
  if(!type||!entityId)return;
  if(!(await getAdminEntityReview(type,entityId,input.database)).reviewed)
    await setAdminEntityReviewed(type,entityId,true,"admin:"+input.adminEmail.trim().toLowerCase(),input.database);
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
  await assertSingleActivePartnerManager({database,resourceId:input.resourceId,accountId:input.accountId});
  // Lock D1 against Notion BEFORE any new partner access is granted.
  // An existing lock stays locked after revocation; the owner can later unlock it manually.
  await ensurePartnerDirectoryReviewLock({
    database,resourceId:input.resourceId,adminEmail:input.adminEmail,now:input.now,
  });
  const current=await database.prepare(
    "SELECT id,role FROM partner_memberships WHERE account_id=?1 AND resource_id=?2 AND revoked_at IS NULL LIMIT 1",
  ).bind(input.accountId,input.resourceId).first<{id:string;role:PartnerRole}>();
  if(current?.role==="OWNER"){
    await markPartnerGrantedReview({database,resourceId:input.resourceId,adminEmail:input.adminEmail});
    return {id:current.id,resourceId:input.resourceId,role:"OWNER" as const,reused:true};
  }
  if(current){
    await changePartnerMembershipAdmin({
      membershipId:current.id,
      role:"OWNER",
      adminEmail:input.adminEmail,
      database,
      now:input.now,
    });
    await markPartnerGrantedReview({database,resourceId:input.resourceId,adminEmail:input.adminEmail});
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
  await markPartnerGrantedReview({database,resourceId:input.resourceId,adminEmail:input.adminEmail});
  return {id,resourceId:input.resourceId,role:"OWNER" as const,reused:false};
}
