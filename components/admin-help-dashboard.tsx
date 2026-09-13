"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SearchIcon } from "@/components/icons";
import { getHelpCategory, helpCaseHref } from "@/lib/help";
import { HELP_ADMIN_CATEGORIES, type HelpAdminFilters } from "@/lib/help-admin-query";
import type { ManagedHelpCaseSummary } from "@/lib/help-store";

type DashboardData = {
  items: ManagedHelpCaseSummary[];
  totals: { total: number; published: number; draft: number; urgent: number };
  categoryCounts: Record<string, number>;
  resultCount: number;
  page: number;
  pages: number;
};

function url(filters: HelpAdminFilters) {
  const params = new URLSearchParams();
  if (filters.category !== "all") params.set("category", filters.category);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.q) params.set("q", filters.q);
  if (filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return `/admin/pomoc${query ? `?${query}` : ""}`;
}

export function AdminHelpDashboard({ data, filters }: { data: DashboardData; filters: HelpAdminFilters }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState(filters.q);
  const { items, totals, categoryCounts, resultCount, page, pages } = data;

  async function removeItem(item: ManagedHelpCaseSummary) {
    if (!window.confirm(`Naozaj chceš natrvalo odstrániť „${item.title}“?`)) return;
    setDeletingId(item.id); setMessage("");
    try {
      const response = await fetch(`/api/admin/help/${item.id}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Prípad sa nepodarilo odstrániť.");
      setMessage("Prípad bol odstránený.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Prípad sa nepodarilo odstrániť."); }
    finally { setDeletingId(null); }
  }

  return <>
    <section className="admin-stats" aria-label="Stav pomoci">
      <div><span>Všetky prípady</span><strong>{totals.total}</strong></div>
      <div><span>Publikované</span><strong>{totals.published}</strong></div>
      <div><span>Koncepty</span><strong>{totals.draft}</strong></div>
      <div><span>Urgentné aktívne</span><strong>{totals.urgent}</strong></div>
    </section>
    <section className="admin-panel">
      <nav className="admin-help-categories" aria-label="Kategórie pomoci">
        <Link aria-current={filters.category === "all" ? "page" : undefined} href={url({ ...filters, category: "all", page: 1 })}>Všetko <strong>{totals.total}</strong></Link>
        {HELP_ADMIN_CATEGORIES.map((slug) => <Link key={slug} aria-current={filters.category === slug ? "page" : undefined} href={url({ ...filters, category: slug, page: 1 })}>{getHelpCategory(slug)?.label} <strong>{categoryCounts[slug] ?? 0}</strong></Link>)}
      </nav>
      <div className="admin-toolbar admin-help-toolbar">
        <form className="admin-search" action="/admin/pomoc" role="search">
          <SearchIcon size={19} /><label className="sr-only" htmlFor="help-admin-search">Hľadať prípad</label>
          <input id="help-admin-search" name="q" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Názov, pes, mesto alebo organizácia" maxLength={120} />
          {filters.category !== "all" && <input type="hidden" name="category" value={filters.category} />}
          {filters.status !== "all" && <input type="hidden" name="status" value={filters.status} />}
          <button type="submit">Hľadať</button>
        </form>
        <div className="admin-status-filter" aria-label="Filtrovať podľa stavu">
          {([["all", "Všetky"], ["published", "Publikované"], ["draft", "Koncepty"]] as const).map(([value, label]) => <Link key={value} className={filters.status === value ? "is-active" : ""} aria-current={filters.status === value ? "page" : undefined} href={url({ ...filters, status: value, page: 1 })}>{label}</Link>)}
        </div>
      </div>
      {message && <p className="admin-flash" role="status">{message}</p>}
      <p className="admin-help-results">Nájdené: <strong>{resultCount}</strong> · Strana {page} z {pages}</p>
      {items.length ? <div className="admin-article-list">{items.map((item) => {
        const category = getHelpCategory(item.category);
        return <article className="admin-article-row admin-help-row" key={item.id}>
          <div className="admin-help-thumb">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span aria-hidden="true">{category?.icon ?? "🐾"}</span>}</div>
          <div className="admin-article-main"><div className="admin-article-tags">
            <span className={`admin-status admin-status--${item.status}`}>{item.status === "published" ? "Publikované" : "Koncept"}</span>
            <span>{category?.label ?? item.category}</span>{item.verified && <span>Overené</span>}{item.urgent && !item.resolved && <span>Urgentné</span>}{item.resolved && <span>Vybavené</span>}
          </div><h2><Link href={`/admin/pomoc/${item.id}`}>{item.title}</Link></h2>
          <p>{[item.organization, item.city, item.dogName ? `Pes: ${item.dogName}` : ""].filter(Boolean).join(" · ")}</p></div>
          <div className="admin-row-actions">{item.status === "published" && <Link href={helpCaseHref(item)} target="_blank">Pozrieť na webe ↗</Link>}<Link className="admin-row-edit" href={`/admin/pomoc/${item.id}`}>Upraviť</Link><button type="button" disabled={deletingId === item.id} onClick={() => void removeItem(item)}>{deletingId === item.id ? "Odstraňujem…" : "Odstrániť"}</button></div>
        </article>;
      })}</div> : <div className="admin-empty"><span>🔎</span><h2>Žiadne prípady pre tento výber</h2><p>Skús upraviť kategóriu, stav alebo hľadaný výraz.</p></div>}
      <nav className="admin-help-pagination" aria-label="Stránkovanie prípadov">
        {page > 1 ? <Link href={url({ ...filters, page: page - 1 })}>← Predchádzajúca</Link> : <span>← Predchádzajúca</span>}
        <strong>Strana {page} / {pages}</strong>
        {page < pages ? <Link href={url({ ...filters, page: page + 1 })}>Ďalšia →</Link> : <span>Ďalšia →</span>}
      </nav>
    </section>
  </>;
}
