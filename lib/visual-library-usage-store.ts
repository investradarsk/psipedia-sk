import { env } from "cloudflare:workers";
import { resolveContextualArticlePromo } from "@/lib/article-promo-context";
import { articlePromoUtcDay, isArticlePromoKey, type ArticlePromoKey } from "@/lib/article-promo";
import { articleHref } from "@/lib/portal";
import { articlePromoBlockAnchor, AUTOMATIC_ARTICLE_PROMO_ANCHOR } from "@/lib/visual-library-anchors";
import { normalizeArticleBlocks, type ArticleBlock } from "@/lib/article-blocks";

export type ArticleBannerUse = {
  url: string;
  label: string;
  placement: string;
  evidence: "published-manual" | "published-auto-today";
  blockId?: string;
  anchorId?: string;
};
export type ArticleBannerUsageResult = {
  status: "complete" | "partial" | "unavailable";
  scannedArticles: number;
  generatedAt: string;
  day: string;
  byKey: Record<string, ArticleBannerUse[]>;
  notice?: string;
};

type PublishedRow = {
  id: number;
  slug: string;
  title: string;
  portal_section: string | null;
  portal_subpage: string | null;
  news_category: string | null;
  blocks_json: string | null;
};
type TopicRow = {
  article_id: number;
  slug: string;
  label: string;
  normalized_key: string;
  is_active: number;
};

const MAX_ARTICLES = 2000;

export function collectPublishedArticleBannerUses(
  articles: readonly PublishedRow[],
  topics: readonly TopicRow[],
  day: string,
): { byKey: Record<string, ArticleBannerUse[]>; malformed: number } {
  const byKey: Record<string, ArticleBannerUse[]> = {};
  const topicsById = new Map<number, Array<{ slug: string; label: string; normalizedKey: string; isActive: boolean }>>();
  for (const topic of topics) {
    const list = topicsById.get(topic.article_id) ?? [];
    list.push({
      slug: topic.slug,
      label: topic.label,
      normalizedKey: topic.normalized_key,
      isActive: Boolean(topic.is_active),
    });
    topicsById.set(topic.article_id, list);
  }

  let malformed = 0;
  for (const row of articles) {
    if (!row.slug || !row.title) { malformed++; continue; }
    let blocks: ArticleBlock[];
    try {
      const raw = JSON.parse(row.blocks_json || "[]") as unknown;
      if (!Array.isArray(raw)) { malformed++; continue; }
      blocks = normalizeArticleBlocks(raw);
    } catch { malformed++; continue; }
    const href = articleHref({ slug: row.slug, portalSection: row.portal_section as Parameters<typeof articleHref>[0]["portalSection"] });
    const url = `https://psipedia.sk${href}`;
    const add = (key: ArticlePromoKey, use: ArticleBannerUse) => {
      (byKey[key] ??= []).push(use);
    };
    const manualKeys = new Set<ArticlePromoKey>();
    for (const [index, block] of blocks.entries()) {
      if (block.type !== "psipedia-promo" || !isArticlePromoKey(block.promoKey)) continue;
      manualKeys.add(block.promoKey);
      add(block.promoKey, {
        url, label: row.title, placement: `V obsahu článku · blok ${index + 1}`,
        evidence: "published-manual", blockId: block.id, anchorId: articlePromoBlockAnchor(block.id),
      });
    }
    // Use exactly the same contextual selection routine as the public article.
    // Manual promo blocks suppress an identical contextual sidebar promo.
    const automatic = resolveContextualArticlePromo({
      slug: row.slug,
      portalSection: row.portal_section as Parameters<typeof resolveContextualArticlePromo>[0]["portalSection"],
      portalSubpage: row.portal_subpage ?? undefined,
      newsCategory: row.news_category as Parameters<typeof resolveContextualArticlePromo>[0]["newsCategory"],
      blocks: blocks.filter((block) => block.type === "psipedia-promo"),
      topics: topicsById.get(row.id) ?? [],
    }, { utcDay: day });
    if (automatic && !manualKeys.has(automatic.promoKey)) {
      add(automatic.promoKey, {
        url, label: row.title, placement: "Bočný panel článku · automaticky dnes",
        evidence: "published-auto-today",
        anchorId: AUTOMATIC_ARTICLE_PROMO_ANCHOR,
      });
    }
  }
  for (const uses of Object.values(byKey)) {
    uses.sort((a, b) => a.url.localeCompare(b.url, "sk") ||
      a.placement.localeCompare(b.placement, "sk"));
  }
  return { byKey, malformed };
}

export async function loadPublishedArticleBannerUses(): Promise<ArticleBannerUsageResult> {
  const generatedAt = new Date().toISOString();
  const day = articlePromoUtcDay(new Date(generatedAt));
  const fallback = (notice: string): ArticleBannerUsageResult => ({
    status: "unavailable", scannedArticles: 0, generatedAt, day, byKey: {}, notice,
  });

  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db || typeof db.prepare !== "function") {
    return fallback("Databáza článkov nie je dostupná. Neuvádzame neoverené použitia.");
  }

  try {
    const [articleResult, topicResult] = await Promise.all([
      db.prepare(`
        SELECT id, slug, title, portal_section, portal_subpage, news_category, blocks_json
        FROM managed_articles
        WHERE status = 'published' OR (status = 'scheduled' AND published_at <= ?)
        ORDER BY id ASC
        LIMIT ?
      `).bind(generatedAt, MAX_ARTICLES + 1).all<PublishedRow>(),
      db.prepare(`
        SELECT a.article_id, t.slug, t.label, t.normalized_key, t.is_active
        FROM article_topic_assignments a
        JOIN article_topics t ON t.id = a.topic_id
        JOIN managed_articles m ON m.id = a.article_id
        WHERE m.status = 'published' OR (m.status = 'scheduled' AND m.published_at <= ?)
        ORDER BY a.article_id, t.label, t.id
      `).bind(generatedAt).all<TopicRow>(),
    ]);
    const all = articleResult.results ?? [];
    const truncated = all.length > MAX_ARTICLES;
    const rows = all.slice(0, MAX_ARTICLES);
    const { byKey, malformed } = collectPublishedArticleBannerUses(
      rows, topicResult.results ?? [], day,
    );
    const partial = truncated || malformed > 0;
    return {
      status: partial ? "partial" : "complete",
      scannedArticles: rows.length,
      generatedAt, day, byKey,
      notice: truncated
        ? "Zobrazených je len prvých 2 000 publikovaných článkov. Zoznam nie je úplný."
        : malformed
          ? `Pri ${malformed} článkoch sa nepodarilo načítať obsahové bloky. Ich použitia nie sú zahrnuté.`
          : undefined,
    };
  } catch (error) {
    console.error("visual_library_article_usage_scan_failed", error);
    return fallback("Overenie publikovaných článkov sa nepodarilo. Skús načítať stránku znovu.");
  }
}
