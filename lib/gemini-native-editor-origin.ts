/** Signed external Gemini receipt, not a mutable Notion creator field.
 * Canonical entity IDs survive transitions from draft to published. */
export type GeminiNativeAgenda =
  "directory" | "events" | "organizations" | "adoptions" | "help-cases" | "lost-found";

const agendas = new Set<GeminiNativeAgenda>([
  "directory", "events", "organizations", "adoptions", "help-cases", "lost-found",
]);

export async function hasGeminiCanonicalOrigin(
  db: Pick<D1Database, "prepare">,
  agenda: GeminiNativeAgenda,
  entityId: number,
): Promise<boolean> {
  if (!agendas.has(agenda) || !Number.isSafeInteger(entityId) || entityId < 1) return false;
  const receipt = await db.prepare(
    "SELECT notion_page_id FROM gemini_notion_created_pages " +
    "WHERE import_agenda=? AND canonical_entity_id=? AND imported_at IS NOT NULL LIMIT 1"
  ).bind(agenda, entityId).first<{ notion_page_id: string }>();
  if (receipt?.notion_page_id) return true;
  // An explicit authenticated owner import of a pre-signature Gemini concept
  // is recorded in the separate canonical review notes table, never forged
  // as a signed external callback or published automatically.
  const legacy = await db.prepare(
    "SELECT notion_page_id FROM gemini_import_review_notes " +
    "WHERE import_agenda=? AND canonical_entity_id=? LIMIT 1"
  ).bind(agenda, entityId).first<{ notion_page_id: string }>().catch(() => null);
  return Boolean(legacy?.notion_page_id);
}
