import type { Article } from "@/lib/content";
import { articleHref, articlePortalSection } from "@/lib/portal";
import { getPublishedArticle, getPublishedArticleSummaries, getRelatedPublishedArticles } from "@/lib/article-store";
import {
  firstManualRelatedPath,
  selectAutomaticMidRelated,
  selectEndRelated,
} from "@/lib/article-magazine-selection";

export type ArticleMagazineData = {
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

  const [manualRelated, topicCandidates, endCandidates] = await Promise.all([
    manualPath
      ? resolveManualRelatedArticle(article).catch((error) => {
          console.error("Article magazine manual related read failed", {
            articleSlug: article.slug,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        })
      : Promise.resolve(null),
    getPublishedArticleSummaries({ portalSection: section, limit: 120 }).catch((error) => {
      console.error("Article magazine topic candidates read failed", {
        articleSlug: article.slug,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }),
    getRelatedPublishedArticles(article, 6).catch((error) => {
      console.error("Article magazine end recommendations read failed", {
        articleSlug: article.slug,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }),
  ]);

  const automaticRelated = manualRelated ? null : selectAutomaticMidRelated(article, topicCandidates);
  const midRelated = manualRelated ?? automaticRelated;
  const endRelated = selectEndRelated(article, endCandidates, midRelated, 3);

  return {
    midRelated,
    endRelated,
    manualRelatedResolved: Boolean(manualRelated),
  };
}
