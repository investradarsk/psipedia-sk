import { env } from "cloudflare:workers";
import { slugifyArticleTitle } from "@/lib/article-store";
import { adminAuditActorRef } from "@/lib/audit-identity";
import { deterministicCanonicalResourceId } from "@/lib/canonical-resource";
import {
  buildManagedDirectoryProfileCreateStatement,
  normalizeManagedDirectoryProfileInput,
} from "@/lib/directory-store";
import { parseOrganizationAdminInput } from "@/lib/help-organization-admin-input";
import { buildOrganizationCreateStatement } from "@/lib/help-organization-admin-write";
import { decryptPii } from "@/lib/pii-crypto";
import { getPartnerDatabase } from "@/lib/partner-auth-store";
import {
  isPartnerProfileChangeRejectionReason,
  publicPartnerProfileChangeReason,
  type PartnerProfileChangeRejectionReason,
} from "@/lib/partner-profile-changes";
import {
  normalizePartnerNewProfile,
  type PartnerDuplicateCandidate,
  type PartnerDuplicateConfidence,
  type PartnerNewProfileResourceType,
  PartnerNewProfileError,
} from "@/lib/partner-new-profile";
import {
  applyAtomicModerationTransition,
  isFoundationSubmissionStatus,
  type FoundationSubmissionStatus,
} from "@/lib/moderation-transition";
import { transitionModerationSubmission } from "@/lib/moderation-store";

type Bindings = { DB?: D1Database; PII_ENCRYPTION_KEY?: string };
type Resolution = "CREATED_NEW" | "LINKED_EXISTING";

type AdminRow = {
  id:string;
  resourceType:PartnerNewProfileResourceType;
  status:string;
  submitterRef:string|null;
  proposedPatchJson:string;
  riskFlagsJson:string;
  duplicateResourceType:string|null;
  duplicateSubjectId:string|null;
  rejectionReasonCode:string|null;
  createdAt:string;
  updatedAt:string;
  reviewedAt:string|null;
  reviewedBy:string|null;
  accountId:string;
  emailCiphertext:string;
  displayName:string;
  categoryOrType:string;
  identityFingerprint:string;
  duplicateConfidence:PartnerDuplicateConfidence;
  duplicateCandidatesJson:string;
  resolutionType:Resolution|null;
  resolvedResourceId:string|null;
  resolvedCanonicalId:number|null;
  dedupeActive:number;
};

function db(input?:D1Database){return getPartnerDatabase(input??(env as unknown as Bindings).DB);}
function piiKey(value?:string){
  const key=value??(env as unknown as Bindings).PII_ENCRYPTION_KEY;
  if(!key)throw new PartnerNewProfileError("PII_ENCRYPTION_KEY nie je nakonfigurovaný.",503);
  return key;
}
function safeJson<T>(value:string,fallback:T):T{try{return JSON.parse(value) as T;}catch{return fallback;}}
function active(status:string){return status==="SUBMITTED"||status==="PENDING_REVIEW"||status==="QUARANTINED";}
function statusLabel(status:string){
  if(status==="SUBMITTED")return "Nové";
  if(status==="PENDING_REVIEW")return "Čaká na rozhodnutie";
  if(status==="QUARANTINED")return "Dodatočná kontrola";
  if(status==="APPROVED")return "Schválené";
  if(status==="REJECTED")return "Zamietnuté";
  return "Zrušené";
}
function safeCandidates(value:string){
  const parsed=safeJson<unknown>(value,[]);
  if(!Array.isArray(parsed))return [] as PartnerDuplicateCandidate[];
  return parsed.filter((item):item is PartnerDuplicateCandidate=>
    Boolean(item)&&typeof item==="object"&&typeof (item as PartnerDuplicateCandidate).canonicalId==="number"&&
    typeof (item as PartnerDuplicateCandidate).name==="string"&&Array.isArray((item as PartnerDuplicateCandidate).reasons)
  ).slice(0,8);
}
const BASE=`
  SELECT s.id,s.resource_type resourceType,s.status,s.submitter_ref submitterRef,
    s.proposed_patch_json proposedPatchJson,s.risk_flags_json riskFlagsJson,
    s.duplicate_resource_type duplicateResourceType,s.duplicate_subject_id duplicateSubjectId,
    s.rejection_reason_code rejectionReasonCode,s.created_at createdAt,s.updated_at updatedAt,
    s.reviewed_at reviewedAt,s.reviewed_by reviewedBy,
    m.partner_account_id accountId,a.email_ciphertext emailCiphertext,
    m.display_name displayName,m.category_or_type categoryOrType,m.identity_fingerprint identityFingerprint,
    m.duplicate_confidence duplicateConfidence,m.duplicate_candidates_json duplicateCandidatesJson,
    m.resolution_type resolutionType,m.resolved_resource_id resolvedResourceId,
    m.resolved_canonical_id resolvedCanonicalId,m.dedupe_active dedupeActive
  FROM partner_new_profile_metadata m
  JOIN moderation_submissions s ON s.id=m.submission_id
  JOIN partner_accounts a ON a.id=m.partner_account_id
`;

