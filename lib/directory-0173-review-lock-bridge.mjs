/**
 * Additive-only one-shot projection of historical Admin review locks.
 * The historical JSON lock must remain authoritative until the full
 * SQL-only review cutover. This does NOT import or edit profile content.
 *
 * A missing SQL row + an explicitly locked legacy source qualifies.
 * Existing SQL rows are NEVER overwritten, including an explicit unlock.
 */
const source="CASE WHEN json_valid(COALESCE(p.source_data_json,'')) THEN p.source_data_json ELSE '{}' END";
const reviewedAt="NULLIF(TRIM(CAST(json_extract("+source+",'$."+'"'+ "_psipedia_profile_review_reviewed_at"+'"'+ "') AS TEXT)),'')";
const reviewedBy="NULLIF(TRIM(CAST(json_extract("+source+",'$."+'"'+ "_psipedia_profile_review_reviewed_by"+'"'+ "') AS TEXT)),'')";
const pending="CASE WHEN json_extract("+source+",'$."+'"'+ "_psipedia_profile_review_unlock_pending"+'"'+ "')='1' THEN 1 ELSE 0 END";
const from="FROM directory_profiles p LEFT JOIN directory_profile_review_state s ON s.profile_id=p.id";
const where="WHERE p.status<>'archived' AND s.profile_id IS NULL AND ("+reviewedAt+" IS NOT NULL OR "+pending+"=1)";

export const DIRECTORY_0173_REVIEW_BRIDGE_COUNT_SQL=
  "SELECT COUNT(*) AS n "+from+" "+where;

export const DIRECTORY_0173_REVIEW_BRIDGE_INVALID_JSON_SQL=
  "SELECT COUNT(*) AS n FROM directory_profiles WHERE NOT json_valid(COALESCE(source_data_json,''))";

export const DIRECTORY_0173_REVIEW_BRIDGE_PROFILE_COUNT_SQL=
  "SELECT COUNT(*) AS n FROM directory_profiles";

export const DIRECTORY_0173_REVIEW_BRIDGE_SQL_COUNT_SQL=
  "SELECT COUNT(*) AS n FROM directory_profile_review_state";

/** One atomic INSERT SELECT, capped to the eight known legacy review records. */
export const DIRECTORY_0173_REVIEW_BRIDGE_APPLY_SQL=
  "INSERT INTO directory_profile_review_state "+
  "(profile_id,reviewed_at,reviewed_by,unlock_pending,"+
  "unlock_requested_at,unlock_requested_by,updated_at,updated_by) "+
  "SELECT p.id,"+reviewedAt+","+reviewedBy+","+pending+",NULL,NULL,p.updated_at,p.updated_by "+
  from+" "+where+" "+
  "AND (SELECT COUNT(*) "+from+" "+where+")<=8 "+
  "ORDER BY p.id ON CONFLICT(profile_id) DO NOTHING";

/** Report mismatches without changing a currently saved newer SQL lock. */
export const DIRECTORY_0173_REVIEW_BRIDGE_PARITY_SQL=
  "SELECT COUNT(*) AS n FROM directory_profiles p "+
  "JOIN directory_profile_review_state s ON s.profile_id=p.id "+
  "WHERE p.status<>'archived' AND ("+reviewedAt+" IS NOT NULL OR "+pending+"=1) "+
  "AND (COALESCE(s.reviewed_at,'')<>COALESCE("+reviewedAt+",'') "+
  "OR s.unlock_pending<>"+pending+")";
