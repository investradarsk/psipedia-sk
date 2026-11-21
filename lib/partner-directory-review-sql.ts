/** SQL-only partner review lock; independent of the Next.js/Cloudflare app runtime. */
/**
 * Activate the partner's SQL review lock inside the membership transaction.
 * A prior human review retains its timestamp and actor; no JSON is touched.
 */
export function partnerDirectoryReviewLockStatement(input: {
  database: D1Database;
  canonicalSql: string;
  accountId: string;
  actorRef: string;
  nowIso: string;
}): D1PreparedStatement {
  return input.database.prepare(`
    INSERT INTO directory_profile_review_state
      (profile_id,reviewed_at,reviewed_by,unlock_pending,
       unlock_requested_at,unlock_requested_by,updated_at,updated_by)
    SELECT p.id,?1,?2,0,NULL,NULL,?1,?2
    FROM directory_profiles p
    WHERE p.id=({CANONICAL_SQL})
      AND EXISTS (
        SELECT 1 FROM partner_resources r
        JOIN partner_memberships m ON m.resource_id=r.id
        WHERE r.entity_type='DIRECTORY_PROFILE'
          AND r.directory_profile_id=p.id
          AND m.account_id=?3 AND m.revoked_at IS NULL
      )
    ON CONFLICT(profile_id) DO UPDATE SET
      reviewed_at=COALESCE(NULLIF(TRIM(directory_profile_review_state.reviewed_at),''),excluded.reviewed_at),
      reviewed_by=CASE
        WHEN NULLIF(TRIM(directory_profile_review_state.reviewed_at),'') IS NULL
        THEN excluded.reviewed_by ELSE directory_profile_review_state.reviewed_by END,
      unlock_pending=0,
      unlock_requested_at=NULL,
      unlock_requested_by=NULL,
      updated_at=excluded.updated_at,
      updated_by=excluded.updated_by
  `.replace("{CANONICAL_SQL}", input.canonicalSql))
    .bind(input.nowIso, input.actorRef, input.accountId);
}