async function raw(id:string,database:D1Database){
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(id))return null;
  return database.prepare(BASE+" WHERE s.id=?1 LIMIT 1").bind(id).first<AdminRow>();
}
async function hydrate(row:AdminRow,key:string){
  return {
    ...row,
    email:await decryptPii(row.emailCiphertext,key),
    duplicateCandidates:safeCandidates(row.duplicateCandidatesJson),
    riskFlags:safeJson<string[]>(row.riskFlagsJson,[]).filter((item)=>typeof item==="string"),
    proposedProfile:normalizePartnerNewProfile(row.resourceType,safeJson(row.proposedPatchJson,{})),
    active:active(row.status),
    statusLabel:statusLabel(row.status),
    rejectionReason:publicPartnerProfileChangeReason(row.rejectionReasonCode),
  };
}

export async function listPartnerNewProfilesAdmin(input:{
  status?:string;resourceType?:string;categoryOrType?:string;duplicateConfidence?:string;q?:string;
  database?:D1Database;encryptionKey?:string;
}={}){
  const database=db(input.database);
  const rows=(await database.prepare(BASE+`
    ORDER BY CASE WHEN s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') THEN 0 ELSE 1 END,
      CASE WHEN s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') THEN s.created_at END ASC,
      s.updated_at DESC LIMIT 300
  `).all<AdminRow>()).results;
  let items=await Promise.all(rows.map((row)=>hydrate(row,piiKey(input.encryptionKey))));
  if(input.status&&input.status!=="all"){
    if(input.status==="active")items=items.filter((item)=>item.active);
    else if(input.status==="history")items=items.filter((item)=>!item.active);
    else if(!isFoundationSubmissionStatus(input.status))throw new PartnerNewProfileError("Neplatný filter statusu.");
    else items=items.filter((item)=>item.status===input.status);
  }
  if(input.resourceType&&input.resourceType!=="all"){
    if(!["DIRECTORY_PROFILE","HELP_ORGANIZATION"].includes(input.resourceType))throw new PartnerNewProfileError("Neplatný typ profilu.");
    items=items.filter((item)=>item.resourceType===input.resourceType);
  }
  if(input.categoryOrType&&input.categoryOrType!=="all")items=items.filter((item)=>item.categoryOrType===input.categoryOrType);
  if(input.duplicateConfidence&&input.duplicateConfidence!=="all"){
    if(!["NONE","MEDIUM","HIGH"].includes(input.duplicateConfidence))throw new PartnerNewProfileError("Neplatný duplicate filter.");
    items=items.filter((item)=>item.duplicateConfidence===input.duplicateConfidence);
  }
  const q=(input.q??"").trim().toLocaleLowerCase("sk");
  if(q)items=items.filter((item)=>[item.email,item.accountId,item.displayName,item.id,item.categoryOrType].some((v)=>v.toLocaleLowerCase("sk").includes(q)));
  return items;
}

export async function getPartnerNewProfileAdmin(id:string,input:{database?:D1Database;encryptionKey?:string}={}){
  const database=db(input.database);
  const row=await raw(id,database);
  if(!row)return null;
  const item=await hydrate(row,piiKey(input.encryptionKey));
  const moderation=(await database.prepare(`
    SELECT id,action,actor_type actorType,actor_ref actorRef,from_status fromStatus,to_status toStatus,
      reason_code reasonCode,changed_fields_json changedFieldsJson,created_at createdAt
    FROM moderation_events WHERE submission_id=?1 ORDER BY created_at ASC,id ASC
  `).bind(id).all()).results;
  return {...item,moderation};
}

