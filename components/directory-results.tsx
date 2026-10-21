import Link from "next/link";
import { DirectoryCard } from "@/components/directory-card";
import { PublicEmptyState, PublicPagination } from "@/components/public-visual-system";
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
        <PublicEmptyState
          className="directory-empty"
          role="status"
          title={result.total ? "Táto strana je prázdna" : "Nenašli sme zhodu"}
          description="Skús zmeniť lokalitu alebo hľadaný výraz."
        >
          <Link href={basePath}>Zrušiť filtre</Link>
        </PublicEmptyState>
      )}

      {result.totalPages > 1 && (
        <PublicPagination
          className="directory-pagination"
          currentPage={result.page}
          totalPages={result.totalPages}
          previousHref={result.page > 1 ? directoryPageHref(basePath, filters, result.page - 1) : undefined}
          nextHref={result.page < result.totalPages ? directoryPageHref(basePath, filters, result.page + 1) : undefined}
        />
      )}
    </section>
  );
}
