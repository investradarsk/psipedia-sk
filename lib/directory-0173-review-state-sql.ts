/**
 * 0173 review-state SQL shadow for an existing, authoritative legacy lock.
 *
 * It projects only already-committed source_data_json review metadata, in the
 * SAME D1 transaction as the canonical source update. Reads and the Notion
 * lock still use the existing JSON + live-partner predicate until the
 * separately audited SQL-only cutover. Never turn a missing 0173 row into an
 * implicit unlock.
 */
const REVIEW_AT_PATH = "'$._psipedia_profile_review_reviewed_at'";
const REVIEW_BY_PATH = "'$._psipedia_profile_review_reviewed_by'";
const UNLOCK_PENDING_PATH = "'$._psipedia_profile_review_unlock_pending'";

const COLUMNS = [
  "reviewed_at", "reviewed_by", "unlock_pending",
  "unlock_requested_at", "unlock_requested_by", "updated_at", "updated_by",
] as const;

function upsertReviewStateSql(where: string): string {
  // All JSON paths and fields are fixed strings, not client-provided values.
  // Existing pending flags have no trustworthy timestamps; do not invent one.
  const selected = [
    "NULLIF(TRIM(CAST(json_extract(p.source_data_json," + REVIEW_AT_PATH + ") AS TEXT)),'')",
    "NULLIF(TRIM(CAST(json_extract(p.source_data_json," + REVIEW_BY_PATH + ") AS TEXT)),'')",
    "CASE WHEN json_extract(p.source_data_json," + UNLOCK_PENDING_PATH + ")='1' THEN 1 ELSE 0 END",
    "NULL",
    "NULL",
    "?",
    "?",
  ];
  return "INSERT INTO directory_profile_review_state (profile_id," + COLUMNS.join(",") + ") " +
    "SELECT p.id," + selected.join(",") + " FROM directory_profiles p WHERE " + where +
    " AND json_valid(COALESCE(p.source_data_json,'')) " +
    "ON CONFLICT(profile_id) DO UPDATE SET " +
    COLUMNS.map(column => column + "=excluded." + column).join(",");
}

/**
 * The canonical UPDATE preceding this statement must have succeeded.
 * SQL identity is guarded against the exact new JSON and profile revision.
 * An owner uncheck writes reviewed_at=NULL and unlock_pending=0 explicitly.
 */
export function directory0173ReviewSqlMirrorStatement(input: {
  database: D1Database;
  profileId: number;
  sourceDataJson: string;
  profileUpdatedAt: string;
  projectedAt: string;
  projectedBy: string;
}): D1PreparedStatement {
  if (!Number.isSafeInteger(input.profileId) || input.profileId <= 0)
    throw new Error("DIRECTORY_0173_REVIEW_INVALID_ID");
  return input.database.prepare(upsertReviewStateSql(
    "p.id=? AND p.source_data_json=? AND p.updated_at=?",
  )).bind(
    input.projectedAt, input.projectedBy,
    input.profileId, input.sourceDataJson, input.profileUpdatedAt,
  );
}

/**
 * Partner moderation holds a canonical resource subquery and an active
 * membership in its transaction. Mirror the actual legacy reviewed state,
 * without replacing a previous human review timestamp or weakening the lock.
 */
export function partnerDirectory0173ReviewSqlMirrorStatement(input: {
  database: D1Database;
  canonicalSql: string;
  accountId: string;
  nowIso: string;
  actorRef: string;
}): D1PreparedStatement {
  return input.database.prepare(upsertReviewStateSql(
    "p.id=(" + input.canonicalSql + ") " +
    "AND EXISTS (SELECT 1 FROM partner_resources r " +
      "JOIN partner_memberships m ON m.resource_id=r.id " +
      "WHERE r.entity_type='DIRECTORY_PROFILE' " +
      "AND r.directory_profile_id=p.id AND m.account_id=? AND m.revoked_at IS NULL)",
  )).bind(input.nowIso, input.actorRef, input.accountId);
}