async function ensurePendingReview(id:string,status:string,actorRef:string,database:D1Database,requestId?:string|null){
  if(status==="PENDING_REVIEW")return;
  if(status!=="SUBMITTED"&&status!=="QUARANTINED")throw new PartnerNewProfileError("Tento návrh už nie je možné rozhodnúť.",409);
  await transitionModerationSubmission({id,toStatus:"PENDING_REVIEW",actorType:"ADMIN",actorRef,requestId:requestId??null});
}

async function uniqueDirectorySlug(database:D1Database,name:string,category:string){
  const base=slugifyArticleTitle(name)||"profil";
  for(let i=1;i<=1000;i++){
    const slug=i===1?base:`${base}-${i}`;
    const row=await database.prepare("SELECT id FROM directory_profiles WHERE category=?1 AND slug=?2 LIMIT 1").bind(category,slug).first();
    if(!row)return slug;
  }
  throw new PartnerNewProfileError("Nepodarilo sa vytvoriť unikátnu adresu profilu.",409);
}
async function uniqueOrganizationSlug(database:D1Database,name:string){
  const base=slugifyArticleTitle(name)||"organizacia";
  for(let i=1;i<=1000;i++){
    const slug=i===1?base:`${base}-${i}`;
    const row=await database.prepare("SELECT id FROM help_organizations WHERE slug=?1 LIMIT 1").bind(slug).first();
    if(!row)return slug;
  }
  throw new PartnerNewProfileError("Nepodarilo sa vytvoriť unikátnu adresu organizácie.",409);
}

function resourceSelect(type:PartnerNewProfileResourceType,canonicalId:number){
  return type==="DIRECTORY_PROFILE"
    ? {column:"directory_profile_id",id:deterministicCanonicalResourceId(type,canonicalId)}
    : {column:"help_organization_id",id:deterministicCanonicalResourceId(type,canonicalId)};
}

async function canonicalExists(type:PartnerNewProfileResourceType,canonicalId:number,database:D1Database){
  if(!Number.isSafeInteger(canonicalId)||canonicalId<=0)return null;
  if(type==="DIRECTORY_PROFILE"){
    return database.prepare("SELECT id,name,slug,category,status FROM directory_profiles WHERE id=?1 AND status<>'archived' LIMIT 1")
      .bind(canonicalId).first<{id:number;name:string;slug:string;category:string;status:string}>();
  }
  return database.prepare("SELECT id,name,slug,type,status FROM help_organizations WHERE id=?1 AND status<>'ARCHIVED' LIMIT 1")
    .bind(canonicalId).first<{id:number;name:string;slug:string;type:string;status:string}>();
}

function resourceAnchorStatement(database:D1Database,input:{
  type:PartnerNewProfileResourceType;canonicalId?:number;category?:string;slug?:string;nowIso:string;
}){
  if(input.canonicalId){
    const spec=resourceSelect(input.type,input.canonicalId);
    const table=input.type==="DIRECTORY_PROFILE"?"directory_profiles":"help_organizations";
    return database.prepare(`INSERT OR IGNORE INTO partner_resources(id,entity_type,${spec.column},created_at,updated_at)
      SELECT ?1,?2,id,?3,?3 FROM ${table} WHERE id=?4`)
      .bind(spec.id,input.type,input.nowIso,input.canonicalId);
  }
  if(input.type==="DIRECTORY_PROFILE"){
    return database.prepare(`INSERT OR IGNORE INTO partner_resources(id,entity_type,directory_profile_id,created_at,updated_at)
      SELECT 'directory-profile-'||id,'DIRECTORY_PROFILE',id,?1,?1 FROM directory_profiles
      WHERE category=?2 AND slug=?3 AND status='draft'`).bind(input.nowIso,input.category,input.slug);
  }
  return database.prepare(`INSERT OR IGNORE INTO partner_resources(id,entity_type,help_organization_id,created_at,updated_at)
    SELECT 'help-organization-'||id,'HELP_ORGANIZATION',id,?1,?1 FROM help_organizations
    WHERE slug=?2 AND status='DRAFT'`).bind(input.nowIso,input.slug);
}

