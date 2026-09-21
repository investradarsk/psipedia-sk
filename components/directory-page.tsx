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
            <PublicSectionHeader
              className={styles.header}
              variant="compact"
              eyebrow={active.singular}
              title={active.label}
              intro={active.description}
              meta={typeof activeCount === "number" ? `${activeCount} ${profileCountLabel(activeCount)}` : undefined}
            />
          ) : (
            <PublicSectionHeader
              className={styles.header}
              variant="image"
              eyebrow="Prehľad adresára"
              title="Služby podľa kategórie"
              intro="Nájdi veterinára, trénera, klub, salón alebo inú službu podľa kategórie a lokality. Vyhľadávanie funguje aj bez diakritiky."
              meta={totalPublished !== null ? `${totalPublished} publikovaných profilov v adresári` : undefined}
              image={{ src: "/images/hero-labrador.webp", alt: "Labrador ako sprievodný vizuál adresára služieb pre psov" }}
            />
          )}

          {!active && (
            <form className={`directory-main-search ${styles.mainSearch}`} action="/adresar" method="get" role="search" aria-label="Vyhľadať službu pre psa">
              <label>
                <span>Kategória</span>
                <select name="category" defaultValue={filters.category}>
                  <option value="">Všetky služby</option>
                  {directoryCategories.map((category) => <option value={category.slug} key={category.slug}>{category.label}</option>)}
                </select>
              </label>
              <label>
                <span>Názov, služba alebo lokalita</span>
                <span className={styles.searchField}>
                  <SearchIcon size={19} />
                  <input name="q" defaultValue={filters.query} placeholder="Nitra, fyzioterapia, labrador…" />
                </span>
              </label>
              <button type="submit"><span>Hľadať</span><ArrowIcon size={17} /></button>
            </form>
          )}

          <nav className={styles.categoryNav} aria-label="Kategórie služieb">
            {directoryCategories.map((category) => {
              const count = categoryCounts[category.slug];
              return (
                <Link
                  href={directoryCategoryHref(category)}
                  key={category.slug}
                  aria-current={active?.slug === category.slug ? "page" : undefined}
                >
                  <span className={styles.categoryNavIcon}>{categoryIcon(category.slug)}</span>
                  <span>{category.label}</span>
                  {typeof count === "number" && <small aria-label={`${count} ${profileCountLabel(count)}`}>{count}</small>}
                </Link>
              );
            })}
          </nav>
        </section>

        {!active && !showResults && (
          <section className={`shell ${styles.overview}`} aria-labelledby="directory-overview-heading">
            <div className={styles.categoryGrid}>
              {directoryCategories.map((category) => {
                const count = categoryCounts[category.slug];
                const previews = categoryPreviews[category.slug] ?? [];
                return (
                  <section
                    className={styles.categoryPanel}
                    key={category.slug}
                    data-directory-category={category.slug}
                    data-directory-category-count={typeof count === "number" ? String(count) : undefined}
                    data-directory-category-empty={count === 0 ? "true" : undefined}
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

                    {previews.length > 0 ? (
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
                    ) : (
                      <p className={styles.emptyPreview} data-directory-empty-state>
                        {count === 0 ? "Zatiaľ bez publikovaných profilov." : "Publikované profily sa momentálne nepodarilo načítať."}
                      </p>
                    )}

                    <Link className={styles.categoryAction} href={directoryCategoryHref(category)}><span>Zobraziť všetkých</span><ArrowIcon size={16} /></Link>
                  </section>
                );
              })}
            </div>
          </section>
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
