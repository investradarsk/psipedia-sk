import type { Metadata } from "next";
import Link from "next/link";
import { ArticleBrowser } from "@/components/article-browser";
import { HomePortalSearch } from "@/components/home-portal-search";
import { ArticlePopularitySidebar } from "@/components/article-popularity-sidebar";
import { ArticlePromo } from "@/components/article-promo";
import { ARTICLE_LISTING_PROMO_ANCHOR } from "@/lib/visual-library-anchors";
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
    novinky: "Novinky",
    steniatka: "Šteniatka",
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
            portalSearchSlot={
              <HomePortalSearch
                action="/clanky"
                id="article-hero-search"
                inputName="hladat"
                label="Hľadať v magazíne"
                panelLabel="Vyhľadávanie článkov"
                eyebrow="ČO HĽADÁŠ?"
                title="Nájdi článok alebo radu"
                placeholder="Hľadať v magazíne"
                buttonLabel="Hľadať"
                defaultValue={scalar(params.hladat) ?? ""}
                allowEmpty
                hidden={scalar(params.tema) ? [{ name: "tema", value: scalar(params.tema) ?? "" }] : []}
                shortcuts={[]}
                searchScope="articles"
              />
            }
          />
        </UnifiedSectionHeroShell>
        <section className="page-body">
          <PublicContentShell variant="listing">
          <div className={styles.layout} data-article-listing-layout>
            <ArticleBrowser
              articles={articles.map(({slug,title,excerpt,category,date,dateIso,image,imageAlt,accent,
                portalSection,newsCategory,imageDisplay,imageFocusX,imageFocusY,thumbnailImageDisplay})=>({
                slug,title,excerpt,category,date,dateIso,image,imageAlt,accent,
                portalSection,newsCategory,imageDisplay,imageFocusX,imageFocusY,thumbnailImageDisplay,
              }))}
              hidePrimarySearch
              initialQuery={scalar(params.hladat) ?? ""}
              initialCategory={categories[scalar(params.tema) ?? ""] ?? "Všetky"}
              sidebar={<aside className={styles.sidebar} aria-label="Objavte ďalší obsah" data-article-discovery-sidebar>
                <div className={styles.sidebarSticky}>
                  <ArticlePopularitySidebar popularity={discovery.popularity} initialWindow="24h" />
                  {discovery.promo ? (
                    <div className={styles.promo} data-automatic-article-promo>
                      <ArticlePromo anchorId={ARTICLE_LISTING_PROMO_ANCHOR} promoKey={discovery.promo.promoKey} variant="auto"
                        seed={discovery.promo.seed} utcDay={discovery.utcDay} compact />
                    </div>
                  ) : null}
                </div>
              </aside>}
            />
          </div>
          </PublicContentShell>
        </section>
      </main>
    </>
  );
}