function resourceSubquery(type:PartnerNewProfileResourceType,canonicalSql:string){
  const column=type==="DIRECTORY_PROFILE"?"directory_profile_id":"help_organization_id";
  return `SELECT r.id FROM partner_resources r WHERE r.${column}=(${canonicalSql}) LIMIT 1`;
}

function membershipStatements(database:D1Database,input:{
  accountId:string;type:PartnerNewProfileResourceType;canonicalSql:string;membershipId:string;actorRef:string;nowIso:string;
  existingMembership:{id:string;role:string}|null;
}){
  const resourceSql=resourceSubquery(input.type,input.canonicalSql);
  const statements:D1PreparedStatement[]=[];
  if(!input.existingMembership){
    statements.push(database.prepare(`INSERT OR IGNORE INTO partner_memberships(
      id,account_id,resource_id,role,created_at,created_by,updated_at
    ) SELECT ?1,?2,(${resourceSql}),'OWNER',?3,?4,?3
      WHERE EXISTS(${resourceSql})`).bind(input.membershipId,input.accountId,input.nowIso,input.actorRef));
    statements.push(database.prepare(`INSERT INTO partner_audit_events(
      id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at
    ) SELECT ?1,'ADMIN',?2,'MEMBERSHIP_CREATED','PARTNER_MEMBERSHIP',?3,?4,?5
      WHERE EXISTS(SELECT 1 FROM partner_memberships WHERE id=?3)`)
      .bind(crypto.randomUUID(),input.actorRef,input.membershipId,JSON.stringify({accountId:input.accountId,role:"OWNER"}),input.nowIso));
  }else if(input.existingMembership.role!=="OWNER"){
    statements.push(database.prepare(`UPDATE partner_memberships SET role='OWNER',updated_at=?1
      WHERE id=?2 AND revoked_at IS NULL`).bind(input.nowIso,input.existingMembership.id));
    statements.push(database.prepare(`INSERT INTO partner_audit_events(
      id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at
    ) VALUES(?1,'ADMIN',?2,'MEMBERSHIP_ROLE_CHANGED','PARTNER_MEMBERSHIP',?3,?4,?5)`)
      .bind(crypto.randomUUID(),input.actorRef,input.existingMembership.id,JSON.stringify({fromRole:input.existingMembership.role,toRole:"OWNER"}),input.nowIso));
  }
  return statements;
}

function verificationStatements(database:D1Database,input:{
  accountId:string;type:PartnerNewProfileResourceType;canonicalSql:string;verificationId:string;actorRef:string;nowIso:string;
  current:{id:string;status:string}|null;
}){
  if(input.current?.status==="VERIFIED")return [] as D1PreparedStatement[];
  const resourceSql=resourceSubquery(input.type,input.canonicalSql);
  const statements:D1PreparedStatement[]=[];
  if(input.current){
    statements.push(database.prepare(`UPDATE partner_resource_verifications
      SET status='PENDING_VERIFICATION',submitted_at=?1,updated_at=?1,reviewed_at=NULL,reviewed_by=NULL,review_note=NULL
      WHERE id=?2`).bind(input.nowIso,input.current.id));
  }else{
    statements.push(database.prepare(`INSERT OR IGNORE INTO partner_resource_verifications(
      id,account_id,resource_id,status,created_at,updated_at,submitted_at
    ) SELECT ?1,?2,(${resourceSql}),'PENDING_VERIFICATION',?3,?3,?3
      WHERE EXISTS(${resourceSql})`).bind(input.verificationId,input.accountId,input.nowIso));
  }
  const targetId=input.current?.id??input.verificationId;
  statements.push(database.prepare(`INSERT INTO partner_audit_events(
    id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at
  ) SELECT ?1,'ADMIN',?2,'VERIFICATION_REQUESTED','PARTNER_RESOURCE_VERIFICATION',?3,?4,?5
    WHERE EXISTS(SELECT 1 FROM partner_resource_verifications WHERE id=?3 AND status='PENDING_VERIFICATION')`)
    .bind(crypto.randomUUID(),input.actorRef,targetId,JSON.stringify({source:"new_profile_resolution"}),input.nowIso));
  return statements;
}

