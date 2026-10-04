import Link from "next/link";
import { Breadcrumbs } from "@/components/page-system";
import {
  PublicContentShell,
  PublicContextBanner,
  PublicFoundation,
  PublicLandingSectionHeading,
  PublicSubcategoryNavigator,
  UnifiedSectionHero,
  UnifiedSectionHeroShell,
} from "@/components/public-visual-system";
import { ArrowIcon, BowlIcon, HeartIcon, PawMark, SparkIcon, WhistleIcon } from "@/components/icons";
import {
  directoryCategories,
  directoryCategoryHref,
  getDirectoryCategory,
  type DirectoryCategorySlug,
} from "@/lib/directory";
import type { DirectoryFilters, PublicDirectoryProfilePage } from "@/lib/directory-store";
import { DirectoryResults } from "@/components/directory-results";
import { getResolvedSectionVisual, getSectionHeroVisual } from "@/lib/section-visual-store";
import styles from "./directory-public.module.css";

function profileCountLabel(count: number) {
  return count === 1 ? "profil" : count > 1 && count < 5 ? "profily" : "profilov";
}

function categoryIcon(slug: DirectoryCategorySlug) {
  switch (slug) {
    case "veterinari":
      return <HeartIcon size={20} />;
    case "treneri":
      return <WhistleIcon size={20} />;
    case "salony-a-sluzby":
    case "dalsie-sluzby":
      return <SparkIcon size={20} />;
    case "hotely-a-opatrovanie":
      return <BowlIcon size={20} />;
    case "fyzioterapia":
      return <HeartIcon size={20} />;
    default:
      return <PawMark size={20} />;
  }
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
  initialCategory = "all",
}: {
  result: PublicDirectoryProfilePage;
  filters: DirectoryFilters;
  categoryCounts: Partial<Record<DirectoryCategorySlug, number>>;
  initialCategory?: "all" | DirectoryCategorySlug;
}) {
  const active = initialCategory === "all" ? null : getDirectoryCategory(initialCategory);
  const heroVisual = await getSectionHeroVisual(active ? `directory.${active.slug}` : "section.adresar");
  const knownCounts = directoryCategories
    .map((category) => categoryCounts[category.slug])
    .filter((count): count is number => typeof count === "number");
  const totalPublished = knownCounts.length > 0 ? knownCounts.reduce((sum, count) => sum + count, 0) : null;
  const activeCount = active ? categoryCounts[active.slug] : undefined;
  const filtered = hasDirectoryFilters(filters);

  const categoryVisualEntries = active ? [] : await Promise.all(
    directoryCategories.map(async (category) => [
      category.slug,
      await getResolvedSectionVisual(`directory.${category.slug}`),
    ] as const),
  );
  const categoryVisuals = new Map(categoryVisualEntries);

  const landingCategoryItems = directoryCategories.map((category) => {
    const count = categoryCounts[category.slug];
    const visual = categoryVisuals.get(category.slug);
    return {
      href: directoryCategoryHref(category),
      title: category.label,
      description: category.description,
      meta: typeof count === "number" ? `${count} ${profileCountLabel(count)}` : undefined,
      icon: categoryIcon(category.slug),
      image: visual ? {
        src: visual.imageUrl,
        alt: visual.altText,
        width: 640,
        height: 360,
        loading: "lazy" as const,
      } : undefined,
    };
  });

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
            metaSlot={active && typeof activeCount === "number"
              ? `${activeCount} ${profileCountLabel(activeCount)}`
              : !active && totalPublished !== null
                ? `${totalPublished.toLocaleString("sk-SK")} publikovaných profilov v adresári`
                : undefined}
          />
        </UnifiedSectionHeroShell>

        {!active ? (
          <PublicContentShell variant="landing" className={styles.categoryLanding}>
            <div data-directory-category-navigation>
              <PublicLandingSectionHeading
                eyebrow="Kategórie služieb"
                title="Vyber si kategóriu"
                description="Prejdi priamo do služby, ktorú hľadáš. Na mobile môžeš kategórie pohodlne posúvať do strán."
                id="directory-categories-title"
              />
              <PublicSubcategoryNavigator
                mode="landing"
                items={landingCategoryItems}
                label="Kategórie služieb"
              />
            </div>
          </PublicContentShell>
        ) : (
          <div className={styles.categorySwitcherWrap} data-directory-category-navigation>
            <PublicSubcategoryNavigator
              mode="compact"
              items={compactCategoryItems}
              label="Prepnúť kategóriu služby"
              className={styles.categorySwitcher}
            />
          </div>
        )}

        <section className={styles.resultsSection}>
          <PublicContentShell variant="listing" className={styles.resultsShell}>
            <DirectoryResults
              result={result}
              filters={filters}
              basePath={active ? `/adresar/${active.slug}` : "/adresar"}
              title={active ? active.resultsTitle : filtered ? "Výsledky vyhľadávania" : "Odporúčané služby"}
              category={active?.slug}
              showCategory={!active}
            />
          </PublicContentShell>
        </section>

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
