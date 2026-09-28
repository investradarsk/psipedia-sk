import type { Metadata } from "next";
import type { Article } from "@/lib/content";
import { articleHref } from "@/lib/portal";
import { buildPageMetadata, searchResultTitle } from "@/lib/seo";

export function buildArticleMetadata(article: Article): Metadata {
  const seo = article.seo;
  const title = seo?.title || searchResultTitle(article.title);
  const description = seo?.description || article.excerpt;
  const canonical = seo?.canonicalUrl || articleHref(article);

  return {
    ...buildPageMetadata({
      title,
      description,
      path: articleHref(article),
      canonical,
      image: seo?.ogImage || article.image,
      imageAlt: article.title,
      socialTitle: seo?.ogTitle || undefined,
      socialDescription: seo?.ogDescription || undefined,
      type: "article",
      publishedTime: article.dateIso,
      modifiedTime: article.updatedDateIso,
      authors: [article.author],
      section: article.category,
      tags: seo?.focusKeyword ? [seo.focusKeyword] : undefined,
      robots: seo?.noindex ? { index: false, follow: true } : undefined,
    }),
    keywords: seo?.focusKeyword ? [seo.focusKeyword] : undefined,
  };
}
