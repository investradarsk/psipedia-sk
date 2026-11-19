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

/** Run after an owner-grant in its existing D1 batch; identical metadata is preserved. */
export function partnerAdminReviewStatement(database:D1Database,input:{
  type:AdminReviewEntityType;entitySql:string;nowIso:string;actorRef:string;
}):D1PreparedStatement{
  const table=({EVENT:"managed_events",ORGANIZATION:"help_organizations",ADOPTION:"adoption_dogs",
    LOST_FOUND:"lost_found_dog_reports",HELP_CASE:"help_cases"} as const)[input.type];
  return database.prepare(`INSERT OR IGNORE INTO admin_entity_reviews(entity_type,entity_id,reviewed_at,reviewed_by)
    SELECT ?1,(${input.entitySql}),?2,?3
    WHERE EXISTS(SELECT 1 FROM ${table} WHERE id=(${input.entitySql}))
      AND ${partnerReviewOwnerSql(input.type,input.entitySql)}`)
    .bind(input.type,input.nowIso,input.actorRef);
}