function resolutionMetadataStatement(database:D1Database,input:{
  submissionId:string;type:PartnerNewProfileResourceType;canonicalSql:string;resolution:Resolution;nowIso:string;actorRef:string;
}){
  const resourceSql=resourceSubquery(input.type,input.canonicalSql);
  return database.prepare(`UPDATE partner_new_profile_metadata
    SET resolution_type=?1,resolved_canonical_id=(${input.canonicalSql}),
      resolved_resource_id=(${resourceSql}),dedupe_active=0
    WHERE submission_id=?2 AND EXISTS(
      SELECT 1 FROM moderation_submissions WHERE id=?2 AND status='APPROVED' AND reviewed_at=?3 AND reviewed_by=?4
    ) AND EXISTS(${resourceSql})`)
    .bind(input.resolution,input.submissionId,input.nowIso,input.actorRef);
}
function subjectResolutionStatement(database:D1Database,input:{
  submissionId:string;canonicalSql:string;nowIso:string;actorRef:string;
}){
  return database.prepare(`UPDATE moderation_submissions SET subject_id=CAST((${input.canonicalSql}) AS TEXT)
    WHERE id=?1 AND status='APPROVED' AND reviewed_at=?2 AND reviewed_by=?3`)
    .bind(input.submissionId,input.nowIso,input.actorRef);
}
function newProfileAuditStatement(database:D1Database,input:{
  submissionId:string;accountId:string;action:"NEW_PROFILE_CREATED"|"NEW_PROFILE_LINKED_EXISTING";
  resolution:Resolution;canonicalSql:string;type:PartnerNewProfileResourceType;actorRef:string;nowIso:string;
}){
  const resourceSql=resourceSubquery(input.type,input.canonicalSql);
  return database.prepare(`INSERT INTO partner_audit_events(
    id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at
  ) SELECT ?1,'ADMIN',?2,?3,'MODERATION_SUBMISSION',?4,?5,?6
    WHERE EXISTS(SELECT 1 FROM partner_new_profile_metadata
      WHERE submission_id=?4 AND resolution_type=?7 AND resolved_resource_id=(${resourceSql}))`)
    .bind(crypto.randomUUID(),input.actorRef,input.action,input.submissionId,
      JSON.stringify({accountId:input.accountId,resolution:input.resolution}),input.nowIso,input.resolution);
}
function notificationStatement(database:D1Database,input:{
  submissionId:string;accountId:string;type:"NEW_PROFILE_CREATED"|"NEW_PROFILE_LINKED_EXISTING"|"NEW_PROFILE_REJECTED";
  status:"APPROVED"|"REJECTED";actorRef:string;now:Date;nowIso:string;
}){
  const expiresAt=new Date(input.now.getTime()+30*24*60*60*1000).toISOString();
  return database.prepare(`INSERT OR IGNORE INTO partner_notification_outbox(
    id,partner_account_id,notification_type,dedupe_key,status,encrypted_secret,expires_at,attempts,created_at,updated_at
  ) SELECT ?1,?2,?3,?4,'PENDING',NULL,?5,0,?6,?6
    WHERE EXISTS(SELECT 1 FROM moderation_submissions
      WHERE id=?7 AND status=?8 AND updated_at=?6 AND reviewed_by=?9)`)
    .bind(crypto.randomUUID(),input.accountId,input.type,
      `partner-new-profile-${input.type.toLowerCase()}/${input.submissionId}`,expiresAt,input.nowIso,
      input.submissionId,input.status,input.actorRef);
}

async function currentMembershipAndVerification(input:{
  accountId:string;type:PartnerNewProfileResourceType;canonicalId:number;database:D1Database;
}){
  const column=input.type==="DIRECTORY_PROFILE"?"directory_profile_id":"help_organization_id";
  const resource=await input.database.prepare(`SELECT id FROM partner_resources WHERE ${column}=?1 LIMIT 1`)
    .bind(input.canonicalId).first<{id:string}>();
  if(!resource)return {membership:null,verification:null};
  const [membership,verification]=await Promise.all([
    input.database.prepare(`SELECT id,role FROM partner_memberships
      WHERE account_id=?1 AND resource_id=?2 AND revoked_at IS NULL LIMIT 1`)
      .bind(input.accountId,resource.id).first<{id:string;role:string}>(),
    input.database.prepare(`SELECT id,status FROM partner_resource_verifications
      WHERE account_id=?1 AND resource_id=?2 LIMIT 1`)
      .bind(input.accountId,resource.id).first<{id:string;status:string}>(),
  ]);
  return {membership:membership??null,verification:verification??null};
}

