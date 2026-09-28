import {
  directoryAdminMembershipFingerprint,
  directoryAdminMembershipQuery,
  directoryAdminMembershipFilters,
  parseDirectoryAdminFilters,
  type DirectoryAdminMembershipFilters,
} from "../directory-admin-query.ts";
import { allDirectoryCategories, isDirectoryCategory } from "../directory.ts";
import type { BulkAction, BulkEligibility, BulkResolvedRecord } from "./core.ts";
import type { BulkDatabase } from "./snapshot-store.ts";

function rawFilterValue(filter: Record<string, unknown>, key: string) {
  const value = filter[key];
  return typeof value === "string" ? value : null;
}

export function normalizeDirectoryBulkFilter(raw: unknown): DirectoryAdminMembershipFilters {
  const filter = typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const parsed = parseDirectoryAdminFilters(
    { get: (key) => rawFilterValue(filter, key) },
    isDirectoryCategory,
  );
  return directoryAdminMembershipFilters(parsed);
}

export function directoryBulkEligibility(action: BulkAction, record: BulkResolvedRecord): BulkEligibility {
  if (record.status !== "draft" && record.status !== "published") {
    return { eligible: false, reason: "invalid-lifecycle" };
  }
  if (action === "publish") {
    return record.status === "draft"
      ? { eligible: true }
      : { eligible: false, reason: "already-target-state" };
  }
  return record.status === "published"
    ? { eligible: true }
    : { eligible: false, reason: "already-target-state" };
}

export async function resolveDirectoryExplicit(
  database: BulkDatabase,
  ids: readonly number[],
): Promise<BulkResolvedRecord[]> {
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const result = await database.prepare(`SELECT id, status, updated_at
    FROM directory_profiles WHERE id IN (${placeholders}) ORDER BY id`)
    .bind(...ids).all<{ id: number; status: string; updated_at: string | null }>();
  return result.results.map((row) => ({
    id: String(row.id),
    status: row.status,
    updatedAt: row.updated_at,
  }));
}

export async function resolveDirectoryAllMatching(
  database: BulkDatabase,
  filter: DirectoryAdminMembershipFilters,
): Promise<BulkResolvedRecord[]> {
  const query = directoryAdminMembershipQuery(filter, allDirectoryCategories);
  const result = await database.prepare(`SELECT id, status, updated_at
    FROM directory_profiles${query.where} ORDER BY id`)
    .bind(...query.args).all<{ id: number; status: string; updated_at: string | null }>();
  return result.results.map((row) => ({
    id: String(row.id),
    status: row.status,
    updatedAt: row.updated_at,
  }));
}

export const directoryBulkAdapter = {
  module: "directory" as const,
  allowedActions: ["publish", "move-to-draft"] as const,
  normalizeFilter: normalizeDirectoryBulkFilter,
  filterFingerprint: directoryAdminMembershipFingerprint,
  resolveExplicit: resolveDirectoryExplicit,
  resolveAllMatching: resolveDirectoryAllMatching,
  resolveSnapshot: async (database: BulkDatabase, ids: readonly string[]) => {
    const numericIds = ids
      .map((id) => Number(id))
      .filter((id) => Number.isSafeInteger(id) && id > 0);
    return resolveDirectoryExplicit(database, numericIds);
  },
  evaluate: directoryBulkEligibility,
};
