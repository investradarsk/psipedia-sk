"use client";

import Link from "next/link";
import { AdminRecordId } from "./admin-record-id";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminInlineRowActions, AdminInlineCellInput } from "@/components/admin-inline-edit-controls";
import { AdminReviewCheckbox } from "@/components/admin-review-checkbox";
import { AdminNumberedPagination } from "@/components/admin-pagination";
import { AdminDataTableRegion } from "@/components/admin-data-table-region";
import { adminFilteredListHref } from "@/lib/admin-list-query";
import { adoptionRegions, adoptionStatusLabels, adoptionStatuses } from "@/lib/adoption";
import {
  type AdoptionAdminListFilters,
  type AdoptionAdminListResult,
  type AdoptionAdminSort,
  type AdoptionAdminSummary,
} from "@/lib/adoption-admin-store";
import { adoptionAdminSorts } from "@/lib/adoption-admin-sorts";
import styles from "./admin-lost-found.module.css";

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat("sk-SK", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Bratislava",
  }).format(date);
}

function adminHref(filters: AdoptionAdminListFilters, overrides: Partial<AdoptionAdminListFilters> = {}) {
  const next = { ...filters, ...overrides };
  return adminFilteredListHref("/admin/adopcie", [
    ["q", next.q],
    ["status", next.status],
    ["freshness", next.freshness && next.freshness !== "all" ? next.freshness : ""],
    ["breed", next.breed],
    ["region", next.region],
    ["locality", next.locality],
    ["sort", next.sort && next.sort !== "updated-desc" ? next.sort : ""],
  ], next.page ?? 1);
}

const sortLabels: Record<AdoptionAdminSort, string> = {
  "updated-desc": "Najnovšie aktualizované",
  "updated-asc": "Najstaršie aktualizované",
  "verified-desc": "Naposledy overené",
  "name-asc": "Meno A–Z",
};

