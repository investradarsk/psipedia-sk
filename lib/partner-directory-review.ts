/**
 * A directory profile with an external manager must never be reopened to
 * ordinary Notion editorial synchronization. The existing reviewed metadata
 * is the visible Admin lock; live memberships provide an independent safety net.
 *
 * Applies only to DIRECTORY_PROFILE, not events, organizations or Help records.
 */
import { setManagedDirectoryProfileReviewed } from "./directory-store";

export async function hasActiveDirectoryPartnerManager(database: D1Database, profileId: number): Promise<boolean> {
  const row = await database.prepare(`
    SELECT 1 AS active FROM partner_resources r
    JOIN partner_memberships m ON m.resource_id=r.id
    WHERE r.entity_type='DIRECTORY_PROFILE' AND r.directory_profile_id=?1
      AND m.revoked_at IS NULL LIMIT 1
  `).bind(profileId).first<{ active: number }>();
  return Boolean(row);
}

/** Lock before giving a partner direct access. A failed grant leaves the profile safely locked. */
export async function ensurePartnerDirectoryReviewLock(input: {
  database: D1Database;
  resourceId: string;
  adminEmail: string;
  now?: Date;
}): Promise<void> {
  const resource = await input.database.prepare(
    "SELECT directory_profile_id AS profileId FROM partner_resources WHERE id=?1 AND entity_type='DIRECTORY_PROFILE' LIMIT 1",
  ).bind(input.resourceId).first<{ profileId: number }>();
  if (!resource) return;
  const result = await input.database.prepare(`
    SELECT EXISTS(
      SELECT 1 FROM directory_profile_review_state s
      WHERE s.profile_id=p.id AND NULLIF(TRIM(s.reviewed_at),'') IS NOT NULL
    ) AS reviewed FROM directory_profiles p WHERE p.id=?1 LIMIT 1
  `).bind(resource.profileId).first<{ reviewed: number }>();
  if (!result) throw new Error("PARTNER_DIRECTORY_PROFILE_NOT_FOUND");
  if (result.reviewed) return;
  await setManagedDirectoryProfileReviewed(
    resource.profileId, true, `admin:${input.adminEmail.trim().toLowerCase()}`,
    input.now ?? new Date(), input.database,
  );
}

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
