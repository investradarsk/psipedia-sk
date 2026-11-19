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
  const result = await input.database.prepare(
    "SELECT source_data_json FROM directory_profiles WHERE id=?1 LIMIT 1",
  ).bind(resource.profileId).first<{ source_data_json: string }>();
  if (!result) throw new Error("PARTNER_DIRECTORY_PROFILE_NOT_FOUND");
  let value: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(result.source_data_json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    value = parsed as Record<string, unknown>;
  } catch {
    throw new Error("PARTNER_DIRECTORY_REVIEW_INVALID_JSON");
  }
  if (typeof value._psipedia_profile_review_reviewed_at === "string" &&
      value._psipedia_profile_review_reviewed_at.trim()) return;
  await setManagedDirectoryProfileReviewed(
    resource.profileId, true, `admin:${input.adminEmail.trim().toLowerCase()}`,
    input.now ?? new Date(), input.database,
  );
}

/**
 * Runs INSIDE the already atomic partner-new-profile moderation batch, after
 * membership creation. It does not overwrite existing manual review timestamps.
 * Invalid JSON aborts the transaction rather than replacing profile data.
 */
export function partnerDirectoryReviewLockStatement(input: {
  database: D1Database;
  canonicalSql: string;
  accountId: string;
  actorRef: string;
  nowIso: string;
}): D1PreparedStatement {
  return input.database.prepare(`
    UPDATE directory_profiles
    SET source_data_json=json_set(
      json_remove(source_data_json, '$._psipedia_profile_review_unlock_pending'),
      '$._psipedia_profile_review_reviewed_at', ?1,
      '$._psipedia_profile_review_reviewed_by', ?2
    ), updated_at=?1, updated_by=?2
    WHERE id=(${input.canonicalSql})
      AND COALESCE(json_extract(source_data_json, '$._psipedia_profile_review_reviewed_at'), '')=''
      AND EXISTS (
        SELECT 1 FROM partner_resources r
        JOIN partner_memberships m ON m.resource_id=r.id
        WHERE r.entity_type='DIRECTORY_PROFILE'
          AND r.directory_profile_id=directory_profiles.id
          AND m.account_id=?3 AND m.revoked_at IS NULL
      )
  `).bind(input.nowIso, input.actorRef, input.accountId);
}
