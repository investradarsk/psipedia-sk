import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import { DirectoryClubFilters } from "@/components/directory-club-filters";
import { directoryProfileHref, type DirectoryClubCardProfile, type DirectoryClubSearchParams, type DirectoryClubSearchResult } from "@/lib/directory";

function resultLabel(value: number) {
  return value === 1 ? "klub" : value > 1 && value < 5 ? "kluby" : "klubov";
}

function cleanContact(profile: DirectoryClubCardProfile) {
  const value = profile.websiteUrl || profile.contact;
  if (!value) return null;
  return value.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "").slice(0, 90);
}

function pageHref(current: DirectoryClubSearchParams, page: number) {
  const params = new URLSearchParams();
  if (current.q) params.set("q", current.q);
  if (current.region) params.set("region", current.region);
  if (current.district) params.set("district", current.district);
  if (current.city) params.set("city", current.city);
  if (current.sort !== "name-asc") params.set("sort", current.sort);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/adresar/kynologicke-kluby${query ? `?${query}` : ""}`;
}

function DirectoryClubCard({ profile }: { profile: DirectoryClubCardProfile }) {
  const contact = cleanContact(profile);
  return (
    <article className="directory-card directory-club-card">
      <Link className="directory-club-card-link" href={directoryProfileHref(profile)} aria-label={`Otvoriť profil ${profile.name}`}>
        <div className="directory-card-tags"><span>Kynologický klub</span></div>
        <h3>{profile.name}</h3>
        <dl>
          {profile.city && <div><dt>Mesto / obec</dt><dd>{profile.city}</dd></div>}
          {profile.district && <div><dt>Okres</dt><dd>{profile.district}</dd></div>}
          {profile.region && <div><dt>Kraj</dt><dd>{profile.region}</dd></div>}
          {contact && <div><dt>{profile.websiteUrl ? "Web" : "Kontakt"}</dt><dd>{contact}</dd></div>}
        </dl>
        <span className="text-link">Profil a kontakt <ArrowIcon size={18} /></span>
      </Link>
    </article>
  );
}

export function DirectoryClubResults({ current, result }: { current: DirectoryClubSearchParams; result: DirectoryClubSearchResult }) {
  return (
    <section className="directory-results" aria-labelledby="directory-results-heading">
      <DirectoryClubFilters key={`${current.q}|${current.region}|${current.district}|${current.city}|${current.sort}|${result.pagination.page}`} current={{ ...current, page: result.pagination.page }} regions={result.filters.regions} districts={result.filters.districts} cities={result.filters.cities} />
      <div className="directory-result-heading">
        <div><span className="eyebrow">Kluby podľa lokality</span><h2 id="directory-results-heading">Kynologické kluby</h2></div>
        <strong>{result.pagination.total} {resultLabel(result.pagination.total)}</strong>
      </div>
      {result.profiles.length > 0 ? <div className="directory-grid">{result.profiles.map((profile) => <DirectoryClubCard key={profile.id} profile={profile} />)}</div> : <div className="directory-empty"><span aria-hidden="true">📍</span><h2>Nenašli sme zhodu</h2><p>Skús zmeniť kraj, okres, mesto alebo hľadaný výraz.</p><Link className="button button--primary" href="/adresar/kynologicke-kluby">Zrušiť filtre</Link></div>}
      {result.pagination.totalPages > 1 && <nav className="directory-pagination" aria-label="Stránkovanie klubov">
        {result.pagination.page > 1 ? <Link rel="prev" href={pageHref(current, result.pagination.page - 1)}>← Predchádzajúca</Link> : <span aria-disabled="true">← Predchádzajúca</span>}
        <strong>Strana {result.pagination.page} z {result.pagination.totalPages}</strong>
        {result.pagination.page < result.pagination.totalPages ? <Link rel="next" href={pageHref(current, result.pagination.page + 1)}>Ďalšia →</Link> : <span aria-disabled="true">Ďalšia →</span>}
      </nav>}
    </section>
  );
}
