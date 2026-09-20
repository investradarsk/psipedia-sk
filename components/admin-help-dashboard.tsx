"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getHelpCategory, helpCaseHref } from "@/lib/help";
import { HELP_ADMIN_CATEGORIES, type HelpAdminFilters } from "@/lib/help-admin-query";
import type { ManagedHelpCaseSummary } from "@/lib/help-store";
import styles from "./admin-help-bulk.module.css";

type DashboardData = {
  items: ManagedHelpCaseSummary[];
  totals: { total: number; published: number; draft: number; urgent: number; current: number; resolved: number };
  categoryCounts: Record<string, number>;
  resultCount: number;
  page: number;
  pages: number;
};

type BulkStatus = "draft" | "published";
type BulkPreflight = { selectedCount: number; changeCount: number; items: { id: number; status: BulkStatus; updatedAt: string }[]; targetStatus: BulkStatus; error?: string };

function url(filters: HelpAdminFilters) {
  const params = new URLSearchParams();
  if (filters.category !== "all") params.set("category", filters.category);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.urgent !== "all") params.set("urgent", filters.urgent);
  if (filters.state !== "all") params.set("state", filters.state);
  if (filters.organization) params.set("organization", filters.organization);
  if (filters.location) params.set("location", filters.location);
  if (filters.q) params.set("q", filters.q);
  if (filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return `/admin/pomoc${query ? `?${query}` : ""}`;
}

