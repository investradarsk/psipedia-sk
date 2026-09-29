import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { ArticleDetail } from "@/components/article-detail";
import { getPublishedArticle, getPublishedArticleAuthorProfile } from "@/lib/article-store";
import { getArticleMagazineData } from "@/lib/article-magazine";
import { buildArticleMetadata } from "@/lib/article-seo";
import { sanitizePublicArticleContent } from "@/lib/article-content-remediation";
import { articles as seedArticles } from "@/lib/content";
import { articleHref } from "@/lib/portal";
import { legacyArticleRedirectPath } from "@/lib/legacy-public-redirects";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return seedArticles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const storedArticle = await getPublishedArticle(slug);
  if (!storedArticle) return {};
  const article = sanitizePublicArticleContent(storedArticle);
  return buildArticleMetadata(article);
}

export default async function LegacyArticlePage({ params }: Props) {
  const { slug } = await params;
  const legacyRedirect = legacyArticleRedirectPath(slug);
  if (legacyRedirect) permanentRedirect(legacyRedirect);
  const storedArticle = await getPublishedArticle(slug);
  if (!storedArticle) notFound();
  const article = sanitizePublicArticleContent(storedArticle);

  const canonical = articleHref(article);
  if (canonical !== `/clanky/${slug}`) redirect(canonical);

  const [magazine, authorProfile] = await Promise.all([
    getArticleMagazineData(article),
    getPublishedArticleAuthorProfile(article),
  ]);
  return <ArticleDetail article={article} magazine={magazine} authorProfile={authorProfile} />;
}
