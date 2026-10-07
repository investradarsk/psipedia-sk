import type { Metadata } from "next";
import Link from "next/link";
import { ArticleBrowser } from "@/components/article-browser";
import { ArticlePopularitySidebar } from "@/components/article-popularity-sidebar";
import { ArticlePromo } from "@/components/article-promo";
import { getArticleDiscoveryData } from "@/lib/article-discovery";
import styles from "./article-listing.module.css";
import { Breadcrumbs } from "@/components/page-system";
import { PublicContentShell, UnifiedSectionHero, UnifiedSectionHeroShell } from "@/components/public-visual-system";
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
  const [articles, heroVisual, discovery] = await Promise.all([
    getPublishedArticleSummaries({ limit: 200 }),
    getSectionHeroVisual("section.novinky"),
    getArticleDiscoveryData({ slug: "article-listing", portalSection: "novinky" }),
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
          />
        </UnifiedSectionHeroShell>
        <section className="page-body">
          <PublicContentShell variant="listing">
          <div className={styles.layout} data-article-listing-layout>
            <div className={styles.main}>
              <ArticleBrowser
                articles={articles}
                initialQuery={scalar(params.hladat) ?? ""}
                initialCategory={categories[scalar(params.tema) ?? ""] ?? "Všetky"}
              />
            </div>
            <aside className={styles.sidebar} aria-label="Objavte ďalší obsah" data-article-discovery-sidebar>
              <div className={styles.sidebarSticky}>
                <ArticlePopularitySidebar popularity={discovery.popularity} initialWindow="24h" />
                {discovery.promo ? (
                  <div className={styles.promo} data-automatic-article-promo>
                    <ArticlePromo promoKey={discovery.promo.promoKey} variant="auto"
                      seed={discovery.promo.seed} utcDay={discovery.utcDay} compact />
                  </div>
                ) : null}
              </div>
            </aside>
          </div>
          </PublicContentShell>
        </section>
      </main>
    </>
  );
}
