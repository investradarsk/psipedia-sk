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

/**
 * Individual Events/Help results come from the SAME verified hourly sweep.
 * Never split a parent receipt into five invented independent run outcomes.
 * Emit counts and fixed agenda IDs only; user-edited content/IDs stay private.
 */
export type NotionAgendaHealth = {
  event: "notion_sync_agenda_health";
  area: "events-help";
  agenda: "events" | "organizations" | "adoptions" | "help-cases" | "lost-found";
  state: NotionSyncHealthState;
  checked: number;
  created: number;
  updated: number;
  conflicts: number;
  failed: number;
};

const EVENT_HELP_AGENDAS = new Set<NotionAgendaHealth["agenda"]>([
  "events", "organizations", "adoptions", "help-cases", "lost-found",
]);

type AgendaCounts = {
  agenda: string;
  enabled?: boolean;
  schemaReady?: boolean;
  targetMissing?: boolean;
  scanned?: number;
  createdFromNotion?: number;
  createdInNotion?: number;
  pulledFromNotion?: number;
  pushedToNotion?: number;
  conflicts?: number;
  failed?: number;
};

/** Existing scheduler summary only; pure, bounded and write-free. */
export function notionAgendaHealth(raw: {
  enabled: boolean;
  schemaReady: boolean;
  agendas: readonly AgendaCounts[];
}): NotionAgendaHealth[] {
  const result: NotionAgendaHealth[] = [];
  const seen = new Set<string>();
  for (const item of raw.agendas.slice(0, 5)) {
    if (!EVENT_HELP_AGENDAS.has(item.agenda as NotionAgendaHealth["agenda"])
      || seen.has(item.agenda)) continue;
    seen.add(item.agenda);
    const health = notionSyncHealth("events-help", {
      enabled: raw.enabled && item.enabled !== false,
      schemaReady: raw.schemaReady && item.schemaReady !== false && !item.targetMissing,
      totals: {
        scanned: item.scanned,
        createdFromNotion: item.createdFromNotion,
        createdInNotion: item.createdInNotion,
        pulledFromNotion: item.pulledFromNotion,
        pushedToNotion: item.pushedToNotion,
        conflicts: item.conflicts,
        failed: item.failed,
      },
    });
    result.push({
      event: "notion_sync_agenda_health",
      area: "events-help",
      agenda: item.agenda as NotionAgendaHealth["agenda"],
      state: health.state,
      checked: health.checked,
      created: health.created,
      updated: health.updated,
      conflicts: health.conflicts,
      failed: health.failed,
    });
  }
  return result;
}

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
  let state: NotionSyncHealthState = "ERROR";

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
      else if (stateValue === "SYNCED" || stateValue === "REVIEW") {
        created = count(result.created);
        updated = count(result.updated);
        checked = count(result.verified);
        conflicts = count(result.conflicts);
        state = stateValue === "REVIEW"
          ? (created + updated > 0 ? "PARTIAL" : "CONFLICT")
          : "SYNCED";
      }
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
