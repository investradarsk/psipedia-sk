export const LOST_FOUND_STATUSES = ["DRAFT", "PENDING", "ACTIVE", "RESOLVED", "EXPIRED", "REJECTED", "ARCHIVED"];

// Public/domain case lifecycle. These values do not define retention of private PII.
export const LOST_FOUND_PUBLIC_ACTIVE_DAYS = 30;
export const LOST_FOUND_PUBLIC_ARCHIVE_AFTER_EXPIRED_DAYS = 90;

// Private-data retention is intentionally not automated in this workstream.
// The shared moderation/security foundation will define the final purge policy before launch.
export const LOST_FOUND_PRIVATE_PII_RETENTION_DAYS = null;

export function defaultLostFoundExpiresAt(now = new Date()) {
  return new Date(now.getTime() + LOST_FOUND_PUBLIC_ACTIVE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function expiredArchiveThreshold(now = new Date()) {
  return new Date(now.getTime() - LOST_FOUND_PUBLIC_ARCHIVE_AFTER_EXPIRED_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function effectiveLostFoundStatus(report, now = new Date()) {
  if (report.status === "ACTIVE" && report.expiresAt && new Date(report.expiresAt).getTime() <= now.getTime()) return "EXPIRED";
  if (report.status === "EXPIRED" && report.expiresAt && new Date(report.expiresAt).getTime() <= new Date(expiredArchiveThreshold(now)).getTime()) return "ARCHIVED";
  return report.status;
}

export function lostFoundStatusIsPublic(status) {
  return ["ACTIVE", "RESOLVED", "EXPIRED", "ARCHIVED"].includes(status);
}

export function lostFoundStatusShouldIndex(status) {
  return status === "ACTIVE";
}
