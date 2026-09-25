import { env } from "cloudflare:workers";
import { adminAuditActorRef } from "@/lib/audit-identity";
import { decryptPii } from "@/lib/pii-crypto";
import { getPartnerDatabase } from "@/lib/partner-auth-store";
import {
  buildDirectoryApplyStatement,
  buildHelpApplyStatements,
  getPartnerEditableFields,
  isPartnerProfileChangeRejectionReason,
  loadPartnerCanonicalForResource,
  normalizePartnerProfilePatch,
  partnerProfileChangeIsStale,
  partnerProfileChangeRiskFlags,
  publicPartnerProfileChangeReason,
  type PartnerProfileChangeResourceType,
  type PartnerProfileEditableValue,
  type PartnerProfilePatch,
  type PartnerProfileChangeRejectionReason,
  PartnerProfileChangeError,
} from "@/lib/partner-profile-changes";
import {
  applyAtomicModerationTransition,
  canTransitionModerationSubmission,
  ModerationStateConflictError,
  isFoundationSubmissionStatus,
  type FoundationSubmissionStatus,
} from "@/lib/moderation-transition";
import { transitionModerationSubmission } from "@/lib/moderation-store";
import { publishPartnerSubmissionMedia, terminalPartnerMediaStatement } from "@/lib/partner-media";

type Bindings = { DB?: D1Database; PII_ENCRYPTION_KEY?: string };

type AdminRow = {
  id:string;
  resourceType:PartnerProfileChangeResourceType;
  subjectId:string;
  operation:string;
  status:string;
  submitterRef:string|null;
  proposedPatchJson:string;
  riskFlagsJson:string;
  rejectionReasonCode:string|null;
  createdAt:string;
  updatedAt:string;
  reviewedAt:string|null;
  reviewedBy:string|null;
  resourceId:string;
  accountId:string;
  baseUpdatedAt:string;
  baseSnapshotJson:string;
  resourceName:string;
  slug:string;
  directoryCategory:string|null;
  emailCiphertext:string;
  currentUpdatedAt:string;
  mediaAssetId:string|null;
  mediaMime:string|null;
  mediaSizeBytes:number|null;
  mediaWidth:number|null;
  mediaHeight:number|null;
};

function db(input?:D1Database){return getPartnerDatabase(input??(env as unknown as Bindings).DB);}
function encryptionKey(value?:string){
  const key=value??(env as unknown as Bindings).PII_ENCRYPTION_KEY;
  if(!key)throw new PartnerProfileChangeError("PII_ENCRYPTION_KEY nie je nakonfigurovaný.",503);
  return key;
}
function safeJson<T>(value:string,fallback:T):T{try{return JSON.parse(value) as T;}catch{return fallback;}}
function safeRiskFlags(value:string){const parsed=safeJson<unknown>(value,[]);return Array.isArray(parsed)?parsed.filter((x):x is string=>typeof x==="string"):[];}
function safePatch(value:string){const parsed=safeJson<unknown>(value,{});return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed as PartnerProfilePatch:{};}
function isActive(status:string){return status==="SUBMITTED"||status==="PENDING_REVIEW"||status==="QUARANTINED";}
function statusLabel(status:string){
  if(status==="SUBMITTED")return "Nové";
  if(status==="PENDING_REVIEW")return "Čaká na rozhodnutie";
  if(status==="QUARANTINED")return "Dodatočná kontrola";
  if(status==="APPROVED")return "Schválené";
  if(status==="REJECTED")return "Zamietnuté";
  return "Zrušené";
}

const BASE_SELECT=`
  SELECT s.id,s.resource_type resourceType,s.subject_id subjectId,s.operation,s.status,
    s.submitter_ref submitterRef,s.proposed_patch_json proposedPatchJson,s.risk_flags_json riskFlagsJson,
    s.media_asset_id mediaAssetId,ma.original_mime mediaMime,ma.size_bytes mediaSizeBytes,ma.width mediaWidth,ma.height mediaHeight,
    s.rejection_reason_code rejectionReasonCode,s.created_at createdAt,s.updated_at updatedAt,
    s.reviewed_at reviewedAt,s.reviewed_by reviewedBy,
    m.partner_resource_id resourceId,m.partner_account_id accountId,m.base_updated_at baseUpdatedAt,
    m.base_snapshot_json baseSnapshotJson,
    COALESCE(d.name,o.name) resourceName,COALESCE(d.slug,o.slug) slug,d.category directoryCategory,
    a.email_ciphertext emailCiphertext,COALESCE(d.updated_at,o.updated_at) currentUpdatedAt
  FROM partner_profile_change_metadata m
  JOIN moderation_submissions s ON s.id=m.submission_id
  JOIN partner_resources r ON r.id=m.partner_resource_id
  JOIN partner_accounts a ON a.id=m.partner_account_id
  LEFT JOIN media_assets ma ON ma.id=s.media_asset_id
  LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id
  LEFT JOIN help_organizations o ON o.id=r.help_organization_id
`;

