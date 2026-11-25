import Link from "next/link";
import { env } from "cloudflare:workers";
import { getDirectoryCategory } from "@/lib/directory";
import { listServiceReviewCatalog, type ServiceReviewSort } from "@/lib/service-review-catalog";
import { getPublicProfileReviewData, type ProfileReviewReadDatabase } from "@/lib/profile-review-read";
import { ProfileReviewSection } from "@/components/profile-review-section";
import { reviewSubmissionHref } from "@/lib/review-author-return-to";
import { profileReviewSubmissionEnabled } from "@/lib/submission-feature-flags";
import styles from "./service-review-catalog.module.css";

export async function ServiceReviewCatalog({ category, query, sort, page, open, reviewPage }: {
  category: string;
  query: string;
  sort: ServiceReviewSort;
  page: number;
  open: number;
  reviewPage: number;
}) {
  const categoryInfo = getDirectoryCategory(category);
  const db = (env as unknown as { DB?: ProfileReviewReadDatabase }).DB;
  if (!categoryInfo || !db) return <p role="status">Katalóg sa momentálne nepodarilo načítať.</p>;
  let listing;
  try {
    listing = await listServiceReviewCatalog(db, category, query, sort, page);
  } catch {
    return <p role="status">Katalóg sa momentálne nepodarilo načítať. Skúste to neskôr.</p>;
  }
  function href(nextPage: number, id?: number, nextReviewPage?: number) {
    const params = new URLSearchParams({ typ: "sluzby", kategoria: category, q: query, zoradenie: sort, strana: String(nextPage) });
    if (id) params.set("profil", String(id));
    if (nextReviewPage) params.set("reviewsPage", String(nextReviewPage));
    return `/recenzie?${params.toString()}${id ? "#sluzba-" + id : "#hodnotenia-sluzieb"}`;
  }
  return (
    <section id="hodnotenia-sluzieb" className={styles.catalog} aria-label={categoryInfo.label}>
      <h2>{categoryInfo.label}</h2>
      <form action="/recenzie#hodnotenia-sluzieb" className={styles.filters}>
        <input type="hidden" name="typ" value="sluzby" />
        <input type="hidden" name="kategoria" value={category} />
        <label>Vyhľadať službu alebo lokalitu<input name="q" defaultValue={query} maxLength={100} placeholder="Názov, mesto alebo okres" /></label>
        <label>Zoradiť podľa<select name="zoradenie" defaultValue={sort}>
          <option value="rating">Najlepšie hodnotené</option>
          <option value="count">Najviac recenzií</option>
          <option value="name">Názov A–Z</option>
        </select></label>
        <button type="submit" className="button button--dark">Zobraziť</button>
      </form>
      <p>{listing.total} profilov</p>
      {listing.rows.length === 0 ? <p>Nenašli sa žiadne služby.</p> : null}
      {await Promise.all(listing.rows.map(async (row) => {
        const profileHref = `/adresar/${row.category}/${row.slug}`;
        const expanded = open === row.id;
        const data = expanded && row.resource_id
          ? await getPublicProfileReviewData(db, { entityType: "DIRECTORY_PROFILE", canonicalId: row.id, category: row.category }, { page: reviewPage }).catch(() => null)
          : null;
        const submitHref = row.resource_id ? reviewSubmissionHref(row.resource_id) : null;
        return (
          <article key={row.id} id={`sluzba-${row.id}`} className={styles.item}>
            <div className={styles.header}>
              <div><h3><Link href={profileHref}>{row.name}</Link></h3><p>{[row.city, row.district].filter(Boolean).join(" · ")}</p></div>
              <div className={styles.score}>{row.average_rating === null ? <span>Bez hodnotení</span> : <strong>{Number(row.average_rating).toLocaleString("sk-SK", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ★</strong>}<small>{row.review_count} hodnotení</small></div>
            </div>
            <div className={styles.actions}>
              <Link className="button button--dark" prefetch={false} href={expanded ? href(listing.page) : href(listing.page, row.id)} aria-expanded={expanded}>{expanded ? "Skryť recenzie" : "Pozrieť recenzie"}</Link>
              {submitHref && profileReviewSubmissionEnabled() ? <a href={submitHref}>Pridať hodnotenie</a> : null}
              <Link href={profileHref}>Profil služby</Link>
            </div>
            {expanded ? data ? (
              <ProfileReviewSection data={data} baseHref={profileHref} compactHeading
                sectionId={`recenzie-${row.id}`}
                paginationHref={(p) => href(listing.page, row.id, p)} />
            ) : <p>{row.resource_id ? "Recenzie sa nepodarilo načítať." : "Tento profil zatiaľ nemá dostupné hodnotenia."}</p> : null}
          </article>
        );
      }))}
      {listing.pages > 1 ? <nav className={styles.actions} aria-label="Stránkovanie služieb">
        {listing.page > 1 ? <Link href={href(listing.page - 1)} prefetch={false}>← Predchádzajúca</Link> : null}
        <span>Strana {listing.page} z {listing.pages}</span>
        {listing.page < listing.pages ? <Link href={href(listing.page + 1)} prefetch={false}>Nasledujúca →</Link> : null}
      </nav> : null}
    </section>
  );
}
