/**
 * Directory profiles explicitly reviewed in Admin are frozen against Notion
 * editorial writes in either direction. The Admin checkbox is the ONLY unlock.
 *
 * The structured SQL review state is authoritative after the one-time import.
 * Missing SQL rows are unchecked, while active partners and pending deletions
 * remain independent, fail-closed locks.
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
 * One indexed, read-only D1 statement. SQL review, partner membership and
 * pending deletion are checked in one database snapshot, without JSON reads.
 */
export const DIRECTORY_REVIEW_LOCK_SQL = [
  "SELECT p.status,",
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
  status: string;
  sql_reviewed_at: string | null;
  sql_unlock_pending: number | null;
  partner_active: number;
  deletion_pending: number;
};

/**
 * Only SQL review state and operational SQL locks decide whether a profile
 * can synchronize. An archived or missing profile still fails closed.
 */
export function directoryReviewLockedFromProjection(row: DirectoryReviewLockRow | null): boolean {
  if (!row || row.status === "archived") return true;
  return Boolean(row.sql_reviewed_at?.trim()) ||
    Number(row.sql_unlock_pending) === 1 ||
    Number(row.partner_active) === 1 ||
    Number(row.deletion_pending) === 1;
}

export async function readDirectoryReviewLock(database: D1Database, profileId: number) {
  if (!Number.isSafeInteger(profileId) || profileId <= 0) {
    throw new Error("DIRECTORY_REVIEW_LOCK_INVALID_ID");
  }
  return database.prepare(DIRECTORY_REVIEW_LOCK_SQL)
    .bind(profileId).first<DirectoryReviewLockRow>();
}

export async function directoryProfileNotionSyncLocked(
  database: D1Database,
  profileId: number,
): Promise<boolean> {
  return directoryReviewLockedFromProjection(await readDirectoryReviewLock(database, profileId));
}

/**
 * An Admin-initiated unlock is allowed to export only its pending SQL review
 * state. An active partner, archive or deletion is never bypassed.
 */
export async function directoryProfileOwnerUnlockPending(
  database: D1Database,
  profileId: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(profileId) || profileId <= 0) {
    throw new Error("DIRECTORY_REVIEW_LOCK_INVALID_ID");
  }
  const row = await database.prepare(DIRECTORY_REVIEW_LOCK_SQL)
    .bind(profileId).first<DirectoryReviewLockRow>();
  return Boolean(row && row.status !== "archived" &&
    !row.sql_reviewed_at?.trim() && Number(row.sql_unlock_pending) === 1 &&
    Number(row.partner_active) !== 1 && Number(row.deletion_pending) !== 1);
}