async function hydrate(row:AdminRow,key:string){
  const patch=safePatch(row.proposedPatchJson);
  const risks=safeRiskFlags(row.riskFlagsJson);
  if(isActive(row.status)&&row.currentUpdatedAt!==row.baseUpdatedAt&&!risks.includes("STALE_BASE"))risks.push("STALE_BASE");
  return {
    ...row,
    email:await decryptPii(row.emailCiphertext,key),
    proposedPatch:patch,
    media:row.mediaAssetId?{
      id:row.mediaAssetId,originalMime:row.mediaMime,sizeBytes:row.mediaSizeBytes,width:row.mediaWidth,height:row.mediaHeight,
      previewUrl:`/api/admin/partners/media/${row.mediaAssetId}`,
    }:null,
    changedFields:[...Object.keys(patch),...(row.mediaAssetId?["image"]:[])],
    riskFlags:risks,
    statusLabel:statusLabel(row.status),
    active:isActive(row.status),
    publicHref:row.resourceType==="DIRECTORY_PROFILE"
      ? `/adresar/${row.directoryCategory}/${row.slug}`
      : `/organizacie/${row.slug}`,
  };
}

export async function listPartnerProfileChangesAdmin(input:{
  status?:string;
  resourceType?:string;
  q?:string;
  risk?:string;
  database?:D1Database;
  encryptionKey?:string;
}={}){
  const database=db(input.database);
  const rows=(await database.prepare(BASE_SELECT+`
    ORDER BY CASE WHEN s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') THEN 0 ELSE 1 END,
      CASE WHEN s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') THEN s.created_at END ASC,
      s.updated_at DESC LIMIT 300
  `).all<AdminRow>()).results;
  let items=await Promise.all(rows.map(row=>hydrate(row,encryptionKey(input.encryptionKey))));
  if(input.status&&input.status!=="all"){
    if(input.status==="active")items=items.filter(item=>item.active);
    else if(!isFoundationSubmissionStatus(input.status))throw new PartnerProfileChangeError("Neplatný filter statusu.");
    else items=items.filter(item=>item.status===input.status);
  }
  if(input.resourceType&&input.resourceType!=="all"){
    if(!["DIRECTORY_PROFILE","HELP_ORGANIZATION"].includes(input.resourceType))throw new PartnerProfileChangeError("Neplatný typ profilu.");
    items=items.filter(item=>item.resourceType===input.resourceType);
  }
  if(input.risk&&input.risk!=="all")items=items.filter(item=>item.riskFlags.includes(input.risk!));
  const q=(input.q??"").trim().toLocaleLowerCase("sk");
  if(q)items=items.filter(item=>[item.email,item.accountId,item.resourceName,item.id].some(v=>v.toLocaleLowerCase("sk").includes(q)));
  return items;
}

async function rawAdminRow(id:string,database:D1Database){
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(id))return null;
  return database.prepare(BASE_SELECT+" WHERE s.id=?1 LIMIT 1").bind(id).first<AdminRow>();
}

export async function getPartnerProfileChangeAdmin(id:string,input:{database?:D1Database;encryptionKey?:string}={}){
  const database=db(input.database);
  const row=await rawAdminRow(id,database);
  if(!row)return null;
  const item=await hydrate(row,encryptionKey(input.encryptionKey));
  const canonical=await loadPartnerCanonicalForResource(row.resourceId,database);
  const base=safeJson<PartnerProfilePatch>(row.baseSnapshotJson,{});
  const proposed=normalizePartnerProfilePatch(row.resourceType,item.proposedPatch,base,Boolean(row.mediaAssetId));
  const stale=item.active&&partnerProfileChangeIsStale(row.baseSnapshotJson,canonical.values);
  const risks=[...new Set([...partnerProfileChangeRiskFlags(proposed),...item.riskFlags,...(stale?["STALE_BASE"]:[])])];
  const labels=new Map(getPartnerEditableFields(row.resourceType).map(field=>[field.key,field.label]));
  const diff=Object.keys(proposed).map(key=>({
    key,
    label:labels.get(key)??key,
    baseValue:base[key]??null,
    currentValue:canonical.values[key]??null,
    proposedValue:proposed[key]??null,
    currentChangedFromBase:JSON.stringify(base[key]??null)!==JSON.stringify(canonical.values[key]??null),
  }));
  return {
    ...item,
    riskFlags:risks,
    stale,
    baseSnapshot:base,
    currentValues:canonical.values,
    currentImageUrl:canonical.imageUrl,
    diff,
    publicHref:canonical.publicHref,
  };
}

