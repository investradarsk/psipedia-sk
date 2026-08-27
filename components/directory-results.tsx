import Link from "next/link";
import { DirectoryCard } from "@/components/directory-card";
import { SearchIcon } from "@/components/icons";
import type { DirectoryFilters, PublicDirectoryProfilePage } from "@/lib/directory-store";

function profileCountLabel(count: number) {
  return count === 1 ? "profil" : count > 1 && count < 5 ? "profily" : "profilov";
}

function pageHref(basePath: string, filters: DirectoryFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.region) params.set("region", filters.region);
  if (filters.district) params.set("district", filters.district);
  if (filters.city) params.set("city", filters.city);
  if (filters.sort !== "recommended") params.set("sort", filters.sort);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function DirectoryResults({ result, filters, basePath, title }: {
  result: PublicDirectoryProfilePage;
  filters: DirectoryFilters;
  basePath: string;
  title: string;
}) {
  return (
    <section className="directory-results" aria-labelledby="directory-results-heading">
      <form className="directory-toolbar" method="get" action={basePath}>
        <label className="directory-search"><span>Vyhľadávanie</span><div><SearchIcon size={19} /><input name="q" defaultValue={filters.query} placeholder="Názov, služba alebo lokalita" /></div></label>
        <label><span>Kraj</span><select name="region" defaultValue={filters.region}><option value="">Všetky kraje</option>{result.options.regions.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
        <label><span>Okres</span><select name="district" defaultValue={filters.district}><option value="">Všetky okresy</option>{result.options.districts.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
        <label><span>Mesto/obec</span><select name="city" defaultValue={filters.city}><option value="">Všetky mestá a obce</option>{result.options.cities.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
        <label><span>Zoradenie</span><select name="sort" defaultValue={filters.sort}><option value="recommended">Odporúčané</option><option value="name-asc">Názov A–Z</option><option value="name-desc">Názov Z–A</option><option value="newest">Najnovšie</option></select></label>
        <div className="directory-filter-actions"><button type="submit">Hľadať</button><Link href={basePath}>Zrušiť filtre</Link></div>
      </form>

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
