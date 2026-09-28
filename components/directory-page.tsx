import Link from "next/link";
import { Breadcrumbs } from "@/components/page-system";
import { PublicFoundation, PublicSectionHeader } from "@/components/public-visual-system";
import { ArrowIcon, BowlIcon, HeartIcon, PawMark, SearchIcon, SparkIcon, WhistleIcon } from "@/components/icons";
import {
  directoryCategories,
  directoryCategoryHref,
  directoryProfileHref,
  getDirectoryCategory,
  type DirectoryCategorySlug,
  type PublicDirectoryProfile,
} from "@/lib/directory";
import type { DirectoryFilters, PublicDirectoryProfilePage } from "@/lib/directory-store";
import { DirectoryResults } from "@/components/directory-results";
import styles from "./directory-public.module.css";

function profileCountLabel(count: number) {
  return count === 1 ? "profil" : count > 1 && count < 5 ? "profily" : "profilov";
}

function previewMeta(profile: PublicDirectoryProfile) {
  const location = [profile.city, profile.district && profile.district !== profile.city ? profile.district : "", profile.region]
    .filter(Boolean)
    .join(" · ");
  const availability = profile.online ? (location ? "aj online" : "online") : "";
  return [location, availability, profile.services[0] ?? ""].filter(Boolean).join(" · ");
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

function CategoryPreviewList({
  category,
  previews,
  count,
}: {
  category: (typeof directoryCategories)[number];
  previews: PublicDirectoryProfile[];
  count: number | undefined;
}) {
  if (previews.length === 0) {
    return (
      <p className={styles.emptyPreview} data-directory-empty-state>
        {count === 0 ? "Zatiaľ bez publikovaných profilov." : "Publikované profily sa momentálne nepodarilo načítať."}
      </p>
    );
  }

  return (
    <div className={styles.previewList} role="list" aria-label={`Ukážka profilov: ${category.label}`}>
      {previews.map((profile) => {
        const meta = previewMeta(profile);
        return (
          <Link
            className={`${styles.previewRow}${profile.imageUrl ? ` ${styles.previewRowWithImage}` : ""}`}
            href={directoryProfileHref(profile)}
            key={profile.id}
            role="listitem"
            data-directory-preview-profile
          >
            {profile.imageUrl && (
              <img className={styles.previewImage} src={profile.imageUrl} alt="" loading="lazy" decoding="async" />
            )}
            <span className={styles.previewCopy}>
              <strong>{profile.name}</strong>
              {meta && <small>{meta}</small>}
            </span>
            <span className={styles.previewArrow} aria-hidden="true"><ArrowIcon size={16} /></span>
          </Link>
        );
      })}
    </div>
  );
}

export function DirectoryPage({
  result,
  filters,
  categoryCounts,
  categoryPreviews = {},
  initialCategory = "all",
  showResults = true,
}: {
  result: PublicDirectoryProfilePage;
  filters: DirectoryFilters;
  categoryCounts: Partial<Record<DirectoryCategorySlug, number>>;
  categoryPreviews?: Partial<Record<DirectoryCategorySlug, PublicDirectoryProfile[]>>;
  initialCategory?: "all" | DirectoryCategorySlug;
  showResults?: boolean;
}) {
  const active = initialCategory === "all" ? null : getDirectoryCategory(initialCategory);
  const knownCounts = directoryCategories
    .map((category) => categoryCounts[category.slug])
    .filter((count): count is number => typeof count === "number");
  const totalPublished = knownCounts.length > 0 ? knownCounts.reduce((sum, count) => sum + count, 0) : null;
  const activeCount = active ? categoryCounts[active.slug] : undefined;

  const rankedCategories = directoryCategories
    .map((category, index) => ({
      category,
      index,
      count: categoryCounts[category.slug],
    }))
    .sort((left, right) => {
      const leftCount = typeof left.count === "number" ? left.count : -1;
      const rightCount = typeof right.count === "number" ? right.count : -1;
      return rightCount - leftCount || left.index - right.index;
    });
  const primaryCategories = rankedCategories.slice(0, 5);
  const secondaryCategories = rankedCategories.slice(5);

  const categoryNavigation = (
    <nav
      className={`${styles.categoryNav}${active ? ` ${styles.categoryNavCompact}` : ""}`}
      aria-label="Kategórie služieb"
      data-directory-category-navigation
    >
      {directoryCategories.map((category) => {
        const count = categoryCounts[category.slug];
        return (
          <Link
            href={directoryCategoryHref(category)}
            key={category.slug}
            aria-current={active?.slug === category.slug ? "page" : undefined}
          >
            <span className={styles.categoryNavIcon}>{categoryIcon(category.slug)}</span>
            <span className={styles.categoryNavCopy}>
              <strong>{category.label}</strong>
              {typeof count === "number" && (
                <small aria-label={`${count} ${profileCountLabel(count)}`}>
                  {count} {profileCountLabel(count)}
                </small>
              )}
            </span>
            <ArrowIcon size={15} />
          </Link>
        );
      })}
    </nav>
  );

  return (
    <main id="obsah" className={styles.page}>
      <PublicFoundation className={styles.foundation}>
        <section className={`shell ${styles.headerShell}`} data-directory-public-header>
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

          {active ? (
            <>
              <PublicSectionHeader
                className={styles.header}
                variant="compact"
                eyebrow={active.singular}
                title={active.label}
                intro={active.description}
                meta={typeof activeCount === "number" ? `${activeCount} ${profileCountLabel(activeCount)}` : undefined}
              />
              {categoryNavigation}
            </>
          ) : (
            <>
              <div className={styles.hero} data-directory-landing-hero>
                <div className={styles.heroCopy}>
                  <span className={styles.heroEyebrow}>Služby pre psov</span>
                  <h1>Služby pre psov na jednom mieste</h1>
                  <p>Nájdi veterinára, trénera, klub, salón, opatrovanie alebo ďalšiu praktickú službu podľa kategórie a lokality.</p>
                  {totalPublished !== null && (
                    <div className={styles.heroMeta}>
                      <strong>{totalPublished.toLocaleString("sk-SK")}</strong>
                      <span>publikovaných profilov v adresári</span>
                    </div>
                  )}
                </div>

                <div className={styles.heroMedia}>
                  <img
                    src="/images/hero-labrador.webp"
                    alt="Labrador ako sprievodný vizuál adresára služieb pre psov"
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                  />
                  <span className={styles.heroMediaAccent} aria-hidden="true" />
                </div>

                <form className={`directory-main-search ${styles.mainSearch}`} action="/adresar" method="get" role="search" aria-label="Vyhľadať službu pre psa">
                  <label>
                    <span>Kategória</span>
                    <select name="category" defaultValue={filters.category}>
                      <option value="">Všetky služby</option>
                      {directoryCategories.map((category) => <option value={category.slug} key={category.slug}>{category.label}</option>)}
                    </select>
                  </label>
                  <label className={styles.searchLabel}>
                    <span>Názov, služba alebo lokalita</span>
                    <SearchIcon size={19} />
                    <input name="q" defaultValue={filters.query} placeholder="Nitra, fyzioterapia, labrador…" />
                  </label>
                  <button type="submit"><span>Hľadať</span><ArrowIcon size={17} /></button>
                </form>
              </div>

              <div className={styles.discovery} aria-labelledby="directory-discovery-title">
                <div className={styles.discoveryHeading}>
                  <div>
                    <span className={styles.sectionEyebrow}>Rýchly výber</span>
                    <h2 id="directory-discovery-title">Vyber si kategóriu služby</h2>
                  </div>
                  <p>Prejdi rovno do kategórie alebo použi vyhľadávanie vyššie.</p>
                </div>
                {categoryNavigation}
              </div>
            </>
          )}
        </section>

        {!active && !showResults && (
          <>
            <section className={styles.primarySection} aria-labelledby="directory-primary-title">
              <div className={`shell ${styles.overview}`}>
                <header className={styles.sectionHeading}>
                  <div>
                    <span className={styles.sectionEyebrow}>Najviac možností</span>
                    <h2 id="directory-primary-title">Hlavné kategórie</h2>
                  </div>
                  <p>Zoradené podľa aktuálneho počtu publikovaných profilov, nie podľa pevne nastavenej priority.</p>
                </header>

                <div className={styles.primaryGrid}>
                  {primaryCategories.map(({ category, count }, index) => {
                    const previews = categoryPreviews[category.slug] ?? [];
                    const action = typeof count === "number"
                      ? `Zobraziť všetkých ${count}`
                      : "Zobraziť všetkých";
                    return (
                      <section
                        className={`${styles.categoryPanel} ${styles.primaryPanel} ${index === 0 ? styles.primaryLead : index === 1 ? styles.primaryFeature : styles.primaryStandard}`}
                        key={category.slug}
                        data-directory-category={category.slug}
                        data-directory-category-count={typeof count === "number" ? String(count) : undefined}
                        data-directory-category-empty={count === 0 ? "true" : undefined}
                        data-directory-primary
                        aria-labelledby={`directory-category-${category.slug}`}
                      >
                        <header className={styles.categoryHeader}>
                          <div className={styles.categoryHeading}>
                            <span className={styles.categoryIcon}>{categoryIcon(category.slug)}</span>
                            <div>
                              <h3 id={`directory-category-${category.slug}`}>{category.label}</h3>
                              <p>{category.description}</p>
                            </div>
                          </div>
                          {typeof count === "number" && (
                            <span className={styles.categoryCount}>{count} {profileCountLabel(count)}</span>
                          )}
                        </header>

                        <CategoryPreviewList category={category} previews={previews} count={count} />

                        <Link className={styles.categoryAction} href={directoryCategoryHref(category)}>
                          <span>{action}</span><ArrowIcon size={16} />
                        </Link>
                      </section>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className={styles.secondarySection} aria-labelledby="directory-secondary-title">
              <div className={`shell ${styles.secondaryShell}`}>
                <header className={styles.sectionHeading}>
                  <div>
                    <span className={styles.sectionEyebrow}>Ďalšie možnosti</span>
                    <h2 id="directory-secondary-title">Ďalšie kategórie služieb</h2>
                  </div>
                  <p>Menšie kategórie zostávajú rovnako dostupné, ale nepreberajú vizuálnu váhu hlavného obsahu.</p>
                </header>

                <div className={styles.secondaryGrid}>
                  {secondaryCategories.map(({ category, count }) => {
                    const action = typeof count === "number"
                      ? `Zobraziť všetkých ${count}`
                      : "Zobraziť všetkých";
                    return (
                      <section
                        className={styles.secondaryItem}
                        key={category.slug}
                        data-directory-category={category.slug}
                        data-directory-category-count={typeof count === "number" ? String(count) : undefined}
                        data-directory-category-empty={count === 0 ? "true" : undefined}
                        data-directory-secondary
                        aria-labelledby={`directory-category-${category.slug}`}
                      >
                        <div className={styles.secondaryIcon}>{categoryIcon(category.slug)}</div>
                        <div className={styles.secondaryCopy}>
                          <h3 id={`directory-category-${category.slug}`}>{category.label}</h3>
                          <p>{category.description}</p>
                          {count === 0 && <small data-directory-empty-state>Zatiaľ bez publikovaných profilov.</small>}
                        </div>
                        <div className={styles.secondaryActionWrap}>
                          {typeof count === "number" && <strong>{count} {profileCountLabel(count)}</strong>}
                          <Link className={styles.secondaryAction} href={directoryCategoryHref(category)}>
                            <span>{action}</span><ArrowIcon size={16} />
                          </Link>
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className={styles.providerSection} data-directory-provider-cta>
              <div className={`shell ${styles.providerCta}`}>
                <div>
                  <span className={styles.sectionEyebrow}>Pre poskytovateľov</span>
                  <h2>Poskytujete služby pre psov?</h2>
                  <p>Spravujete veterinárnu ambulanciu, salón, hotel, výcvikovú školu alebo inú službu? Ozvite sa nám, ak chcete profil doplniť alebo upraviť.</p>
                </div>
                <Link href="/o-nas#kontakt">
                  <span>Pridať alebo upraviť profil</span>
                  <ArrowIcon size={17} />
                </Link>
              </div>
            </section>
          </>
        )}

        {(active || showResults) && (
          <section className={styles.resultsSection}>
            <div className={`shell ${styles.resultsShell}`}>
              <DirectoryResults
                result={result}
                filters={filters}
                basePath={active ? `/adresar/${active.slug}` : "/adresar"}
                title={active ? active.label : "Výsledky vyhľadávania"}
                category={active?.slug}
                showCategory={!active}
              />
            </div>
          </section>
        )}
      </PublicFoundation>
    </main>
  );
}
