/**
 * Directory profiles explicitly reviewed in Admin are frozen against Notion
 * editorial writes in either direction. The Admin checkbox is the ONLY unlock.
 *
 * SQL 0173 review state is now read for every lock decision. The historical
 * source_data_json review state stays as an independent protective OR until
 * a separate audited complete backfill confirms SQL-only lock parity.
 * Missing SQL rows, mismatched reviews, or a live partner must never unlock
 * an old reviewed profile.
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

/**
 * One indexed, read-only D1 statement. Checking SQL review, legacy pending,
 * partner membership and pending deletion from one snapshot avoids observing
 * a revoked/incomplete partner state across separate queries.
 *
 * The SQL row can be absent on older profiles. That must never be interpreted
 * as permission to override a historical review lock.
 */
export const DIRECTORY_REVIEW_LOCK_SQL = [
  "SELECT p.source_data_json,p.status,",
  "s.reviewed_at AS sql_reviewed_at,s.unlock_pending AS sql_unlock_pending,",
  "EXISTS (SELECT 1 FROM partner_resources r",
  "JOIN partner_memberships m ON m.resource_id=r.id",
  "WHERE r.entity_type='DIRECTORY_PROFILE' AND r.directory_profile_id=p.id",
  "AND m.revoked_at IS NULL) AS partner_active,",
  "EXISTS (SELECT 1 FROM admin_record_tombstones t",
  "WHERE t.kind='directory' AND t.record_id=p.id) AS deletion_pending",
  "FROM directory_profiles p",
  "LEFT JOIN directory_profile_review_state s ON s.profile_id=p.id",
  "WHERE p.id=?1 LIMIT 1",
].join(" ");

type DirectoryReviewLockRow = {
  source_data_json: string;
  status: string;
  sql_reviewed_at: string | null;
  sql_unlock_pending: number | null;
  partner_active: number;
  deletion_pending: number;
};

/**
 * Safety invariant: a lock from ANY still-supported authority is sufficient
 * to block Notion. An empty or missing sidecar may not clear a JSON lock.
 */
export function directoryReviewLockedFromProjection(row: DirectoryReviewLockRow | null): boolean {
  if (!row || row.status === "archived") return true;
  // Fail closed on corrupt JSON, even if SQL appears clear.
  const legacyLocked = isDirectoryReviewedSourceLocked(row.source_data_json);
  return legacyLocked ||
    Boolean(row.sql_reviewed_at?.trim()) ||
    Number(row.sql_unlock_pending) === 1 ||
    Number(row.partner_active) === 1 ||
    Number(row.deletion_pending) === 1;
}

export async function directoryProfileNotionSyncLocked(
  database: D1Database,
  profileId: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(profileId) || profileId <= 0) {
    throw new Error("DIRECTORY_REVIEW_LOCK_INVALID_ID");
  }
  const row = await database.prepare(DIRECTORY_REVIEW_LOCK_SQL)
    .bind(profileId).first<DirectoryReviewLockRow>();
  return directoryReviewLockedFromProjection(row);
}
