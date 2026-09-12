export const LOST_FOUND_STATUSES = ["DRAFT", "PENDING", "ACTIVE", "RESOLVED", "EXPIRED", "REJECTED", "ARCHIVED"];
export const DEFAULT_ACTIVE_DAYS = 30;
export const ARCHIVE_AFTER_EXPIRED_DAYS = 90;

export function defaultLostFoundExpiresAt(now = new Date()) {
  return new Date(now.getTime() + DEFAULT_ACTIVE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function expiredArchiveThreshold(now = new Date()) {
  return new Date(now.getTime() - ARCHIVE_AFTER_EXPIRED_DAYS * 24 * 60 * 60 * 1000).toISOString();
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
