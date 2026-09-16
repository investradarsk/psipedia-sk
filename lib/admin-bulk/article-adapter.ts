import {
  articleAdminBulkFingerprint,
  normalizeArticleAdminBulkFilter,
} from "../article-admin-bulk-filter";
import {
  BulkPreflightError,
  type BulkAction,
  type BulkEligibility,
  type BulkResolvedRecord,
} from "./core";
import type { BulkDatabase } from "./snapshot-store";

export function articleBulkEligibility(action: BulkAction, record: BulkResolvedRecord): BulkEligibility {
  if (record.status !== "draft" && record.status !== "scheduled" && record.status !== "published") {
    return { eligible: false, reason: "invalid-lifecycle" };
  }
  if (!record.updatedAt) {
    return { eligible: false, reason: "invalid-lifecycle" };
  }
  if (action === "publish") {
    return record.status === "published"
      ? { eligible: false, reason: "already-target-state" }
      : { eligible: true };
  }
  return record.status === "draft"
    ? { eligible: false, reason: "already-target-state" }
    : { eligible: true };
}

export async function resolveArticleExplicit(
  database: BulkDatabase,
  ids: readonly number[],
): Promise<BulkResolvedRecord[]> {
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const result = await database.prepare(`SELECT id, status, updated_at
    FROM managed_articles WHERE id IN (${placeholders}) ORDER BY id`)
    .bind(...ids).all<{ id: number; status: string; updated_at: string | null }>();
  return result.results.map((row) => ({
    id: String(row.id),
    status: row.status,
    updatedAt: row.updated_at,
  }));
}

export const articleBulkAdapter = {
  module: "articles" as const,
  allowedActions: ["publish", "move-to-draft"] as const,
  normalizeFilter: normalizeArticleAdminBulkFilter,
  filterFingerprint: articleAdminBulkFingerprint,
  resolveExplicit: resolveArticleExplicit,
  resolveAllMatching: async () => {
    throw new BulkPreflightError(
      "All-matching výber článkov nie je podporovaný bez serverového membership kontraktu.",
      400,
      "unsupported-selection-mode",
    );
  },
  resolveSnapshot: async (database: BulkDatabase, ids: readonly string[]) => {
    const numericIds = ids
      .map((id) => Number(id))
      .filter((id) => Number.isSafeInteger(id) && id > 0);
    return resolveArticleExplicit(database, numericIds);
  },
  evaluate: articleBulkEligibility,
};
