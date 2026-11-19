/**
 * Directory profiles explicitly reviewed in Admin are frozen against Notion
 * editorial writes in either direction. The Admin checkbox is the ONLY unlock.
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
  return isDirectoryReviewedSourceLocked(row.source_data_json);
}
