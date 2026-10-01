import {
  getPopularArticles,
  type ArticlePopularityWindow,
  type PopularArticleSummary,
} from "@/lib/article-popularity";
import { articlePromoUtcDay } from "@/lib/article-promo";
import {
  resolveContextualArticlePromo,
  type ContextualArticlePromoDecision,
  type ContextualArticlePromoInput,
} from "@/lib/article-promo-context";
import { getNewsCategory } from "@/lib/news";
import { articleHref, getPortalSubpage } from "@/lib/portal";

export type ArticleDiscoveryPopularItem = {
  slug: string;
  title: string;
  href: string;
  label: string;
};

export type ArticleDiscoveryData = {
  popularity: Record<ArticlePopularityWindow, ArticleDiscoveryPopularItem[]>;
  initialWindow: ArticlePopularityWindow;
  promo: ContextualArticlePromoDecision;
};

function popularityLabel(article: PopularArticleSummary) {
  if (article.portalSection === "novinky") {
    return getNewsCategory(article.newsCategory)?.shortLabel ?? article.category;
  }
  if (article.portalSubpage) {
    return getPortalSubpage(article.portalSection, article.portalSubpage)?.subpage.label
      ?? article.category;
  }
  return article.category;
}

function toPopularItem(article: PopularArticleSummary): ArticleDiscoveryPopularItem {
  return {
    slug: article.slug,
    title: article.title,
    href: articleHref(article),
    label: popularityLabel(article),
  };
}

export function selectInitialPopularityWindow(
  popular24h: readonly ArticleDiscoveryPopularItem[],
  popular7d: readonly ArticleDiscoveryPopularItem[],
): ArticlePopularityWindow {
  if (popular24h.length > 0) return "24h";
  if (popular7d.length > 0) return "7d";
  return "24h";
}

async function readPopularityWindow(
  articleSlug: string,
  window: ArticlePopularityWindow,
  now: Date,
) {
  try {
    return await getPopularArticles({
      window,
      limit: 5,
      excludeSlug: articleSlug,
      now,
    });
  } catch (error) {
    console.error("Article discovery popularity read failed", {
      articleSlug,
      window,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export async function getArticleDiscoveryData(
  article: ContextualArticlePromoInput,
  now = new Date(),
): Promise<ArticleDiscoveryData> {
  const [popular24h, popular7d] = await Promise.all([
    readPopularityWindow(article.slug, "24h", now),
    readPopularityWindow(article.slug, "7d", now),
  ]);

  const popularity = {
    "24h": popular24h.slice(0, 5).map(toPopularItem),
    "7d": popular7d.slice(0, 5).map(toPopularItem),
  };

  return {
    popularity,
    initialWindow: selectInitialPopularityWindow(popularity["24h"], popularity["7d"]),
    promo: resolveContextualArticlePromo(article, { utcDay: articlePromoUtcDay(now) }),
  };
}
