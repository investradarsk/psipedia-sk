/**
 * Directory profiles explicitly reviewed in Admin are frozen against Notion
 * editorial writes in either direction. The Admin checkbox is the ONLY unlock.
 * A live partner membership also forces a lock, even if older metadata is missing.
 * The review checkbox itself can still be mirrored Admin -> Notion once.
 */
import { readDirectoryProfileReviewMetadata } from "./directory-profile-metadata.ts";

export const DIRECTORY_REVIEW_UNLOCK_PENDING_KEY = "_psipedia_profile_review_unlock_pending";

function reviewSource(sourceJson: string): Record<string, string | number | null> {
  let value: unknown;
  try { value = JSON.parse(sourceJson); }
  catch { throw new Error("DIRECTORY_REVIEW_LOCK_INVALID_JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("DIRECTORY_REVIEW_LOCK_INVALID_JSON");
  }
  return value as Record<string, string | number | null>;
}

/** A pending owner unlock must block ordinary Notion sync until D1 wins again. */
export function isDirectoryReviewUnlockPendingSource(sourceJson: string): boolean {
  const source = reviewSource(sourceJson);
  return !readDirectoryProfileReviewMetadata(source).reviewed &&
    source[DIRECTORY_REVIEW_UNLOCK_PENDING_KEY] === "1";
}

export function isDirectoryReviewedSourceLocked(sourceJson: string): boolean {
  const source = reviewSource(sourceJson);
  return readDirectoryProfileReviewMetadata(source).reviewed ||
    source[DIRECTORY_REVIEW_UNLOCK_PENDING_KEY] === "1";
}

export async function directoryProfileNotionSyncLocked(
  database: D1Database,
  profileId: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(profileId) || profileId <= 0) {
    throw new Error("DIRECTORY_REVIEW_LOCK_INVALID_ID");
  }
  const row = await database.prepare(
    "SELECT source_data_json,status FROM directory_profiles WHERE id=? LIMIT 1",
  ).bind(profileId).first<{ source_data_json: string; status: string }>();
  if (!row || row.status === "archived") return true;
  if (isDirectoryReviewedSourceLocked(row.source_data_json)) return true;
  // Defense in depth: no stale checkbox/unlock can let a live owner receive
  // an inbound Notion overwrite, even during a concurrent ownership change.
  const partner = await database.prepare(`
    SELECT 1 AS active FROM partner_resources r
    JOIN partner_memberships m ON m.resource_id=r.id
    WHERE r.entity_type='DIRECTORY_PROFILE' AND r.directory_profile_id=?1
      AND m.revoked_at IS NULL LIMIT 1
  `).bind(profileId).first<{ active: number }>();
  return Boolean(partner);
}
