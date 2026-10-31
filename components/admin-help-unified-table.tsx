"use client";

import Link from "next/link";
import { AdminRecordTable } from "@/components/admin-record-table";
import styles from "./admin-help-unified-table.module.css";

export type HelpDirectoryRow = {
  id: number;
  title: string;
  detail: string;
  category: string;
  status: string;
  city: string;
  updatedAt: string;
  href: string;
};
export type HelpDirectoryCategory = { slug: string; label: string; icon: string; href: string };

export function AdminHelpUnifiedTable({
  category, categories, rows, query, page, pages, total,
}: {
  category: string;
  categories: HelpDirectoryCategory[];
  rows: HelpDirectoryRow[];
  query: string;
  page: number;
  pages: number;
  total: number;
}) {
  const categoryHref = (slug: string, nextPage = 1) => {
    const params = new URLSearchParams();
    params.set("category", slug);
    if (query) params.set("q", query);
    if (nextPage > 1) params.set("page", String(nextPage));
    return "/admin/pomoc-psom?" + params;
  };
  const active = categories.find(item => item.slug === category) ?? categories[0];
  return (
    <section className={styles.workspace} aria-label="Pomoc psom – spoločná tabuľka" data-admin-help-unified-grid>
      <div className={styles.intro}>
        <div>
          <strong>Profily a prípady</strong>
          <p>Vyber kategóriu a pracuj s prehľadnou tabuľkou. Úpravy sa otvárajú v existujúcom editore.</p>
        </div>
        <Link className={styles.categoryAction} href={active.href}>Pokročilá správa kategórie</Link>
      </div>
      <nav className={styles.categories} aria-label="Kategórie Pomoci psom">
        {categories.map(item => (
          <Link key={item.slug} href={categoryHref(item.slug)} aria-current={item.slug === category ? "page" : undefined}>
            <span aria-hidden="true">{item.icon}</span> {item.label}
          </Link>
        ))}
      </nav>
      <form className={styles.search} method="get">
        <input type="hidden" name="category" value={category} />
        <label htmlFor="help-unified-query">Hľadať v kategórii</label>
        <input id="help-unified-query" name="q" defaultValue={query} placeholder="Meno psa, názov, mesto alebo organizácia…" maxLength={80} />
        <button type="submit">Hľadať</button>
        {query && <Link href={categoryHref(category).split("&q=")[0]}>Vyčistiť</Link>}
      </form>
      <p className={styles.count}>Nájdených záznamov: <strong>{total}</strong> · Strana {page} z {pages}</p>
      {rows.length ? <AdminRecordTable
        rows={rows}
        label={active.label}
        columns={[
          { id: "title", label: "Názov / pes", width: 265, sortValue: item => item.title, cell: item => <Link className={styles.primary} href={item.href}>{item.title}</Link> },
          { id: "detail", label: "Typ / doplnenie", width: 205, sortValue: item => item.detail, cell: item => item.detail || "—" },
          { id: "city", label: "Lokalita", width: 160, sortValue: item => item.city, cell: item => item.city || "—" },
          { id: "status", label: "Stav", width: 150, sortValue: item => item.status, cell: item => item.status },
          { id: "updated", label: "Aktualizované", width: 145, sortValue: item => item.updatedAt, cell: item => item.updatedAt ? new Intl.DateTimeFormat("sk-SK", {day: "numeric",month: "short",year: "numeric"}).format(new Date(item.updatedAt)) : "—" },
          { id: "actions", label: "Akcia", width: 125, cell: item => <Link className={styles.action} href={item.href}>Upraviť →</Link> },
        ]}
      /> : <p className={styles.empty}>Pre tento výber nie sú záznamy. Skús vyhľadávať iné slovo alebo zmeniť kategóriu.</p>}
      {pages > 1 && <nav className={styles.pagination} aria-label="Stránkovanie Pomoci psom">
        {page > 1 ? <Link href={categoryHref(category, page - 1)}>← Predchádzajúca</Link> : <span>← Predchádzajúca</span>}
        <span>{page} / {pages}</span>
        {page < pages ? <Link href={categoryHref(category, page + 1)}>Ďalšia →</Link> : <span>Ďalšia →</span>}
      </nav>}
    </section>
  );
}
