import type { Metadata } from "next";
import { ArticleBrowser } from "@/components/article-browser";
import { StructuredData } from "@/components/structured-data";
import { getPublishedArticleSummaries } from "@/lib/article-store";
import { buildCollectionPageJsonLd } from "@/lib/listing-seo";
import { articleHref } from "@/lib/portal";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata({
  title: "Magazín o psoch",
  description: "Články, novinky, praktické návody a ďalší redakčný obsah zo sveta psov na jednom mieste.",
  path: "/clanky",
});

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ hladat?: string; tema?: string }>;
}) {
  const params = await searchParams;
  const articles = await getPublishedArticleSummaries({ limit: 200 });
  const categories: Record<string, string> = {
    vycvik: "Výcvik",
    zdravie: "Zdravie",
    vyziva: "Výživa",
    "zivot-so-psom": "Život so psom",
  };
  const heroImage = articles.find((article) => article.image)?.image;
  const hasQuery = Object.values(params).some(Boolean);
  const schema = hasQuery ? null : buildCollectionPageJsonLd({
    name: "Magazín Psipedia",
    description: "Články, novinky, praktické návody a ďalší redakčný obsah zo sveta psov na jednom mieste.",
    path: "/clanky",
    breadcrumbs: [
      { name: "Domov", path: "/" },
      { name: "Magazín", path: "/clanky" },
    ],
    items: articles.map((article) => ({ name: article.title, path: articleHref(article) })),
  });

  return (
    <>
      {schema && <StructuredData value={schema} />}
      <main id="obsah">
        <header className={`page-hero page-hero--editorial shell${heroImage ? " page-hero--photo" : ""}`}>
          {heroImage && <img className="page-hero-photo" src={heroImage} alt="" aria-hidden="true" decoding="async" />}
          <div className="page-hero-inner">
            <span className="eyebrow">Magazín Psipedia</span>
            <h1>Magazín pre život so psom</h1>
            <p>Články, novinky, praktické návody a ďalší obsah, ktorý pomáha lepšie sa orientovať vo svete psov.</p>
          </div>
        </header>
        <section className="page-body shell">
          <ArticleBrowser
            articles={articles}
            initialQuery={params.hladat ?? ""}
            initialCategory={categories[params.tema ?? ""] ?? "Všetky"}
          />
        </section>
      </main>
    </>
  );
}
