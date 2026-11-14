import {
  getPopularArticles,
  type ArticlePopularityWindow,
  type PopularArticleSummary,
} from "@/lib/article-popularity";
import { getPopularDirectoryProfiles, type PopularDirectoryProfileSummary } from "@/lib/directory-popularity";
import { directoryCategoryLabel, directoryProfileHref } from "@/lib/directory";
import { articlePromoUtcDay } from "@/lib/article-promo";
import {
  resolveContextualArticlePromo,
  type ContextualArticlePromoDecision,
  type ContextualArticlePromoInput,
} from "@/lib/article-promo-context";
import { getNewsCategory } from "@/lib/news";
import { articleHref, getPortalSection, getPortalSubpage } from "@/lib/portal";

export type ArticleDiscoveryPopularItem = {
  slug: string;
  title: string;
  href: string;
  label: string;
  image?: string;
  /** Actual qualified reads in the selected 24h/7d window; never estimated. */
  qualifiedReads?: number;
  /** Profiles use independent qualified-view counts, not article reads. */
  qualifiedViews?: number;
  contentType?: "article" | "profile";
};

export type ArticleDiscoveryData = {
  popularity: Record<ArticlePopularityWindow, ArticleDiscoveryPopularItem[]>;
  initialWindow: ArticlePopularityWindow;
  promo: ContextualArticlePromoDecision | null;
  utcDay: string;
};

function popularityLabel(article: PopularArticleSummary) {
  if (article.portalSection === "novinky") {
    return getNewsCategory(article.newsCategory)?.shortLabel ?? article.category;
  }
  if (article.portalSubpage) {
    return getPortalSubpage(article.portalSection, article.portalSubpage)?.subpage.label
      ?? getPortalSection(article.portalSection)?.label
      ?? article.category;
  }
  return getPortalSection(article.portalSection ?? "")?.label ?? article.category;
}

function toPopularItem(article: PopularArticleSummary): ArticleDiscoveryPopularItem {
  return {
    slug: article.slug,
    title: article.title,
    href: articleHref(article),
    label: popularityLabel(article),
    image: article.image,
    qualifiedReads: article.qualifiedReads,
  };
}

function toPopularProfile(profile: PopularDirectoryProfileSummary): ArticleDiscoveryPopularItem {
  return {
    slug: profile.slug,
    title: profile.name,
    href: directoryProfileHref(profile),
    label: directoryCategoryLabel(profile.category),
    image: profile.imageUrl,
    qualifiedViews: profile.qualifiedViews,
    contentType: "profile",
  };
}

/**
 * One five-item ranking for actual qualified reads/views, regardless of type.
 * Ties use a stable href for predictable SSR and client hydration. Never add
 * unmeasured "newest" content as a fallback.
 */
export function mergePopularContent(
  articles: readonly ArticleDiscoveryPopularItem[],
  profiles: readonly ArticleDiscoveryPopularItem[],
  limit = 5,
): ArticleDiscoveryPopularItem[] {
  const count = (item: ArticleDiscoveryPopularItem) =>
    item.contentType === "profile" ? item.qualifiedViews ?? 0 : item.qualifiedReads ?? 0;
  return [...articles, ...profiles]
    .filter((item) => Number.isFinite(count(item)) && count(item) > 0)
    .sort((a, b) => count(b) - count(a) || a.href.localeCompare(b.href))
    .slice(0, Math.max(1, Math.min(20, Math.trunc(limit))));
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
  const [popular24h, popular7d, profiles24h, profiles7d] = await Promise.all([
    readPopularityWindow(article.slug, "24h", now),
    readPopularityWindow(article.slug, "7d", now),
    getPopularDirectoryProfiles({ window: "24h", now, limit: 5 }),
    getPopularDirectoryProfiles({ window: "7d", now, limit: 5 }),
  ]);

  const popularity = {
    "24h": mergePopularContent(popular24h.slice(0, 5).map(toPopularItem), profiles24h.map(toPopularProfile)),
    "7d": mergePopularContent(popular7d.slice(0, 5).map(toPopularItem), profiles7d.map(toPopularProfile)),
  };

  const utcDay = articlePromoUtcDay(now);
  return {
    popularity,
    initialWindow: selectInitialPopularityWindow(popularity["24h"], popularity["7d"]),
    promo: resolveContextualArticlePromo(article, { utcDay }),
    utcDay,
  };
}