export async function createPartnerNewProfileAdmin(input:{
  id:string;adminEmail:string;requestId?:string|null;database?:D1Database;now?:Date;
}){
  const database=db(input.database);
  let row=await raw(input.id,database);
  if(!row)throw new PartnerNewProfileError("Návrh sa nenašiel.",404);
  if(row.status==="APPROVED"&&row.resolutionType)return getPartnerNewProfileAdmin(input.id,{database});
  const actorRef=await adminAuditActorRef(input.adminEmail);
  await ensurePendingReview(input.id,row.status,actorRef,database,input.requestId);
  row=await raw(input.id,database);
  if(!row||row.status!=="PENDING_REVIEW")throw new PartnerNewProfileError("Stav návrhu sa medzičasom zmenil.",409);

  const account=await database.prepare("SELECT status FROM partner_accounts WHERE id=?1 LIMIT 1").bind(row.accountId).first<{status:string}>();
  if(!account||account.status!=="ACTIVE")throw new PartnerNewProfileError("Partner účet už nie je aktívny.",409);
  const normalized=normalizePartnerNewProfile(row.resourceType,safeJson(row.proposedPatchJson,{}));
  const now=input.now??new Date(),nowIso=now.toISOString();
  const membershipId=crypto.randomUUID(),verificationId=crypto.randomUUID();
  const canonicalStatements:D1PreparedStatement[]=[];
  let canonicalSql="",slug="";
  let canonicalCategory:string|undefined;

  if(row.resourceType==="DIRECTORY_PROFILE"){
    const values=normalized.values;
    canonicalCategory=String(values.category);
    slug=await uniqueDirectorySlug(database,normalized.displayName,canonicalCategory);
    const canonicalInput=normalizeManagedDirectoryProfileInput({
      slug,name:String(values.name),category:canonicalCategory,status:"draft",
      excerpt:String(values.excerpt),description:String(values.description),
      services:Array.isArray(values.services)?values.services:[],qualifications:Array.isArray(values.qualifications)?values.qualifications:[],
      city:String(values.city),district:String(values.district),region:String(values.region),address:String(values.address),
      online:Boolean(values.online),priceNote:String(values.priceNote),websiteUrl:String(values.websiteUrl)||null,
      publicPhone:String(values.publicPhone),publicEmail:String(values.publicEmail),
      facebookUrl:String(values.facebookUrl),instagramUrl:String(values.instagramUrl),
      internalEmail:null,imageUrl:null,imageKey:null,verified:false,featured:false,seo:{},
    });
    canonicalStatements.push(buildManagedDirectoryProfileCreateStatement(database,canonicalInput,actorRef,nowIso,{submissionId:input.id,actorRef}));
    canonicalSql=`SELECT id FROM directory_profiles WHERE category='${canonicalCategory.replaceAll("'","''")}' AND slug='${slug.replaceAll("'","''")}' LIMIT 1`;
  }else{
    const values=normalized.values;
    slug=await uniqueOrganizationSlug(database,normalized.displayName);
    const organizationInput=parseOrganizationAdminInput({
      name:String(values.name),slug,legalName:String(values.legalName),registrationNumber:String(values.registrationNumber)||null,
      type:String(values.type),shortDescription:String(values.shortDescription),description:String(values.description),
      publicEmail:String(values.publicEmail)||null,publicPhone:String(values.publicPhone)||null,
      websiteUrl:String(values.websiteUrl)||null,facebookUrl:String(values.facebookUrl)||null,instagramUrl:String(values.instagramUrl)||null,
      imageUrl:null,imageKey:null,sourceUrl:null,
    });
    canonicalStatements.push(buildOrganizationCreateStatement(database,organizationInput,actorRef,nowIso,{submissionId:input.id,actorRef}));
    canonicalSql=`SELECT id FROM help_organizations WHERE slug='${slug.replaceAll("'","''")}' LIMIT 1`;
    const hasLocation=[values.address,values.city,values.district,values.region].some((value)=>String(value??"").trim());
    if(hasLocation){
      canonicalStatements.push(database.prepare(`INSERT INTO organization_locations(
        organization_id,role,label,address,city,district,region,country_code,is_primary,sort_order
      ) SELECT (${canonicalSql}),'SITE','',?1,?2,?3,?4,?5,1,0
        WHERE EXISTS(${canonicalSql})`).bind(
        String(values.address),String(values.city),String(values.district),String(values.region),String(values.countryCode||"SK"),
      ));
    }
  }

  canonicalStatements.push(resourceAnchorStatement(database,{
    type:row.resourceType,category:canonicalCategory,slug,nowIso,
  }));
  const canonicalState={membership:null as {id:string;role:string}|null,verification:null as {id:string;status:string}|null};
  canonicalStatements.push(...membershipStatements(database,{
    accountId:row.accountId,type:row.resourceType,canonicalSql,membershipId,actorRef,nowIso,existingMembership:canonicalState.membership,
  }));
  canonicalStatements.push(...verificationStatements(database,{
    accountId:row.accountId,type:row.resourceType,canonicalSql,verificationId,actorRef,nowIso,current:canonicalState.verification,
  }));
  canonicalStatements.push(
    resolutionMetadataStatement(database,{submissionId:input.id,type:row.resourceType,canonicalSql,resolution:"CREATED_NEW",nowIso,actorRef}),
    subjectResolutionStatement(database,{submissionId:input.id,canonicalSql,nowIso,actorRef}),
    newProfileAuditStatement(database,{
      submissionId:input.id,accountId:row.accountId,action:"NEW_PROFILE_CREATED",resolution:"CREATED_NEW",
      canonicalSql,type:row.resourceType,actorRef,nowIso,
    }),
    notificationStatement(database,{
      submissionId:input.id,accountId:row.accountId,type:"NEW_PROFILE_CREATED",status:"APPROVED",actorRef,now,nowIso,
    }),
  );

  await applyAtomicModerationTransition(database,{
    id:input.id,expectedStatus:"PENDING_REVIEW",toStatus:"APPROVED",actorType:"ADMIN",actorRef,
    requestId:input.requestId??null,eventId:crypto.randomUUID(),changedFieldsJson:JSON.stringify(Object.keys(normalized.values)),
    now:nowIso,extraStatements:canonicalStatements,
  });
  return getPartnerNewProfileAdmin(input.id,{database});
}

