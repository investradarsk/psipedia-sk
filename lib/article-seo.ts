import type { Metadata } from "next";
import type { Article } from "@/lib/content";
import { articleHref } from "@/lib/portal";
import { absoluteUrl, buildPageMetadata, searchResultTitle, SITE_NAME } from "@/lib/seo";

export function buildArticleMetadata(article: Article): Metadata {
  const seo = article.seo;
  const title = seo?.title || searchResultTitle(article.title);
  const description = seo?.description || article.excerpt;
  const canonical = seo?.canonicalUrl || absoluteUrl(articleHref(article));
  const image = seo?.ogImage || article.image || null;
  const imageUrl = image ? absoluteUrl(image) : null;
  const socialTitle = seo?.ogTitle || `${title} | ${SITE_NAME}`;
  const socialDescription = seo?.ogDescription || description;
  const base = buildPageMetadata({
    title,
    description,
    path: articleHref(article),
    image,
    imageAlt: article.title,
    type: "article",
    publishedTime: article.dateIso,
    modifiedTime: article.updatedDateIso,
    authors: [article.author],
    section: article.category,
    tags: seo?.focusKeyword ? [seo.focusKeyword] : undefined,
    robots: seo?.noindex ? { index: false, follow: true } : undefined,
  });

  return {
    ...base,
    keywords: seo?.focusKeyword ? [seo.focusKeyword] : undefined,
    alternates: { canonical },
    openGraph: {
      ...base.openGraph,
      title: socialTitle,
      description: socialDescription,
      url: canonical,
      images: imageUrl ? [{ url: imageUrl, alt: article.title }] : [],
    },
    twitter: { card: "summary_large_image", title: socialTitle, description: socialDescription, images: imageUrl ? [imageUrl] : [] },
  };
}
