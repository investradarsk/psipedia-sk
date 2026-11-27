/**
 * Shared Admin review lock for Events and Help agendas.
 * The existing admin_entity_reviews table is canonical for manual review.
 * A current external manager is an independent fail-closed sync lock.
 * Do not confuse this with Directory's source_data_json review metadata.
 */
import type { AdminReviewEntityType } from "./admin-entity-review-store";

const types = {
  events: "EVENT", organizations: "ORGANIZATION", adoptions: "ADOPTION",
  "help-cases": "HELP_CASE", "lost-found": "LOST_FOUND",
} as const satisfies Record<string, AdminReviewEntityType>;

export type LockableAgenda = keyof typeof types;
export function reviewTypeForAgenda(agenda: LockableAgenda): AdminReviewEntityType { return types[agenda]; }

const helpColumns = {ADOPTION:"adoption_dog_id",LOST_FOUND:"lost_found_report_id",HELP_CASE:"help_case_id"} as const;
const anchorColumns = {EVENT:"managed_event_id",ORGANIZATION:"help_organization_id"} as const;

/** Only fixed, allowlisted SQL is used to query membership. */
export function partnerReviewOwnerSql(type: AdminReviewEntityType, entitySql: string): string {
  if(type==="BREED"||type==="ESHOP")return `(0 AND (${entitySql}) IS NOT NULL)`;
  if(type in helpColumns){
    const col=helpColumns[type as keyof typeof helpColumns];
    return `EXISTS(SELECT 1 FROM partner_help_claims pc WHERE pc.${col}=(${entitySql}) AND pc.status='APPROVED')`;
  }
  const col=anchorColumns[type as keyof typeof anchorColumns];
  if(!col)throw Error("ADMIN_PARTNER_REVIEW_TYPE_UNSUPPORTED");
  return `EXISTS(SELECT 1 FROM partner_resources pr JOIN partner_memberships pm ON pm.resource_id=pr.id
    WHERE pr.${col}=(${entitySql}) AND pm.revoked_at IS NULL)`;
}

export async function isActiveAdminPartnerOwner(database: D1Database, type: AdminReviewEntityType, entityId: number): Promise<boolean> {
  if(!Number.isSafeInteger(entityId)||entityId<1)throw Error("ADMIN_REVIEW_INVALID_ENTITY_ID");
  const row=await database.prepare(`SELECT ${partnerReviewOwnerSql(type,"?1")} AS owned`)
    .bind(entityId).first<{owned:number}>();
  return Boolean(row?.owned);
}

/** An unchecked record is still locked when a partner owns it. A missing schema is a hard sync failure. */
export async function isAdminNotionSyncLocked(database:D1Database,agenda:LockableAgenda,entityId:number):Promise<boolean>{
  const type=reviewTypeForAgenda(agenda);
  if(!Number.isSafeInteger(entityId)||entityId<1)throw Error("ADMIN_REVIEW_INVALID_ENTITY_ID");
  const row=await database.prepare(`SELECT
    (EXISTS(SELECT 1 FROM admin_entity_reviews ar WHERE ar.entity_type=?1 AND ar.entity_id=?2)
      OR ${partnerReviewOwnerSql(type,"?2")}) AS locked`
  ).bind(type,entityId).first<{locked:number}>();
  if(!row)throw Error("ADMIN_REVIEW_LOCK_UNAVAILABLE");
  return Boolean(row.locked);
}

/** Bounded read-only diagnostic projection; uses the same review/owner predicates. */
export async function readAdminNotionReviewLocks(database:D1Database,agenda:LockableAgenda,ids:readonly number[]){
  const unique=[...new Set(ids)];
  if(unique.length>50||unique.some(id=>!Number.isSafeInteger(id)||id<1))
    throw Error("ADMIN_REVIEW_INVALID_ENTITY_ID");
  if(!unique.length)return new Map<number,{reviewed:number;owned:number}>();
  const type=reviewTypeForAgenda(agenda);
  const sql="WITH requested(entity_id) AS (VALUES "+unique.map(()=>"(?)").join(",")+") "+
    "SELECT q.entity_id,EXISTS(SELECT 1 FROM admin_entity_reviews ar WHERE ar.entity_type=? AND ar.entity_id=q.entity_id) AS reviewed,"+
    partnerReviewOwnerSql(type,"q.entity_id")+" AS owned FROM requested q";
  const rows=await database.prepare(sql).bind(...unique,type).all<{entity_id:number;reviewed:number;owned:number}>();
  if(!rows.success||!Array.isArray(rows.results)||rows.results.length!==unique.length||
    new Set(rows.results.map(row=>row.entity_id)).size!==unique.length)
    throw Error("ADMIN_REVIEW_LOCK_UNAVAILABLE");
  return new Map(rows.results.map(row=>[row.entity_id,row]));
}

