import Link from "next/link";
import { DirectoryCard } from "@/components/directory-card";
import { DirectoryFilterForm } from "@/components/directory-filter-form";
import type { DirectoryCategorySlug } from "@/lib/directory";
import type { DirectoryFilters, PublicDirectoryProfilePage } from "@/lib/directory-store";

function profileCountLabel(count: number) {
  return count === 1 ? "profil" : count > 1 && count < 5 ? "profily" : "profilov";
}

function pageHref(basePath: string, filters: DirectoryFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.category) params.set("category", filters.category);
  if (filters.region) params.set("region", filters.region);
  if (filters.district) params.set("district", filters.district);
  if (filters.city) params.set("city", filters.city);
  if (filters.service) params.set("service", filters.service);
  if (filters.breed) params.set("breed", filters.breed);
  if (filters.fciGroup) params.set("fci", filters.fciGroup);
  if (filters.organization) params.set("organization", filters.organization);
  if (filters.profileType) params.set("type", filters.profileType);
  if (filters.sort !== "recommended") params.set("sort", filters.sort);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function DirectoryResults({ result, filters, basePath, title, category, showCategory = false }: {
  result: PublicDirectoryProfilePage;
  filters: DirectoryFilters;
  basePath: string;
  title: string;
  category?: DirectoryCategorySlug;
  showCategory?: boolean;
}) {
  return (
    <section className="directory-results" aria-labelledby="directory-results-heading">
      <DirectoryFilterForm filters={filters} options={result.options} basePath={basePath} category={category} showCategory={showCategory} />

      <div className="directory-result-heading">
        <div><span className="eyebrow">Výsledky</span><h2 id="directory-results-heading">{title}</h2></div>
        <strong>{result.total} {profileCountLabel(result.total)}</strong>
      </div>

      {result.profiles.length ? (
        <div className="directory-grid">{result.profiles.map((profile) => <DirectoryCard profile={profile} key={profile.id} />)}</div>
      ) : (
        <div className="directory-empty"><span aria-hidden="true">📍</span><h2>{result.total ? "Táto strana je prázdna" : "Nenašli sme zhodu"}</h2><p>Skús zmeniť lokalitu alebo hľadaný výraz.</p><Link href={basePath}>Zrušiť filtre</Link></div>
      )}

      {result.totalPages > 1 && <nav className="directory-pagination" aria-label="Stránkovanie výsledkov">
        {result.page > 1 ? <Link href={pageHref(basePath, filters, result.page - 1)}>← Predchádzajúca</Link> : <span aria-disabled="true">← Predchádzajúca</span>}
        <strong>Strana {result.page} z {result.totalPages}</strong>
        {result.page < result.totalPages ? <Link href={pageHref(basePath, filters, result.page + 1)}>Ďalšia →</Link> : <span aria-disabled="true">Ďalšia →</span>}
      </nav>}
    </section>
  );
}
