import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleCard } from "@/components/article-card";
import { categories, categoryBySlug } from "@/lib/content";
import { getPublishedArticles } from "@/lib/article-store";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return categories.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = categoryBySlug[slug];
  if (!category) return {};
  return {
    title: category.label,
    description: category.description,
    alternates: { canonical: `/tema/${category.slug}` },
    openGraph: {
      type: "website",
      title: `${category.label} – články o psoch | Psipedia.sk`,
      description: category.description,
      url: `/tema/${category.slug}`,
    },
  };
}

export default async function TopicPage({ params }: Props) {
  const { slug } = await params;
  const category = categoryBySlug[slug];
  if (!category) notFound();
  const articles = await getPublishedArticles();
  const filtered = articles.filter((article) => article.category === category.label);

  return (
    <main id="obsah">
      <header className="page-hero shell">
        <div className="page-hero-inner">
          <span className="eyebrow">Téma</span>
          <h1>{category.label}</h1>
          <p>{category.description} Vyber si z našich sprievodcov a praktických postupov.</p>
        </div>
      </header>
      <section className="page-body shell">
        <p className="result-count">{filtered.length} {filtered.length === 1 ? "článok" : "články"}</p>
        <div className="article-grid">{filtered.map((article) => <ArticleCard article={article} key={article.slug} />)}</div>
      </section>
    </main>
  );
}
