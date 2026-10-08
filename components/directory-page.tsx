import Link from "next/link";
import { Breadcrumbs } from "@/components/page-system";
import {
  PublicContentShell,
  PublicContextBanner,
  PublicFoundation,
  PublicSubcategoryNavigator,
  UnifiedSectionHero,
  UnifiedSectionHeroShell,
} from "@/components/public-visual-system";
import { ArrowIcon, PawMark } from "@/components/icons";
import { DirectoryCategoryOverview } from "@/components/directory-category-overview";
import {
  directoryCategories,
  directoryCategoryHref,
  getDirectoryCategory,
  type DirectoryCategorySlug,
  type PublicDirectoryProfile,
} from "@/lib/directory";
import type { DirectoryFilters, PublicDirectoryProfilePage } from "@/lib/directory-store";
import { DirectoryResults } from "@/components/directory-results";
import { getSectionHeroVisual } from "@/lib/section-visual-store";
import styles from "./directory-public.module.css";

function profileCountLabel(count: number) {
  return count === 1 ? "profil" : count > 1 && count < 5 ? "profily" : "profilov";
}

function hasDirectoryFilters(filters: DirectoryFilters) {
  return Boolean(
    filters.query || filters.category || filters.region || filters.district || filters.city ||
    filters.service || filters.breed || filters.fciGroup || filters.organization ||
    filters.profileType || filters.sort !== "recommended",
  );
}

export async function DirectoryPage({
  result,
  filters,
  categoryCounts,
  categoryPreviews = {},
  initialCategory = "all",
}: {
  result: PublicDirectoryProfilePage;
  filters: DirectoryFilters;
  categoryCounts: Partial<Record<DirectoryCategorySlug, number>>;
  categoryPreviews?: Partial<Record<DirectoryCategorySlug, PublicDirectoryProfile[]>>;
  initialCategory?: "all" | DirectoryCategorySlug;
}) {
  const active = initialCategory === "all" ? null : getDirectoryCategory(initialCategory);
  const heroVisual = await getSectionHeroVisual(active ? `directory.${active.slug}` : "section.adresar");
  const activeCount = active ? categoryCounts[active.slug] : undefined;
  const filtered = hasDirectoryFilters(filters);
  const showRootOverview = !active && !filtered && filters.page === 1;

  const compactCategoryItems = [
    {
      href: "/adresar",
      title: "Všetky služby",
      current: !active,
    },
    ...directoryCategories.map((category) => ({
      href: directoryCategoryHref(category),
      title: category.label,
      current: active?.slug === category.slug,
    })),
  ];

  // Search stays first, followed by compact category chips on every viewport.
  const categoryNavigation = (
    <div className={styles.categorySwitcherWrap} data-directory-category-navigation>
      <PublicSubcategoryNavigator
        mode="compact"
        items={compactCategoryItems}
        label="Prepnúť kategóriu služby"
        className={styles.categorySwitcher}
      />
    </div>
  );

  return (
    <main id="obsah" className={styles.page}>
      <PublicFoundation className={styles.foundation}>
        <UnifiedSectionHeroShell>
          <UnifiedSectionHero
            breadcrumbs={<Breadcrumbs>
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
            </Breadcrumbs>}
            eyebrow={active ? active.singular : "Adresár služieb"}
            title={active?.heroTitle ?? "Služby pre psov"}
            intro={active?.intro ?? "Nájdi veterinára, trénera, klub, salón, opatrovanie alebo ďalšiu praktickú službu podľa kategórie a lokality."}
            visual={heroVisual}
            metaSlot={active && typeof activeCount === "number" ? `${activeCount} ${profileCountLabel(activeCount)}` : undefined}
          />
        </UnifiedSectionHeroShell>

        <section className={styles.resultsSection}>
          <PublicContentShell variant="listing" className={styles.resultsShell}>
            <DirectoryResults
              result={result}
              filters={filters}
              basePath={active ? `/adresar/${active.slug}` : "/adresar"}
              title={active ? active.resultsTitle : filtered ? "Výsledky vyhľadávania" : "Odporúčané služby"}
              category={active?.slug}
              showCategory={!active}
              categoryNavigation={categoryNavigation}
              showResults={!showRootOverview}
            />
          </PublicContentShell>
        </section>

        {showRootOverview ? (
          <DirectoryCategoryOverview categories={directoryCategories} previews={categoryPreviews} />
        ) : null}

        <section className={styles.contextSection}>
          <PublicContentShell variant="plain" className={styles.contextShell}>
            <PublicContextBanner
              eyebrow="Služby v okolí"
              title="Nájdite služby pre psov na mape"
              text="Pozri si služby podľa polohy a rýchlejšie nájdi možnosti vo svojom okolí."
              ctaLabel="Pozrieť mapu"
              ctaHref="/mapa"
              icon={<PawMark size={20} />}
              tone="forest"
            />
          </PublicContentShell>
        </section>

        {!active && (
          <section className={styles.providerSection} data-directory-provider-cta>
            <PublicContentShell variant="plain" className={styles.providerCta}>
              <div>
                <span className={styles.sectionEyebrow}>Pre poskytovateľov</span>
                <h2>Poskytujete služby pre psov?</h2>
                <p>Spravujete veterinárnu ambulanciu, salón, hotel, výcvikovú školu alebo inú službu? Ozvite sa nám, ak chcete profil doplniť alebo upraviť.</p>
              </div>
              <Link href="/o-nas#kontakt">
                <span>Pridať alebo upraviť profil</span>
                <ArrowIcon size={17} />
              </Link>
            </PublicContentShell>
          </section>
        )}
      </PublicFoundation>
    </main>
  );
}
