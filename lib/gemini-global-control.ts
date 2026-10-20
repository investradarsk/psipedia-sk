import { nextGeminiRunAt } from "./gemini-automation-schedule.ts";

export type GeminiGlobalState = "RUNNING" | "STOPPED" | "RESUMING";
export type GeminiGlobalControl = {
  state: GeminiGlobalState; revision: number; updatedAt: string;
};
type Row = { state: GeminiGlobalState; revision: number; updated_at: string };
type ScheduleRow = {
  id: number; enabled: number; next_run_at: string | null;
  cadence_minutes: number; weekly_day: number | null;
};

export class GeminiGlobalControlError extends Error {
  constructor(readonly code: "STOPPED" | "CONFLICT" | "UNAVAILABLE") {
    super(code);
  }
}

export async function getGeminiGlobalControl(db: Pick<D1Database, "prepare">): Promise<GeminiGlobalControl> {
  let row: Row | null;
  try {
    row = await db.prepare(
      "SELECT state, revision, updated_at FROM gemini_global_control WHERE id=1"
    ).first<Row>();
  } catch { throw new GeminiGlobalControlError("UNAVAILABLE"); }
  if (!row || !["RUNNING", "STOPPED", "RESUMING"].includes(row.state) ||
      !Number.isSafeInteger(row.revision)) throw new GeminiGlobalControlError("UNAVAILABLE");
  return { state: row.state, revision: row.revision, updatedAt: row.updated_at };
}

/** Used before the route starts any provider work. D1 triggers guard the race
 * after this read, including a simultaneous STOP in another request. */
export async function requireGeminiRunning(db: Pick<D1Database, "prepare">) {
  const control = await getGeminiGlobalControl(db);
  if (control.state !== "RUNNING") throw new GeminiGlobalControlError("STOPPED");
}

/**
 * STOP is transactional: queued approvals are closed as FAILED with a specific
 * non-provider code; they are never silently replayed on resume. RUNNING jobs,
 * receipts, run history, existing drafts and per-category schedules are untouched.
 *
 * Resume is a fenced two-phase process: RESUMING remains fail-closed while
 * overdue occurrences are skipped using the existing Europe/Bratislava calendar.
 * A competing STOP increments revision; only the winning revision can enable.
 */
export async function setGeminiGlobalStop(db: D1Database, stopped: boolean, now = new Date()) {
  const at = now.toISOString();
  if (stopped) {
    await db.batch([
      db.prepare(
        "UPDATE gemini_global_control SET state='STOPPED',revision=revision+1,updated_at=? WHERE id=1"
      ).bind(at),
      db.prepare(
        "UPDATE gemini_manual_background_jobs SET status='FAILED',error_code='GEMINI_GLOBAL_STOP_CANCELLED',completed_at=? " +
        "WHERE status='QUEUED'"
      ).bind(at),
    ]);
    return getGeminiGlobalControl(db);
  }

  const current = await getGeminiGlobalControl(db);
  if (current.state === "RUNNING") return current;
  const fence = await db.prepare(
    "UPDATE gemini_global_control SET state='RESUMING',revision=revision+1,updated_at=? " +
    "WHERE id=1 AND state=? AND revision=?"
  ).bind(at, current.state, current.revision).run();
  if (fence.meta.changes !== 1) throw new GeminiGlobalControlError("CONFLICT");
  const revision = current.revision + 1;
  const due = await db.prepare(
    "SELECT id,enabled,next_run_at,cadence_minutes,weekly_day FROM gemini_automation_settings " +
    "WHERE enabled=1 AND next_run_at IS NOT NULL AND next_run_at<=?"
  ).bind(at).all<ScheduleRow>();

  for (const item of due.results ?? []) {
    const next = nextGeminiRunAt(new Date(item.next_run_at!), item.cadence_minutes, item.weekly_day, now);
    // Each update is fenced. If a concurrent STOP wins, it cannot re-enable
    // anything; leave the control stopped and let the admin explicitly resume.
    await db.prepare(
      "UPDATE gemini_automation_settings SET next_run_at=?,updated_at=? " +
      "WHERE id=? AND enabled=1 AND next_run_at=? AND EXISTS " +
      "(SELECT 1 FROM gemini_global_control WHERE id=1 AND state='RESUMING' AND revision=?)"
    ).bind(next, at, item.id, item.next_run_at, revision).run();
  }
  const enabled = await db.prepare(
    "UPDATE gemini_global_control SET state='RUNNING',updated_at=? " +
    "WHERE id=1 AND state='RESUMING' AND revision=?"
  ).bind(at, revision).run();
  if (enabled.meta.changes !== 1) throw new GeminiGlobalControlError("CONFLICT");
  return getGeminiGlobalControl(db);
}