export async function linkPartnerNewProfileAdmin(input:{
  id:string;canonicalId:number;adminEmail:string;requestId?:string|null;database?:D1Database;now?:Date;
}){
  const database=db(input.database);
  let row=await raw(input.id,database);
  if(!row)throw new PartnerNewProfileError("Návrh sa nenašiel.",404);
  if(row.status==="APPROVED"&&row.resolutionType)return getPartnerNewProfileAdmin(input.id,{database});
  const canonical=await canonicalExists(row.resourceType,input.canonicalId,database);
  if(!canonical)throw new PartnerNewProfileError("Existujúci canonical profil sa nenašiel alebo je archivovaný.",404);
  const account=await database.prepare("SELECT status FROM partner_accounts WHERE id=?1 LIMIT 1").bind(row.accountId).first<{status:string}>();
  if(!account||account.status!=="ACTIVE")throw new PartnerNewProfileError("Partner účet už nie je aktívny.",409);
  const existing=await currentMembershipAndVerification({accountId:row.accountId,type:row.resourceType,canonicalId:input.canonicalId,database});
  const actorRef=await adminAuditActorRef(input.adminEmail);
  await ensurePendingReview(input.id,row.status,actorRef,database,input.requestId);
  row=await raw(input.id,database);
  if(!row||row.status!=="PENDING_REVIEW")throw new PartnerNewProfileError("Stav návrhu sa medzičasom zmenil.",409);

  const now=input.now??new Date(),nowIso=now.toISOString();
  const spec=resourceSelect(row.resourceType,input.canonicalId);
  const canonicalSql=`SELECT ${input.canonicalId}`;
  const statements:D1PreparedStatement[]=[
    resourceAnchorStatement(database,{type:row.resourceType,canonicalId:input.canonicalId,nowIso}),
    ...membershipStatements(database,{
      accountId:row.accountId,type:row.resourceType,canonicalSql,membershipId:crypto.randomUUID(),
      actorRef,nowIso,existingMembership:existing.membership,
    }),
    ...verificationStatements(database,{
      accountId:row.accountId,type:row.resourceType,canonicalSql,verificationId:crypto.randomUUID(),
      actorRef,nowIso,current:existing.verification,
    }),
    resolutionMetadataStatement(database,{
      submissionId:input.id,type:row.resourceType,canonicalSql,resolution:"LINKED_EXISTING",nowIso,actorRef,
    }),
    subjectResolutionStatement(database,{submissionId:input.id,canonicalSql,nowIso,actorRef}),
    newProfileAuditStatement(database,{
      submissionId:input.id,accountId:row.accountId,action:"NEW_PROFILE_LINKED_EXISTING",resolution:"LINKED_EXISTING",
      canonicalSql,type:row.resourceType,actorRef,nowIso,
    }),
    notificationStatement(database,{
      submissionId:input.id,accountId:row.accountId,type:"NEW_PROFILE_LINKED_EXISTING",status:"APPROVED",actorRef,now,nowIso,
    }),
  ];
  void spec;
  await applyAtomicModerationTransition(database,{
    id:input.id,expectedStatus:"PENDING_REVIEW",toStatus:"APPROVED",actorType:"ADMIN",actorRef,
    requestId:input.requestId??null,eventId:crypto.randomUUID(),changedFieldsJson:JSON.stringify(["resolution"]),
    now:nowIso,extraStatements:statements,
  });
  return getPartnerNewProfileAdmin(input.id,{database});
}

