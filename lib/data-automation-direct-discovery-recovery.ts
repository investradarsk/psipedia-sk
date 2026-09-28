import type { AutomationDiscoveryDatabase } from "./data-automation-discovery-store.ts";

/**
 * Releases only search-query cooldowns whose provider request succeeded but the
 * owning DIRECT_ENTITY discovery run subsequently ended PARTIAL/FAILED.
 *
 * The usage row is intentionally retained so daily request budgets and audit
 * history stay intact. Only its fingerprint is retired from future cooldown
 * lookup. This must be called only for an explicit admin-triggered retry.
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
    SET query_fingerprint=query_fingerprint || ':downstream-failed:' || id,
        finalized_at=COALESCE(finalized_at, ?)
    WHERE root_id IN (${placeholders})
      AND status='SUCCESS'
      AND query_fingerprint NOT LIKE '%:downstream-failed:%'
      AND discovery_run_id IN (
        SELECT id FROM automation_discovery_runs
        WHERE root_id IN (${placeholders})
          AND status IN ('PARTIAL','FAILED')
          AND error_count>0
      )`).bind(at, ...rootIds, ...rootIds).run();
  return { released: Number(result.meta?.changes ?? 0) };
}
