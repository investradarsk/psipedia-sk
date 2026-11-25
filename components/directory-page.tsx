import { settleOptionalRead } from "@/lib/optional-read-recovery";
import { retryTransientPublicRead } from "@/lib/public-read-retry";
import { PublicFilterLayout, PublicFilterPanel } from "@/components/public-filters";
import Link from "next/link";
import { AffiliateRotatingBanner } from "@/components/affiliate-rotating-banner";
import { Breadcrumbs } from "@/components/page-system";
import {
  PublicContentShell,
  PublicCategorySection,
  PublicFoundation,
  UnifiedSectionHero,
  UnifiedSectionHeroShell,
} from "@/components/public-visual-system";
import { DirectoryCategoryNavigation } from "@/components/directory-category-navigation";
import { DirectoryFilterForm } from "@/components/directory-filter-form";
import { RelatedEntityLinks } from "@/components/related-entity-links";
import type { InternalDiscoveryLink } from "@/lib/internal-discovery";
import { DirectoryResults } from "@/components/directory-results";
import { DirectoryCard } from "@/components/directory-card";
import { HomePortalSearch } from "@/components/home-portal-search";
import { ArticlePopularitySidebar } from "@/components/article-popularity-sidebar";
import { getArticleDiscoveryData } from "@/lib/article-discovery";
import {
  directoryCategories,
  directoryCategoryHref,
  getDirectoryCategory,
  type DirectoryCategorySlug,
} from "@/lib/directory";
import { directoryQueryFields } from "@/lib/directory-query";
import {
  getDirectoryCategoryPreviews,
  type DirectoryFilters,
  type PublicDirectoryProfilePage,
} from "@/lib/directory-store";
import { EMPTY_MAP_FILTERS, serializeMapUiFilters } from "@/lib/map-public-ui";
import { getSectionHeroVisual } from "@/lib/section-visual-store";
import { PublicPhotoCallout } from "@/components/public-visual-system/public-photo-callout";
import { PublicMagazineBanner } from "@/components/public-visual-system/public-magazine-banner";
import { publicSectionPhotoPromos } from "@/lib/public-section-photo-promos";
import { CTA_DIRECTORY_MAP_ANCHOR } from "@/lib/visual-library-anchors";
import styles from "./directory-public.module.css";

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
    facets: filters.facets,
    canonicalService: filters.canonicalService ?? "",
  });
  return "/mapa?" + params.toString();
}

