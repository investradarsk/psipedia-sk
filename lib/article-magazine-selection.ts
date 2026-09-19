import type { Article } from "@/lib/content";

export function normalizedInternalArticlePath(value: string | undefined) {
  const href = value?.trim();
  if (!href?.startsWith("/")) return null;
  try {
    const url = new URL(href, "https://psipedia.sk");
    if (url.origin !== "https://psipedia.sk" || url.search || url.hash) return null;
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const parts = path.split("/").filter(Boolean);
    return parts.length === 2 ? path : null;
  } catch {
    return null;
  }
}

export function firstManualRelatedPath(article: Pick<Article, "blocks">) {
  const related = article.blocks?.find((block) => block.type === "related");
  return related?.type === "related" ? normalizedInternalArticlePath(related.href) : null;
}

function portalSection(article: Pick<Article, "portalSection">) {
  return article.portalSection ?? "clanky";
}

export function sameArticleTopic(article: Article, candidate: Article) {
  if (candidate.slug === article.slug || portalSection(candidate) !== portalSection(article)) return false;
  if (portalSection(article) === "novinky") {
    return Boolean(article.newsCategory && candidate.newsCategory === article.newsCategory);
  }
  if (article.portalSubpage) return candidate.portalSubpage === article.portalSubpage;
  return candidate.category === article.category;
}

export function selectAutomaticMidRelated(article: Article, candidates: Article[]) {
  return candidates.find((candidate) => sameArticleTopic(article, candidate)) ?? null;
}

export function selectEndRelated(article: Article, candidates: Article[], midRelated: Article | null, limit = 3) {
  const excluded = new Set([article.slug, midRelated?.slug].filter((value): value is string => Boolean(value)));
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (excluded.has(candidate.slug) || seen.has(candidate.slug)) return false;
    seen.add(candidate.slug);
    return true;
  }).slice(0, Math.max(0, limit));
}

export function selectLatestSidebar(article: Article, candidates: Article[], midRelated: Article | null, endRelated: Article[], limit = 5) {
  const excluded = new Set([article.slug, midRelated?.slug, ...endRelated.map((item) => item.slug)].filter((value): value is string => Boolean(value)));
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (excluded.has(candidate.slug) || seen.has(candidate.slug)) return false;
    seen.add(candidate.slug);
    return true;
  }).slice(0, Math.max(0, limit));
}
