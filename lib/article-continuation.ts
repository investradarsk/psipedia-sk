import type { Article } from "@/lib/content";
import { getArticlePromoTarget, type ArticlePromoKey } from "@/lib/article-promo";
import { resolveContentHubNextAction } from "@/lib/content-hub-context-cta";
import { articleHref, articlePortalSection } from "@/lib/portal";

export type ArticleContinuationDecision = {
  href: string;
  label: string;
  context: "cross-section" | "topic";
};

const canonical = (href: string) => href.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";

/**
 * Exactly one next step, based on an explicit editorial subsection rule or the
 * existing topic route. No new search, popularity query or inferred taxonomy.
 */
export function resolveArticleContinuation({
  article, topicHref, topicLabel, sidebarPromoKey, relatedHrefs = [],
}: {
  article: Article;
  topicHref: string;
  topicLabel: string;
  sidebarPromoKey?: ArticlePromoKey | null;
  relatedHrefs?: readonly string[];
}): ArticleContinuationDecision | null {
  const manualPromoKeys = (article.blocks ?? []).flatMap((block) =>
    block.type === "psipedia-promo" ? [block.promoKey] : [],
  );
  const manualHrefs = manualPromoKeys.flatMap((key) => {
    const href = getArticlePromoTarget(key)?.href;
    return href ? [href] : [];
  });
  const manualRelatedHrefs = (article.blocks ?? []).flatMap((block) =>
    block.type === "related" ? [block.href] : [],
  );
  const occupiedHrefs = [
    articleHref(article),
    topicHref,
    ...relatedHrefs,
    ...manualHrefs,
    ...manualRelatedHrefs,
  ];
  const next = article.portalSubpage
    ? resolveContentHubNextAction({
        section: articlePortalSection(article),
        topic: article.portalSubpage,
        sidebarPromoKey,
        occupiedPromoKeys: manualPromoKeys,
        occupiedHrefs,
      })
    : null;

  if (next && next.href.startsWith("/") && !next.href.startsWith("//")) {
    return { href: next.href, label: next.label, context: "cross-section" };
  }

  // The bottom-of-article topic link is omitted when the author has already
  // supplied that destination (or when no safe, distinct topic exists).
  const normalizedTopic = canonical(topicHref);
  if (!topicHref.startsWith("/") || topicHref.startsWith("//") ||
      !topicLabel.trim() || normalizedTopic === canonical(articleHref(article)) ||
      [...manualHrefs, ...manualRelatedHrefs, ...relatedHrefs].some((href) => canonical(href) === normalizedTopic)) {
    return null;
  }
  return { href: topicHref, label: `Viac z témy ${topicLabel}`, context: "topic" };
}
