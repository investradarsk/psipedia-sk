import type { GeminiNativeAgenda } from "./gemini-native-editor-origin";

export type GeminiImportReview = {
  notionPageId: string;
  warnings: string[];
};

export async function recordGeminiImportReviewNotes(
  db: D1Database, agenda: GeminiNativeAgenda, entityId: number,
  notionPageId: string, warnings: readonly string[],
): Promise<void> {
  if (!Number.isSafeInteger(entityId) || entityId <= 0 || !notionPageId) return;
  const clean = [...new Set(warnings.filter(x => typeof x === "string")
    .map(x => x.trim().slice(0, 280)).filter(Boolean))].slice(0, 30);
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO gemini_import_review_notes
    (import_agenda,canonical_entity_id,notion_page_id,warnings_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(import_agenda,canonical_entity_id) DO UPDATE SET
      warnings_json=excluded.warnings_json, updated_at=excluded.updated_at
    WHERE notion_page_id=excluded.notion_page_id`)
    .bind(agenda, entityId, notionPageId, JSON.stringify(clean), now, now).run();
}

export async function getGeminiImportReviewNotes(
  db: D1Database, agenda: GeminiNativeAgenda, entityId: number,
): Promise<GeminiImportReview | null> {
  if (!Number.isSafeInteger(entityId) || entityId <= 0) return null;
  const row = await db.prepare(
    "SELECT notion_page_id,warnings_json FROM gemini_import_review_notes WHERE import_agenda=? AND canonical_entity_id=? LIMIT 1"
  ).bind(agenda, entityId).first<{notion_page_id:string;warnings_json:string}>();
  if (!row) return null;
  try {
    const items: unknown = JSON.parse(row.warnings_json);
    return {notionPageId:row.notion_page_id,
      warnings:Array.isArray(items)?items.filter((x):x is string=>typeof x==="string").slice(0,30):[]};
  } catch { return null; }
}
