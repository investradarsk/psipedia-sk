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

export { partnerDirectoryReviewLockStatement } from "./partner-directory-review-sql";
