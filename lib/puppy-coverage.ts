import type { PortalSubpage } from "@/lib/portal";

export const puppyCoverageStatuses = ["COVERED", "PARTIAL", "MISSING"] as const;
export type PuppyCoverageStatus = (typeof puppyCoverageStatuses)[number];
export type PuppyCoverageArticleStatus = "draft" | "scheduled" | "published";

export type PuppyCoverageArticle = {
  id: number;
  slug: string;
  title: string;
  portalSubpage: string | null;
  status: PuppyCoverageArticleStatus;
};

export type PuppyCoverageArea = Pick<PortalSubpage, "slug" | "label" | "description" | "href">;

export type PuppyCoverageRow = {
  slug: string;
  label: string;
  description: string;
  status: PuppyCoverageStatus;
  totalCount: number;
  publishedCount: number;
  draftCount: number;
  scheduledCount: number;
  articles: PuppyCoverageArticle[];
};

export function classifyPuppyCoverage(articles: PuppyCoverageArticle[]): PuppyCoverageStatus {
  if (articles.some((article) => article.status === "published")) return "COVERED";
  if (articles.length > 0) return "PARTIAL";
  return "MISSING";
}

export function buildPuppyCoverageMatrix(
  areas: PuppyCoverageArea[],
  articles: PuppyCoverageArticle[],
): PuppyCoverageRow[] {
  return areas
    .filter((area) => !area.href)
    .map((area) => {
      const relevantArticles = articles.filter((article) => article.portalSubpage === area.slug);
      return {
        slug: area.slug,
        label: area.label,
        description: area.description,
        status: classifyPuppyCoverage(relevantArticles),
        totalCount: relevantArticles.length,
        publishedCount: relevantArticles.filter((article) => article.status === "published").length,
        draftCount: relevantArticles.filter((article) => article.status === "draft").length,
        scheduledCount: relevantArticles.filter((article) => article.status === "scheduled").length,
        articles: relevantArticles,
      };
    });
}
