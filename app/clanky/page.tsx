import type { Metadata } from "next";
import Link from "next/link";
import { ArticleBrowser } from "@/components/article-browser";
import { Breadcrumbs } from "@/components/page-system";
import { UnifiedSectionHero, UnifiedSectionHeroShell } from "@/components/public-visual-system";
import { SectionHeroSearch } from "@/components/section-hero-search";
import { StructuredData } from "@/components/structured-data";
import { getPublishedArticleSummaries } from "@/lib/article-store";
import { buildCollectionPageJsonLd, buildListingPageMetadata, resolveListingIndexPolicy } from "@/lib/listing-seo";
import { articleHref } from "@/lib/portal";
import { getSectionHeroVisual } from "@/lib/section-visual-store";

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
  const [articles, heroVisual] = await Promise.all([
    getPublishedArticleSummaries({ limit: 200 }),
    getSectionHeroVisual("section.novinky"),
  ]);
  const categories: Record<string, string> = {
    vycvik: "Výcvik",
    zdravie: "Zdravie",
    vyziva: "Výživa",
    "zivot-so-psom": "Život so psom",
  };
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
        <UnifiedSectionHeroShell>
          <UnifiedSectionHero
            breadcrumbs={<Breadcrumbs><Link href="/">Domov</Link><span>/</span><span>Novinky</span></Breadcrumbs>}
            eyebrow="Psipedia"
            title="Novinky zo sveta psov"
            intro="Články, novinky, praktické návody a ďalší obsah, ktorý pomáha lepšie sa orientovať vo svete psov."
            visual={heroVisual}
            searchSlot={
              <SectionHeroSearch
                action="/clanky"
                id="news-hero-query"
                label="Hľadať v Novinkách"
                placeholder="Hľadať článok alebo tému…"
                defaultValue={scalar(params.hladat) ?? ""}
                inputName="hladat"
              />
            }
          />
        </UnifiedSectionHeroShell>
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