export function AdminAdoptionDashboard({ result, filters, reviewedIds = [] }: { result: AdoptionAdminListResult; filters: AdoptionAdminListFilters; reviewedIds?: number[] }) {
  const router = useRouter();
  const reviewed = new Set(reviewedIds);
  const [inlineDraft, setInlineDraft] = useState<{ id: number; key: string; updatedAt: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const viewKey = JSON.stringify([filters, result.pagination.page, result.items.map(item => item.id)]);
  const activeInline = inlineDraft?.key === viewKey && result.items.some(item => item.id === inlineDraft.id && item.updatedAt === inlineDraft.updatedAt)
    ? inlineDraft : null;
  function beginInline(item: AdoptionAdminSummary) {
    if (busy || item.status === "ARCHIVED") return;
    setMessage("");
    setInlineDraft({ id: item.id, updatedAt: item.updatedAt, key: viewKey, name: item.name });
  }
  async function saveInline() {
    const draft = activeInline;
    if (!draft || busy || !draft.name.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/adoptions/" + draft.id, {
        method: "PATCH", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set-inline-name", name: draft.name, expectedUpdatedAt: draft.updatedAt }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Meno psa sa nepodarilo uložiť.");
      setInlineDraft(null);
      setMessage("Meno psa bolo uložené.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rýchla úprava zlyhala.");
    } finally {
      setBusy(false);
    }
  }
  const stats = [
    { key: "all", label: "Všetky", count: result.counts.total, href: adminHref(filters, { status: "", freshness: "all", page: 1 }), active: !filters.status && (filters.freshness ?? "all") === "all" },
    ...adoptionStatuses.map((status) => ({ key: status, label: adoptionStatusLabels[status], count: result.counts[status], href: adminHref(filters, { status, freshness: "all", page: 1 }), active: filters.status === status && (filters.freshness ?? "all") === "all" })),
    { key: "stale", label: "Treba overiť", count: result.counts.stale, href: adminHref(filters, { status: "", freshness: "stale", page: 1 }), active: !filters.status && filters.freshness === "stale" },
  ];

  return <>
    <nav className={`${styles.tabs} ${styles.adoptionTabs}`} aria-label="Globálne počty adopcií">{stats.map((stat)=><Link key={stat.key} data-active={stat.active} href={stat.href}>{stat.label} <strong>{stat.count}</strong></Link>)}</nav>
    <form className={styles.filters} method="get" aria-label="Filtrovať adopcie">
      <input name="q" defaultValue={filters.q} aria-label="Vyhľadávanie" placeholder="Meno, organizácia, mesto…" />
      <select name="status" defaultValue={filters.status ?? ""} aria-label="Lifecycle stav"><option value="">Všetky stavy</option>{adoptionStatuses.map((status)=><option key={status} value={status}>{adoptionStatusLabels[status]}</option>)}</select>
      <select name="freshness" defaultValue={filters.freshness ?? "all"} aria-label="Overenie"><option value="all">Všetky overenia</option><option value="stale">Treba overiť</option><option value="fresh">Čerstvo overené</option></select>
      <input name="breed" defaultValue={filters.breed} aria-label="Plemeno" placeholder="Plemeno" />
      <select name="region" defaultValue={filters.region ?? ""} aria-label="Kraj"><option value="">Všetky kraje</option>{adoptionRegions.map((region)=><option key={region} value={region}>{region}</option>)}</select>
      <input name="locality" defaultValue={filters.locality} aria-label="Mesto alebo okres" placeholder="Mesto / okres" />
      <select name="sort" defaultValue={filters.sort ?? "updated-desc"} aria-label="Radenie">{adoptionAdminSorts.map((sort)=><option key={sort} value={sort}>{sortLabels[sort]}</option>)}</select>
      <button type="submit">Filtrovať</button>
    </form>
    {message && <p role="status">{message}</p>}
    <AdminDataTableRegion className={`${styles.tableWrap} ${styles.adoptionTableRegion}`} label="Zoznam adopcií – tabuľka"><table className={styles.table}><thead><tr><th scope="col">ID</th><th scope="col">Pes</th><th scope="col">Stav</th><th scope="col">Organizácia</th><th scope="col">Lokalita</th><th scope="col">Overenie</th><th scope="col">Publikovanie / SEO</th><th scope="col">Akcia</th></tr></thead><tbody>
      {result.items.map((item)=>{const locality=[item.city,item.district,item.region].filter(Boolean).join(" · ");const verified=formatDate(item.lastVerifiedAt);const published=formatDate(item.publishedAt);const isPublic=item.status==="ACTIVE"||item.status==="RESERVED";return <tr key={item.id}><td><AdminRecordId id={item.id} kind="adoptions" compact /></td><td><div className={styles.rowTitle}>{activeInline?.id === item.id
    ? <AdminInlineCellInput label={"Meno psa " + item.name} value={activeInline.name}
        maxLength={180} required disabled={busy}
        onChange={name => setInlineDraft(previous => previous ? { ...previous, name } : null)} />
    : <strong>{item.name}</strong>}
    <small>/{item.slug}</small><small>{item.breedName||"Plemeno neuvedené"}</small></div></td><td className={styles.status}>{adoptionStatusLabels[item.status]}</td><td>{item.organizationName||"—"}</td><td>{locality||"—"}</td><td><div className={styles.rowTitle}><strong>{verified||"Neoverené"}</strong>{item.stale&&<small>Treba overiť</small>}</div></td><td><div className={styles.rowTitle}><strong>{isPublic?"Verejný profil":"Neverejný profil"}</strong><small>{item.indexable?"index":"noindex"}</small>{published&&<small>Publikované {published}</small>}</div></td><td><div className={styles.rowTitle}><AdminReviewCheckbox entityType="ADOPTION" entityId={item.id} initialReviewed={reviewed.has(item.id)} compact />{item.status !== "ARCHIVED" && <span className={styles.inlineDesktop}><AdminInlineRowActions
    editing={activeInline?.id === item.id}
    busy={busy}
    disabled={Boolean(activeInline && activeInline.id !== item.id) ||
      (activeInline?.id === item.id && !activeInline.name.trim())}
    onEdit={() => beginInline(item)}
    onSave={() => void saveInline()}
    onCancel={() => { if (!busy) setInlineDraft(null); }}
  /></span>}
  <Link className={styles.edit} href={`/admin/adopcie/${item.id}`}>Upraviť →</Link></div></td></tr>})}
      {!result.items.length&&<tr><td colSpan={8}>Žiadne adopcie pre zvolené filtre.</td></tr>}
    </tbody></table></AdminDataTableRegion>
    <section className={styles.adoptionCards} aria-label="Zoznam adopcií – mobilné karty">
      {result.items.map((item) => {
        const locality = [item.city, item.district, item.region].filter(Boolean).join(" · ");
        const verified = formatDate(item.lastVerifiedAt);
        const isPublic = item.status === "ACTIVE" || item.status === "RESERVED";
        return <article key={item.id} className={styles.adoptionCard}>
          <div className={styles.adoptionCardTop}>
            <div className={styles.adoptionCardIdentity}>
              <h2><Link href={`/admin/adopcie/${item.id}`}>{item.name}</Link></h2>
              <AdminRecordId id={item.id} kind="adoptions" compact />
              <small>#{item.id} · {item.breedName || "Plemeno neuvedené"}</small>
            </div>
            <span className={styles.adoptionCardStatus}>{adoptionStatusLabels[item.status]}</span>
          </div>
          <dl className={styles.adoptionCardFacts}>
            <div><dt>Organizácia</dt><dd>{item.organizationName || "—"}</dd></div>
            <div><dt>Lokalita</dt><dd>{locality || "—"}</dd></div>
            <div><dt>Overenie</dt><dd>{verified || "Neoverené"}{item.stale && <span className={styles.adoptionCardWarning}> · Treba overiť</span>}</dd></div>
            <div><dt>Web</dt><dd>{isPublic ? "Verejný profil" : "Neverejný profil"} · {item.indexable ? "index" : "noindex"}</dd></div>
          </dl>
          <div className={styles.adoptionCardActions}>
            <AdminReviewCheckbox entityType="ADOPTION" entityId={item.id} initialReviewed={reviewed.has(item.id)} compact />
            <Link className={styles.edit} href={`/admin/adopcie/${item.id}`}>Upraviť →</Link>
          </div>
        </article>;
      })}
      {!result.items.length && <p>Žiadne adopcie pre zvolené filtre.</p>}
    </section>
    <AdminNumberedPagination page={result.pagination.page} totalPages={result.pagination.totalPages}
      hrefForPage={(page)=>adminHref(filters,{page})} className={styles.pagination}
      ariaLabel="Stránkovanie adopcií" />
  </>;
}
