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
}) {
  await db.prepare(
    "UPDATE gemini_automation_runs SET status = ?, completed_at = ?, error_count = ?, error_code = ? WHERE id = ? AND status = 'RUNNING'",
  ).bind(input.status, input.at, input.status === "FAILED" ? 1 : 0, input.errorCode ?? null, input.id).run();
}
