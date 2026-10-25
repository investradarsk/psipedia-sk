/**
 * Read-only operational health contract for existing Psipedia ↔ Notion sweeps.
 *
 * The caller retains the original sweep result and all domain-specific gates.
 * No Notion requests, D1 writes, publication transitions or page-ID matching
 * happen here. Emit counts and state only, never provider payloads or secrets.
 */
export type NotionSyncArea =
  | "service-catalog"
  | "directory"
  | "events-help"
  | "facebook-images";

export type NotionSyncHealthState =
  | "DISABLED"
  | "BLOCKED"
  | "IDLE"
  | "SYNCED"
  | "PARTIAL"
  | "CONFLICT"
  | "ERROR";

export type NotionSyncHealth = {
  event: "notion_sync_health";
  area: NotionSyncArea;
  state: NotionSyncHealthState;
  checked: number;
  created: number;
  updated: number;
  conflicts: number;
  failed: number;
};

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

function commonState(input: {
  enabled: boolean;
  schemaReady: boolean;
  created: number;
  updated: number;
  conflicts: number;
  failed: number;
}): NotionSyncHealthState {
  if (!input.enabled) return "DISABLED";
  if (!input.schemaReady) return "BLOCKED";
  const changed = input.created + input.updated > 0;
  if (input.failed > 0) return changed ? "PARTIAL" : "ERROR";
  if (input.conflicts > 0) return changed ? "PARTIAL" : "CONFLICT";
  return changed ? "SYNCED" : "IDLE";
}

/** Consistent, value-free operational status without inventing success. */
export function notionSyncHealth(area: NotionSyncArea, raw: unknown): NotionSyncHealth {
  const result = object(raw);
  let checked = 0;
  let created = 0;
  let updated = 0;
  let conflicts = 0;
  let failed = 0;
  let state: NotionSyncHealthState | null = null;

  switch (area) {
    case "service-catalog": {
      const stateValue = result.state;
      if (stateValue === "DISABLED") state = "DISABLED";
      else if (stateValue === "BLOCKED") state = "BLOCKED";
      else if (stateValue === "QUARANTINED") {
        state = "CONFLICT";
        conflicts = 1;
      } else if (stateValue === "VERIFIED") {
        state = "SYNCED";
        updated = 1;
      } else if (stateValue === "PAGE_READY") {
        state = "SYNCED";
        created = 1;
      } else if (stateValue === "IDLE") state = "IDLE";
      else {
        // Unknown runner state must not be reported as a successful sweep.
        state = "ERROR";
        failed = 1;
      }
      break;
    }
    case "directory": {
      checked = count(result.notionScanned);
      created = count(result.createdFromNotion) + count(result.bootstrapped);
      updated = count(result.pulledFromNotion) + count(result.pushedToNotion);
      failed = count(result.failed);
      state = commonState({
        enabled: result.enabled !== false,
        schemaReady: result.schemaReady !== false,
        created, updated, conflicts, failed,
      });
      break;
    }
    case "events-help": {
      const totals = object(result.totals);
      checked = count(totals.scanned);
      created = count(totals.createdFromNotion) + count(totals.createdInNotion);
      updated = count(totals.pulledFromNotion) + count(totals.pushedToNotion);
      conflicts = count(totals.conflicts);
      failed = count(totals.failed);
      state = commonState({
        enabled: result.enabled !== false,
        schemaReady: result.schemaReady !== false,
        created, updated, conflicts, failed,
      });
      break;
    }
    case "facebook-images": {
      checked = count(result.scanned);
      created = count(result.created);
      updated = count(result.updated) + count(result.writtenBack);
      conflicts = count(result.conflicts);
      failed = count(result.failed) + count(result.invalid);
      state = commonState({
        enabled: result.enabled !== false,
        schemaReady: true,
        created, updated, conflicts, failed,
      });
      break;
    }
  }

  return { event: "notion_sync_health", area, state, checked, created, updated, conflicts, failed };
}