export function AdminHelpDashboard({ data, filters }: { data: DashboardData; filters: HelpAdminFilters }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const { items, totals, categoryCounts, resultCount, page, pages } = data;
  const selectedCount = selected.size;
  const pageSelected = !!items.length && items.every((item) => selected.has(item.id));

  function toggle(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function togglePage(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const item of items) { if (checked) next.add(item.id); else next.delete(item.id); }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function bulk(targetStatus: BulkStatus) {
    if (!selectedCount) return;
    setBulkBusy(true);
    setMessage("");
    try {
      const selection = { mode: "ids" as const, ids: [...selected] };
      const previewResponse = await fetch("/api/admin/help/bulk", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "preflight", targetStatus, selection }),
      });
      const preview = await previewResponse.json() as BulkPreflight;
      if (!previewResponse.ok) throw new Error(preview.error || "Hromadnú zmenu sa nepodarilo pripraviť.");
      if (!preview.changeCount) {
        setMessage("Označené záznamy už majú požadovaný publikačný stav.");
        return;
      }
      const verb = targetStatus === "published" ? "Publikovať" : "Prepnúť na koncept";
      const scope = preview.selectedCount === preview.changeCount ? "" : ` Z ${preview.selectedCount} označených sa zmení ${preview.changeCount}.`;
      if (!window.confirm(`${verb} ${preview.changeCount} záznamov?${scope} Zmena sa týka iba publikačného stavu.`)) return;
      const applyResponse = await fetch("/api/admin/help/bulk", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "apply", targetStatus, confirmedCount: preview.items.length, items: preview.items }),
      });
      const applied = await applyResponse.json() as { requested?: number; changed?: number; error?: string };
      if (!applyResponse.ok) throw new Error(applied.error || "Hromadná zmena zlyhala.");
      clearSelection();
      setMessage(`Zmenených záznamov: ${applied.changed ?? 0} z ${applied.requested ?? preview.items.length} potvrdených.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Hromadná zmena zlyhala.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function removeItem(item: ManagedHelpCaseSummary) {
    if (!window.confirm(`Naozaj chceš natrvalo odstrániť „${item.title}“?`)) return;
    setDeletingId(item.id); setMessage("");
    try {
      const response = await fetch(`/api/admin/help/${item.id}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Prípad sa nepodarilo odstrániť.");
      setSelected((current) => { const next = new Set(current); next.delete(item.id); return next; });
      setMessage("Help záznam bol odstránený.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Prípad sa nepodarilo odstrániť."); }
    finally { setDeletingId(null); }
  }

  return <div className={styles.dashboard}>
    <section className={styles.boundary} aria-label="Canonical hranice Pomoc psom">
      <div>
        <span className="admin-eyebrow">Help domain boundary</span>
        <h2>Samostatné canonical moduly zostávajú oddelené</h2>
        <p>Tento zoznam vlastní iba generic Help výzvy. Adopcie, stratené a nájdené psy a organizácie sa neupravujú cez Help CRUD.</p>
      </div>
      <nav className={styles.moduleLinks} aria-label="Samostatné admin moduly">
        <Link href="/admin/adopcie">Adopcie</Link>
        <Link href="/admin/stratene-najdene">Stratené / nájdené</Link>
        <Link href="/admin/organizacie">Organizácie</Link>
        <Link href="/admin/import">Import dát</Link>
      </nav>
    </section>

    <section className={`admin-stats ${styles.stats}`} aria-label="Stav generic Help záznamov">
      <div><span>Všetky Help záznamy</span><strong>{totals.total}</strong></div>
      <div><span>Publikované</span><strong>{totals.published}</strong></div>
      <div><span>Koncepty</span><strong>{totals.draft}</strong></div>
      <div><span>Aktívne</span><strong>{totals.current}</strong></div>
      <div><span>Urgentné aktívne</span><strong>{totals.urgent}</strong></div>
      <div><span>Vybavené</span><strong>{totals.resolved}</strong></div>
    </section>

    <section className="admin-panel">
      <form className={styles.filters} action="/admin/pomoc" role="search" aria-label="Filtrovať Help záznamy">
        <label className={styles.searchField}><span>Hľadať</span><input name="q" defaultValue={filters.q} placeholder="Názov, pes, mesto alebo organizácia" maxLength={120} /></label>
        <label><span>Kategória</span><select name="category" defaultValue={filters.category}><option value="all">Všetky kategórie ({totals.total})</option>{HELP_ADMIN_CATEGORIES.map((slug) => <option value={slug} key={slug}>{getHelpCategory(slug)?.label ?? slug} ({categoryCounts[slug] ?? 0})</option>)}</select></label>
        <label><span>Publikácia</span><select name="status" defaultValue={filters.status}><option value="all">Všetky stavy</option><option value="published">Publikované</option><option value="draft">Koncepty</option></select></label>
        <label><span>Urgentnosť</span><select name="urgent" defaultValue={filters.urgent}><option value="all">Všetky</option><option value="urgent">Iba urgentné aktívne</option></select></label>
        <label><span>Stav prípadu</span><select name="state" defaultValue={filters.state}><option value="all">Všetky</option><option value="current">Aktívne</option><option value="resolved">Vybavené</option></select></label>
        <label><span>Organizácia / osoba</span><input name="organization" defaultValue={filters.organization} placeholder="Napr. OZ Žltý pes" maxLength={120} /></label>
        <label><span>Lokalita</span><input name="location" defaultValue={filters.location} placeholder="Mesto, kraj alebo poznámka" maxLength={120} /></label>
        <div className={styles.filterActions}><button type="submit">Použiť filtre</button><Link href="/admin/pomoc">Vymazať filtre</Link></div>
      </form>

      <div className={styles.bulk} aria-busy={bulkBusy}>
        <label><input type="checkbox" aria-label="Označiť všetky na tejto strane" checked={pageSelected} disabled={bulkBusy || !items.length} onChange={(event) => togglePage(event.target.checked)} /> Označiť všetky na tejto strane</label>
        <span role="status">Označené: {selectedCount}</span>
        <button className={styles.primary} type="button" disabled={bulkBusy || !selectedCount} onClick={() => void bulk("published")}>Publikovať</button>
        <button type="button" disabled={bulkBusy || !selectedCount} onClick={() => void bulk("draft")}>Prepnúť na koncept</button>
        {!!selectedCount && <button className={styles.clear} type="button" disabled={bulkBusy} onClick={clearSelection}>Zrušiť výber</button>}
      </div>
      {resultCount > 500 && <p className={styles.warning}>Všetky výsledky filtra možno naraz označiť pri najviac 500 záznamoch. Spresni filter; výber jednotlivých strán zostáva dostupný.</p>}
      {message && <p className="admin-flash" role="status">{message}</p>}
      <p className="admin-help-results">Nájdené: <strong>{resultCount}</strong> · Strana {page} z {pages}</p>
      {items.length ? <div className="admin-article-list">{items.map((item) => {
        const category = getHelpCategory(item.category);
        return <article className={`admin-article-row admin-help-row ${styles.row}`} key={item.id}>
          <label className={styles.rowCheckTarget}><span className="sr-only">Označiť {item.title}</span><input className={styles.rowCheck} aria-label={`Označiť ${item.title}`} type="checkbox" checked={selected.has(item.id)} disabled={bulkBusy} onChange={() => toggle(item.id)} /></label>
          <div className="admin-help-thumb">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span aria-hidden="true">{category?.icon ?? "🐾"}</span>}</div>
          <div className="admin-article-main"><div className="admin-article-tags"><span className={`admin-status admin-status--${item.status}`}>{item.status === "published" ? "Publikované" : "Koncept"}</span><span>{category?.label ?? item.category}</span>{item.verified && <span>Overené</span>}{item.urgent && !item.resolved && <span>Urgentné</span>}{item.resolved && <span>Vybavené</span>}</div><h2><Link href={`/admin/pomoc/${item.id}`}>{item.title}</Link></h2><p>{[item.organization, item.city, item.dogName ? `Pes: ${item.dogName}` : ""].filter(Boolean).join(" · ")}</p></div>
          <div className="admin-row-actions">{item.status === "published" && <Link href={helpCaseHref(item)} target="_blank">Pozrieť na webe ↗</Link>}<Link className="admin-row-edit" href={`/admin/pomoc/${item.id}`}>Upraviť</Link><button type="button" disabled={deletingId === item.id || bulkBusy} onClick={() => void removeItem(item)}>{deletingId === item.id ? "Odstraňujem…" : "Odstrániť"}</button></div>
        </article>;
      })}</div> : <div className="admin-empty"><span>🔎</span><h2>Žiadne Help záznamy pre tento výber</h2><p>Skús upraviť kategóriu, stav, organizáciu, lokalitu alebo hľadaný výraz.</p></div>}
      <nav className={`admin-help-pagination ${styles.pagination}`} aria-label="Stránkovanie Help záznamov">{page > 1 ? <Link href={url({ ...filters, page: page - 1 })}>← Predchádzajúca</Link> : <span>← Predchádzajúca</span>}<strong>Strana {page} / {pages}</strong>{page < pages ? <Link href={url({ ...filters, page: page + 1 })}>Ďalšia →</Link> : <span>Ďalšia →</span>}</nav>
    </section>
  </div>;
}