export async function rejectPartnerNewProfileAdmin(input:{
  id:string;reasonCode:unknown;adminEmail:string;requestId?:string|null;database?:D1Database;now?:Date;
}){
  if(!isPartnerProfileChangeRejectionReason(input.reasonCode))throw new PartnerNewProfileError("Vyber platný dôvod zamietnutia.");
  const database=db(input.database);
  let row=await raw(input.id,database);
  if(!row)throw new PartnerNewProfileError("Návrh sa nenašiel.",404);
  if(row.status==="REJECTED")return getPartnerNewProfileAdmin(input.id,{database});
  const actorRef=await adminAuditActorRef(input.adminEmail);
  await ensurePendingReview(input.id,row.status,actorRef,database,input.requestId);
  row=await raw(input.id,database);
  if(!row||row.status!=="PENDING_REVIEW")throw new PartnerNewProfileError("Stav návrhu sa medzičasom zmenil.",409);
  const now=input.now??new Date(),nowIso=now.toISOString();
  const reason=input.reasonCode as PartnerProfileChangeRejectionReason;
  await applyAtomicModerationTransition(database,{
    id:input.id,expectedStatus:"PENDING_REVIEW",toStatus:"REJECTED",actorType:"ADMIN",actorRef,reasonCode:reason,
    requestId:input.requestId??null,eventId:crypto.randomUUID(),changedFieldsJson:JSON.stringify(["status"]),now:nowIso,
    extraStatements:[
      database.prepare(`UPDATE partner_new_profile_metadata SET dedupe_active=0
        WHERE submission_id=?1 AND EXISTS(
          SELECT 1 FROM moderation_submissions WHERE id=?1 AND status='REJECTED' AND updated_at=?2 AND reviewed_by=?3
        )`).bind(input.id,nowIso,actorRef),
      database.prepare(`INSERT INTO partner_audit_events(
        id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at
      ) SELECT ?1,'ADMIN',?2,'NEW_PROFILE_REJECTED','MODERATION_SUBMISSION',?3,?4,?5
        WHERE EXISTS(SELECT 1 FROM moderation_submissions
          WHERE id=?3 AND status='REJECTED' AND updated_at=?5 AND reviewed_by=?2)`)
        .bind(crypto.randomUUID(),actorRef,input.id,JSON.stringify({reasonCode:reason}),nowIso),
      notificationStatement(database,{
        submissionId:input.id,accountId:row.accountId,type:"NEW_PROFILE_REJECTED",status:"REJECTED",actorRef,now,nowIso,
      }),
    ],
  });
  return getPartnerNewProfileAdmin(input.id,{database});
}
