import type { GeminiD1 } from "./gemini-automation-store.ts";
import { getGeminiCatalogItem } from "./gemini-automation-catalog.ts";
import {
  geminiSettingView, geminiSettingViews,
  type GeminiSettingRow, type GeminiSettingsInput,
} from "./gemini-automation-admin-settings.ts";

export type GeminiRecentRun = {
  id: number;
  stableKey: string;
  section: string;
  subcategory: string;
  startedAt: string;
  trigger: string;
  status: string;
  model: string;
  candidateCount: number;
  duplicateCount: number;
  conceptCount: number;
  errorCode: string | null;
};

const SETTING_COLUMNS = "id, stable_key, section, subcategory, enabled, cadence_minutes, max_new_concepts, last_run_at, next_run_at";

export async function listGeminiSettings(db: GeminiD1) {
  const rows = await db.prepare("SELECT " + SETTING_COLUMNS + " FROM gemini_automation_settings ORDER BY stable_key ASC")
    .all<GeminiSettingRow>();
  return geminiSettingViews(rows.results ?? []);
}

export async function getGeminiSetting(db: GeminiD1, stableKey: string) {
  const item = getGeminiCatalogItem(stableKey);
  if (!item) return null;
  const row = await db.prepare("SELECT " + SETTING_COLUMNS + " FROM gemini_automation_settings WHERE stable_key = ?")
    .bind(stableKey).first<GeminiSettingRow>();
  return geminiSettingView(item, row);
}

export async function saveGeminiSetting(db: GeminiD1, input: GeminiSettingsInput, now = new Date()) {
  const item = getGeminiCatalogItem(input.stableKey);
  if (!item) throw new Error("GEMINI_UNKNOWN_CATEGORY");
  const timestamp = now.toISOString();
  // This is a configuration timestamp only. No cron invokes the Gemini runner.
  const next = input.enabled ? new Date(now.getTime() + input.cadenceMinutes * 60000).toISOString() : null;
  await db.prepare(`
    INSERT INTO gemini_automation_settings
      (stable_key, section, subcategory, enabled, cadence_minutes, max_new_concepts, next_run_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(stable_key) DO UPDATE SET
      section = excluded.section,
      subcategory = excluded.subcategory,
      enabled = excluded.enabled,
      cadence_minutes = excluded.cadence_minutes,
      max_new_concepts = excluded.max_new_concepts,
      next_run_at = excluded.next_run_at,
      updated_at = excluded.updated_at
  `).bind(
    item.stableKey, item.section, item.subcategory,
    input.enabled ? 1 : 0, input.cadenceMinutes, input.maxNewConcepts, next, timestamp,
  ).run();
  return getGeminiSetting(db, input.stableKey);
}

export async function listRecentGeminiRuns(db: GeminiD1, limit = 30): Promise<GeminiRecentRun[]> {
  const bounded = Number.isSafeInteger(limit) ? Math.min(100, Math.max(1, limit)) : 30;
  const result = await db.prepare(`
    SELECT r.id, s.stable_key, s.section, s.subcategory, r.started_at,
      r.trigger_type, r.status, r.model, r.candidate_count, r.duplicate_count,
      r.concept_count, r.error_code
    FROM gemini_automation_runs r
    JOIN gemini_automation_settings s ON s.id = r.setting_id
    ORDER BY r.started_at DESC, r.id DESC
    LIMIT ?
  `).bind(bounded).all<{
    id: number; stable_key: string; section: string; subcategory: string;
    started_at: string; trigger_type: string; status: string; model: string;
    candidate_count: number; duplicate_count: number; concept_count: number; error_code: string | null;
  }>();
  return (result.results ?? []).map((row) => ({
    id: row.id,
    stableKey: row.stable_key, section: row.section, subcategory: row.subcategory,
    startedAt: row.started_at, trigger: row.trigger_type, status: row.status,
    model: row.model, candidateCount: row.candidate_count,
    duplicateCount: row.duplicate_count, conceptCount: row.concept_count,
    errorCode: row.error_code,
  }));
}
