import type { Article } from "@/lib/content";
import { articlePortalSection, type ArticlePortalSection } from "@/lib/portal";

export const homepageEditorialSections = ["steniatka", "starostlivost", "aktivity"] as const;

export type HomepageEditorialSection = (typeof homepageEditorialSections)[number];

export type HomepageArticleSelection = {
  latest: Article[];
  bySection: Record<HomepageEditorialSection, Article[]>;
};

function comparePublishedArticles(left: Article, right: Article) {
  const byDate = right.dateIso.localeCompare(left.dateIso);
  if (byDate !== 0) return byDate;
  return left.slug.localeCompare(right.slug, "sk-SK");
}

export function selectHomepageArticles(
  articles: Article[],
  options: { latestLimit?: number; sectionLimit?: number } = {},
): HomepageArticleSelection {
  const latestLimit = Math.max(1, Math.trunc(options.latestLimit ?? 5));
  const sectionLimit = Math.max(1, Math.trunc(options.sectionLimit ?? 3));
  const ordered = [...articles].sort(comparePublishedArticles);
  const latest = ordered.slice(0, latestLimit);
  const usedSlugs = new Set(latest.map((article) => article.slug));

  const bySection = Object.fromEntries(
    homepageEditorialSections.map((section) => {
      const selected = ordered
        .filter((article) => articlePortalSection(article) === section && !usedSlugs.has(article.slug))
        .slice(0, sectionLimit);
      selected.forEach((article) => usedSlugs.add(article.slug));
      return [section, selected];
    }),
  ) as Record<HomepageEditorialSection, Article[]>;

  return { latest, bySection };
}

export function homepageArticleSection(article: Article): ArticlePortalSection {
  return articlePortalSection(article);
}
