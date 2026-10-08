import {
  geminiAutomationCatalog, getGeminiCatalogItem,
  GEMINI_DEFAULT_CADENCE_MINUTES, GEMINI_DEFAULT_MAX_NEW_CONCEPTS,
} from "./gemini-automation-catalog.ts";
import type { GeminiCatalogItem } from "./gemini-automation-catalog.ts";

export type GeminiSettingRow = {
  id: number;
  stable_key: string;
  section: string;
  subcategory: string;
  enabled: number;
  cadence_minutes: number;
  max_new_concepts: number;
  last_run_at: string | null;
  next_run_at: string | null;
};

export type GeminiSettingView = GeminiCatalogItem & {
  enabled: boolean;
  cadenceMinutes: number;
  maxNewConcepts: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  saved: boolean;
};

export type GeminiSettingsInput = {
  stableKey: string;
  enabled: boolean;
  cadenceMinutes: number;
  maxNewConcepts: number;
};

export class GeminiSettingsValidationError extends Error {
  constructor(message: string) { super(message); this.name = "GeminiSettingsValidationError"; }
}

/** Only editable values are accepted; server derives section/subcategory. */
export function parseGeminiSettingsInput(value: unknown): GeminiSettingsInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GeminiSettingsValidationError("Neplatné nastavenia.");
  }
  const object = value as Record<string, unknown>;
  const expected = ["stable_key", "enabled", "cadence_minutes", "max_new_concepts"];
  if (Object.keys(object).some((key) => !expected.includes(key)) || expected.some((key) => !Object.hasOwn(object, key))) {
    throw new GeminiSettingsValidationError("Možno upraviť iba zapnutie, frekvenciu a počet konceptov.");
  }
  if (typeof object.stable_key !== "string" || !getGeminiCatalogItem(object.stable_key)) {
    throw new GeminiSettingsValidationError("Neznáma podkategória.");
  }
  if (typeof object.enabled !== "boolean") {
    throw new GeminiSettingsValidationError("Zapnutie musí byť áno alebo nie.");
  }
  const cadence = object.cadence_minutes;
  const max = object.max_new_concepts;
  if (typeof cadence !== "number" || !Number.isSafeInteger(cadence) || cadence < 5 || cadence > 43200) {
    throw new GeminiSettingsValidationError("Frekvencia musí byť medzi 5 a 43 200 minútami.");
  }
  if (typeof max !== "number" || !Number.isSafeInteger(max) || max < 0 || max > 100) {
    throw new GeminiSettingsValidationError("Maximálny počet konceptov musí byť medzi 0 a 100.");
  }
  return { stableKey: object.stable_key, enabled: object.enabled, cadenceMinutes: cadence, maxNewConcepts: max };
}

export function geminiSettingView(item: GeminiCatalogItem, row?: GeminiSettingRow | null): GeminiSettingView {
  return {
    ...item,
    enabled: row ? row.enabled === 1 : false,
    cadenceMinutes: row?.cadence_minutes ?? GEMINI_DEFAULT_CADENCE_MINUTES,
    maxNewConcepts: row?.max_new_concepts ?? GEMINI_DEFAULT_MAX_NEW_CONCEPTS,
    lastRunAt: row?.last_run_at ?? null,
    nextRunAt: row?.next_run_at ?? null,
    saved: !!row,
  };
}

export function geminiSettingViews(rows: readonly GeminiSettingRow[]) {
  const byKey = new Map(rows.map((row) => [row.stable_key, row]));
  return geminiAutomationCatalog.map((item) => geminiSettingView(item, byKey.get(item.stableKey)));
}
