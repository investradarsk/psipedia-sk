import type { GeminiFailureCode } from "./gemini-automation-types.ts";

export type GeminiD1 = Pick<D1Database, "prepare">;
export async function beginGeminiRun(db: GeminiD1, options: {
  settingId: number;
  triggerType: "MANUAL" | "SCHEDULED" | "TEST";
  model: string;
  at: string;
}): Promise<number> {
  const result = await db.prepare(
    "INSERT INTO gemini_automation_runs (setting_id, trigger_type, status, model, started_at) VALUES (?, ?, 'RUNNING', ?, ?)",
  ).bind(options.settingId, options.triggerType, options.model, options.at).run();
  const id = result.meta.last_row_id;
  if (!id) throw new Error("gemini_run_insert_failed");
  return id;
}

export async function finishGeminiRun(db: GeminiD1, input: {
  id: number;
  status: "SUCCESS" | "FAILED";
  at: string;
  errorCode?: GeminiFailureCode;
  requestCount?: number;
  groundedSearchQueryCount?: number;
  candidateCount?: number;
  duplicateCount?: number;
  conceptCount?: number;
  errorCount?: number;
}) {
  await db.prepare(
    "UPDATE gemini_automation_runs SET status = ?, completed_at = ?, request_count = ?, grounded_search_query_count = ?, candidate_count = ?, duplicate_count = ?, concept_count = ?, error_count = ?, error_code = ? WHERE id = ? AND status = 'RUNNING'",
  ).bind(input.status, input.at, input.requestCount ?? 0, input.groundedSearchQueryCount ?? 0,
    input.candidateCount ?? 0, input.duplicateCount ?? 0, input.conceptCount ?? 0,
    input.errorCount ?? (input.status === "FAILED" ? 1 : 0), input.errorCode ?? null, input.id).run();
}

/**
 * Atomic concurrency claim: two simultaneous POSTs cannot both create a fresh
 * RUNNING manual pilot. Expired claims are ignored without modifying history.
 */
export async function beginGeminiManualPilotRun(db: GeminiD1, input: {
  settingId: number; stableKey: string; model: string; at: string; staleBefore: string;
}): Promise<number | null> {
  const result = await db.prepare(`
    INSERT INTO gemini_automation_runs (setting_id, trigger_type, status, model, started_at)
    SELECT s.id, 'MANUAL', 'RUNNING', ?, ?
    FROM gemini_automation_settings s
    WHERE s.id = ? AND s.stable_key = ? AND s.max_new_concepts > 0
      AND NOT EXISTS (
        SELECT 1 FROM gemini_automation_runs r
        WHERE r.setting_id = s.id AND r.trigger_type = 'MANUAL'
          AND r.status = 'RUNNING' AND r.started_at >= ?
      )
  `).bind(input.model, input.at, input.settingId, input.stableKey, input.staleBefore).run();
  return (result.meta.changes ?? 0) === 1 ? Number(result.meta.last_row_id) : null;
}

export async function markGeminiSettingLastRun(db: GeminiD1, settingId: number, at: string) {
  await db.prepare("UPDATE gemini_automation_settings SET last_run_at = ? WHERE id = ?")
    .bind(at, settingId).run();
}
