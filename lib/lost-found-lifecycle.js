export const LOST_FOUND_STATUSES = ["DRAFT", "PENDING", "ACTIVE", "RESOLVED", "EXPIRED", "REJECTED", "ARCHIVED"];

export const LOST_FOUND_MODERATION_TRANSITIONS = Object.freeze({
  DRAFT: Object.freeze(["PENDING", "ACTIVE", "REJECTED", "ARCHIVED"]),
  PENDING: Object.freeze(["DRAFT", "ACTIVE", "REJECTED", "ARCHIVED"]),
  ACTIVE: Object.freeze(["RESOLVED", "EXPIRED", "ARCHIVED"]),
  RESOLVED: Object.freeze(["ACTIVE", "ARCHIVED"]),
  EXPIRED: Object.freeze(["ACTIVE", "ARCHIVED"]),
  REJECTED: Object.freeze(["DRAFT", "ARCHIVED"]),
  ARCHIVED: Object.freeze(["DRAFT", "ACTIVE"]),
});

export function allowedLostFoundTransitions(currentStatus) {
  return [...(LOST_FOUND_MODERATION_TRANSITIONS[currentStatus] ?? [])];
}

export function canTransitionLostFoundStatus(currentStatus, requestedStatus) {
  if (!LOST_FOUND_STATUSES.includes(currentStatus) || !LOST_FOUND_STATUSES.includes(requestedStatus)) return false;
  return currentStatus === requestedStatus || allowedLostFoundTransitions(currentStatus).includes(requestedStatus);
}

export function assertLostFoundStatusTransition(currentStatus, requestedStatus) {
  if (!LOST_FOUND_STATUSES.includes(requestedStatus)) throw new Error("Neplatný cieľový stav hlásenia.");
  if (!canTransitionLostFoundStatus(currentStatus, requestedStatus)) {
    throw new Error(`Nepovolený prechod stavu ${currentStatus} -> ${requestedStatus}.`);
  }
}

export function assertLostFoundCreateStatus(requestedStatus) {
  if (requestedStatus !== undefined && requestedStatus !== "DRAFT") {
    throw new Error("Nové hlásenie možno vytvoriť iba ako DRAFT.");
  }
}

export function assertLostFoundDuplicateTarget(reportId, reportType, duplicateOfId, target) {
  if (!Number.isInteger(duplicateOfId) || duplicateOfId < 1) throw new Error("Zadaj ID kanonického hlásenia pre duplicitu.");
  if (duplicateOfId === reportId) throw new Error("Hlásenie nemôže byť duplicitou samého seba.");
  if (!target) throw new Error("Kanonické hlásenie pre duplicitu neexistuje.");
  if (target.type !== reportType) throw new Error("Duplicitné hlásenia musia mať rovnaký typ LOST/FOUND.");
}

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
