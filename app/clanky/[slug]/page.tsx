import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArticleDetail } from "@/components/article-detail";
import { getPublishedArticle, getPublishedArticles } from "@/lib/article-store";
import { articles as seedArticles } from "@/lib/content";
import { articleHref } from "@/lib/portal";
import { buildPageMetadata, searchResultTitle } from "@/lib/seo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return seedArticles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedArticle(slug);
  if (!article) return {};
  return buildPageMetadata({
    title: searchResultTitle(article.title),
    description: article.excerpt,
    path: articleHref(article),
    image: article.image || null,
    imageAlt: article.title,
    type: "article",
    publishedTime: article.dateIso,
    modifiedTime: article.updatedDateIso,
    authors: [article.author],
    section: article.category,
  });
}

export default async function LegacyArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getPublishedArticle(slug);
  if (!article) notFound();

  const canonical = articleHref(article);
  if (canonical !== `/clanky/${slug}`) redirect(canonical);

  const articles = await getPublishedArticles();
  const sameCategory = articles.filter((item) => item.slug !== article.slug && item.category === article.category);
  const others = articles.filter((item) => item.slug !== article.slug && item.category !== article.category);
  return <ArticleDetail article={article} related={[...sameCategory, ...others].slice(0, 3)} />;
}