function imageApplyStatement(database:D1Database,input:{
  resourceType:PartnerProfileChangeResourceType;canonicalId:number;submissionId:string;imageUrl:string;imageKey:string;nowIso:string;actorRef:string;
}){
  const table=input.resourceType==="DIRECTORY_PROFILE"?"directory_profiles":"help_organizations";
  return database.prepare(`UPDATE ${table} SET image_url=?1,image_key=?2,updated_at=?3,updated_by=?4
    WHERE id=?5 AND EXISTS(SELECT 1 FROM moderation_submissions WHERE id=?6 AND status='APPROVED' AND updated_at=?3 AND reviewed_by=?4)`)
    .bind(input.imageUrl,input.imageKey,input.nowIso,input.actorRef,input.canonicalId,input.submissionId);
}

async function ensurePendingReview(id:string,status:string,actorRef:string,database:D1Database,requestId?:string|null){
  if(status==="PENDING_REVIEW")return;
  if(status!=="SUBMITTED"&&status!=="QUARANTINED")throw new PartnerProfileChangeError("Tento návrh už nie je možné rozhodnúť.",409);
  await transitionModerationSubmission({
    id,
    toStatus:"PENDING_REVIEW",
    actorType:"ADMIN",
    actorRef,
    requestId:requestId??null,
  });
}

function terminalMetadataStatement(database:D1Database,id:string,toStatus:"APPROVED"|"REJECTED",nowIso:string,actorRef:string){
  return database.prepare(`
    UPDATE partner_profile_change_metadata SET dedupe_active=0
    WHERE submission_id=?1 AND EXISTS(
      SELECT 1 FROM moderation_submissions
      WHERE id=?1 AND status=?2 AND updated_at=?3 AND reviewed_by=?4
    )
  `).bind(id,toStatus,nowIso,actorRef);
}

function auditStatement(database:D1Database,input:{
  id:string;accountId:string;action:"PROFILE_CHANGE_APPROVED"|"PROFILE_CHANGE_REJECTED";
  nowIso:string;actorRef:string;resourceId:string;changedFieldCount:number;status:"APPROVED"|"REJECTED";
}){
  return database.prepare(`
    INSERT INTO partner_audit_events(id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at)
    SELECT ?1,'ADMIN',?2,?3,'MODERATION_SUBMISSION',?4,?5,?6
    WHERE EXISTS(
      SELECT 1 FROM moderation_submissions
      WHERE id=?4 AND status=?7 AND updated_at=?6 AND reviewed_by=?2
    )
  `).bind(
    crypto.randomUUID(),input.actorRef,input.action,input.id,
    JSON.stringify({resourceId:input.resourceId,accountId:input.accountId,changedFieldCount:input.changedFieldCount}),
    input.nowIso,input.status,
  );
}

function notificationStatement(database:D1Database,input:{
  id:string;accountId:string;type:"PROFILE_CHANGE_APPROVED"|"PROFILE_CHANGE_REJECTED";
  now:Date;nowIso:string;actorRef:string;status:"APPROVED"|"REJECTED";
}){
  const expiresAt=new Date(input.now.getTime()+30*24*60*60*1000).toISOString();
  return database.prepare(`
    INSERT OR IGNORE INTO partner_notification_outbox(
      id,partner_account_id,notification_type,dedupe_key,status,encrypted_secret,expires_at,attempts,created_at,updated_at
    )
    SELECT ?1,?2,?3,?4,'PENDING',NULL,?5,0,?6,?6
    WHERE EXISTS(
      SELECT 1 FROM moderation_submissions
      WHERE id=?7 AND status=?8 AND updated_at=?6 AND reviewed_by=?9
    )
  `).bind(
    crypto.randomUUID(),input.accountId,input.type,
    `partner-profile-change-${input.status.toLowerCase()}/${input.id}`,
    expiresAt,input.nowIso,input.id,input.status,input.actorRef,
  );
}

