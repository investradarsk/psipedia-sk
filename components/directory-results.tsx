import Link from "next/link";
import { DirectoryCard } from "@/components/directory-card";
import { directoryPageHref } from "@/lib/directory-query";
import type { DirectoryFilters, PublicDirectoryProfilePage } from "@/lib/directory-store";
import styles from "./directory-public.module.css";

function profileCountLabel(count: number) {
  return count === 1 ? "profil" : count > 1 && count < 5 ? "profily" : "profilov";
}

export function DirectoryResults({
  result, filters, basePath, title,
}: {
  result: PublicDirectoryProfilePage;
  filters: DirectoryFilters;
  basePath: string;
  title: string;
}) {
  return (
    <section className={`directory-results ${styles.resultsLayout} ${styles.resultsColumn}`}
      data-directory-search-first data-directory-results aria-labelledby="directory-results-heading">
      <div className={styles.resultsHeading}>
        <div>
          <span className="eyebrow">Výsledky</span>
          <h2 id="directory-results-heading">{title}</h2>
        </div>
        <strong>{result.total} {profileCountLabel(result.total)}</strong>
      </div>

      {result.profiles.length ? (
        <div className={`directory-grid ${styles.listGrid}`} data-directory-list>
          {result.profiles.map((profile) => <DirectoryCard profile={profile} key={profile.id} />)}
        </div>
      ) : (
        <div className="directory-empty" role="status">
          <h2>{result.total ? "Táto strana je prázdna" : "Nenašli sme zhodu"}</h2>
          <p>Skús zmeniť lokalitu alebo hľadaný výraz.</p>
          <Link href={basePath}>Zrušiť filtre</Link>
        </div>
      )}

      {result.totalPages > 1 && (
        <nav className="directory-pagination" aria-label="Stránkovanie výsledkov">
          {result.page > 1
            ? <Link href={directoryPageHref(basePath, filters, result.page - 1)} rel="prev">← Predchádzajúca</Link>
            : <span aria-disabled="true">← Predchádzajúca</span>}
          <strong>Strana {result.page} z {result.totalPages}</strong>
          {result.page < result.totalPages
            ? <Link href={directoryPageHref(basePath, filters, result.page + 1)} rel="next">Ďalšia →</Link>
            : <span aria-disabled="true">Ďalšia →</span>}
        </nav>
      )}
    </section>
  );
}
