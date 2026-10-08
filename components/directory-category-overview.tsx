import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import { PageContainer } from "@/components/page-system";
import { directoryCategoryHref, directoryProfileHref, directoryCategories, type DirectoryCategorySlug, type PublicDirectoryProfile } from "@/lib/directory";
import styles from "./directory-category-overview.module.css";

export function DirectoryCategoryOverview({
  categories,
  previews,
}: {
  categories: readonly (typeof directoryCategories)[number][];
  previews: Partial<Record<DirectoryCategorySlug, PublicDirectoryProfile[]>>;
}) {
  return (
    <div className={styles.overview} data-directory-category-overview>
      <PageContainer>
        <h2 className={styles.heading}>Služby podľa kategórie</h2>
        <p className={styles.lead}>Krátky výber publikovaných profilov. Kompletné služby nájdete v jednotlivých kategóriách.</p>
        {categories.map((category) => {
          const profiles = (previews[category.slug] ?? []).slice(0, 7);
          return (
            <section className={styles.category} key={category.slug} aria-labelledby={`directory-preview-${category.slug}`}>
              <div className={styles.header}>
                <div>
                  <h3 id={`directory-preview-${category.slug}`}>{category.label}</h3>
                  <p>{category.description}</p>
                </div>
                <Link className={styles.all} href={directoryCategoryHref(category)}>
                  Celá kategória <ArrowIcon size={16} />
                </Link>
              </div>
              {profiles.length ? (
                <ul className={styles.profiles}>
                  {profiles.map((profile) => (
                    <li key={profile.id}>
                      <Link href={directoryProfileHref(profile)} className={styles.profile}>
                        <strong>{profile.name}</strong>
                        {profile.city ? <small>{profile.city}</small> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.empty}>Zatiaľ bez dostupných profilov v tomto výbere.</p>
              )}
            </section>
          );
        })}
      </PageContainer>
    </div>
  );
}
