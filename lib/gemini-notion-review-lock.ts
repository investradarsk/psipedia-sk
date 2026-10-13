/** Cross-isolate exclusion for Notion-only review/import; never a profile table. */
export async function acquireGeminiNotionLock(database: D1Database, rawId: string) {
  const id = rawId.replaceAll("-", "").toLowerCase();
  const owner = crypto.randomUUID();
  const result = await database.prepare(
    "INSERT OR IGNORE INTO gemini_notion_review_locks (notion_page_id, owner) VALUES (?, ?)",
  ).bind(id, owner).run();
  if (!result.meta.changes) return null;
  return async () => {
    await database.prepare("DELETE FROM gemini_notion_review_locks WHERE notion_page_id = ? AND owner = ?")
      .bind(id, owner).run();
  };
}
