import { geminiCanonicalEditorUrl } from "./gemini-concept-manager";
import type { GeminiCanonicalAgenda } from "./gemini-notion-review-state";

export type GeminiImportAgenda = GeminiCanonicalAgenda | "directory";

/**
 * D1 is the authority on whether an import completed. Notion may rate-limit
 * the final read or fail its optional write-back even after the D1 transaction.
 * Return a link only when BOTH the one-to-one mapping and the actual native
 * canonical record exist, and the record is still PRIVATE.
 */
export async function verifiedPrivateGeminiEditor(
  db: D1Database, agenda: GeminiImportAgenda, notionPageId: string,
): Promise<string | null> {
  const queryByAgenda: Record<GeminiImportAgenda, string> = {
    directory: `SELECT d.id,d.status FROM directory_notion_sync m
      JOIN directory_profiles d ON d.id=m.directory_profile_id
      WHERE m.notion_page_id=? LIMIT 1`,
    events: `SELECT d.id,d.status FROM event_notion_sync m
      JOIN managed_events d ON d.id=m.event_id
      WHERE m.notion_page_id=? LIMIT 1`,
    organizations: `SELECT d.id,d.status FROM notion_agenda_sync m
      JOIN help_organizations d ON d.id=m.entity_id
      WHERE m.notion_page_id=? AND m.agenda='organizations' LIMIT 1`,
    adoptions: `SELECT d.id,d.status FROM notion_agenda_sync m
      JOIN adoption_dogs d ON d.id=m.entity_id
      WHERE m.notion_page_id=? AND m.agenda='adoptions' LIMIT 1`,
    "help-cases": `SELECT d.id,d.status FROM notion_agenda_sync m
      JOIN help_cases d ON d.id=m.entity_id
      WHERE m.notion_page_id=? AND m.agenda='help-cases' LIMIT 1`,
    "lost-found": `SELECT d.id,d.status FROM notion_agenda_sync m
      JOIN lost_found_dog_reports d ON d.id=m.entity_id
      WHERE m.notion_page_id=? AND m.agenda='lost-found' LIMIT 1`,
  };
  const row = await db.prepare(queryByAgenda[agenda])
    .bind(notionPageId).first<{ id: number; status: string }>();
  if (!row || !Number.isSafeInteger(row.id) || row.id <= 0) return null;
  const privateStatus = agenda === "directory" || agenda === "events" || agenda === "help-cases"
    ? "draft" : "DRAFT";
  if (row.status !== privateStatus) return null;
  return geminiCanonicalEditorUrl({
    psipediaId: String(row.id), canonicalVerified: true,
    ...(agenda !== "directory" ? { agenda } : {}),
  });
}
