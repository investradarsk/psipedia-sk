import type { Article } from "@/lib/content";
import { getPublishedArticleSummaries } from "@/lib/article-store";
import { articlePortalSection, type PortalSubpage } from "@/lib/portal";

/**
 * Review category landing pages are indexable only when they contain real editorial
 * material. Labels, descriptions, SEO metadata and imagery alone do not qualify.
 */
export function portalSubpageHasEditorialValue(subpage: PortalSubpage) {
  return Boolean(
    subpage.intro ||
    subpage.popularTopics?.length ||
    subpage.commonQuestions?.length ||
    subpage.homeSteps?.length ||
    subpage.warningSigns?.length ||
    subpage.expertAdvice ||
    subpage.serviceLinks?.length
  );
}

export function filterPublishedReviewsBySubpage(articles: Article[], portalSubpage: string, limit = 120) {
  return articles
    .filter((article) => articlePortalSection(article) === "recenzie" && article.portalSubpage === portalSubpage)
    .slice(0, Math.max(1, limit));
}

export async function getPublishedReviewSummaries(portalSubpage: string, limit = 120) {
  // The shared store caps public summary reads at 500. Pull the full review window first,
  // then apply the managed product-category filter before the category-page slice.
  const reviews = await getPublishedArticleSummaries({ portalSection: "recenzie", limit: 500 });
  return filterPublishedReviewsBySubpage(reviews, portalSubpage, limit);
}
