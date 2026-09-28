import type { AutomationDiscoveryDatabase } from "./data-automation-discovery-store.ts";

/**
 * Releases search-query cooldowns for an explicit admin-triggered DIRECT_ENTITY
 * retry. Search usage rows are intentionally retained so daily provider budgets
 * and the audit trail stay intact; only the fingerprint used by cooldown lookup
 * is retired.
 *
 * This is deliberately broader than downstream-failure recovery. A prior run can
 * finish SUCCESS with zero canonical drafts (for example all provider results
 * were filtered, rejected by technical governance, or yielded no usable entity).
 * In that state an explicit admin retry must not silently become a no-op for the
 * full query cooldown window.
 *
 * Call this only from an explicit admin save/retry path. Scheduled discovery
 * continues to honor the normal query cooldown.
 */
export async function releaseFailedDirectDiscoveryCooldowns(input: {
  rootIds: number[];
  now?: Date;
}, databaseInput: AutomationDiscoveryDatabase) {
  const rootIds = [...new Set(input.rootIds.filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 20);
  if (!rootIds.length) return { released: 0 };
  const placeholders = rootIds.map(() => "?").join(",");
  const at = (input.now ?? new Date()).toISOString();
  const result = await databaseInput.prepare(`UPDATE automation_search_usage
    SET query_fingerprint=query_fingerprint || ':admin-retry:' || id,
        finalized_at=COALESCE(finalized_at, ?)
    WHERE root_id IN (${placeholders})
      AND status IN ('SUCCESS','EMPTY')
      AND query_fingerprint NOT LIKE '%:admin-retry:%'`).bind(at, ...rootIds).run();
  return { released: Number(result.meta?.changes ?? 0) };
}
