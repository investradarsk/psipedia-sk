import type { AdminReviewEntityType } from "./admin-entity-review-store";
const tables:Record<AdminReviewEntityType,string>={
  EVENT:"managed_events",ADOPTION:"adoption_dogs",LOST_FOUND:"lost_found_dog_reports",
  HELP_CASE:"help_cases",ORGANIZATION:"help_organizations",BREED:"managed_breeds",ESHOP:"managed_eshops",
};

/** Only use immediately after a successful canonical CAS in the same batch.
 * The first statement aborts the transaction if the exact write did not occur.
 * Preserve original reviewer/date; review is not an ordinary Notion push. */
export function reviewOnSaveStatements(db:D1Database,input:{
  type:AdminReviewEntityType;id:number;revision:string;actor:string;
}):D1PreparedStatement[]{
  const table=tables[input.type];
  if(!table||!Number.isSafeInteger(input.id)||input.id<1||!input.revision||!input.actor)
    throw Error("REVIEW_ON_SAVE_SCOPE_INVALID");
  return [
    db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('REVIEW_ON_SAVE_CAS_FAILED','$') END"),
    db.prepare("INSERT OR IGNORE INTO admin_entity_reviews(entity_type,entity_id,reviewed_at,reviewed_by) "+
      "SELECT ?,id,?,? FROM "+table+" WHERE id=? AND updated_at=?")
      .bind(input.type,input.revision,input.actor,input.id,input.revision),
    db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM "+table+" p JOIN admin_entity_reviews r ON r.entity_id=p.id "+
      "WHERE p.id=? AND p.updated_at=? AND r.entity_type=?) THEN 1 ELSE json_extract('REVIEW_ON_SAVE_FAILED','$') END")
      .bind(input.id,input.revision,input.type),
  ];
}
