"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminRecordTable } from "@/components/admin-record-table";
import {
  AdminActionButton,
  AdminBulkActionToolbar,
  AdminModalDialog,
} from "@/components/admin-interaction-system";
import { isHelpAdminCreateCategory } from "@/lib/help-admin-query";
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

type BulkStatus = "draft" | "published";
type BulkPreflight = {
  selectedCount: number;
  changeCount: number;
  targetStatus: BulkStatus;
  items: { id: number; status: BulkStatus; updatedAt: string }[];
  error?: string;
};
type BulkReview = { key: string; targetStatus: BulkStatus; preview: BulkPreflight };

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
  const router = useRouter();
  const [selectionState, setSelectionState] = useState<{ key: string; ids: number[] }>({ key: "", ids: [] });
  const [bulkReview, setBulkReview] = useState<BulkReview | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [message, setMessage] = useState("");

  // A category, search, page or row change invalidates selection immediately,
  // including the preflight preview. Nothing can leak to another page/filter.
  const viewKey = JSON.stringify([category, query, page, rows.map(row => row.id)]);
  const visibleIds = new Set(rows.map(row => row.id));
  const selectedIds = selectionState.key === viewKey
    ? selectionState.ids.filter(id => visibleIds.has(id))
    : [];
  const activeReview = bulkReview?.key === viewKey ? bulkReview : null;
  const canBulkEdit = isHelpAdminCreateCategory(category);

  const categoryHref = (slug: string, nextPage = 1) => {
    const params = new URLSearchParams();
    params.set("category", slug);
    if (query) params.set("q", query);
    if (nextPage > 1) params.set("page", String(nextPage));
    return "/admin/pomoc-psom?" + params;
  };
  const active = categories.find(item => item.slug === category) ?? categories[0];

  function changeSelection(ids: number[]) {
    if (bulkBusy || !canBulkEdit) return;
    setSelectionState({ key: viewKey, ids: ids.filter(id => visibleIds.has(id)) });
    setBulkReview(null);
    setMessage("");
  }

  async function prepareBulk(targetStatus: BulkStatus) {
    if (!canBulkEdit || bulkBusy || !selectedIds.length) return;
    setBulkBusy(true);
    setBulkReview(null);
    setMessage("");
    const selectionIds = [...selectedIds];
    try {
      const response = await fetch("/api/admin/help/bulk", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "preflight",
          expectedCategory: category,
          targetStatus,
          selection: { mode: "ids", ids: selectionIds },
        }),
      });
      const preview = await response.json() as BulkPreflight;
      if (!response.ok) throw new Error(preview.error || "Kontrola hromadnej úpravy zlyhala.");
      if (!preview.changeCount) {
        setMessage("Vybrané záznamy už majú požadovaný publikačný stav.");
        return;
      }
      setBulkReview({ key: viewKey, targetStatus, preview });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kontrola hromadnej úpravy zlyhala.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function applyBulk() {
    if (!activeReview || bulkBusy || !canBulkEdit) return;
    setBulkBusy(true);
    setMessage("");
    try {
      const { targetStatus, preview } = activeReview;
      const response = await fetch("/api/admin/help/bulk", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          targetStatus,
          confirmedCount: preview.items.length,
          items: preview.items,
        }),
      });
      const result = await response.json() as { requested?: number; changed?: number; error?: string };
      if (!response.ok) throw new Error(result.error || "Hromadnú zmenu sa nepodarilo uložiť.");
      setBulkReview(null);
      setSelectionState({ key: viewKey, ids: [] });
      setMessage("Uložené: " + (result.changed ?? 0) + " z " + (result.requested ?? preview.items.length) + " potvrdených zmien.");
      router.refresh();
    } catch (error) {
      // Keep the selection and allow re-checking rather than silently retrying.
      setBulkReview(null);
      setMessage(error instanceof Error ? error.message : "Hromadná zmena zlyhala. Obnov výber a skontroluj ho znova.");
    } finally {
      setBulkBusy(false);
    }
  }

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

      {canBulkEdit && rows.length > 0 && (
        <div className={styles.bulkPanel} aria-busy={bulkBusy}>
          <p>Označ záznamy zaškrtávacími políčkami. Výber platí iba pre túto kategóriu a zobrazenú stranu ({rows.length} záznamov).</p>
          {selectedIds.length > 0 && (
            <AdminBulkActionToolbar
              selectedCount={selectedIds.length}
              selectionDescription="Iba aktuálna strana a kategória. Pred zmenou server overí aktuálny stav."
              onClear={() => changeSelection([])}
              primaryAction={
                <AdminActionButton variant="primary" disabled={bulkBusy} onClick={() => void prepareBulk("published")}>
                  Skontrolovať publikovanie
                </AdminActionButton>
              }
              destructiveAction={
                <AdminActionButton variant="destructive" disabled={bulkBusy} onClick={() => void prepareBulk("draft")}>
                  Skontrolovať presun do konceptov
                </AdminActionButton>
              }
            />
          )}
        </div>
      )}
      {message && <p className={styles.bulkMessage} role="status">{message}</p>}

      {rows.length ? <AdminRecordTable
        rows={rows}
        label={active.label}
        busy={bulkBusy}
        selection={canBulkEdit ? {
          selectedIds,
          disabled: bulkBusy,
          labelForRow: item => "Označiť " + item.title,
          onChange: changeSelection,
        } : undefined}
        columns={[
          { id: "title", label: "Názov / pes", width: 265, sortValue: item => item.title, cell: item => <Link className={styles.primary} href={item.href}>{item.title}</Link> },
          { id: "detail", label: "Typ / doplnenie", width: 205, sortValue: item => item.detail, cell: item => item.detail || "—" },
          { id: "city", label: "Lokalita", width: 160, sortValue: item => item.city, cell: item => item.city || "—" },
          { id: "status", label: "Stav", width: 150, sortValue: item => item.status, cell: item => item.status },
          { id: "updated", label: "Aktualizované", width: 145, sortValue: item => item.updatedAt, cell: item => item.updatedAt ? new Intl.DateTimeFormat("sk-SK", {day: "numeric",month: "short",year: "numeric"}).format(new Date(item.updatedAt)) : "—" },
          { id: "actions", label: "Akcia", width: 125, cell: item => <Link className={styles.action} href={item.href}>Upraviť →</Link> },
        ]}
      /> : <p className={styles.empty}>Pre tento výber nie sú záznamy. Skús vyhľadávať iné slovo alebo zmeniť kategóriu.</p>}
      {!canBulkEdit && rows.length > 0 && (
        <p className={styles.bulkHint}>Táto kategória má vlastné pravidlá zmien. Hromadné úpravy sa vykonávajú iba v príslušnom module, nie cez spoločnú tabuľku.</p>
      )}
      {pages > 1 && <nav className={styles.pagination} aria-label="Stránkovanie Pomoci psom">
        {page > 1 ? <Link href={categoryHref(category, page - 1)}>← Predchádzajúca</Link> : <span>← Predchádzajúca</span>}
        <span>{page} / {pages}</span>
        {page < pages ? <Link href={categoryHref(category, page + 1)}>Ďalšia →</Link> : <span>Ďalšia →</span>}
      </nav>}

      <AdminModalDialog
        open={activeReview !== null}
        title={activeReview?.targetStatus === "published" ? "Publikovať vybrané záznamy?" : "Presunúť vybrané záznamy do konceptov?"}
        description="Po potvrdení server znova overí stav a verziu všetkých záznamov. Nie je to hromadné odstránenie."
        onClose={() => { if (!bulkBusy) setBulkReview(null); }}
        footer={<>
          <AdminActionButton variant="neutral" disabled={bulkBusy} onClick={() => setBulkReview(null)}>Zrušiť</AdminActionButton>
          <AdminActionButton
            variant={activeReview?.targetStatus === "draft" ? "destructive" : "primary"}
            disabled={bulkBusy || !activeReview}
            onClick={() => void applyBulk()}
          >
            {bulkBusy ? "Ukladám…" : "Potvrdiť hromadnú zmenu"}
          </AdminActionButton>
        </>}
      >
        {activeReview && <p>Označených: <strong>{activeReview.preview.selectedCount}</strong>.
          Zmení sa <strong>{activeReview.preview.changeCount}</strong>.
          Bez zmeny zostane <strong>{activeReview.preview.selectedCount - activeReview.preview.changeCount}</strong>.
        </p>}
      </AdminModalDialog>
    </section>
  );
}
