/**
 * 5B: Read existing, persistently recorded Admin automation transitions only.
 * No new schema, Notion request, cron, or production write.
 *
 * These are honest *run* receipts, not proof of Notion availability or of
 * full content parity. A missing receipt remains UNKNOWN.
 */
export type NotionRunArea = "directory" | "events-help";
export type NotionRunState =
  | "UNKNOWN" | "STARTED" | "STALE" | "SUCCESS" | "NO_CHANGE"
  | "PARTIAL_SUCCESS" | "FAILED" | "SKIPPED" | "CANCELLED";

export type NotionRunReceipt = {
  area: NotionRunArea;
  status: NotionRunState;
  recordedAt: string | null;
  runId: string | null;
  conflicts: number | null;
  errors: number | null;
};

const SCOPES: Record<NotionRunArea, string> = {
  directory: "notion/directory",
  "events-help": "notion/events-help",
};

const STATUS_BY_EVENT: Record<string, Exclude<NotionRunState, "UNKNOWN" | "STALE">> = {
  automation_run_started: "STARTED",
  automation_run_success: "SUCCESS",
  automation_run_no_change: "NO_CHANGE",
  automation_run_partial_success: "PARTIAL_SUCCESS",
  automation_run_failed: "FAILED",
  automation_run_skipped: "SKIPPED",
  automation_run_cancelled: "CANCELLED",
};
const RUN_EVENT_KEYS = Object.keys(STATUS_BY_EVENT);
const STALE_STARTED_AFTER_MS = 2 * 60 * 60 * 1000;

type Row = {
  event_type: string;
  resource_ref: string;
  created_at: string;
  body: string | null;
};

function countFromBody(body: string | null, label: string): number | null {
  if (typeof body !== "string" || body.length > 2048) return null;
  // The producer is recordAdminAutomationRunEvent; only parse its
  // stable numeric counters. No provider content is returned to the client.
  const matches = [...body.matchAll(new RegExp(label + ": ([0-9]+)(?=,|\\.|$)", "g"))];
  if (matches.length !== 1) return null;
  const value = Number(matches[0][1]);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function parseNotionRunReceipt(
  area: NotionRunArea, row: Row | null, now = new Date(),
): NotionRunReceipt {
  const empty: NotionRunReceipt = {
    area, status: "UNKNOWN", recordedAt: null, runId: null, conflicts: null, errors: null,
  };
  if (!row || !Object.prototype.hasOwnProperty.call(STATUS_BY_EVENT, row.event_type)) return empty;
  const at = Date.parse(row.created_at);
  const id = Number(row.resource_ref);
  if (!Number.isFinite(at) || at > now.getTime() + 60_000
    || !Number.isSafeInteger(id) || id <= 0 || Math.abs(at - id) > STALE_STARTED_AFTER_MS) return empty;
  const raw = STATUS_BY_EVENT[row.event_type];
  const status = raw === "STARTED" && now.getTime() - at > STALE_STARTED_AFTER_MS
    ? "STALE" : raw;
  return {
    area, status, recordedAt: new Date(at).toISOString(), runId: String(id),
    conflicts: raw === "STARTED" ? null : countFromBody(row.body, "konfliktov na kontrolu"),
    errors: raw === "STARTED" ? null : countFromBody(row.body, "chýb"),
  };
}

/** At most two indexed backward scans. No untrusted identifiers enter SQL. */
export async function readNotionRunReceipts(
  db: Pick<D1Database, "prepare">, now = new Date(),
): Promise<Record<NotionRunArea, NotionRunReceipt>> {
  const result = {} as Record<NotionRunArea, NotionRunReceipt>;
  for (const area of ["directory", "events-help"] as const) {
    try {
      const row = await db.prepare(
        "SELECT event_type,resource_ref,created_at,body FROM admin_notification_events " +
        "WHERE source_type='AUTOMATION_RUN' AND actor_type='AUTOMATION' " +
        "AND resource_type='notion' AND actor_ref=? AND event_type IN (" +
        RUN_EVENT_KEYS.map(() => "?").join(",") + ") " +
        "ORDER BY id DESC LIMIT 1",
      ).bind(SCOPES[area], ...RUN_EVENT_KEYS).first<Row>();
      result[area] = parseNotionRunReceipt(area, row ?? null, now);
    } catch {
      // Missing migration 0071, blocked permissions or a damaged schema
      // must never yield a fake green status.
      result[area] = parseNotionRunReceipt(area, null, now);
    }
  }
  return result;
}
