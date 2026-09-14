import Link from "next/link";
import { adoptionRegions, adoptionStatusLabels, adoptionStatuses } from "@/lib/adoption";
import {
  adoptionAdminSorts,
  type AdoptionAdminListFilters,
  type AdoptionAdminListResult,
  type AdoptionAdminSort,
} from "@/lib/adoption-admin-store";
import styles from "./admin-lost-found.module.css";

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat("sk-SK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Bratislava",
  }).format(date);
}

function adminHref(filters: AdoptionAdminListFilters, overrides: Partial<AdoptionAdminListFilters> = {}) {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.status) params.set("status", next.status);
  if (next.freshness && next.freshness !== "all") params.set("freshness", next.freshness);
  if (next.breed) params.set("breed", next.breed);
  if (next.region) params.set("region", next.region);
  if (next.locality) params.set("locality", next.locality);
  if (next.sort && next.sort !== "updated-desc") params.set("sort", next.sort);
  if ((next.page ?? 1) > 1) params.set("page", String(next.page));
  return `/admin/adopcie${params.toString() ? `?${params}` : ""}`;
}

const sortLabels: Record<AdoptionAdminSort, string> = {
  "updated-desc": "Najnovšie aktualizované",
  "updated-asc": "Najstaršie aktualizované",
  "verified-desc": "Naposledy overené",
  "name-asc": "Meno A–Z",
};

export function AdminAdoptionDashboard({
  result,
  filters,
}: {
  result: AdoptionAdminListResult;
  filters: AdoptionAdminListFilters;
}) {
  const stats: Array<{ key: string; label: string; count: number; href: string; active: boolean }> = [
    {
      key: "all",
      label: "Všetky",
      count: result.counts.total,
      href: adminHref(filters, { status: "", freshness: "all", page: 1 }),
      active: !filters.status && (filters.freshness ?? "all") === "all",
    },
    ...adoptionStatuses.map((status) => ({
      key: status,
      label: adoptionStatusLabels[status],
      count: result.counts[status],
      href: adminHref(filters, { status, freshness: "all", page: 1 }),
      active: filters.status === status && (filters.freshness ?? "all") === "all",
    })),
    {
      key: "stale",
      label: "Treba overiť",
      count: result.counts.stale,
      href: adminHref(filters, { status: "", freshness: "stale", page: 1 }),
      active: !filters.status && filters.freshness === "stale",
    },
  ];

  return <>
    <nav className={styles.tabs} aria-label="Globálne počty adopcií">
      {stats.map((stat) => <Link key={stat.key} data-active={stat.active} href={stat.href}>{stat.label} <strong>{stat.count}</strong></Link>)}
    </nav>

    <form className={styles.filters} method="get" aria-label="Filtrovať adopcie">
      <input name="q" defaultValue={filters.q} aria-label="Vyhľadávanie" placeholder="Meno, organizácia, mesto…" />
      <select name="status" defaultValue={filters.status ?? ""} aria-label="Lifecycle stav">
        <option value="">Všetky stavy</option>
        {adoptionStatuses.map((status) => <option key={status} value={status}>{adoptionStatusLabels[status]}</option>)}
      </select>
      <select name="freshness" defaultValue={filters.freshness ?? "all"} aria-label="Overenie">
        <option value="all">Všetky overenia</option>
        <option value="stale">Treba overiť</option>
        <option value="fresh">Čerstvo overené</option>
      </select>
      <input name="breed" defaultValue={filters.breed} aria-label="Plemeno" placeholder="Plemeno" />
      <select name="region" defaultValue={filters.region ?? ""} aria-label="Kraj">
        <option value="">Všetky kraje</option>
        {adoptionRegions.map((region) => <option key={region} value={region}>{region}</option>)}
      </select>
      <input name="locality" defaultValue={filters.locality} aria-label="Mesto alebo okres" placeholder="Mesto / okres" />
      <select name="sort" defaultValue={filters.sort ?? "updated-desc"} aria-label="Radenie">
        {adoptionAdminSorts.map((sort) => <option key={sort} value={sort}>{sortLabels[sort]}</option>)}
      </select>
      <button type="submit">Filtrovať</button>
    </form>

    <div className={styles.tableWrap} role="region" aria-label="Zoznam adopcií" tabIndex={0}>
      <table className={styles.table}>
        <thead><tr><th scope="col">Pes</th><th scope="col">Stav</th><th scope="col">Organizácia</th><th scope="col">Lokalita</th><th scope="col">Overenie</th><th scope="col">Publikovanie / SEO</th></tr></thead>
        <tbody>
          {result.items.map((item) => {
            const locality = [item.city, item.district, item.region].filter(Boolean).join(" · ");
            const verified = formatDate(item.lastVerifiedAt);
            const published = formatDate(item.publishedAt);
            const isPublic = item.status === "ACTIVE" || item.status === "RESERVED";
            return <tr key={item.id}>
              <td><div className={styles.rowTitle}><strong>{item.name}</strong><small>#{item.id} · /{item.slug}</small><small>{item.breedName || "Plemeno neuvedené"}</small></div></td>
              <td className={styles.status}>{adoptionStatusLabels[item.status]}</td>
              <td>{item.organizationName || "—"}</td>
              <td>{locality || "—"}</td>
              <td><div className={styles.rowTitle}><strong>{verified || "Neoverené"}</strong>{item.stale && <small>Treba overiť</small>}</div></td>
              <td><div className={styles.rowTitle}><strong>{isPublic ? "Verejný profil" : "Neverejný profil"}</strong><small>{item.indexable ? "index" : "noindex"}</small>{published && <small>Publikované {published}</small>}</div></td>
            </tr>;
          })}
          {!result.items.length && <tr><td colSpan={6}>Žiadne adopcie pre zvolené filtre.</td></tr>}
        </tbody>
      </table>
    </div>

    {result.pagination.totalPages > 1 && <nav className={styles.pagination} aria-label="Stránkovanie adopcií">
      {result.pagination.page > 1 && <Link href={adminHref(filters, { page: result.pagination.page - 1 })}>←</Link>}
      {Array.from({ length: Math.min(result.pagination.totalPages, 7) }, (_, index) => {
        const start = Math.max(1, Math.min(result.pagination.page - 3, result.pagination.totalPages - 6));
        const page = start + index;
        if (page > result.pagination.totalPages) return null;
        return page === result.pagination.page
          ? <span key={page}>{page}</span>
          : <Link key={page} href={adminHref(filters, { page })}>{page}</Link>;
      })}
      {result.pagination.page < result.pagination.totalPages && <Link href={adminHref(filters, { page: result.pagination.page + 1 })}>→</Link>}
    </nav>}
  </>;
}
