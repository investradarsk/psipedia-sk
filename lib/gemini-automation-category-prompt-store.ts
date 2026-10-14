import type { GeminiD1 } from "./gemini-automation-store.ts";
import { geminiAutomationCatalog, getGeminiCatalogItem } from "./gemini-automation-catalog.ts";
import {
  geminiCategoryPromptView, geminiCategoryPromptViews,
  type GeminiCategoryPromptRow,
} from "./gemini-automation-category-prompts.ts";

/** Admin-only D1 overrides. Reads never seed or change default prompts. */
export async function listGeminiCategoryPrompts(db: GeminiD1) {
  const rows = await db.prepare(
    "SELECT stable_key, user_prompt, updated_at FROM gemini_category_prompts",
  ).all<GeminiCategoryPromptRow>();
  return geminiCategoryPromptViews(rows.results ?? []);
}

export async function getGeminiCategoryPrompt(db: GeminiD1, stableKey: string) {
  const item = getGeminiCatalogItem(stableKey);
  if (!item) return null;
  const row = await db.prepare(
    "SELECT stable_key, user_prompt, updated_at FROM gemini_category_prompts WHERE stable_key = ?",
  ).bind(stableKey).first<GeminiCategoryPromptRow>();
  return geminiCategoryPromptView(item, row);
}

export async function saveGeminiCategoryPrompt(
  db: GeminiD1, stableKey: string, userPrompt: string, now = new Date(),
) {
  if (!getGeminiCatalogItem(stableKey)) throw new Error("GEMINI_UNKNOWN_CATEGORY");
  await db.prepare(
    "INSERT INTO gemini_category_prompts (stable_key, user_prompt, updated_at) VALUES (?, ?, ?) " +
    "ON CONFLICT(stable_key) DO UPDATE SET user_prompt = excluded.user_prompt, updated_at = excluded.updated_at",
  ).bind(stableKey, userPrompt, now.toISOString()).run();
  return getGeminiCategoryPrompt(db, stableKey);
}

export async function resetGeminiCategoryPrompt(db: GeminiD1, stableKey: string) {
  if (!getGeminiCatalogItem(stableKey)) throw new Error("GEMINI_UNKNOWN_CATEGORY");
  await db.prepare("DELETE FROM gemini_category_prompts WHERE stable_key = ?").bind(stableKey).run();
  const item = geminiAutomationCatalog.find((category) => category.stableKey === stableKey)!;
  return geminiCategoryPromptView(item);
}