export async function approvePartnerProfileChangeAdmin(input:{
  id:string;adminEmail:string;requestId?:string|null;database?:D1Database;now?:Date;
}){
  const database=db(input.database);
  let row=await rawAdminRow(input.id,database);
  if(!row)throw new PartnerProfileChangeError("Návrh sa nenašiel.",404);
  const actorRef=await adminAuditActorRef(input.adminEmail);
  await ensurePendingReview(input.id,row.status,actorRef,database,input.requestId);
  row=await rawAdminRow(input.id,database);
  if(!row||row.status!=="PENDING_REVIEW")throw new PartnerProfileChangeError("Stav návrhu sa medzičasom zmenil.",409);

  const canonical=await loadPartnerCanonicalForResource(row.resourceId,database);
  if(String(canonical.canonicalId)!==row.subjectId||canonical.entityType!==row.resourceType){
    throw new PartnerProfileChangeError("Canonical cieľ návrhu nie je konzistentný.",409);
  }
  if(canonical.updatedAt!==row.baseUpdatedAt||partnerProfileChangeIsStale(row.baseSnapshotJson,canonical.values)){
    throw new PartnerProfileChangeError("Verejný profil sa od vytvorenia žiadosti zmenil. Obnovte stránku a skontrolujte rozdiely pred rozhodnutím.",409);
  }
  const base=safeJson<PartnerProfilePatch>(row.baseSnapshotJson,{});
  const stored=safePatch(row.proposedPatchJson);
  const patch=normalizePartnerProfilePatch(row.resourceType,stored,base,Boolean(row.mediaAssetId));
  const media=await publishPartnerSubmissionMedia({
    submissionId:input.id,database,publicFolder:row.resourceType==="HELP_ORGANIZATION"?"help":"directory",
  });
  const changedFields=[...Object.keys(patch),...(media?["image"]:[])];
  const now=input.now??new Date();
  const nowIso=now.toISOString();

  const canonicalStatements:D1PreparedStatement[]=Object.keys(patch).length
    ? row.resourceType==="DIRECTORY_PROFILE"
      ? [buildDirectoryApplyStatement(database,canonical,patch,actorRef,nowIso,input.id)]
      : buildHelpApplyStatements(database,canonical,patch,actorRef,nowIso,input.id)
    : [];
  if(media)canonicalStatements.push(imageApplyStatement(database,{
    resourceType:row.resourceType,canonicalId:canonical.canonicalId,submissionId:input.id,
    imageUrl:media.imageUrl,imageKey:media.imageKey,nowIso,actorRef,
  }));
  const transitionGuard=row.resourceType==="DIRECTORY_PROFILE"
    ? {sql:"EXISTS(SELECT 1 FROM directory_profiles WHERE id=? AND updated_at=?)",bindings:[canonical.canonicalId,row.baseUpdatedAt] as const}
    : canonical.locationId===null
      ? {
          sql:"EXISTS(SELECT 1 FROM help_organizations WHERE id=? AND updated_at=?) AND NOT EXISTS(SELECT 1 FROM organization_locations WHERE organization_id=?)",
          bindings:[canonical.canonicalId,row.baseUpdatedAt,canonical.canonicalId] as const,
        }
      : {
          sql:`EXISTS(SELECT 1 FROM help_organizations WHERE id=? AND updated_at=?)
            AND (SELECT id FROM organization_locations WHERE organization_id=? ORDER BY is_primary DESC,sort_order ASC,id ASC LIMIT 1)=?
            AND EXISTS(
              SELECT 1 FROM organization_locations
              WHERE id=? AND organization_id=?
                AND address IS ? AND city IS ? AND district IS ? AND region IS ? AND country_code IS ?
            )`,
          bindings:[
            canonical.canonicalId,row.baseUpdatedAt,canonical.canonicalId,canonical.locationId,
            canonical.locationId,canonical.canonicalId,
            base.address??"",base.city??"",base.district??"",base.region??"",base.countryCode??"",
          ] as const,
        };

  try{
    await applyAtomicModerationTransition(database,{
    id:input.id,
    expectedStatus:"PENDING_REVIEW",
    toStatus:"APPROVED",
    actorType:"ADMIN",
    actorRef,
    requestId:input.requestId??null,
    eventId:crypto.randomUUID(),
    changedFieldsJson:JSON.stringify(changedFields),
    now:nowIso,
    transitionGuard,
    extraStatements:[
      ...canonicalStatements,
      terminalPartnerMediaStatement({database,submissionId:input.id,state:"APPROVED",nowIso,actorRef,publicKey:media?.imageKey??null}),
      terminalMetadataStatement(database,input.id,"APPROVED",nowIso,actorRef),
      auditStatement(database,{
        id:input.id,accountId:row.accountId,action:"PROFILE_CHANGE_APPROVED",nowIso,actorRef,
        resourceId:row.resourceId,changedFieldCount:changedFields.length,status:"APPROVED",
      }),
      notificationStatement(database,{
        id:input.id,accountId:row.accountId,type:"PROFILE_CHANGE_APPROVED",now,nowIso,actorRef,status:"APPROVED",
      }),
    ],
    });
  }catch(error){
    if(error instanceof ModerationStateConflictError){
      const latest=await loadPartnerCanonicalForResource(row.resourceId,database);
      if(latest.updatedAt!==row.baseUpdatedAt||partnerProfileChangeIsStale(row.baseSnapshotJson,latest.values)){
        throw new PartnerProfileChangeError("Verejný profil sa od vytvorenia žiadosti zmenil. Obnovte stránku a skontrolujte rozdiely pred rozhodnutím.",409);
      }
      throw new PartnerProfileChangeError("Stav žiadosti sa medzičasom zmenil. Obnovte stránku a skúste rozhodnutie znova.",409);
    }
    throw error;
  }
  return getPartnerProfileChangeAdmin(input.id,{database});
}

