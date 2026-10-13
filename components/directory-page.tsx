import Link from "next/link";
import { Breadcrumbs } from "@/components/page-system";
import {
  PublicContentShell,
  PublicFoundation,
  UnifiedSectionHero,
  UnifiedSectionHeroShell,
} from "@/components/public-visual-system";
import { DirectoryCategoryNavigation } from "@/components/directory-category-navigation";
import { DirectoryFilterForm } from "@/components/directory-filter-form";
import { DirectoryResults } from "@/components/directory-results";
import { SectionHeroSearch } from "@/components/section-hero-search";
import { ArticlePopularitySidebar } from "@/components/article-popularity-sidebar";
import { getArticleDiscoveryData } from "@/lib/article-discovery";
import {
  directoryCategories, directoryCategoryHref, getDirectoryCategory,
  type DirectoryCategorySlug,
} from "@/lib/directory";
import { directoryQueryFields } from "@/lib/directory-query";
import type { DirectoryFilters, PublicDirectoryProfilePage } from "@/lib/directory-store";
import { EMPTY_MAP_FILTERS, serializeMapUiFilters } from "@/lib/map-public-ui";
import { getSectionHeroVisual } from "@/lib/section-visual-store";
import styles from "./directory-public.module.css";

function profileCountLabel(count: number) {
  return count === 1 ? "profil" : count > 1 && count < 5 ? "profily" : "profilov";
}

function mapHref(filters: DirectoryFilters, category?: DirectoryCategorySlug) {
  // Reuse the actual public map URL contract. No Google SDK call on listing.
  const params = serializeMapUiFilters({
    ...EMPTY_MAP_FILTERS,
    category: "services",
    subcategory: category ?? filters.category,
    region: filters.region,
    district: filters.district,
    city: filters.city,
    search: filters.query,
  });
  return "/mapa?" + params.toString();
}

export async function DirectoryPage({
  result, filters, initialCategory = "all",
}: {
  result: PublicDirectoryProfilePage;
  filters: DirectoryFilters;
  initialCategory?: "all" | DirectoryCategorySlug;
}) {
  const active = initialCategory === "all" ? null : getDirectoryCategory(initialCategory);
  const basePath = active ? `/adresar/${active.slug}` : "/adresar";
  const [heroVisual, discovery] = await Promise.all([
    getSectionHeroVisual(active ? `directory.${active.slug}` : "section.adresar"),
    getArticleDiscoveryData({ slug: "directory-listing", portalSection: "novinky" }),
  ]);
  // Preserve the established category SEO copy and all stored image/crop values.
  const seoHeroVisual = active
    ? { ...heroVisual, heroContent: { ...heroVisual.heroContent, title: active.heroTitle, intro: active.intro } }
    : heroVisual;

  const categoryItems = [
    { href: "/adresar", title: "Všetky služby", current: !active && !filters.category },
    ...directoryCategories.map((category) => ({
      href: directoryCategoryHref(category),
      title: category.label,
      current: active?.slug === category.slug || (!active && filters.category === category.slug),
    })),
  ];

  const hasPopularity = discovery.popularity["24h"].length > 0 || discovery.popularity["7d"].length > 0;

  return (
    <main id="obsah" className={styles.page}>
      <PublicFoundation className={styles.foundation}>
        <UnifiedSectionHeroShell>
          <UnifiedSectionHero
            breadcrumbs={<Breadcrumbs>
              <Link href="/">Domov</Link><span>/</span>
              {active
                ? <><Link href="/adresar">Služby pre psov</Link><span>/</span><span>{active.label}</span></>
                : <span>Služby pre psov</span>}
            </Breadcrumbs>}
            eyebrow={active ? active.singular : "Adresár služieb"}
            title={active?.heroTitle ?? "Služby pre psov"}
            intro={active?.intro ?? "Nájdi veterinára, trénera, klub, salón, opatrovanie alebo ďalšiu praktickú službu podľa kategórie a lokality."}
            visual={seoHeroVisual}
            metaSlot={active ? `${result.total} ${profileCountLabel(result.total)}` : undefined}
          />
        </UnifiedSectionHeroShell>

        <section className={styles.resultsSection} aria-label="Adresár služieb pre psov">
          <PublicContentShell variant="listing" className={styles.resultsShell}>
            <div className={styles.directorySearch} data-directory-main-search>
              <SectionHeroSearch
                action={basePath}
                id="directory-main-query"
                label="Hľadať služby pre psov"
                placeholder="Hľadať veterinára, trénera, salón alebo mesto..."
                defaultValue={filters.query}
                buttonLabel="Hľadať"
                formScope="services"
                hidden={directoryQueryFields(filters, ["q", "page"])}
              />
            </div>

            <DirectoryCategoryNavigation items={categoryItems} />

            <div className={styles.directoryColumns} data-directory-columns>
              <aside className={styles.filterColumn} aria-label="Filtre adresára">
                <DirectoryFilterForm
                  filters={filters}
                  options={result.options}
                  basePath={basePath}
                  category={active?.slug}
                />
              </aside>

              <DirectoryResults
                result={result}
                filters={filters}
                basePath={basePath}
                title={active ? active.resultsTitle : filters.query || filters.category || filters.region || filters.city ? "Výsledky vyhľadávania" : "Všetky služby pre psov"}
              />

              <aside className={styles.directorySidebar} aria-label="Ďalšie možnosti">
                <section className={styles.sidebarCard} data-directory-map-cta>
                  <span className={styles.sidebarEyebrow}>Služby v okolí</span>
                  <h2>Nájdi služby na mape</h2>
                  <p>Prezri si verejne zobraziteľné miesta podľa kategórie a zvolenej lokality.</p>
                  <Link href={mapHref(filters, active?.slug)}>Zobraziť na mape →</Link>
                </section>

                <section className={styles.sidebarCard} data-directory-provider-cta>
                  <span className={styles.sidebarEyebrow}>Pre poskytovateľov</span>
                  <h2>Poskytuješ služby pre psov?</h2>
                  <p>Požiadaj o pridanie alebo úpravu údajov svojho profilu.</p>
                  <Link href="/o-nas#kontakt">Pridať alebo upraviť profil →</Link>
                </section>

                <div className={styles.popularityCard} data-directory-popular-articles>
                  {hasPopularity
                    ? <ArticlePopularitySidebar popularity={discovery.popularity} initialWindow="24h" />
                    : <section className={styles.sidebarCard}><h2>Najčítanejšie</h2><p>Za posledné obdobie zatiaľ nemáme rebríček.</p></section>}
                </div>
              </aside>
            </div>
          </PublicContentShell>
        </section>
      </PublicFoundation>
    </main>
  );
}