/** Run after an owner-grant in its existing D1 batch; identical metadata is preserved. */
export function partnerAdminReviewStatement(database:D1Database,input:{
  type:AdminReviewEntityType;entitySql:string;nowIso:string;actorRef:string;
}):D1PreparedStatement{
  if(input.type==="BREED"||input.type==="ESHOP")throw Error("ADMIN_PARTNER_REVIEW_TYPE_UNSUPPORTED");
  const table=({EVENT:"managed_events",ORGANIZATION:"help_organizations",ADOPTION:"adoption_dogs",
    LOST_FOUND:"lost_found_dog_reports",HELP_CASE:"help_cases"} as const)[input.type];
  return database.prepare(`INSERT OR IGNORE INTO admin_entity_reviews(entity_type,entity_id,reviewed_at,reviewed_by)
    SELECT ?1,(${input.entitySql}),?2,?3
    WHERE EXISTS(SELECT 1 FROM ${table} WHERE id=(${input.entitySql}))
      AND ${partnerReviewOwnerSql(input.type,input.entitySql)}`)
    .bind(input.type,input.nowIso,input.actorRef);
}


/** Persist the review of any legacy owned record BEFORE dropping ownership.
 * Caller MUST prepend these statements to the same D1 batch as revocation.
 * No status or publication fields are touched. Existing review actors/dates
 * are retained; a pending Directory unlock is cancelled by active ownership.
 */
export function preservePartnerReviewBeforeRevoke(database:D1Database,input:{
  scope: {kind:"account"|"membership"|"claim";id:string} |
    {kind:"resource";accountId:string;resourceId:string};
  nowIso:string;actorRef:string;
}):D1PreparedStatement[]{
  const {scope,nowIso,actorRef}=input;
  const membership=scope.kind==="account"?"m.account_id=?3":
    scope.kind==="membership"?"m.id=?3":
    scope.kind==="resource"?"m.account_id=?3 AND m.resource_id=?4":null;
  const claim=scope.kind==="account"?"c.account_id=?3":scope.kind==="claim"?"c.id=?3":null;
  const args=scope.kind==="resource"?[scope.accountId,scope.resourceId]:[scope.id];
  const statements:D1PreparedStatement[]=[];
  if(membership){
    const owned=" FROM partner_resources r JOIN partner_memberships m ON m.resource_id=r.id WHERE m.revoked_at IS NULL AND "+membership;
    statements.push(database.prepare(
      "INSERT INTO directory_profile_review_state(profile_id,reviewed_at,reviewed_by,unlock_pending,unlock_requested_at,unlock_requested_by,updated_at,updated_by) "+
      "SELECT p.id,?1,?2,0,NULL,NULL,?1,?2 FROM directory_profiles p WHERE EXISTS(SELECT 1"+owned+
      " AND r.entity_type='DIRECTORY_PROFILE' AND r.directory_profile_id=p.id) "+
      "ON CONFLICT(profile_id) DO UPDATE SET reviewed_at=COALESCE(NULLIF(TRIM(directory_profile_review_state.reviewed_at),''),excluded.reviewed_at),"+
      "reviewed_by=CASE WHEN NULLIF(TRIM(directory_profile_review_state.reviewed_at),'') IS NULL THEN excluded.reviewed_by ELSE directory_profile_review_state.reviewed_by END,"+
      "unlock_pending=0,unlock_requested_at=NULL,unlock_requested_by=NULL,updated_at=excluded.updated_at,updated_by=excluded.updated_by "+
      "WHERE NULLIF(TRIM(directory_profile_review_state.reviewed_at),'') IS NULL OR directory_profile_review_state.unlock_pending=1"
    ).bind(nowIso,actorRef,...args));
    for(const [type,table,column] of [["EVENT","managed_events","managed_event_id"],["ORGANIZATION","help_organizations","help_organization_id"]] as const)
      statements.push(database.prepare(
        "INSERT OR IGNORE INTO admin_entity_reviews(entity_type,entity_id,reviewed_at,reviewed_by) "+
        "SELECT '"+type+"',p.id,?1,?2 FROM "+table+" p WHERE EXISTS(SELECT 1"+owned+" AND r."+column+"=p.id)"
      ).bind(nowIso,actorRef,...args));
  }
  if(claim){
    for(const [type,table,column] of [["ADOPTION","adoption_dogs","adoption_dog_id"],["LOST_FOUND","lost_found_dog_reports","lost_found_report_id"],["HELP_CASE","help_cases","help_case_id"]] as const)
      statements.push(database.prepare(
        "INSERT OR IGNORE INTO admin_entity_reviews(entity_type,entity_id,reviewed_at,reviewed_by) "+
        "SELECT '"+type+"',p.id,?1,?2 FROM "+table+" p WHERE EXISTS(SELECT 1 FROM partner_help_claims c WHERE c.status='APPROVED' AND "+claim+" AND c."+column+"=p.id)"
      ).bind(nowIso,actorRef,...args));
  }
  return statements;
}