export async function rejectPartnerProfileChangeAdmin(input:{
  id:string;reasonCode:unknown;adminEmail:string;requestId?:string|null;database?:D1Database;now?:Date;
}){
  if(!isPartnerProfileChangeRejectionReason(input.reasonCode))throw new PartnerProfileChangeError("Vyberte platný dôvod zamietnutia.");
  const database=db(input.database);
  let row=await rawAdminRow(input.id,database);
  if(!row)throw new PartnerProfileChangeError("Návrh sa nenašiel.",404);
  const actorRef=await adminAuditActorRef(input.adminEmail);
  await ensurePendingReview(input.id,row.status,actorRef,database,input.requestId);
  row=await rawAdminRow(input.id,database);
  if(!row||row.status!=="PENDING_REVIEW")throw new PartnerProfileChangeError("Stav návrhu sa medzičasom zmenil.",409);
  const patch=safePatch(row.proposedPatchJson);
  const changedFields=[...Object.keys(patch),...(row.mediaAssetId?["image"]:[])];
  const now=input.now??new Date();
  const nowIso=now.toISOString();

  await applyAtomicModerationTransition(database,{
    id:input.id,
    expectedStatus:"PENDING_REVIEW",
    toStatus:"REJECTED",
    actorType:"ADMIN",
    actorRef,
    reasonCode:input.reasonCode as PartnerProfileChangeRejectionReason,
    requestId:input.requestId??null,
    eventId:crypto.randomUUID(),
    changedFieldsJson:JSON.stringify(changedFields),
    now:nowIso,
    extraStatements:[
      terminalPartnerMediaStatement({database,submissionId:input.id,state:"REJECTED",nowIso,actorRef}),
      terminalMetadataStatement(database,input.id,"REJECTED",nowIso,actorRef),
      auditStatement(database,{
        id:input.id,accountId:row.accountId,action:"PROFILE_CHANGE_REJECTED",nowIso,actorRef,
        resourceId:row.resourceId,changedFieldCount:changedFields.length,status:"REJECTED",
      }),
      notificationStatement(database,{
        id:input.id,accountId:row.accountId,type:"PROFILE_CHANGE_REJECTED",now,nowIso,actorRef,status:"REJECTED",
      }),
    ],
  });
  return getPartnerProfileChangeAdmin(input.id,{database});
}

export function partnerProfileChangeRejectionLabel(code:string|null|undefined){
  return publicPartnerProfileChangeReason(code);
}

export function formatPartnerProfileDiffValue(value:PartnerProfileEditableValue|undefined){
  if(Array.isArray(value))return value.join(", ");
  if(typeof value==="boolean")return value?"Áno":"Nie";
  if(value===null||value===undefined||value==="")return "—";
  return String(value);
}
