"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminPagination } from "@/components/admin-pagination";
import { SearchIcon } from "@/components/icons";
import { allDirectoryCategories, directoryProfileHref, getDirectoryCategory } from "@/lib/directory";
import { directoryAdminHref, type DirectoryAdminFilters } from "@/lib/directory-admin-query";
import type { ManagedDirectoryAdminPage } from "@/lib/directory-admin-store";
import type { ManagedDirectoryProfileSummary } from "@/lib/directory-store";

export function AdminDirectoryDashboard({ data, filters }: {
  data: ManagedDirectoryAdminPage;
  filters: DirectoryAdminFilters;
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const { profiles, counts, resultCount, pagination } = data;

  async function removeProfile(profile: ManagedDirectoryProfileSummary) {
    if (!window.confirm(`Naozaj chceš natrvalo odstrániť profil „${profile.name}“? Prijaté dopyty zostanú zachované.`)) return;
    setDeletingId(profile.id); setMessage("");
    try {
      const response = await fetch(`/api/admin/directory/${profile.id}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Profil sa nepodarilo odstrániť.");
      setMessage("Profil bol odstránený.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Profil sa nepodarilo odstrániť.");
    } finally { setDeletingId(null); }
  }

  return (
    <>
      <section className="admin-stats" aria-label="Stav adresára">
        <div><span>Všetky profily</span><strong>{counts.total}</strong></div>
        <div><span>Publikované</span><strong>{counts.published}</strong></div>
        <div><span>Koncepty</span><strong>{counts.draft}</strong></div>
      </section>
      <section className="admin-panel">
        <div className="admin-toolbar">
          <form className="admin-directory-category-filter" action="/admin/adresar" method="get" role="search">
            <label className="admin-search">
              <SearchIcon size={19} />
              <span className="sr-only">Hľadať profil</span>
              <input name="q" defaultValue={filters.q} maxLength={100} placeholder="Názov, mesto alebo služba" />
            </label>
            <label className="admin-select-filter">
              <span>Kategória</span>
              <select name="category" defaultValue={filters.category}>
                <option value="">Všetky kategórie</option>
                {allDirectoryCategories.map((category) => <option value={category.slug} key={category.slug}>{category.label}</option>)}
              </select>
            </label>
            {filters.status !== "all" && <input type="hidden" name="status" value={filters.status} />}
            <button type="submit">Použiť filtre</button>
          </form>
          <form className="admin-status-filter" action="/admin/adresar" method="get" aria-label="Filtrovať podľa stavu">
            {filters.category && <input type="hidden" name="category" value={filters.category} />}
            {filters.q && <input type="hidden" name="q" value={filters.q} />}
            {([ ["all", "Všetky"], ["published", "Publikované"], ["draft", "Koncepty"] ] as const).map(([value, label]) => (
              <button
                type="submit"
                name="status"
                value={value === "all" ? "" : value}
                className={filters.status === value ? "is-active" : ""}
                aria-pressed={filters.status === value}
                key={value}
              >{label}</button>
            ))}
          </form>
        </div>
        {message && <p className="admin-flash" role="status">{message}</p>}
        <p className="admin-help-results admin-directory-results">Nájdené: <strong>{resultCount}</strong> · Strana {pagination.page} z {pagination.totalPages}</p>
        {profiles.length ? (
          <div className="admin-article-list">
            {profiles.map((profile) => {
              const category = getDirectoryCategory(profile.category);
              return <article className="admin-article-row admin-directory-row" key={profile.id}>
                <div className="admin-directory-thumb">{profile.imageUrl ? <img src={profile.imageUrl} alt="" /> : <span aria-hidden="true">{category?.icon ?? "🐾"}</span>}</div>
                <div className="admin-article-main">
                  <div className="admin-article-tags"><span className={`admin-status admin-status--${profile.status}`}>{profile.status === "published" ? "Publikované" : "Koncept"}</span><span>{category?.label}</span>{profile.verified && <span>Overené</span>}{profile.featured && <span>Odporúčame</span>}</div>
                  <h2><Link href={`/admin/adresar/${profile.id}`}>{profile.name}</Link></h2>
                  <p>{profile.city} · {profile.region} · {profile.services.slice(0, 2).join(" · ") || "Bez uvedených služieb"}</p>
                </div>
                <div className="admin-row-actions">
                  {profile.status === "published" && <Link href={directoryProfileHref(profile)} target="_blank">Pozrieť ↗</Link>}
                  <Link className="admin-row-edit" href={`/admin/adresar/${profile.id}`}>Upraviť</Link>
                  <button type="button" disabled={deletingId === profile.id} onClick={() => void removeProfile(profile)}>{deletingId === profile.id ? "Odstraňujem…" : "Odstrániť"}</button>
                </div>
              </article>;
            })}
          </div>
        ) : <div className="admin-empty"><span>📍</span><h2>Žiadne profily</h2><p>Pridaj prvý profil alebo zmeň filter.</p></div>}
        <AdminPagination pagination={pagination} basePath={directoryAdminHref({ ...filters, page: 1 })} />
      </section>
    </>
  );
}
