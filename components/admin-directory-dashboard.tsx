"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AdminPagination } from "@/components/admin-pagination";
import { SearchIcon } from "@/components/icons";
import { allDirectoryCategories, directoryProfileHref, getDirectoryCategory, type DirectoryCategorySlug } from "@/lib/directory";
import type { ManagedDirectoryProfileSummary, ManagedDirectoryProfileSummaryPage } from "@/lib/directory-store";

type StatusFilter = "all" | "published" | "draft";

export function AdminDirectoryDashboard({ initialProfiles, initialCounts, pagination, initialCategory }: {
  initialProfiles: ManagedDirectoryProfileSummary[];
  initialCounts: ManagedDirectoryProfileSummaryPage["counts"];
  pagination: ManagedDirectoryProfileSummaryPage["pagination"];
  initialCategory?: DirectoryCategorySlug;
}) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [counts, setCounts] = useState(initialCounts);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const visibleProfiles = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("sk");
    return profiles.filter((profile) => (status === "all" || profile.status === status)
      && (!needle || `${profile.name} ${profile.city} ${profile.region} ${getDirectoryCategory(profile.category)?.label} ${profile.services.join(" ")}`.toLocaleLowerCase("sk").includes(needle)));
  }, [profiles, query, status]);

  async function removeProfile(profile: ManagedDirectoryProfileSummary) {
    if (!window.confirm(`Naozaj chceš natrvalo odstrániť profil „${profile.name}“? Prijaté dopyty zostanú zachované.`)) return;
    setDeletingId(profile.id); setMessage("");
    try {
      const response = await fetch(`/api/admin/directory/${profile.id}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Profil sa nepodarilo odstrániť.");
      setProfiles((current) => current.filter((item) => item.id !== profile.id));
      setCounts((current) => ({
        ...current,
        total: Math.max(0, current.total - 1),
        [profile.status]: Math.max(0, current[profile.status] - 1),
      }));
      setMessage("Profil bol odstránený.");
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
          <label className="admin-search"><SearchIcon size={19} /><span className="sr-only">Hľadať profil</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Názov, mesto alebo služba" /></label>
          <form className="admin-directory-category-filter" action="/admin/adresar" method="get">
            <label className="admin-select-filter"><span>Kategória</span><select name="category" defaultValue={initialCategory ?? ""}><option value="">Všetky kategórie</option>{allDirectoryCategories.map((category) => <option value={category.slug} key={category.slug}>{category.label}</option>)}</select></label>
            <button type="submit">Použiť filter</button>
          </form>
          <div className="admin-status-filter" aria-label="Filtrovať podľa stavu">
            {([ ["all", "Všetky"], ["published", "Publikované"], ["draft", "Koncepty"] ] as const).map(([value, label]) => <button type="button" className={status === value ? "is-active" : ""} onClick={() => setStatus(value)} key={value}>{label}</button>)}
          </div>
        </div>
        {message && <p className="admin-flash" role="status">{message}</p>}
        {visibleProfiles.length ? (
          <div className="admin-article-list">
            {visibleProfiles.map((profile) => {
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
        <AdminPagination pagination={pagination} basePath={initialCategory ? `/admin/adresar?category=${initialCategory}` : "/admin/adresar"} />
      </section>
    </>
  );
}
