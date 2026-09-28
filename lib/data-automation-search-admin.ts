import type { AutomationDiscoveryDatabase, AutomationDiscoveryRoot } from "./data-automation-discovery-store.ts";
import { utcSearchDayBucket } from "./data-automation-search-budget.ts";

export type AutomationSearchAdminReason = "MANUAL_BUDGET_OVERRIDE" | "MANUAL_RUN";

function cleanActor(value: string) {
  return value.trim().toLowerCase().slice(0, 320);
}

export async function recordAutomationSearchAdminEvent(input: {
  root: AutomationDiscoveryRoot;
  actorEmail: string;
  reason: AutomationSearchAdminReason;
  extraRequests?: number;
  now?: Date;
}, database: AutomationDiscoveryDatabase) {
  const now = input.now ?? new Date();
  const at = now.toISOString();
  const extraRequests = Math.max(0, Math.min(10, Math.floor(input.extraRequests ?? 0)));
  const config = { ...input.root.config };
  const searchBudget = config.searchBudget && typeof config.searchBudget === "object" && !Array.isArray(config.searchBudget)
    ? { ...(config.searchBudget as Record<string, unknown>) }
    : {};
  const previous = Array.isArray(searchBudget.adminOverrides)
    ? searchBudget.adminOverrides.filter((row) => row && typeof row === "object" && !Array.isArray(row)).slice(-99)
    : [];
  const event = {
    dayBucket: utcSearchDayBucket(now),
    extraRequests,
    actor: cleanActor(input.actorEmail),
    createdAt: at,
    reason: input.reason,
  };
  searchBudget.adminOverrides = [...previous, event];
  config.searchBudget = searchBudget;
  await database.prepare(`UPDATE automation_discovery_roots
    SET config_json=?,updated_at=? WHERE id=?`).bind(
      JSON.stringify(config),
      at,
      input.root.id,
    ).run();
  return event;
}

export async function releaseAutomationSearchCooldownsForAdmin(input: {
  rootIds: number[];
  now?: Date;
}, database: AutomationDiscoveryDatabase) {
  const rootIds = [...new Set(input.rootIds.filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 20);
  if (!rootIds.length) return { released: 0 };
  const now = input.now ?? new Date();
  const marker = String(now.getTime());
  const recentSince = new Date(now.getTime() - 31 * 24 * 60 * 60_000).toISOString();
  const placeholders = rootIds.map(() => "?").join(",");
  const result = await database.prepare(`UPDATE automation_search_usage
    SET query_fingerprint=query_fingerprint || ':admin-search:' || ? || ':' || id
    WHERE root_id IN (${placeholders})
      AND status<>'RESERVED'
      AND created_at>=?`).bind(marker, ...rootIds, recentSince).run();
  return { released: Number(result.meta?.changes ?? 0) };
}
