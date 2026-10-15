import {
  writeBackPublishedArticleToNotion,
  type NotionSyncBindings,
} from "@/lib/notion-article-sync";

/** Hourly read from the canonical article/mapping tables. No schema changes. */
type ReconciliationCandidate = {
  id: number;
  slug: string;
  portal_section: string;
  status: string;
  published_at: string | null;
  updated_at: string;
  notion_page_id: string;
  mapping_updated_at: string;
};

export type ArticlePublishNotionReconciliationSummary = {
  enabled: boolean;
  checked: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
};

const DEFAULT_BATCH_SIZE = 50;

/**
 * A public scheduled article does not change status in D1: public selectors
 * use (status='scheduled' AND published_at <= now). Mirror that exact gate.
 *
 * Mapping updated_at acts as a *check-attempt* cursor and last_synced_at as a
 * successful acknowledgement. A failed Notion request can be retried without
 * starving every later article in the bounded queue.
 */
export async function runArticlePublishNotionReconciliation(args: {
  database: D1Database;
  bindings: NotionSyncBindings;
  now?: string;
  limit?: number;
}): Promise<ArticlePublishNotionReconciliationSummary> {
  const enabled = ["true", "1"].includes((args.bindings.NOTION_ARTICLE_SYNC_ENABLED ?? "").trim().toLowerCase());
  const summary: ArticlePublishNotionReconciliationSummary = {
    enabled, checked: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0,
  };
  if (!enabled) return summary;

  const now = args.now ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(now))) throw new Error("Invalid reconciliation time");
  const limit = Math.max(1, Math.min(DEFAULT_BATCH_SIZE, Math.trunc(args.limit ?? DEFAULT_BATCH_SIZE)));
  const result = await args.database.prepare(
    "SELECT a.id, a.slug, a.portal_section, a.status, a.published_at, a.updated_at, " +
      "m.notion_page_id, m.updated_at AS mapping_updated_at " +
    "FROM managed_articles a " +
    "JOIN article_notion_sync m ON m.article_id = a.id " +
    // Legacy published rows with no publish time require manual resolution. Never
    // emit a remote publication date inferred from a Cron execution time.
    "WHERE (a.status = 'published' AND a.published_at IS NOT NULL) OR " +
      "(a.status = 'scheduled' AND a.published_at IS NOT NULL AND a.published_at <= ?) " +
    "ORDER BY m.updated_at ASC, a.id ASC LIMIT ?",
  ).bind(now, limit).all<ReconciliationCandidate>();

  for (const candidate of result.results) {
    summary.checked += 1;
    try {
      const outcome = await writeBackPublishedArticleToNotion({
        database: args.database,
        bindings: args.bindings,
        now,
        article: {
          id: candidate.id,
          slug: candidate.slug,
          portalSection: candidate.portal_section,
          status: candidate.status,
          publishedAt: candidate.published_at,
          updatedAt: candidate.updated_at,
        },
      });
      if (!outcome.linked) summary.skipped += 1;
      else if (outcome.updated) summary.updated += 1;
      else summary.unchanged += 1;
    } catch {
      summary.failed += 1;
      // Neither page contents nor provider errors/tokens belong in logs.
      console.error("notion_article_publication_reconciliation_failed", { articleId: candidate.id });
      try {
        // Update the attempt cursor only, NEVER claim a failed remote sync.
        // CAS protects a newer mapping revision written by another worker.
        await args.database.prepare(
          "UPDATE article_notion_sync SET updated_at = ? " +
          "WHERE article_id = ? AND notion_page_id = ? AND updated_at = ?",
        ).bind(now, candidate.id, candidate.notion_page_id, candidate.mapping_updated_at).run();
      } catch {
        // The next Cron can still retry; do not abort the rest of this batch.
        console.error("notion_article_publication_attempt_cursor_failed", { articleId: candidate.id });
      }
    }
  }
  return summary;
}