export async function DirectoryPage({
  result,
  filters,
  initialCategory = "all",
  priorityLinks = [],
}: {
  result: PublicDirectoryProfilePage;
  filters: DirectoryFilters;
  initialCategory?: "all" | DirectoryCategorySlug;
  priorityLinks?: InternalDiscoveryLink[];
}) {
  const active = initialCategory === "all" ? null : getDirectoryCategory(initialCategory);
  // Only the unfiltered overview uses five bounded profiles per category.
  // All searches, facets, sorts, category routes and pages keep full results.
  const isOverview =
    !active &&
    filters.page === 1 &&
    filters.sort === "recommended" &&
    ![
      filters.query,
      filters.category,
      filters.region,
      filters.district,
      filters.city,
      filters.service,
      filters.canonicalService,
      filters.breed,
      filters.fciGroup,
      filters.organization,
      filters.profileType,
    ].some(Boolean) &&
    Object.keys(filters.facets ?? {}).length === 0;
  const basePath = active ? `/adresar/${active.slug}` : "/adresar";
  // These three independent D1 reads previously ran in two serial phases
  // on the root overview. Start the conditional previews together with the
  // hero and editorial sidebar without changing the page's result set.
  const previewsRead = isOverview ? retryTransientPublicRead(() => getDirectoryCategoryPreviews(5), { stage: "directory_category_previews" }) : Promise.resolve(null);
  const heroRead = retryTransientPublicRead(() => getSectionHeroVisual(active ? `directory.${active.slug}` : "section.adresar"));
  const discoveryRead = getArticleDiscoveryData({ slug: "directory-listing", portalSection: "novinky" });
  // Keep all three reads concurrent and identify any failing D1 read boundary
  // in Cloudflare Observability without logging SQL or private input.
  const [categoryPreviews, heroVisual, discovery] = await Promise.all([
    settleOptionalRead("directory_category_previews", previewsRead, null),
    heroRead,
    settleOptionalRead("directory_article_discovery", discoveryRead, null),
  ]);
  // Preserve the established category SEO copy and all stored image/crop values.
  const seoHeroVisual = active
    ? {
        ...heroVisual,
        heroContent: { ...heroVisual.heroContent, title: active.heroTitle, intro: active.intro },
      }
    : heroVisual;

  const categoryItems = [
    { href: "/adresar", title: "Všetky služby", current: !active && !filters.category },
    ...directoryCategories.map((category) => ({
      href: directoryCategoryHref(category),
      title: category.label,
      current: active?.slug === category.slug || (!active && filters.category === category.slug),
    })),
  ];

  const hasPopularity = discovery &&
    (discovery.popularity["24h"].length > 0 || discovery.popularity["7d"].length > 0);

  const mapBanner = (
    <div data-directory-map-cta>
      <PublicMagazineBanner
        compact
        visual="light"
        size="small"
        testId="directory-map-cta"
        eyebrow="Služby v okolí"
        title="Nájdi služby na mape"
        description={
          filters.canonicalService
            ? "Prezri si verejne zobraziteľné miesta podľa kategórie a zvolenej lokality. Mapa používa rovnaký filter potvrdenej služby ako zoznam."
            : "Prezri si verejne zobraziteľné miesta podľa kategórie a zvolenej lokality."
        }
        label="Zobraziť na mape"
        href={mapHref(filters, active?.slug)}
        anchorId={CTA_DIRECTORY_MAP_ANCHOR}
      />
    </div>
  );

  return (
    <main id="obsah" className={styles.page}>
      <PublicFoundation className={styles.foundation}>
        <UnifiedSectionHeroShell className={!active ? styles.compactDesktopHero : undefined}>
          <UnifiedSectionHero
            contentSource="route"
            breadcrumbs={
              <Breadcrumbs>
                <Link href="/">Domov</Link>
                <span>/</span>
                {active ? (
                  <>
                    <Link href="/adresar">Služby pre psov</Link>
                    <span>/</span>
                    <span>{active.label}</span>
                  </>
                ) : (
                  <span>Služby pre psov</span>
                )}
              </Breadcrumbs>
            }
            eyebrow={active ? active.singular : "Adresár služieb"}
            title={active?.heroTitle ?? "Služby pre psov"}
            intro={
              active?.intro ??
              "Vyhľadaj veterinára, trénera, salón, opatrovanie či inú službu pre psa. Výsledky spresni podľa lokality a zamerania a z profilu môžeš poslať dopyt cez Psipediu."
            }
            visual={seoHeroVisual}
            portalSearchSlot={
              <HomePortalSearch
                action={basePath}
                id="directory-main-query"
                label="Hľadať služby pre psov"
                panelLabel="Vyhľadávanie služieb pre psov"
                eyebrow="ČO POTREBUJEŠ?"
                title={
                  active
                    ? `Nájdi ${active.searchObject} vo svojom okolí`
                    : "Nájdi službu pre svojho psa"
                }
                placeholder={
                  active
                    ? `Hľadať ${active.searchObject} alebo mesto...`
                    : "Hľadať veterinára, trénera, salón alebo mesto..."
                }
                defaultValue={filters.query}
                buttonLabel="Hľadať"
                allowEmpty
                hidden={directoryQueryFields(filters, ["q", "page"])}
                shortcuts={[]}
                searchScope="services"
              />
            }
          />
        </UnifiedSectionHeroShell>

        <section className={styles.resultsSection} aria-label="Adresár služieb pre psov">
          <PublicContentShell variant="listing" className={styles.resultsShell}>
            <PublicCategorySection
              eyebrow="Kategórie služieb"
              title="Vyberte, akú službu hľadáte"
              id="directory-categories-heading"
            >
              <DirectoryCategoryNavigation items={categoryItems} />
            </PublicCategorySection>

                <div data-directory-provider-cta>
                  <PublicMagazineBanner
                    compact
                    visual="dark"
                    photoTone="care"
                    size="small"
                    testId="directory-provider-cta"
                    eyebrow="Pre poskytovateľov"
                    title="Poskytuješ služby pre psov?"
                    description="Požiadaj o pridanie alebo úpravu údajov svojho profilu."
                    label="Pridať alebo upraviť profil"
                    href="/o-nas#kontakt"
                  />
                </div>

            <AffiliateRotatingBanner placement="horizontal" />
            <PublicFilterLayout extra className={styles.directoryColumns} data-directory-columns>
              <PublicFilterPanel
                title="Filtrovať služby"
                resetHref={basePath}
                className={styles.filterColumn}
                aria-label="Filtre adresára"
              >
                <DirectoryFilterForm
                  filters={filters}
                  options={result.options}
                  basePath={basePath}
                  category={active?.slug}
                  mapHref={mapHref(filters, active?.slug)}
                />
              </PublicFilterPanel>

              {isOverview && categoryPreviews ? (
                <div className={styles.categoryPreviewResults} data-directory-category-previews>
                  {directoryCategories.map((category) => {
                    const profiles = categoryPreviews[category.slug] ?? [];
                    const href = directoryCategoryHref(category);
                    return (
                      <section
                        className={styles.categoryPreviewSection}
                        key={category.slug}
                        aria-labelledby={`preview-${category.slug}`}
                      >
                        <h2 id={`preview-${category.slug}`} className={styles.categoryPreviewTitle}>
                          <Link href={href}>{category.label}</Link>
                        </h2>
                        {profiles.length > 0 ? (
                          <div className={styles.categoryPreviewCards}>
                            {profiles.map((profile) => (
                              <DirectoryCard profile={profile} key={profile.id} />
                            ))}
                          </div>
                        ) : (
                          <p className={styles.categoryPreviewEmpty}>
                            Profily v tejto kategórii ešte dopĺňame.
                          </p>
                        )}
                        <Link className={styles.categoryPreviewMore} href={href}>
                          Zobraziť kategóriu {category.label} <span aria-hidden="true">→</span>
                        </Link>
                        {category.slug === directoryCategories[0]?.slug ? mapBanner : category.slug !== directoryCategories.at(-1)?.slug ? (
                          <PublicMagazineBanner compact size="small" testId={`directory-category-${category.slug}`} eyebrow={category.label} title={`Nájdite ${category.searchObject} vo svojom okolí`} description={`Pozrite si kategóriu ${category.label} na mape.`} label="Zobraziť na mape" href={mapHref(filters, category.slug)} />
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.categoryPreviewResults}>
                <DirectoryResults
                  result={result}
                  filters={filters}
                  basePath={basePath}
                  title={
                    active
                      ? active.resultsTitle
                      : filters.query || filters.category || filters.region || filters.city
                        ? "Výsledky vyhľadávania"
                        : "Všetky služby pre psov"
                  }
                />
                {mapBanner}
                </div>
              )}

              <aside className={styles.directorySidebar} aria-label="Ďalšie možnosti">
                <AffiliateRotatingBanner placement="sidebar" />
                {priorityLinks.length > 0 ? (
                  <section className={styles.sidebarCard} aria-labelledby="category-priority-links">
                    <h2 id="category-priority-links">Tipy z adresára</h2>
                    <RelatedEntityLinks links={priorityLinks} label="Vybrané profily a prehľady" />
                  </section>
                ) : null}
                {discovery && <div className={styles.popularityCard} data-directory-popular-articles data-directory-popular-content>
                  {hasPopularity && discovery ? (
                    <ArticlePopularitySidebar
                      popularity={discovery.popularity}
                      initialWindow={discovery.initialWindow}
                    />
                  ) : (
                    <section className={styles.sidebarCard}>
                      <h2>Najčítanejšie</h2>
                      <p>Za posledné obdobie zatiaľ nemáme rebríček.</p>
                    </section>
                  )}
                </div>}
              </aside>
            </PublicFilterLayout>
          </PublicContentShell>
        </section>
        {isOverview ? (
          <PublicPhotoCallout
            promo={publicSectionPhotoPromos.services}
            bannerId="section-services"
          />
        ) : null}
      </PublicFoundation>
    </main>
  );
}
