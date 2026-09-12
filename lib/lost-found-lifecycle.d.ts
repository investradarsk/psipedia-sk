export type LostFoundStatus = "DRAFT" | "PENDING" | "ACTIVE" | "RESOLVED" | "EXPIRED" | "REJECTED" | "ARCHIVED";
export const LOST_FOUND_STATUSES: LostFoundStatus[];
export const DEFAULT_ACTIVE_DAYS: number;
export const ARCHIVE_AFTER_EXPIRED_DAYS: number;
export function defaultLostFoundExpiresAt(now?: Date): string;
export function expiredArchiveThreshold(now?: Date): string;
export function effectiveLostFoundStatus(report: { status: LostFoundStatus; expiresAt?: string | null }, now?: Date): LostFoundStatus;
export function lostFoundStatusIsPublic(status: LostFoundStatus): boolean;
export function lostFoundStatusShouldIndex(status: LostFoundStatus): boolean;
