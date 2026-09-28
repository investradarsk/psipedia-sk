import type { Article } from "@/lib/content";
import { articleHref, articlePortalSection } from "@/lib/portal";
import { getPublishedArticle, getPublishedArticleSummaries, getRelatedPublishedArticles } from "@/lib/article-store";
import {
  firstManualRelatedPath,
  selectAutomaticMidRelated,
  selectEndRelated,
  selectLatestSidebar,
} from "@/lib/article-magazine-selection";

export const ARTICLE_SIDEBAR_MODE = "latest" as const;

export type ArticleMagazineData = {
  sidebarMode: typeof ARTICLE_SIDEBAR_MODE;
  sidebarItems: Article[];
  midRelated: Article | null;
  endRelated: Article[];
  manualRelatedResolved: boolean;
};

async function resolveManualRelatedArticle(article: Article) {
  const path = firstManualRelatedPath(article);
  if (!path) return null;
  const slug = path.split("/").filter(Boolean).at(-1);
  if (!slug || slug === article.slug) return null;

  const candidate = await getPublishedArticle(slug);
  if (!candidate || candidate.slug === article.slug) return null;
  return articleHref(candidate).replace(/\/+$/, "") === path ? candidate : null;
}

export async function getArticleMagazineData(article: Article): Promise<ArticleMagazineData> {
  const section = articlePortalSection(article);
  const manualPath = firstManualRelatedPath(article);

  const [manualRelated, topicCandidates, endCandidates, latestCandidates] = await Promise.all([
    manualPath ? resolveManualRelatedArticle(article) : Promise.resolve(null),
    getPublishedArticleSummaries({ portalSection: section, limit: 120 }),
    getRelatedPublishedArticles(article, 6),
    getPublishedArticleSummaries({ limit: 40 }),
  ]);

  const automaticRelated = manualRelated ? null : selectAutomaticMidRelated(article, topicCandidates);
  const midRelated = manualRelated ?? automaticRelated;
  const endRelated = selectEndRelated(article, endCandidates, midRelated, 3);
  const sidebarItems = selectLatestSidebar(article, latestCandidates, midRelated, endRelated, 5);

  return {
    sidebarMode: ARTICLE_SIDEBAR_MODE,
    sidebarItems,
    midRelated,
    endRelated,
    manualRelatedResolved: Boolean(manualRelated),
  };
}
