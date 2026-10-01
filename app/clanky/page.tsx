import type { Metadata } from "next";
import { ArticleBrowser } from "@/components/article-browser";
import { StructuredData } from "@/components/structured-data";
import { getPublishedArticleSummaries } from "@/lib/article-store";
import { buildCollectionPageJsonLd, buildListingPageMetadata, resolveListingIndexPolicy } from "@/lib/listing-seo";
import { articleHref } from "@/lib/portal";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return buildListingPageMetadata({
    title: "Novinky zo sveta psov",
    description: "Články, novinky, praktické návody a ďalší redakčný obsah zo sveta psov na jednom mieste.",
    path: "/clanky",
    searchParams: await searchParams,
  });
}

export default async function ArticlesPage({ searchParams }: Props) {
  const params = await searchParams;
  const policy = resolveListingIndexPolicy("/clanky", params);
  const articles = await getPublishedArticleSummaries({ limit: 200 });
  const categories: Record<string, string> = {
    vycvik: "Výcvik",
    zdravie: "Zdravie",
    vyziva: "Výživa",
    "zivot-so-psom": "Život so psom",
  };
  const heroImage = articles.find((article) => article.image)?.image;
  const schema = policy.kind === "clean" ? buildCollectionPageJsonLd({
    name: "Novinky zo sveta psov",
    description: "Články, novinky, praktické návody a ďalší redakčný obsah zo sveta psov na jednom mieste.",
    path: "/clanky",
    breadcrumbs: [
      { name: "Domov", path: "/" },
      { name: "Novinky zo sveta psov", path: "/clanky" },
    ],
    items: articles.map((article) => ({ name: article.title, path: articleHref(article) })),
  }) : null;

  return (
    <>
      {schema && <StructuredData value={schema} />}
      <main id="obsah">
        <header className={`page-hero page-hero--editorial shell${heroImage ? " page-hero--photo" : ""}`}>
          {heroImage && <img className="page-hero-photo" src={heroImage} alt="" aria-hidden="true" decoding="async" />}
          <div className="page-hero-inner">
            <span className="eyebrow">Psipedia</span>
            <h1>Novinky zo sveta psov</h1>
            <p>Články, novinky, praktické návody a ďalší obsah, ktorý pomáha lepšie sa orientovať vo svete psov.</p>
          </div>
        </header>
        <section className="page-body shell">
          <ArticleBrowser
            articles={articles}
            initialQuery={scalar(params.hladat) ?? ""}
            initialCategory={categories[scalar(params.tema) ?? ""] ?? "Všetky"}
          />
        </section>
      </main>
    </>
  );
}
